# Intelligent Email Filter

AI-powered email filtering system for Ashoka University that learns user preferences and automatically filters important emails.

## Features

- 🔐 Google Workspace OAuth for @ashoka.edu.in accounts
- 📧 Incremental email indexing and synchronization
- 🤖 LLM-based importance classification
- 🔍 Semantic search using vector embeddings
- 📊 SQLite database with Qdrant vector storage
- 🐳 Docker containerization

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Google Cloud Console access for OAuth setup
- OpenAI or Anthropic API key

### Setup

1. **Clone and configure:**
   ```bash
   git clone <repository>
   cd intelligent-email-filter
   cp .env.example .env
   ```

2. **Configure environment variables in `.env`:**
   - Add Google OAuth credentials
   - Add LLM API key
   - Generate JWT and encryption secrets

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Check health:**
   ```bash
   curl http://localhost:3000/health
   ```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Docker Development

```bash
# Build and start all services
docker-compose up --build

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## Architecture

- **Backend:** Node.js + TypeScript + Express
- **Database:** SQLite for metadata, Qdrant for vectors
- **Cache:** Redis for sessions and job queues
- **Email:** Gmail API integration
- **AI:** OpenAI/Anthropic for classification

## API Endpoints

- `GET /health` - Health check
- `POST /auth/login` - Start OAuth flow
- `GET /emails` - Get filtered emails
- `POST /emails/sync` - Trigger sync
- `POST /ml/train` - Train importance model

## License

MIT License - see LICENSE file for details.