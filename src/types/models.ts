/**
 * Core data models for the Intelligent Email Filter system
 */

export interface User {
  id: string;
  email: string; // Must end with @ashoka.edu.in
  createdAt: Date;
  lastLoginAt: Date;
  oauthTokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };
  preferences: {
    autoClassify: boolean;
    confidenceThreshold: number;
  };
}

export interface Email {
  id: string;
  userId: string;
  messageId: string; // Provider's unique message ID
  subject: string;
  sender: string;
  recipients: string[];
  content: string;
  htmlContent?: string;
  receivedAt: Date;
  indexedAt: Date;
  importance: 'important' | 'not_important' | 'unclassified';
  importanceConfidence?: number;
  userLabeled: boolean; // True if user manually classified
  vectorId?: string; // Reference to vector embedding in vector DB
  metadata: {
    hasAttachments: boolean;
    threadId?: string;
    labels: string[];
  };
}

export interface EmailVector {
  id: string;
  emailId: string;
  userId: string;
  embedding: number[]; // Vector embedding of email content
  embeddingModel: string; // Model used to generate embedding
  createdAt: Date;
}

export interface TrainingExample {
  id: string;
  userId: string;
  emailId: string;
  importance: 'important' | 'not_important';
  createdAt: Date;
  features: {
    subject: string;
    sender: string;
    content: string;
    hasAttachments: boolean;
  };
}

export interface SyncState {
  userId: string;
  lastSyncAt: Date;
  lastMessageId?: string;
  totalEmailsIndexed: number;
  isInitialSyncComplete: boolean;
  currentSyncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string;
}

export interface UserExpectations {
  id: string;
  userId: string;
  title: string;
  description: string; // Natural language description of what makes emails important
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  examples?: {
    important: string[]; // Example descriptions of important emails
    notImportant: string[]; // Example descriptions of not important emails
  };
}

// Database row interfaces (for SQLite storage)
export interface UserRow {
  id: string;
  email: string;
  created_at: string;
  last_login_at: string;
  oauth_access_token: string;
  oauth_refresh_token: string;
  oauth_expires_at: string;
  auto_classify: number; // SQLite boolean as integer
  confidence_threshold: number;
}

export interface EmailRow {
  id: string;
  user_id: string;
  message_id: string;
  subject: string;
  sender: string;
  recipients: string; // JSON string
  content: string;
  html_content?: string;
  received_at: string;
  indexed_at: string;
  importance: string;
  importance_confidence?: number;
  user_labeled: number; // SQLite boolean as integer
  vector_id?: string;
  has_attachments: number; // SQLite boolean as integer
  thread_id?: string;
  labels: string; // JSON string
}

export interface TrainingExampleRow {
  id: string;
  user_id: string;
  email_id: string;
  importance: string;
  created_at: string;
  subject: string;
  sender: string;
  content: string;
  has_attachments: number; // SQLite boolean as integer
}

export interface SyncStateRow {
  user_id: string;
  last_sync_at: string;
  last_message_id?: string;
  total_emails_indexed: number;
  is_initial_sync_complete: number; // SQLite boolean as integer
  current_sync_status: string;
  last_error?: string;
}

export interface UserExpectationsRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  is_active: number; // SQLite boolean as integer
  created_at: string;
  updated_at: string;
  important_examples?: string; // JSON string array
  not_important_examples?: string; // JSON string array
}