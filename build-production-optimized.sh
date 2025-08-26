#!/bin/bash

# Enable Docker BuildKit for better build performance
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "🚀 Starting optimized production build..."

# Build with progress output and better error handling
docker-compose -f docker-compose.prod.yml build \
    --parallel \
    --progress=plain \
    --no-cache \
    email-classifier incremental-classifier

if [ $? -eq 0 ]; then
    echo "✅ Build successful! Starting services..."
    docker-compose -f docker-compose.prod.yml up -d
else
    echo "❌ Build failed. Check the logs above for details."
    echo "💡 Try running with verbose output:"
    echo "   BUILDKIT_PROGRESS=plain docker-compose -f docker-compose.prod.yml build email-classifier"
    exit 1
fi
