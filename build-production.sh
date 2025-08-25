#!/bin/bash

# Production build script for AWS deployment
# This script builds services sequentially to avoid resource exhaustion

set -e

echo "🚀 Starting production build process..."

# Function to check available memory
check_memory() {
    free_mem=$(free -m | awk 'NR==2{printf "%.1f", $7/1024}')
    echo "Available memory: ${free_mem}GB"
    
    if (( $(echo "$free_mem < 1.5" | bc -l) )); then
        echo "⚠️  Warning: Low memory detected. Consider upgrading instance or reducing concurrent builds."
    fi
}

# Function to build with retry logic
build_with_retry() {
    local service=$1
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        echo "📦 Building $service (attempt $attempt/$max_attempts)..."
        
        if docker-compose -f docker-compose.prod.yml build $service --no-cache; then
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

# Check system resources
check_memory

# Clean up existing containers and images
echo "🧹 Cleaning up existing containers and images..."
docker-compose -f docker-compose.prod.yml down --remove-orphans
docker system prune -f

# Build infrastructure services first (lightweight)
echo "🏗️  Building infrastructure services..."
docker-compose -f docker-compose.prod.yml up -d redis qdrant

# Wait for infrastructure to be ready
sleep 10

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
    echo "🚀 Starting all services..."
    docker-compose -f docker-compose.prod.yml up -d
    echo "✅ All services are now running!"
    docker-compose -f docker-compose.prod.yml ps
else
    echo "ℹ️  Services built but not started. Run 'docker-compose -f docker-compose.prod.yml up -d' when ready."
fi
