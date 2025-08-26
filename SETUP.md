# Setup Guide

## Quick Start

1. **Copy environment file:**
   ```bash
   cp env.example .env
   ```

2. **Update your .env file with your actual values:**
   - Set your OpenAI API key
   - Configure Gmail OAuth credentials
   - Update other settings as needed

3. **Start all services:**
   ```bash
   # For development
   docker compose up

   # For production
   docker compose -f docker-compose.prod.yml up -d

   # For AWS deployment
   docker compose -f docker-compose.prod.yml -f docker-compose.aws.yml up -d
   ```

## What's Included

The setup includes:
- **PostgreSQL**: Main database (replaces SQLite for better performance)
- **Qdrant**: Vector database for email embeddings
- **Redis**: Cache and session storage
- **Main App**: Email filtering API (Node.js/TypeScript)
- **Classifier**: ML classification service (Python/FastAPI)
- **Frontend**: Web interface (Next.js)

## Database

The system now uses PostgreSQL instead of SQLite for better production performance and concurrent access. The database will be automatically created and migrated on first run.

## Configuration Changes Made

- **Database**: Updated from SQLite to PostgreSQL
- **Networking**: Fixed Qdrant hostname resolution in Docker networks
- **Volumes**: Added persistent storage for PostgreSQL data
- **Dependencies**: Added proper service dependencies

## Troubleshooting

### If services fail to start:
1. Check that all required environment variables are set in `.env`
2. Ensure Docker has enough disk space (at least 5GB free)
3. Check service logs: `docker compose logs [service-name]`

### Common issues:
- **Database connection errors**: Verify PostgreSQL credentials in `.env`
- **Qdrant connection errors**: Ensure Qdrant service is running
- **Build failures**: Clear Docker cache with `docker system prune -a`
