import Joi from 'joi';
import { User, Email, EmailVector, TrainingExample, SyncState } from '../types/models';

/**
 * Validation schemas and functions for data models
 */

// Validation schemas
export const userSchema = Joi.object<User>({
  id: Joi.string().uuid().required(),
  email: Joi.string()
    .email()
    .pattern(/@ashoka\.edu\.in$/)
    .required()
    .messages({
      'string.pattern.base': 'Email must be from @ashoka.edu.in domain'
    }),
  createdAt: Joi.date().required(),
  lastLoginAt: Joi.date().required(),
  oauthTokens: Joi.object({
    accessToken: Joi.string().required(),
    refreshToken: Joi.string().required(),
    expiresAt: Joi.date().required()
  }).required(),
  preferences: Joi.object({
    autoClassify: Joi.boolean().required(),
    confidenceThreshold: Joi.number().min(0).max(1).required()
  }).required()
});

export const emailSchema = Joi.object<Email>({
  id: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  messageId: Joi.string().required(),
  subject: Joi.string().allow('').required(),
  sender: Joi.string().email().required(),
  recipients: Joi.array().items(Joi.string().email()).min(1).required(),
  content: Joi.string().allow('').required(),
  htmlContent: Joi.string().allow('').optional(),
  receivedAt: Joi.date().required(),
  indexedAt: Joi.date().required(),
  importance: Joi.string().valid('important', 'not_important', 'unclassified').required(),
  importanceConfidence: Joi.number().min(0).max(1).optional(),
  userLabeled: Joi.boolean().required(),
  vectorId: Joi.string().optional(),
  metadata: Joi.object({
    hasAttachments: Joi.boolean().required(),
    threadId: Joi.string().optional(),
    labels: Joi.array().items(Joi.string()).required()
  }).required()
});

export const emailVectorSchema = Joi.object<EmailVector>({
  id: Joi.string().uuid().required(),
  emailId: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  embedding: Joi.array().items(Joi.number()).min(1).required(),
  embeddingModel: Joi.string().required(),
  createdAt: Joi.date().required()
});

export const trainingExampleSchema = Joi.object<TrainingExample>({
  id: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  emailId: Joi.string().uuid().required(),
  importance: Joi.string().valid('important', 'not_important').required(),
  createdAt: Joi.date().required(),
  features: Joi.object({
    subject: Joi.string().allow('').required(),
    sender: Joi.string().email().required(),
    content: Joi.string().allow('').required(),
    hasAttachments: Joi.boolean().required()
  }).required()
});

export const syncStateSchema = Joi.object<SyncState>({
  userId: Joi.string().uuid().required(),
  lastSyncAt: Joi.date().required(),
  lastMessageId: Joi.string().optional(),
  totalEmailsIndexed: Joi.number().integer().min(0).required(),
  isInitialSyncComplete: Joi.boolean().required(),
  currentSyncStatus: Joi.string().valid('idle', 'syncing', 'error').required(),
  lastError: Joi.string().optional()
});

// Validation functions
export function validateUser(user: unknown): { error?: Joi.ValidationError; value?: User } {
  return userSchema.validate(user, { abortEarly: false });
}

export function validateEmail(email: unknown): { error?: Joi.ValidationError; value?: Email } {
  return emailSchema.validate(email, { abortEarly: false });
}

export function validateEmailVector(emailVector: unknown): { error?: Joi.ValidationError; value?: EmailVector } {
  return emailVectorSchema.validate(emailVector, { abortEarly: false });
}

export function validateTrainingExample(trainingExample: unknown): { error?: Joi.ValidationError; value?: TrainingExample } {
  return trainingExampleSchema.validate(trainingExample, { abortEarly: false });
}

export function validateSyncState(syncState: unknown): { error?: Joi.ValidationError; value?: SyncState } {
  return syncStateSchema.validate(syncState, { abortEarly: false });
}

// Domain-specific validation functions
export function isAshokaEmail(email: string): boolean {
  return email.endsWith('@ashoka.edu.in');
}

export function isValidImportance(importance: string): importance is 'important' | 'not_important' | 'unclassified' {
  return ['important', 'not_important', 'unclassified'].includes(importance);
}

export function isValidSyncStatus(status: string): status is 'idle' | 'syncing' | 'error' {
  return ['idle', 'syncing', 'error'].includes(status);
}

export function validateConfidenceScore(score: number): boolean {
  return score >= 0 && score <= 1;
}

export function validateEmbeddingDimension(embedding: number[], expectedDimension: number = 1536): boolean {
  return embedding.length === expectedDimension && embedding.every(val => typeof val === 'number' && !isNaN(val));
}

// Utility functions for data transformation and validation
export function sanitizeEmailContent(content: string): string {
  // Remove potentially harmful content and normalize whitespace
  return content
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

export function validateEmailAddress(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateMessageId(messageId: string): boolean {
  // Gmail message IDs are typically alphanumeric with some special characters
  const messageIdRegex = /^[a-zA-Z0-9._-]+$/;
  return messageIdRegex.test(messageId) && messageId.length > 0;
}

// Custom validation error class
export class ValidationError extends Error {
  public details: Joi.ValidationErrorItem[];

  constructor(message: string, details: Joi.ValidationErrorItem[]) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// Helper function to throw validation errors
export function throwValidationError(result: { error?: Joi.ValidationError }): never {
  if (result.error) {
    throw new ValidationError(result.error.message, result.error.details);
  }
  throw new Error('Validation failed');
}