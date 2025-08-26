#!/bin/bash

# Production build script for AWS deployment
# This script builds services sequentially to avoid resource exhaustion
# Usage: ./build-production.sh [aws|local]

set -e

# Default to local deployment, use 'aws' for AWS deployment
DEPLOYMENT_TYPE=${1:-local}

echo "🚀 Starting production build process for $DEPLOYMENT_TYPE deployment..."

# Function to check available memory (Linux/macOS compatible)
check_memory() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        free_mem=$(free -m | awk 'NR==2{printf "%.1f", $7/1024}')
        echo "Available memory: ${free_mem}GB"
        
        if (( $(echo "$free_mem < 1.5" | bc -l) )); then
            echo "⚠️  Warning: Low memory detected. Consider upgrading instance or reducing concurrent builds."
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        total_mem=$(sysctl -n hw.memsize)
        total_mem_gb=$(echo "scale=1; $total_mem / 1024 / 1024 / 1024" | bc)
        echo "Total memory: ${total_mem_gb}GB"
    else
        echo "ℹ️  Memory check not available for this OS"
    fi
}

# Function to build with retry logic
build_with_retry() {
    local service=$1
    local max_attempts=3
    local attempt=1
    
    # Set compose files based on deployment type
    local compose_files
    if [ "$DEPLOYMENT_TYPE" = "aws" ]; then
        compose_files="-f docker-compose.prod.yml -f docker-compose.aws.yml"
    else
        compose_files="-f docker-compose.prod.yml"
    fi
    
    while [ $attempt -le $max_attempts ]; do
        echo "📦 Building $service (attempt $attempt/$max_attempts)..."
        
        if docker-compose $compose_files build $service --no-cache; then
            echo "✅ Successfully built $service"
            return 0
        else
            echo "❌ Failed to build $service (attempt $attempt/$max_attempts)"
            if [ $attempt -eq $max_attempts ]; then
                echo "💥 Max attempts reached for $service. Exiting."
                exit 1
            fi
            
            # Clean up before retry
            docker system prune -f
            sleep 10
            attempt=$((attempt + 1))
        fi
    done
}

# Function to start infrastructure services
start_infrastructure() {
    local compose_files
    if [ "$DEPLOYMENT_TYPE" = "aws" ]; then
        compose_files="-f docker-compose.prod.yml -f docker-compose.aws.yml"
    else
        compose_files="-f docker-compose.prod.yml"
    fi
    
    echo "🏗️  Starting infrastructure services..."
    docker-compose $compose_files up -d redis qdrant
    
    # Wait for infrastructure to be ready
    echo "⏳ Waiting for infrastructure services to be ready..."
    sleep 15
    
    # Check if services are healthy
    echo "🔍 Checking service health..."
    docker-compose $compose_files ps
}

# Function to deploy all services
deploy_services() {
    local compose_files
    if [ "$DEPLOYMENT_TYPE" = "aws" ]; then
        compose_files="-f docker-compose.prod.yml -f docker-compose.aws.yml"
    else
        compose_files="-f docker-compose.prod.yml"
    fi
    
    echo "🚀 Starting all services..."
    docker-compose $compose_files up -d
    echo "✅ All services are now running!"
    docker-compose $compose_files ps
}

# Check system resources
check_memory

# Clean up existing containers and images
echo "🧹 Cleaning up existing containers and images..."
if [ "$DEPLOYMENT_TYPE" = "aws" ]; then
    docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml down --remove-orphans
else
    docker-compose -f docker-compose.prod.yml down --remove-orphans
fi
docker system prune -f

# Start infrastructure services
start_infrastructure

# Build services sequentially to avoid memory issues
echo "🔨 Building application services sequentially..."

# Build main app first
build_with_retry "app"

# Build Python classifier service
build_with_retry "email-classifier"

# Build incremental classifier
build_with_retry "incremental-classifier"

# Build frontend last
build_with_retry "frontend"

echo "🎉 All services built successfully!"

# Optional: Start all services
read -p "Do you want to start all services now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    deploy_services
else
    echo "ℹ️  Services built but not started."
    if [ "$DEPLOYMENT_TYPE" = "aws" ]; then
        echo "Run 'docker-compose -f docker-compose.prod.yml -f docker-compose.aws.yml up -d' when ready."
    else
        echo "Run 'docker-compose -f docker-compose.prod.yml up -d' when ready."
    fi
fi

echo "🏁 Build process completed for $DEPLOYMENT_TYPE deployment!"