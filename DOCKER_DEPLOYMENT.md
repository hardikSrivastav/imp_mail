# Docker Deployment Guide

This guide covers deployment options for the imp_mail application using Docker Compose.

## Overview

The application supports multiple deployment configurations:

- **Development**: `docker-compose.yml` - Local development with hot reloading
- **Production**: `docker-compose.prod.yml` - Production-ready configuration
- **AWS Production**: `docker-compose.prod.yml` + `docker-compose.aws.yml` - AWS-optimized deployment

## Quick Start

### Local Development
```bash
docker-compose up -d
```

### Production Deployment
```bash
# Local production
./build-production.sh local

# AWS production
./build-production.sh aws
```

### AWS Deployment
```bash
# Full AWS deployment with infrastructure setup
./deploy-aws.sh
```

## Architecture

The application consists of the following services:

- **app**: Main Node.js/TypeScript backend API
- **frontend**: Next.js React frontend
- **email-classifier**: Python ML service for email classification
- **incremental-classifier**: Continuous learning service
- **redis**: Caching and session storage
- **qdrant**: Vector database for embeddings

## Deployment Configurations

### Development (`docker-compose.yml`)
- Hot reloading enabled
- Source code mounted as volumes
- Debug logging enabled
- Minimal resource constraints

### Production (`docker-compose.prod.yml`)
- Optimized builds with multi-stage Dockerfiles
- Production environment variables
- Health checks enabled
- Restart policies configured

### AWS Production (`docker-compose.aws.yml`)
- Resource limits and reservations
- AWS-optimized logging configuration
- Persistent volume bindings
- Enhanced health checks

## Build Scripts

### `build-production.sh`
Handles production builds with:
- Sequential service building to avoid memory issues
- Retry logic for failed builds
- System resource monitoring
- Support for both local and AWS deployments

Usage:
```bash
./build-production.sh [local|aws]
```

### `deploy-aws.sh`
Comprehensive AWS deployment script that:
- Checks AWS environment and resources
- Sets up required directories and permissions
- Configures Docker for AWS
- Pulls base images for faster builds
- Deploys services with health monitoring
- Sets up log rotation and monitoring

## Environment Variables

### Required Environment Variables
Create a `.env` file with:

```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Gmail OAuth (for email fetching)
GMAIL_CLIENT_ID=your_gmail_client_id
GMAIL_CLIENT_SECRET=your_gmail_client_secret

# Application Configuration
NODE_ENV=production
PROTOTYPE_HIGH_THRESHOLD=0.6
PROTOTYPE_LOW_THRESHOLD=0.5

# Database URLs (auto-configured in Docker)
REDIS_URL=redis://redis:6379
QDRANT_URL=http://qdrant:6333
```

### AWS-Specific Environment Variables
```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Resource Requirements

### Minimum Requirements
- **RAM**: 4GB (8GB recommended for AWS)
- **CPU**: 2 cores (4 cores recommended)
- **Disk**: 10GB free space
- **Network**: Stable internet connection

### AWS Instance Recommendations
- **t3.large** (2 vCPU, 8GB RAM) - Minimum for production
- **t3.xlarge** (4 vCPU, 16GB RAM) - Recommended for high traffic
- **c5.xlarge** (4 vCPU, 8GB RAM) - CPU-optimized alternative

## Service-Specific Configuration

### Main App Service
- **Port**: 3000
- **Health Check**: `/health` endpoint
- **Resources**: 512MB-1GB RAM, 0.25-0.5 CPU

### Email Classifier
- **Port**: 8000
- **Health Check**: `/health` endpoint
- **Resources**: 1-2GB RAM, 0.5-1.0 CPU
- **Note**: Most resource-intensive service due to ML processing

### Frontend
- **Port**: 3005
- **Health Check**: Root endpoint
- **Resources**: 256-512MB RAM, 0.25-0.5 CPU

### Redis
- **Port**: 6379
- **Persistence**: Volume-backed
- **Resources**: 128-256MB RAM, 0.1-0.25 CPU

### Qdrant
- **Ports**: 6333 (HTTP), 6334 (gRPC)
- **Persistence**: Volume-backed
- **Resources**: 512MB-1GB RAM, 0.25-0.5 CPU

## Monitoring and Maintenance

### Health Checks
All services include health checks that:
- Run every 30 seconds
- Have 10-second timeouts
- Allow 3 retries before marking unhealthy
- Have appropriate start periods

### Logging
- JSON file driver with rotation
- 10MB max file size, 3 files retained
- Centralized in `/opt/imp_mail/` on AWS

### Monitoring Commands
```bash
# Check service status
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml ps

# View logs
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml logs -f [service]

# Restart a service
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml restart [service]

# Run health check (AWS only)
/usr/local/bin/imp-mail-health-check
```

## Troubleshooting

### Common Issues

1. **Out of Memory Errors**
   - Increase instance size or add swap
   - Build services sequentially using the build script
   - Monitor memory usage during builds

2. **Service Won't Start**
   - Check logs: `docker-compose logs [service]`
   - Verify environment variables
   - Ensure dependencies are healthy

3. **Network Connectivity Issues**
   - Verify all services are on the same network
   - Check port conflicts
   - Ensure firewall allows required ports

4. **Volume Permission Issues**
   - Check directory ownership and permissions
   - Ensure Docker has access to mounted paths
   - Use proper user/group settings

### Performance Optimization

1. **Build Performance**
   - Use BuildKit: `export DOCKER_BUILDKIT=1`
   - Enable build cache
   - Pull base images before building

2. **Runtime Performance**
   - Allocate appropriate resources per service
   - Use SSD storage for volumes
   - Monitor and tune resource limits

3. **Network Performance**
   - Use internal Docker networking
   - Minimize external API calls
   - Implement proper caching strategies

## Security Considerations

1. **Environment Variables**
   - Never commit `.env` files to version control
   - Use AWS Secrets Manager for production secrets
   - Rotate API keys regularly

2. **Network Security**
   - Use internal Docker networks
   - Implement proper firewall rules
   - Consider using a reverse proxy (nginx/traefik)

3. **Container Security**
   - Keep base images updated
   - Use non-root users where possible
   - Scan images for vulnerabilities

## Backup and Recovery

### Data Backup
Important data locations:
- Redis data: `/opt/imp_mail/redis_data`
- Qdrant data: `/opt/imp_mail/qdrant_data`
- Application data: `/opt/imp_mail/app_data`
- Logs: `/opt/imp_mail/classifier_logs` and `/opt/imp_mail/app_logs`

### Backup Script Example
```bash
#!/bin/bash
BACKUP_DIR="/backup/imp_mail/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Stop services
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml stop

# Backup data
tar -czf "$BACKUP_DIR/redis_data.tar.gz" /opt/imp_mail/redis_data
tar -czf "$BACKUP_DIR/qdrant_data.tar.gz" /opt/imp_mail/qdrant_data
tar -czf "$BACKUP_DIR/app_data.tar.gz" /opt/imp_mail/app_data

# Start services
docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml start
```

## Support

For issues and questions:
1. Check the logs first
2. Review this documentation
3. Check the GitHub repository for known issues
4. Create an issue with detailed logs and configuration