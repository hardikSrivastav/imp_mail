# Docker Container Restart Fix

## Problem
Docker containers are stopping after connection breaks or system restarts, requiring manual intervention to restart services.

## Root Causes Identified
1. **Missing restart policies** in development docker-compose.yml
2. **No systemd service** for automatic startup on boot
3. **Docker daemon not configured** for production stability
4. **No health monitoring** with automatic restart capabilities

## Solution

### Quick Fix (Run on EC2 Instance)

1. **Upload the fix script to your EC2 instance:**
   ```bash
   scp -P 8443 -i ~/.ssh/zonf.pem fix-container-restart.sh imp-mail.service ec2-user@ec2-15-206-169-99.ap-south-1.compute.amazonaws.com:~/
   ```

2. **SSH into the instance:**
   ```bash
   ssh -p 8443 -i ~/.ssh/zonf.pem ec2-user@ec2-15-206-169-99.ap-south-1.compute.amazonaws.com
   ```

3. **Run the fix script:**
   ```bash
   cd /opt/imp_mail
   sudo ./fix-container-restart.sh
   ```

### What the Fix Does

#### 1. **Enhanced Restart Policies**
- Added `restart: unless-stopped` to all services in docker-compose.yml
- Ensures containers restart automatically after crashes or system reboots

#### 2. **Docker Daemon Configuration**
- Configures Docker daemon with `live-restore: true` for better stability
- Sets up proper logging with rotation
- Optimizes ulimits for better resource handling

#### 3. **Systemd Service**
- Creates `imp-mail.service` for automatic startup on boot
- Handles service lifecycle management
- Provides proper dependency management with Docker

#### 4. **Health Monitoring**
- Creates `/usr/local/bin/imp-mail-compose` wrapper with enhanced logic
- Implements exponential backoff for restart attempts
- Adds health checks with automatic recovery

#### 5. **Cron-based Monitoring**
- Runs health checks every 5 minutes
- Automatically restarts services if they become unhealthy
- Logs all restart attempts for debugging

### Manual Commands (After Fix)

```bash
# Start services
sudo systemctl start imp-mail

# Stop services  
sudo systemctl stop imp-mail

# Check status
sudo systemctl status imp-mail

# View logs
sudo journalctl -u imp-mail -f

# Manual restart
/usr/local/bin/imp-mail-compose restart

# Health check
/usr/local/bin/imp-mail-compose health-check

# View restart logs
tail -f /opt/imp_mail/restart.log

# View health check logs
tail -f /opt/imp_mail/health-check.log
```

### Verification Steps

1. **Test automatic restart:**
   ```bash
   # Kill a container manually
   docker kill <container_id>
   
   # Wait 30 seconds and check if it restarted
   docker ps
   ```

2. **Test system restart:**
   ```bash
   # Restart the EC2 instance
   sudo reboot
   
   # After reboot, check if services are running
   sudo systemctl status imp-mail
   docker ps
   ```

3. **Test health monitoring:**
   ```bash
   # Check cron job is running
   crontab -l
   
   # Check health monitoring logs
   tail -f /opt/imp_mail/health-check.log
   ```

### Troubleshooting

#### If services still don't restart:

1. **Check Docker daemon status:**
   ```bash
   sudo systemctl status docker
   ```

2. **Check systemd service status:**
   ```bash
   sudo systemctl status imp-mail
   ```

3. **Check logs for errors:**
   ```bash
   sudo journalctl -u imp-mail -n 50
   ```

4. **Manual restart with wrapper:**
   ```bash
   /usr/local/bin/imp-mail-compose restart
   ```

#### If cron monitoring isn't working:

1. **Check cron service:**
   ```bash
   sudo systemctl status cron
   ```

2. **Check cron logs:**
   ```bash
   sudo journalctl -u cron
   ```

3. **Test health monitor manually:**
   ```bash
   /usr/local/bin/imp-mail-health-monitor
   ```

### Files Modified/Created

- `docker-compose.yml` - Added restart policies
- `imp-mail.service` - Systemd service file
- `fix-container-restart.sh` - Automated fix script
- `/usr/local/bin/imp-mail-compose` - Enhanced wrapper script
- `/usr/local/bin/imp-mail-health-monitor` - Health monitoring script
- `/etc/docker/daemon.json` - Docker daemon configuration
- `/etc/systemd/system/imp-mail.service` - Systemd service
- `/etc/logrotate.d/imp-mail-restart` - Log rotation config

### Prevention

After applying this fix:
- Services will automatically restart after crashes
- Services will start automatically on system boot
- Health monitoring will detect and fix issues automatically
- All restart attempts are logged for debugging

This should completely resolve the container stopping issues you were experiencing.
