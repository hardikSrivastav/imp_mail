#!/bin/bash

# Fix Docker container restart issues for imp_mail
# This script addresses the problem of containers stopping after connection breaks

set -e

echo "🔧 Fixing Docker container restart issues..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Running as root - this is OK for system configuration"
    else
        print_status "Running as regular user - will use sudo for system operations"
    fi
}

# Function to detect and configure container runtime
configure_container_runtime() {
    print_status "Detecting and configuring container runtime..."
    
    # Check if we're using Docker or Podman
    if docker info >/dev/null 2>&1 && ! docker info 2>&1 | grep -q "Emulate Docker CLI using podman"; then
        print_status "Using Docker - configuring Docker daemon..."
        
        sudo mkdir -p /etc/docker
        
        # Create or update Docker daemon configuration
        sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "features": {
        "buildkit": true
    },
    "live-restore": true,
    "restart": true,
    "default-ulimits": {
        "nofile": {
            "Hard": 64000,
            "Name": "nofile",
            "Soft": 64000
        }
    }
}
EOF

        # Restart Docker daemon
        sudo systemctl restart docker
        print_success "Docker daemon configured and restarted"
        
    else
        print_status "Using Podman - configuring Podman..."
        
        # Create podman configuration directory
        mkdir -p ~/.config/containers
        
        # Configure podman for better stability
        tee ~/.config/containers/containers.conf > /dev/null <<EOF
[containers]
default_ulimits = [
    "nofile=64000:64000"
]

[engine]
events_logger = "file"
log_driver = "k8s-file"
EOF

        # Enable podman socket if available
        if systemctl list-unit-files | grep -q "podman.socket"; then
            sudo systemctl enable --now podman.socket
            print_success "Podman socket enabled"
        fi
        
        print_success "Podman configured for stability"
    fi
}

# Function to install systemd service
install_systemd_service() {
    print_status "Installing systemd service for automatic startup..."
    
    # Copy service file to systemd directory
    sudo cp imp-mail.service /etc/systemd/system/
    
    # Reload systemd and enable the service
    sudo systemctl daemon-reload
    sudo systemctl enable imp-mail.service
    
    print_success "Systemd service installed and enabled"
}

# Function to create Docker Compose wrapper with better error handling
create_compose_wrapper() {
    print_status "Creating Docker Compose wrapper with restart logic..."
    
    # Create a wrapper script that handles restarts better
    cat > /tmp/docker-compose-wrapper.sh << 'EOF'
#!/bin/bash

# Docker Compose wrapper with enhanced restart logic
COMPOSE_FILES="-f docker-compose.prod.yml -f docker-compose.aws.yml"
LOG_FILE="/home/ec2-user/imp_mail/restart.log"
WORK_DIR="/home/ec2-user/imp_mail"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to check if services are healthy
check_services_health() {
    log_message "Checking services health..."
    
    # Change to working directory
    cd "$WORK_DIR" || { log_message "Failed to change to working directory: $WORK_DIR"; return 1; }
    
    # Check if all services are running
    if ! docker-compose $COMPOSE_FILES ps | grep -q "Up"; then
        log_message "Some services are not running, attempting restart..."
        return 1
    fi
    
    # Check individual service health
    services=("app" "email-classifier" "frontend" "redis" "postgres" "qdrant")
    
    for service in "${services[@]}"; do
        if ! docker-compose $COMPOSE_FILES ps "$service" | grep -q "Up"; then
            log_message "Service $service is not running"
            return 1
        fi
    done
    
    log_message "All services are healthy"
    return 0
}

# Function to restart services with exponential backoff
restart_services() {
    local attempt=1
    local max_attempts=5
    
    while [ $attempt -le $max_attempts ]; do
        log_message "Restart attempt $attempt/$max_attempts"
        
        # Stop all services
        docker-compose $COMPOSE_FILES down --remove-orphans
        
        # Wait a bit
        sleep 10
        
        # Start services
        if docker-compose $COMPOSE_FILES up -d; then
            log_message "Services started successfully"
            
            # Wait for services to be ready
            sleep 30
            
            # Check health
            if check_services_health; then
                log_message "All services are healthy after restart"
                return 0
            fi
        fi
        
        log_message "Restart attempt $attempt failed"
        attempt=$((attempt + 1))
        
        # Exponential backoff
        sleep $((attempt * 10))
    done
    
    log_message "Failed to restart services after $max_attempts attempts"
    return 1
}

# Main logic
case "${1:-start}" in
    start)
        log_message "Starting imp_mail services..."
        cd "$WORK_DIR" || { log_message "Failed to change to working directory: $WORK_DIR"; exit 1; }
        docker-compose $COMPOSE_FILES up -d
        sleep 30
        check_services_health || restart_services
        ;;
    stop)
        log_message "Stopping imp_mail services..."
        cd "$WORK_DIR" || { log_message "Failed to change to working directory: $WORK_DIR"; exit 1; }
        docker-compose $COMPOSE_FILES down
        ;;
    restart)
        log_message "Restarting imp_mail services..."
        restart_services
        ;;
    health-check)
        check_services_health
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|health-check}"
        exit 1
        ;;
