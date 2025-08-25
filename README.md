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
   cp env.template .env
   ```

2. **Configure environment variables in `.env`:**
   
   **Required Configuration:**
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` - Google OAuth credentials
   - `OPENAI_API_KEY` - OpenAI API key for AI features
   - `JWT_SECRET` and `ENCRYPTION_KEY` - Generate secure secrets
   
   **Email Delivery (Required for Digest Feature):**
   ```bash
   # Gmail Configuration (Recommended)
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-gmail-app-password
   EMAIL_FROM=your-email@gmail.com
   ```
   
   **Gmail Setup Instructions:**
   - Enable 2-factor authentication on your Gmail account
   - Generate an App Password: Google Account → Security → 2-Step Verification → App passwords
   - Use the generated password as `EMAIL_PASSWORD`

3. **Start services:**
   ```bash
   docker-compose up -d
   ```

4. **Test email configuration (optional):**
   ```bash
   npm run check-email
   ```

5. **Check health:**
   ```bash
   curl http://localhost:3005/health
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

# Test email configuration
npm run check-email
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