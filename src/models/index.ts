/**
 * Models module exports
 */

// Type definitions
export * from '../types/models';

// Validation functions and schemas
export * from './validation';

// Model transformers
export * from './transformers';

// Database migrations
export * from '../database/migrations';

// Configuration
export { initializeDatabase, getDatabase, closeDatabase } from '../config/database';
export { initializeQdrant, getQdrantClient, createEmailCollection, getCollectionName } from '../config/qdrant';