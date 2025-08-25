import { Database } from 'sqlite';
import { EmailFetcher, RawEmailData } from '../email/EmailFetcher';
import { EmailParser } from '../email/EmailParser';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { SyncStateManager } from '../sync/SyncStateManager';
import { Email, EmailRow, SyncState } from '../../types/models';
import { v4 as uuidv4 } from 'uuid';

/**
 * IncrementalIndexer handles processing only new emails since the last sync
 * It includes deduplication, embedding generation, and error handling
 */
export class IncrementalIndexer {
  private maxRetries: number = 3;
  private retryDelayMs: number = 1000;

  constructor(
    private db: Database,
    private emailFetcher: EmailFetcher,
    private emailParser: EmailParser,
    private vectorService: VectorEmbeddingService,
    private syncStateManager: SyncStateManager
  ) {}

  private isDebug(): boolean {
    return process.env.INDEXING_DEBUG === 'true';
  }

  private debugLog(message: string, ...args: any[]) {
    if (this.isDebug()) {
      console.log(`[INDEXING DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Process incremental indexing for a user
   */
  async processIncrementalSync(userId: string): Promise<{
    emailsProcessed: number;
    emailsSkipped: number;
    errors: string[];
  }> {
    const result = {
      emailsProcessed: 0,
      emailsSkipped: 0,
      errors: [] as string[]
    };

    try {
      // Update sync status to 'syncing'
      await this.syncStateManager.updateSyncStatus(userId, 'syncing');

      // Get current sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        throw new Error(`No sync state found for user ${userId}`);
      }

      // Fetch new emails since last sync
      const newEmails = await this.fetchNewEmails(userId, syncState);
      this.debugLog(`Incremental: fetched ${newEmails.length} emails since ${syncState.lastSyncAt.toISOString()}. Sample:`, newEmails.slice(0, 5).map(e => ({ id: e.id, snippet: (e.snippet || '').slice(0, 80) })));
      console.log(`📧 Found ${newEmails.length} new emails for user ${userId}`);

      // Process each email
      for (const rawEmail of newEmails) {
        try {
          this.debugLog(`Evaluating email ${rawEmail.id}`);
          const processed = await this.processEmail(userId, rawEmail);
          if (processed) {
            result.emailsProcessed++;
            this.debugLog(`Stored email ${rawEmail.id}`);
          } else {
            result.emailsSkipped++;
          }
        } catch (error) {
          const errorMsg = `Failed to process email ${rawEmail.id}: ${error}`;
          console.error('❌', errorMsg);
          result.errors.push(errorMsg);
        }
      }

      // Update sync state with results
      const lastMessageId = newEmails.length > 0 ? newEmails[newEmails.length - 1].id : syncState.lastMessageId;
      await this.syncStateManager.updateLastSync(userId, lastMessageId, result.emailsProcessed);
      await this.syncStateManager.updateSyncStatus(userId, 'idle');

      console.log(`✅ Incremental sync completed for user ${userId}: ${result.emailsProcessed} processed, ${result.emailsSkipped} skipped, ${result.errors.length} errors`);

    } catch (error) {
      const errorMsg = `Incremental sync failed for user ${userId}: ${error}`;
      console.error('❌', errorMsg);
      result.errors.push(errorMsg);
      
      // Update sync status to error
      await this.syncStateManager.updateSyncStatus(userId, 'error', errorMsg);
    }

    return result;
  }

  /**
   * Process incremental sync for multiple users
   */
  async processMultipleUsers(userIds: string[]): Promise<{
    totalProcessed: number;
    totalSkipped: number;
    totalErrors: number;
    userResults: Record<string, { processed: number; skipped: number; errors: string[] }>;
  }> {
    const overallResult = {
      totalProcessed: 0,
      totalSkipped: 0,
      totalErrors: 0,
      userResults: {} as Record<string, { processed: number; skipped: number; errors: string[] }>
    };

    for (const userId of userIds) {
      try {
        const userResult = await this.processIncrementalSync(userId);
        
        overallResult.totalProcessed += userResult.emailsProcessed;
        overallResult.totalSkipped += userResult.emailsSkipped;
        overallResult.totalErrors += userResult.errors.length;
        
        overallResult.userResults[userId] = {
          processed: userResult.emailsProcessed,
          skipped: userResult.emailsSkipped,
          errors: userResult.errors
        };
      } catch (error) {
        const errorMsg = `Failed to process user ${userId}: ${error}`;
        console.error('❌', errorMsg);
        
        overallResult.totalErrors++;
        overallResult.userResults[userId] = {
          processed: 0,
          skipped: 0,
          errors: [errorMsg]
        };
      }
    }

    return overallResult;
  }

  /**
   * Fetch new emails since last sync
   */
  private async fetchNewEmails(userId: string, syncState: SyncState): Promise<RawEmailData[]> {
    // Fetch email list first
    const emailListResult = await this.emailFetcher.fetchEmailsSince(
      syncState.lastSyncAt,
      100 // Process in batches
    );

    // If no messages found, return empty array
    if (!emailListResult.messages || emailListResult.messages.length === 0) {
      return [];
    }

    // Extract message IDs
    const messageIds = emailListResult.messages
      .map(msg => msg.id)
      .filter((id): id is string => !!id);

    // Fetch full email data for each message
    return await this.emailFetcher.fetchEmailsBatch(messageIds);
  }

  /**
   * Process a single email with deduplication and error handling
   */
  private async processEmail(userId: string, rawEmail: any): Promise<boolean> {
    try {
      // Check for deduplication using Gmail message ID
      const existingEmail = await this.checkEmailExists(userId, rawEmail.id);
      if (existingEmail) {
        console.log(`⏭️  Skipping duplicate email: ${rawEmail.id}`);
        return false;
      }

      // Parse email metadata
      const parsedEmail = await this.emailParser.parseEmail(rawEmail);
      
      // Create email record
      const email: Email = {
        id: uuidv4(),
        userId,
        messageId: parsedEmail.messageId,
        subject: parsedEmail.subject,
        sender: parsedEmail.sender,
        recipients: parsedEmail.recipients,
        content: parsedEmail.content,
        htmlContent: parsedEmail.htmlContent,
        receivedAt: parsedEmail.receivedAt,
        indexedAt: new Date(),
        importance: 'unclassified',
        importanceConfidence: undefined,
        userLabeled: false,
        vectorId: undefined,
        metadata: parsedEmail.metadata
      };

      // Store email in database with retry logic
      await this.storeEmailWithRetry(email);

      // Generate and store embedding
      try {
        const emailVector = await this.vectorService.processEmailEmbedding(
          email.id,
          userId,
          this.prepareContentForEmbedding(email)
        );
        
        // Update email with vector ID
        await this.updateEmailVectorId(email.id, emailVector.id);
        
      } catch (embeddingError) {
        console.error(`⚠️  Failed to generate embedding for email ${email.id}:`, embeddingError);
        // Continue processing even if embedding fails
      }

      return true;

    } catch (error) {
      console.error(`❌ Failed to process email ${rawEmail.id}:`, error);
      throw error;
    }
  }

  /**
   * Check if email already exists in database
   */
  private async checkEmailExists(userId: string, messageId: string): Promise<boolean> {
    const existing = await this.db.get(
      'SELECT id FROM emails WHERE user_id = ? AND message_id = ?',
      [userId, messageId]
    );
    return !!existing;
  }

  /**
   * Store email in database with retry logic
   */
  private async storeEmailWithRetry(email: Email): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.storeEmail(email);
        return; // Success
      } catch (error) {
        lastError = error as Error;
        console.error(`❌ Attempt ${attempt} failed to store email ${email.id}:`, error);
        
        if (attempt < this.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed to store email after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Store email in database
   */
  private async storeEmail(email: Email): Promise<void> {
    const emailRow: Omit<EmailRow, 'rowid'> = {
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

    await this.db.run(
      `INSERT INTO emails (
        id, user_id, message_id, subject, sender, recipients, content, html_content,
        received_at, indexed_at, importance, importance_confidence, user_labeled,
        vector_id, has_attachments, thread_id, labels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emailRow.id, emailRow.user_id, emailRow.message_id, emailRow.subject,
        emailRow.sender, emailRow.recipients, emailRow.content, emailRow.html_content,
        emailRow.received_at, emailRow.indexed_at, emailRow.importance,
        emailRow.importance_confidence, emailRow.user_labeled, emailRow.vector_id,
        emailRow.has_attachments, emailRow.thread_id, emailRow.labels
      ]
    );
  }

  /**
   * Update email with vector ID
   */
  private async updateEmailVectorId(emailId: string, vectorId: string): Promise<void> {
    await this.db.run(
      'UPDATE emails SET vector_id = ? WHERE id = ?',
      [vectorId, emailId]
    );
  }

  /**
   * Prepare email content for embedding generation
   */
  private prepareContentForEmbedding(email: Email): string {
    // Combine subject and content for better embedding
    const parts = [
      `Subject: ${email.subject}`,
      `From: ${email.sender}`,
      `Content: ${email.content}`
    ];
    
    return parts.join('\n\n');
  }

  /**
   * Get indexing statistics
   */
  async getIndexingStats(): Promise<{
    totalEmails: number;
    emailsWithEmbeddings: number;
    recentlyIndexed: number;
  }> {
    const stats = await this.db.get<{
      total_emails: number;
      emails_with_embeddings: number;
      recently_indexed: number;
    }>(
      `SELECT 
        COUNT(*) as total_emails,
        SUM(CASE WHEN vector_id IS NOT NULL THEN 1 ELSE 0 END) as emails_with_embeddings,
        SUM(CASE WHEN indexed_at > datetime('now', '-1 hour') THEN 1 ELSE 0 END) as recently_indexed
       FROM emails`
    );

    return {
      totalEmails: stats?.total_emails || 0,
      emailsWithEmbeddings: stats?.emails_with_embeddings || 0,
      recentlyIndexed: stats?.recently_indexed || 0
    };
  }

  /**
   * Clean up failed indexing attempts
   */
  async cleanupFailedIndexing(userId: string): Promise<void> {
    try {
      // Calculate cutoff time (1 hour ago)
      const cutoffTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      
      // Remove emails without embeddings that are older than 1 hour
      const result = await this.db.run(
        `DELETE FROM emails 
         WHERE user_id = ? 
         AND vector_id IS NULL 
         AND indexed_at < ?`,
        [userId, cutoffTime]
      );
      
      console.log(`🧹 Cleaned up failed indexing attempts for user ${userId} (${result.changes} emails removed)`);
    } catch (error) {
      console.error('❌ Failed to cleanup failed indexing:', error);
    }
  }
}