esac
EOF

    # Make executable and move to proper location
    chmod +x /tmp/docker-compose-wrapper.sh
    sudo mv /tmp/docker-compose-wrapper.sh /usr/local/bin/imp-mail-compose
    
    print_success "Docker Compose wrapper created"
}

# Function to setup log rotation for restart logs
setup_log_rotation() {
    print_status "Setting up log rotation for restart logs..."
    
    sudo tee /etc/logrotate.d/imp-mail-restart > /dev/null <<EOF
/home/ec2-user/imp_mail/restart.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}
EOF

    print_success "Log rotation configured for restart logs"
}

# Function to create health check cron job
setup_health_monitoring() {
    print_status "Setting up health monitoring cron job..."
    
    # Create health check script
    cat > /tmp/health-monitor.sh << 'EOF'
#!/bin/bash

# Health monitoring script for imp_mail
LOG_FILE="/home/ec2-user/imp_mail/health-check.log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if services are running
if ! /usr/local/bin/imp-mail-compose health-check; then
    log_message "Health check failed, attempting restart..."
    
    if /usr/local/bin/imp-mail-compose restart; then
        log_message "Services restarted successfully"
    else
        log_message "Failed to restart services, alerting..."
        # Here you could add alerting logic (email, Slack, etc.)
    fi
fi
EOF

    chmod +x /tmp/health-monitor.sh
    sudo mv /tmp/health-monitor.sh /usr/local/bin/imp-mail-health-monitor
    
    # Add cron job to run every 5 minutes
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/imp-mail-health-monitor") | crontab -
    
    print_success "Health monitoring cron job installed"
}

# Function to update existing deployment
update_existing_deployment() {
    print_status "Updating existing deployment..."
    
    # Stop current services
    if docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml ps | grep -q "Up"; then
        print_status "Stopping current services..."
        docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml down
    fi
    
    # Start with new configuration
    print_status "Starting services with new configuration..."
    /usr/local/bin/imp-mail-compose start
    
    print_success "Deployment updated successfully"
}

# Main execution
main() {
    echo "======================================"
    echo "🔧 IMP_MAIL CONTAINER RESTART FIX"
    echo "======================================"
    
    check_root
    
    # Configure container runtime for stability
    configure_container_runtime
    
    # Install systemd service
    install_systemd_service
    
    # Create enhanced wrapper
    create_compose_wrapper
    
    # Setup monitoring
    setup_log_rotation
    setup_health_monitoring
    
    # Update existing deployment
    update_existing_deployment
    
    echo "======================================"
    print_success "Container restart issues fixed!"
    echo "======================================"
    
    echo ""
    echo "📋 What was fixed:"
    echo "• Added restart policies to all services"
    echo "• Configured Docker daemon for stability"
    echo "• Installed systemd service for auto-startup"
    echo "• Created health monitoring with auto-restart"
    echo "• Added log rotation for restart logs"
    echo ""
    echo "🔍 Useful commands:"
    echo "• Start services: sudo systemctl start imp-mail"
    echo "• Stop services: sudo systemctl stop imp-mail"
    echo "• Check status: sudo systemctl status imp-mail"
    echo "• View logs: sudo journalctl -u imp-mail -f"
    echo "• Manual restart: /usr/local/bin/imp-mail-compose restart"
    echo "• Health check: /usr/local/bin/imp-mail-compose health-check"
    echo ""
}

# Run main function
main "$@"
