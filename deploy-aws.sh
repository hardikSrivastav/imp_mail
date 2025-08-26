#!/bin/bash

# AWS deployment script for imp_mail production environment
# This script handles AWS-specific deployment tasks including volume setup and service deployment

set -e

echo "🌩️  Starting AWS deployment for imp_mail..."

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
APP_NAME="imp_mail"
DATA_DIR="/opt/imp_mail"

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

# Function to check if running on AWS EC2
check_aws_environment() {
    print_status "Checking AWS environment..."
    
    if curl -s --max-time 3 http://169.254.169.254/latest/meta-data/instance-id > /dev/null 2>&1; then
        INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
        INSTANCE_TYPE=$(curl -s http://169.254.169.254/latest/meta-data/instance-type)
        AZ=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
        
        print_success "Running on AWS EC2 instance: $INSTANCE_ID ($INSTANCE_TYPE) in $AZ"
        return 0
    else
        print_warning "Not running on AWS EC2 or metadata service unavailable"
        return 1
    fi
}

# Function to setup AWS-specific directories
setup_aws_directories() {
    print_status "Setting up AWS-specific directories..."
    
    # Create data directories with proper permissions
    sudo mkdir -p "$DATA_DIR/redis_data"
    sudo mkdir -p "$DATA_DIR/qdrant_data"
    sudo mkdir -p "$DATA_DIR/classifier_logs"
    sudo mkdir -p "$DATA_DIR/app_data"
    sudo mkdir -p "$DATA_DIR/app_logs"
    
    # Set proper ownership (assuming docker group exists)
    if getent group docker > /dev/null 2>&1; then
        sudo chown -R $USER:docker "$DATA_DIR"
        sudo chmod -R 775 "$DATA_DIR"
        print_success "Directories created with docker group permissions"
    else
        sudo chown -R $USER:$USER "$DATA_DIR"
        sudo chmod -R 755 "$DATA_DIR"
        print_success "Directories created with user permissions"
    fi
}

# Function to check system resources
check_system_resources() {
    print_status "Checking system resources..."
    
    # Check available memory
    total_mem=$(free -m | awk 'NR==2{print $2}')
    available_mem=$(free -m | awk 'NR==2{print $7}')
    
    echo "Total Memory: ${total_mem}MB"
    echo "Available Memory: ${available_mem}MB"
    
    if [ "$available_mem" -lt 2048 ]; then
        print_warning "Available memory is less than 2GB. Consider upgrading instance."
    fi
    
    # Check disk space
    disk_usage=$(df -h / | awk 'NR==2{print $5}' | sed 's/%//')
    echo "Root disk usage: ${disk_usage}%"
    
    if [ "$disk_usage" -gt 80 ]; then
        print_warning "Disk usage is above 80%. Consider cleaning up or expanding storage."
    fi
    
    # Check CPU
    cpu_cores=$(nproc)
    echo "CPU cores: $cpu_cores"
    
    if [ "$cpu_cores" -lt 2 ]; then
        print_warning "Less than 2 CPU cores available. Performance may be limited."
    fi
}

# Function to setup Docker for AWS
setup_docker_aws() {
    print_status "Configuring Docker for AWS..."
    
    # Enable Docker BuildKit for better performance
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Configure Docker daemon for AWS (if not already configured)
    if [ ! -f /etc/docker/daemon.json ]; then
        print_status "Creating Docker daemon configuration..."
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
    }
}
EOF
        sudo systemctl restart docker
        print_success "Docker daemon configured and restarted"
    fi
}

# Function to pull base images
pull_base_images() {
    print_status "Pulling base images to optimize build time..."
    
    docker pull node:18-alpine || print_warning "Failed to pull node:18-alpine"
    docker pull python:3.11-slim || print_warning "Failed to pull python:3.11-slim"
    docker pull redis:7-alpine || print_warning "Failed to pull redis:7-alpine"
    docker pull qdrant/qdrant:latest || print_warning "Failed to pull qdrant/qdrant:latest"
    
    print_success "Base images pulled"
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services with AWS configuration..."
    
    # Build and deploy using AWS compose files
    ./build-production.sh aws
    
    # Wait for services to be healthy
    print_status "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml ps
    
    print_success "Services deployed successfully"
}

# Function to setup monitoring
setup_monitoring() {
    print_status "Setting up basic monitoring..."
    
    # Create a simple health check script
    cat > /tmp/health-check.sh << 'EOF'
#!/bin/bash
echo "=== Health Check $(date) ==="
echo "Services Status:"
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml ps
echo ""
echo "System Resources:"
echo "Memory: $(free -h | grep Mem | awk '{print $3"/"$2}')"
echo "Disk: $(df -h / | tail -1 | awk '{print $3"/"$2" ("$5" used)"}')"
echo "Load: $(uptime | awk -F'load average:' '{print $2}')"
echo "================================"
EOF
    
    chmod +x /tmp/health-check.sh
    sudo mv /tmp/health-check.sh /usr/local/bin/imp-mail-health-check
    
    print_success "Health check script installed at /usr/local/bin/imp-mail-health-check"
}

# Function to setup log rotation
setup_log_rotation() {
    print_status "Setting up log rotation..."
    
    sudo tee /etc/logrotate.d/imp-mail > /dev/null <<EOF
$DATA_DIR/app_logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}

$DATA_DIR/classifier_logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}
EOF
    
    print_success "Log rotation configured"
}

# Main deployment process
main() {
    echo "======================================"
    echo "🌩️  IMP_MAIL AWS DEPLOYMENT SCRIPT"
    echo "======================================"
    
    # Pre-deployment checks
    check_aws_environment
    check_system_resources
    
    # Setup AWS environment
    setup_aws_directories
    setup_docker_aws
    
    # Optimize deployment
    pull_base_images
    
    # Deploy services
    deploy_services
    
    # Post-deployment setup
    setup_monitoring
    setup_log_rotation
    
    echo "======================================"
    print_success "AWS deployment completed successfully!"
    echo "======================================"
    
    echo ""
    echo "📋 Next steps:"
    echo "1. Configure your domain/load balancer to point to this instance"
    echo "2. Set up SSL/TLS certificates"
    echo "3. Configure monitoring and alerting"
    echo "4. Run health checks: /usr/local/bin/imp-mail-health-check"
    echo ""
    echo "🔍 Useful commands:"
    echo "• Check status: docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml ps"
    echo "• View logs: docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml logs -f [service]"
    echo "• Restart service: docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml restart [service]"
    echo ""
}

# Run main function
main "$@"
