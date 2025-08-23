# Email Classification Microservice

A FastAPI-based microservice that classifies emails as important/non-important using few-shot learning and vector similarity search.

## Features

- **Few-shot Learning**: Learns from minimal training examples (as few as 5-10 labeled emails)
- **Vector Store Integration**: Supports multiple vector databases (Pinecone, ChromaDB, Weaviate)
- **Model Persistence**: Automatically saves and restores trained models across service restarts
- **Active Learning**: Improves over time with user feedback
- **RESTful API**: Clean, documented API endpoints
- **Scalable Architecture**: Containerized with Docker support
- **Real-time Classification**: Fast email classification with confidence scores

## API Overview

### Input/Output Contracts

#### Training Input
```json
{
  "user_id": "user123",
  "labeled_examples": [
    {
      "email_id": "email_001",
      "is_important": true,
      "confidence": 1.0
    }
  ],
  "retrain": false
}
```

#### Classification Input
```json
{
  "user_id": "user123",
  "email_ids": ["email_001", "email_002", "email_003"],
  "return_confidence": true
}
```

#### Classification Output
```json
{
  "user_id": "user123",
  "results": [
    {
      "email_id": "email_001",
      "is_important": true,
      "confidence": 0.87,
      "reasoning": "Classified as important (confidence: 0.87) - has attachments, sent during business hours"
    }
  ],
  "model_version": "abc123",
  "processed_at": "2024-01-15T10:30:00Z"
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/train` | POST | Train/update classifier with labeled examples |
| `/classify` | POST | Classify emails as important/non-important |
| `/feedback` | POST | Submit feedback for model improvement |
| `/stats/{user_id}` | GET | Get model statistics and performance |
| `/health` | GET | Health check endpoint |

## Quick Start

### Using Docker Compose (Recommended)

1. **Start the services:**
```bash
docker-compose up -d
```

2. **Train the classifier:**
```bash
curl -X POST "http://localhost:8000/train" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "labeled_examples": [
      {"email_id": "email_001", "is_important": true},
      {"email_id": "email_002", "is_important": false}
    ]
  }'
```

3. **Classify emails:**
```bash
curl -X POST "http://localhost:8000/classify" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "email_ids": ["email_003", "email_004"]
  }'
```

### Manual Setup

1. **Install dependencies:**
```bash
pip install -r requirements.txt
```

2. **Start ChromaDB (if using):**
```bash
chroma run --host localhost --port 8001
```

3. **Run the service:**
```bash
uvicorn email_classifier_service:app --host 0.0.0.0 --port 8000
```

## Vector Store Configuration

### ChromaDB (Default)
```python
VECTOR_STORE_TYPE=chroma
CHROMA_HOST=localhost
CHROMA_PORT=8001
```

### Pinecone
```python
VECTOR_STORE_TYPE=pinecone
PINECONE_API_KEY=your_api_key
PINECONE_ENVIRONMENT=us-west1-gcp
PINECONE_INDEX_NAME=emails
```

## Email Data Format

The service expects emails in the vector store with this structure:

```json
{
  "email_id": "unique_identifier",
  "embedding": [0.1, 0.2, ...],  // 768-dim vector
  "metadata": {
    "user_id": "user123",
    "sender": "sender@example.com",
    "subject": "Important meeting",
    "timestamp": "2024-01-15T10:30:00Z",
    "thread_length": 3,
    "cc_count": 2,
    "has_attachments": true,
    "is_reply": false,
    "is_forward": false
  },
  "content": "Email body text..."
}
```

## Classification Features

The service uses multiple feature types for classification:

1. **Content Features**
   - Semantic similarity using vector embeddings
   - TF-IDF patterns
   - Content length and complexity

2. **Metadata Features**
   - Sender patterns and reputation
   - Thread length and CC count
   - Attachment presence
   - Reply/forward indicators

3. **Temporal Features**
   - Business hours detection
   - Weekend/weekday patterns
   - Time-based urgency signals

4. **Behavioral Features**
   - Historical interaction patterns
   - Response time patterns
   - User-specific preferences

## Model Training Strategy

1. **Cold Start**: Uses similarity-based classification with minimal examples
2. **Few-Shot Learning**: Trains Random Forest with feature engineering
3. **Active Learning**: Identifies uncertain predictions for user feedback
4. **Incremental Updates**: Continuously improves with new examples

## Performance Expectations

- **Initial Accuracy**: 70-75% with 10 labeled examples
- **Mature Model**: 85-90% accuracy with 50+ examples
- **Response Time**: < 100ms per email classification
- **Throughput**: 1000+ emails/second

## Monitoring

Access monitoring dashboards:
- **API Docs**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090 (if enabled)
- **Health Check**: http://localhost:8000/health

## Model Persistence

The service automatically saves trained models and training examples to disk, ensuring that your AI models persist across service restarts.

### How It Works

1. **Automatic Saving**: Models are automatically saved after training and when adding new examples
2. **Startup Loading**: All saved models are loaded when the service starts
3. **User-Specific Storage**: Each user's model is stored separately in `/app/data/models/{user_id}/`

### Storage Structure
```
/app/data/models/
├── user_123/
│   ├── labeled_examples.json  # Training examples
│   ├── model.pkl             # Trained scikit-learn model
│   └── metadata.json         # Model metadata
└── user_456/
    ├── labeled_examples.json
    ├── model.pkl
    └── metadata.json
```

### API Endpoints for Persistence

- `GET /persistence/status` - Check persistence status and saved models
- `POST /persistence/save-all` - Manually save all loaded models
- `POST /reset/{user_id}` - Reset user's model (removes from memory and disk)

### Testing Persistence

Use the provided test script:
```bash
# Setup test data and train a model
python test_persistence.py

# Restart the service
docker-compose restart email-classifier

# Verify the model persisted
python test_persistence.py --verify
```

### Volume Configuration

Make sure to mount the data directory in docker-compose.yml:
```yaml
volumes:
  - ./data:/app/data  # Persist classifier models and training data
```

## Development

### Running Tests
```bash
pytest tests/
```

### Code Formatting
```bash
black .
flake8 .
mypy .
```

### Adding New Vector Stores

1. Implement the `VectorStoreClient` interface
2. Add to `VectorStoreFactory`
3. Update configuration options

## Production Considerations

1. **Scaling**: Use multiple replicas behind a load balancer
2. **Persistence**: Store models in shared storage (S3, GCS)
3. **Monitoring**: Set up proper logging and metrics
4. **Security**: Add authentication and rate limiting
5. **Caching**: Use Redis for frequently accessed data

## License

MIT License - see LICENSE file for details.
