import { 
  User, Email, TrainingExample, SyncState,
  UserRow, EmailRow, TrainingExampleRow, SyncStateRow 
} from '../types/models';

/**
 * Transformation functions between database rows and model objects
 */

// User transformations
export function userRowToModel(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    createdAt: new Date(row.created_at),
    lastLoginAt: new Date(row.last_login_at),
    oauthTokens: {
      accessToken: row.oauth_access_token,
      refreshToken: row.oauth_refresh_token,
      expiresAt: new Date(row.oauth_expires_at)
    },
    preferences: {
      autoClassify: Boolean(row.auto_classify),
      confidenceThreshold: row.confidence_threshold
    }
  };
}

export function userModelToRow(user: User): UserRow {
  return {
    id: user.id,
    email: user.email,
    created_at: user.createdAt.toISOString(),
    last_login_at: user.lastLoginAt.toISOString(),
    oauth_access_token: user.oauthTokens.accessToken,
    oauth_refresh_token: user.oauthTokens.refreshToken,
    oauth_expires_at: user.oauthTokens.expiresAt.toISOString(),
    auto_classify: user.preferences.autoClassify ? 1 : 0,
    confidence_threshold: user.preferences.confidenceThreshold
  };
}

// Email transformations
export function emailRowToModel(row: EmailRow): Email {
  return {
    id: row.id,
    userId: row.user_id,
    messageId: row.message_id,
    subject: row.subject,
    sender: row.sender,
    recipients: JSON.parse(row.recipients),
    content: row.content,
    htmlContent: row.html_content,
    receivedAt: new Date(row.received_at),
    indexedAt: new Date(row.indexed_at),
    importance: row.importance as 'important' | 'not_important' | 'unclassified',
    importanceConfidence: row.importance_confidence,
    userLabeled: Boolean(row.user_labeled),
    vectorId: row.vector_id,
    metadata: {
      hasAttachments: Boolean(row.has_attachments),
      threadId: row.thread_id,
      labels: JSON.parse(row.labels)
    }
  };
}

export function emailModelToRow(email: Email): EmailRow {
  return {
    id: email.id,
    user_id: email.userId,
    message_id: email.messageId,
    subject: email.subject,
    sender: email.sender,
    recipients: JSON.stringify(email.recipients),
    content: email.content,
    html_content: email.htmlContent,
    received_at: email.receivedAt.toISOString(),
    indexed_at: email.indexedAt.toISOString(),
    importance: email.importance,
    importance_confidence: email.importanceConfidence,
    user_labeled: email.userLabeled ? 1 : 0,
    vector_id: email.vectorId,
    has_attachments: email.metadata.hasAttachments ? 1 : 0,
    thread_id: email.metadata.threadId,
    labels: JSON.stringify(email.metadata.labels)
  };
}

// Training example transformations
export function trainingExampleRowToModel(row: TrainingExampleRow): TrainingExample {
  return {
    id: row.id,
    userId: row.user_id,
    emailId: row.email_id,
    importance: row.importance as 'important' | 'not_important',
    createdAt: new Date(row.created_at),
    features: {
      subject: row.subject,
      sender: row.sender,
      content: row.content,
      hasAttachments: Boolean(row.has_attachments)
    }
  };
}

export function trainingExampleModelToRow(example: TrainingExample): TrainingExampleRow {
  return {
    id: example.id,
    user_id: example.userId,
    email_id: example.emailId,
    importance: example.importance,
    created_at: example.createdAt.toISOString(),
    subject: example.features.subject,
    sender: example.features.sender,
    content: example.features.content,
    has_attachments: example.features.hasAttachments ? 1 : 0
  };
}

// Sync state transformations
export function syncStateRowToModel(row: SyncStateRow): SyncState {
  return {
    userId: row.user_id,
    lastSyncAt: new Date(row.last_sync_at),
    lastMessageId: row.last_message_id,
    totalEmailsIndexed: row.total_emails_indexed,
    isInitialSyncComplete: Boolean(row.is_initial_sync_complete),
    currentSyncStatus: row.current_sync_status as 'idle' | 'syncing' | 'error',
    lastError: row.last_error
  };
}

export function syncStateModelToRow(syncState: SyncState): SyncStateRow {
  return {
    user_id: syncState.userId,
    last_sync_at: syncState.lastSyncAt.toISOString(),
    last_message_id: syncState.lastMessageId,
    total_emails_indexed: syncState.totalEmailsIndexed,
    is_initial_sync_complete: syncState.isInitialSyncComplete ? 1 : 0,
    current_sync_status: syncState.currentSyncStatus,
    last_error: syncState.lastError
  };
}

// Utility functions for safe JSON parsing
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('Failed to parse JSON:', jsonString, error);
    return fallback;
  }
}

export function safeJsonStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch (error) {
    console.warn('Failed to stringify object:', obj, error);
    return '{}';
  }
}

// Batch transformation functions
export function transformUserRows(rows: UserRow[]): User[] {
  return rows.map(userRowToModel);
}

export function transformEmailRows(rows: EmailRow[]): Email[] {
  return rows.map(emailRowToModel);
}

export function transformTrainingExampleRows(rows: TrainingExampleRow[]): TrainingExample[] {
  return rows.map(trainingExampleRowToModel);
}

export function transformSyncStateRows(rows: SyncStateRow[]): SyncState[] {
  return rows.map(syncStateRowToModel);
}