# Docker Deployment Guide

This project supports both development and production deployments using Docker Compose.

## Services

The application consists of the following services:

- **app**: Main Node.js/TypeScript backend API server
- **frontend**: Next.js React frontend application
- **redis**: Redis cache and session store
- **qdrant**: Vector database for email embeddings
- **email-classifier**: Python ML service for email classification
- **incremental-classifier**: Python service for incremental learning

## Development Deployment

For development with hot reloading and source code mounting:

```bash
# Start all services in development mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Development Features:
- Hot reloading for both frontend and backend
- Source code mounted as volumes
- Development dependencies included
- Debug logging enabled

### Ports:
- Frontend: http://localhost:3005
- Backend API: http://localhost:3000
- Email Classifier: http://localhost:8000
- Redis: localhost:6379
- Qdrant: http://localhost:6333

## Production Deployment

For production with optimized builds and minimal dependencies:

```bash
# Start all services in production mode
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop all services
docker-compose -f docker-compose.prod.yml down
```

### Production Features:
- Optimized builds with multi-stage Dockerfiles
- Production-only dependencies
- No source code mounting
- Automatic restarts
- Health checks

## Environment Configuration

Make sure you have a `.env` file in the root directory with the required environment variables:

```env
# Database
DATABASE_URL=...

# Authentication
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
JWT_SECRET=...

# OpenAI
OPENAI_API_KEY=...

# Redis
REDIS_URL=redis://redis:6379

# Qdrant
QDRANT_URL=http://qdrant:6333
```

## Useful Commands

```bash
# Rebuild all services
docker-compose build

# Rebuild specific service
docker-compose build frontend

# View service logs
docker-compose logs frontend

# Execute command in running container
docker-compose exec frontend sh

# Scale a service (if needed)
docker-compose up -d --scale frontend=2
```

## Troubleshooting

### Frontend not connecting to backend
- Ensure `NEXT_PUBLIC_API_URL` is set correctly in the frontend service
- Check that services are on the same Docker network

### Permission issues
- All services run as non-root users for security
- Volume mounts may need proper permissions on the host

### Build failures
- Clear Docker cache: `docker system prune -a`
- Rebuild without cache: `docker-compose build --no-cache`

## Network Architecture

All services communicate through the `email-filter-network` Docker bridge network:

```
┌─────────────┐    ┌─────────────┐
│  Frontend   │    │   Backend   │
│  (Next.js)  │───▶│  (Node.js)  │
│   :3005     │    │    :3000    │
└─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │    Redis    │
                   │    :6379    │
                   └─────────────┘
                           │
                           ▼
                   ┌─────────────┐    ┌─────────────┐
                   │   Qdrant    │    │ ML Services │
                   │    :6333    │───▶│   :8000     │
                   └─────────────┘    └─────────────┘
```
