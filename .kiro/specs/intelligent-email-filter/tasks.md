# Implementation Plan

- [x] 1. Set up project structure and Docker configuration
  - Create directory structure for services, models, repositories, and API components
  - Set up TypeScript configuration, package.json, and development dependencies
  - Create Dockerfile for the application and docker-compose.yml with Redis and Qdrant services
  - Configure environment variables for SQLite, OAuth, and LLM service credentials
  - _Requirements: All requirements need proper project foundation_

- [x] 2. Implement data models and database schema
  - Create TypeScript interfaces for User, Email, EmailVector, TrainingExample, and SyncState models
  - Write database migration scripts for SQLite schema creation with proper indexing
  - Set up Qdrant vector database connection and collection configuration
  - Implement model validation functions with proper type checking
  - Create unit tests for model validation and database schema
  - _Requirements: 1.4, 2.2, 4.2, 6.5_

- [x] 3. Build authentication service with domain validation
  - Implement DomainValidator class to enforce @ashoka.edu.in email restriction
  - Create OAuthManager for handling email provider OAuth flows
  - Build TokenStore for secure storage and retrieval of OAuth tokens
  - Write AuthController with login, callback, refresh, and status endpoints
  - Create unit tests for domain validation and OAuth token management
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Create Google Workspace integration layer
  - Implement EmailFetcher class for retrieving emails via Gmail API
  - Build EmailParser to extract metadata from Gmail message format
  - Create rate limiting and retry logic for Gmail API calls
  - Write integration tests with mock Gmail API responses
  - _Requirements: 2.1, 2.2, 3.1, 7.1_

- [x] 5. Build email indexing and synchronization system
- [x] 5.1 Implement sync state management
  - Create SyncStateManager to track indexing progress and timestamps
  - Build database operations for storing and retrieving sync state
  - Write unit tests for sync state persistence and retrieval
  - _Requirements: 2.1, 3.1, 3.2_

- [x] 5.2 Create incremental indexing engine
  - Implement IncrementalIndexer with logic to process only new emails
  - Build VectorEmbeddingService to generate embeddings for email content
  - Create email deduplication using Gmail message IDs
  - Implement Qdrant vector storage and retrieval operations
  - Create error handling and retry mechanisms for failed indexing
  - Write unit tests for incremental indexing and embedding generation
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5.3 Build full indexing capability
  - Implement complete email history indexing for new users
  - Create progress tracking and user notification system
  - Build batch processing for large email volumes
  - Write integration tests for full indexing workflow
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Implement email storage and retrieval system
  - Create EmailRepository with CRUD operations for SQLite email metadata
  - Build QdrantRepository for managing email embeddings and similarity search
  - Implement semantic search using Qdrant vector similarity alongside SQLite full-text search
  - Create email filtering by date range, sender, and importance
  - Build Redis caching layer for frequently accessed emails and embeddings
  - Write unit tests for repository operations and search functionality
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Build OpenAI email filtering service
- [x] 7.1 Create user expectations management
  - Implement UserExpectationsManager for storing and retrieving user filtering preferences
  - Build interface for users to define their email importance criteria in natural language
  - Create validation and preprocessing for user expectation inputs
  - Write unit tests for expectations storage and retrieval operations
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 7.2 Implement OpenAI integration for email filtering
  - Create OpenAIFilterService class for communicating with OpenAI API
  - Build EmailClassifier that uses OpenAI to evaluate emails against user expectations
  - Implement prompt engineering to send email content and user expectations to OpenAI
  - Create confidence scoring based on OpenAI response certainty
  - Create fallback mechanisms when OpenAI API is unavailable
  - Write integration tests with mock OpenAI API responses
  - _Requirements: 4.3, 4.4, 5.1, 5.4, 7.3_

- [x] 7.3 Build intelligent filtering pipeline
  - Implement automatic filtering of newly indexed emails using OpenAI
  - Create batch filtering for existing unclassified emails
  - Build expectation-based filtering that only processes emails from indexed data
  - Create confidence-based flagging for manual review when OpenAI is uncertain
  - Write end-to-end tests for the complete filtering workflow
  - _Requirements: 5.1, 5.2, 5.5_

- [ ] 8. Create API controllers and routing
- [x] 8.1 Build email management API
  - Implement EmailController with endpoints for retrieving and searching emails
  - Create email importance update endpoint for user corrections
  - Build email synchronization trigger endpoint
  - Write API integration tests for all email endpoints
  - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 8.2 Implement OpenAI filtering service API
  - Create FilterController with expectations management and filtering endpoints
  - Build user expectations update endpoint for modifying filtering criteria
  - Implement batch filtering endpoint for processing multiple emails with OpenAI
  - Create filtering status and OpenAI usage metrics endpoint
  - Write API tests for OpenAI filtering service endpoints
  - _Requirements: 4.1, 4.3, 5.1_

- [x] 8.3 Build indexing service API
  - Implement IndexingController with full and incremental sync endpoints
  - Create indexing status and progress monitoring endpoint
  - Build manual sync trigger with proper authentication
  - Write API tests for indexing endpoints
  - _Requirements: 2.1, 3.1, 3.2_

- [ ] 9. Implement comprehensive error handling
  - Create centralized error handling middleware for API responses
  - Build retry mechanisms with exponential backoff for external services
  - Implement graceful degradation when dependencies are unavailable
  - Create detailed logging for debugging and monitoring
  - Write tests for error scenarios and recovery mechanisms
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Build frontend user interface
- [ ] 10.1 Create authentication UI
  - Build login page with @ashoka.edu.in domain validation
  - Implement OAuth callback handling and token management
  - Create session management and automatic token refresh
  - Write frontend tests for authentication flows
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 10.2 Implement email browsing interface
  - Create email list view with importance filtering
  - Build search interface with full-text search capabilities
  - Implement email detail view with metadata display
  - Create importance classification controls for user feedback
  - Write frontend tests for email browsing functionality
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 10.3 Build expectations management interface
  - Create interface for users to define and update their email importance expectations
  - Implement natural language input for describing what makes emails important
  - Build expectations preview showing how current criteria would filter existing emails
  - Create interface for reviewing and adjusting OpenAI filtering results
  - Write frontend tests for expectations management workflows
  - _Requirements: 4.1, 4.2, 4.4_

- [ ] 11. Create background job processing
  - Implement job queue system for email synchronization tasks
  - Build scheduled jobs for regular incremental indexing
  - Create job monitoring and failure notification system
  - Write tests for background job processing and scheduling
  - _Requirements: 3.1, 3.4, 3.5_

- [ ] 12. Implement system monitoring and health checks
  - Create health check endpoints for all services including OpenAI API connectivity
  - Build monitoring for email sync status and OpenAI filtering performance
  - Implement alerting for system failures, OpenAI API issues, and performance problems
  - Create dashboard for system status, OpenAI usage metrics, and filtering accuracy
  - Write tests for monitoring and health check functionality
  - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [ ] 13. Add comprehensive testing and validation
  - Create end-to-end tests covering complete user workflows
  - Build performance tests for large email volumes and concurrent users
  - Implement security tests for authentication and data access
  - Create load tests for email indexing and search performance
  - Write integration tests for external service dependencies
  - _Requirements: All requirements need thorough testing coverage_