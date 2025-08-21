# Intelligent Email Filter API Endpoints

This document describes the API endpoints implemented for the Intelligent Email Filter system.

## Authentication Endpoints

### POST /api/auth/login
Initiate OAuth login flow
- **Body**: `{ "email": "user@ashoka.edu.in" }`
- **Response**: OAuth authorization URL

### POST /api/auth/callback
Handle OAuth callback
- **Body**: `{ "code": "auth_code", "state": "oauth_state" }`
- **Response**: JWT tokens

### POST /api/auth/refresh
Refresh JWT token
- **Headers**: `Authorization: Bearer <token>`
- **Response**: New JWT token

### GET /api/auth/status
Get authentication status
- **Headers**: `Authorization: Bearer <token>`
- **Response**: User authentication status

## Email Management Endpoints

### GET /api/emails
Retrieve emails for authenticated user
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `importance`: `important | not_important | unclassified`
  - `sender`: Filter by sender email
  - `dateFrom`: ISO date string
  - `dateTo`: ISO date string
  - `limit`: Number (1-100, default: 50)
  - `offset`: Number (default: 0)
- **Response**: Paginated list of emails

### GET /api/emails/search
Search emails using text or semantic search
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `search`: Search query (required)
  - `importance`: Filter by importance
  - `sender`: Filter by sender
  - `dateFrom`: ISO date string
  - `dateTo`: ISO date string
  - `limit`: Number (1-50, default: 20)
  - `offset`: Number (default: 0)
  - `useSemanticSearch`: Boolean
  - `combineResults`: Boolean (default: true)
- **Response**: Search results with relevance scores

### GET /api/emails/:id
Get specific email by ID
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Email details

### PUT /api/emails/:id/importance
Update email importance classification
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "importance": "important | not_important | unclassified", "userLabeled": true }`
- **Response**: Updated email

### GET /api/emails/:id/similar
Find emails similar to specified email
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `limit`: Number (1-20, default: 5)
  - `threshold`: Number (0-1, default: 0.8)
- **Response**: Similar emails with similarity scores

### POST /api/emails/sync
Trigger email synchronization
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "type": "incremental | full" }`
- **Response**: Sync status

### GET /api/emails/sync/status
Get synchronization status
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Sync state and statistics

## Filter Management Endpoints

### POST /api/filter/expectations
Create user expectations for filtering
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "title": "Work Emails",
    "description": "Emails related to work projects and meetings",
    "examples": {
      "important": ["Meeting invitations", "Project updates"],
      "notImportant": ["Newsletter", "Promotional emails"]
    }
  }
  ```
- **Response**: Created expectations

### GET /api/filter/expectations
Get user's active expectations
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Active filtering expectations

### PUT /api/filter/expectations
Update user's expectations
- **Headers**: `Authorization: Bearer <token>`
- **Body**: Partial expectations update
- **Response**: Updated expectations

### DELETE /api/filter/expectations
Deactivate user's expectations
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Success message

### POST /api/filter/batch
Process batch filtering of emails
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "emailIds": ["email1", "email2"],
    "filterUnclassified": true,
    "confidenceThreshold": 0.7,
    "batchSize": 10
  }
  ```
- **Response**: Filtering statistics

### GET /api/filter/status
Get filtering status and OpenAI usage metrics
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Filtering status and statistics

### POST /api/filter/classify/:id
Classify a single email
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Classification result and updated email

## Indexing Management Endpoints

### POST /api/indexing/full
Trigger full email indexing
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "force": false }`
- **Response**: Indexing status

### POST /api/indexing/incremental
Trigger incremental email indexing
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "force": false }`
- **Response**: Indexing status

### POST /api/indexing/sync
Generic sync endpoint (chooses appropriate indexing type)
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "type": "full | incremental", "force": false }`
- **Response**: Sync status

### GET /api/indexing/status
Get indexing status and progress
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Detailed indexing progress

### GET /api/indexing/progress
Get detailed indexing progress (alias for status)
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Indexing progress details

### POST /api/indexing/cancel
Cancel ongoing indexing operation
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Cancellation status

### GET /api/indexing/stats
Get comprehensive indexing statistics
- **Headers**: `Authorization: Bearer <token>`
- **Response**: Detailed indexing and email statistics

### POST /api/indexing/reset
Reset indexing state (for development/testing)
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "confirm": true }`
- **Response**: Reset confirmation

## Health Check

### GET /health
System health check
- **Response**: Service status and timestamp

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict
- `500`: Internal Server Error
- `503`: Service Unavailable

## Authentication

Most endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

Tokens are obtained through the OAuth flow using the `/api/auth/login` and `/api/auth/callback` endpoints.