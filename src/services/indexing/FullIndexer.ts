import { Database } from 'sqlite';
import { EmailFetcher, RawEmailData } from '../email/EmailFetcher';
import { EmailParser } from '../email/EmailParser';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { SyncStateManager } from '../sync/SyncStateManager';
import { Email, EmailRow } from '../../types/models';
import { v4 as uuidv4 } from 'uuid';

/**
 * FullIndexer handles complete email history indexing for new users
 * It includes progress tracking, batch processing, and user notification
 */
export class FullIndexer {
  private batchSize: number = 50;
  private maxRetries: number = 3;
  private retryDelayMs: number = 100; // Reduced for faster tests

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
   * Process full indexing for a new user
   */
  async processFullIndexing(
    userId: string,
    progressCallback?: (progress: FullIndexingProgress) => void
  ): Promise<FullIndexingResult> {
    const result: FullIndexingResult = {
      totalEmails: 0,
      emailsProcessed: 0,
      emailsSkipped: 0,
      errors: [],
      startTime: new Date(),
      endTime: new Date(),
      isComplete: false
    };

    try {
      // Acquire sync lock to prevent concurrent runs
      const acquired = await this.syncStateManager.tryAcquireSyncLock(userId);
      if (!acquired) {
        const msg = `Another indexing run is already in progress for ${userId}. Skipping.`;
        console.warn(msg);
        result.errors.push(msg);
        result.endTime = new Date();
        return result;
      }

      // Get or create sync state
      let syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        syncState = await this.syncStateManager.createSyncState(userId);
      }

      console.log(`🔄 Starting full indexing for user ${userId}`);

      // Get total email count estimate
      const initialFetch = await this.emailFetcher.fetchAllEmails(undefined, 1);
      result.totalEmails = initialFetch.resultSizeEstimate || 0;

      if (progressCallback) {
        progressCallback({
          phase: 'initializing',
          totalEmails: result.totalEmails,
          processedEmails: 0,
          currentBatch: 0,
          totalBatches: Math.ceil(result.totalEmails / this.batchSize),
          errors: []
        });
      }

      // Process emails in batches
      let pageToken: string | undefined = undefined;
      let batchNumber = 0;
      let totalBatches = Math.ceil(result.totalEmails / this.batchSize);

      do {
        batchNumber++;
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} for user ${userId}`);

        try {
          // Fetch batch of email IDs
          const emailListResult = await this.emailFetcher.fetchAllEmails(pageToken, this.batchSize);
          const idSample = (emailListResult.messages || [])
            .map(m => m.id)
            .filter((id): id is string => !!id)
            .slice(0, 5);
          this.debugLog(`Batch ${batchNumber}: fetched ${emailListResult.messages?.length || 0} message IDs. Sample:`, idSample);
          
          if (!emailListResult.messages || emailListResult.messages.length === 0) {
            break;
          }

          // Extract message IDs
          const messageIds = emailListResult.messages
            .map(msg => msg.id)
            .filter((id): id is string => !!id);

          // Fetch full email data for batch
          const rawEmails = await this.emailFetcher.fetchEmailsBatch(messageIds);
          const rawSample = rawEmails.slice(0, 5).map(e => ({ id: e.id, snippet: (e.snippet || '').slice(0, 80) }));
          this.debugLog(`Batch ${batchNumber}: fetched ${rawEmails.length} full emails. Sample:`, rawSample);

          // Process each email in the batch
          const batchResult = await this.processBatch(userId, rawEmails);
          
          result.emailsProcessed += batchResult.processed;
          result.emailsSkipped += batchResult.skipped;
          result.errors.push(...batchResult.errors);

          // Update progress
          if (progressCallback) {
            progressCallback({
              phase: 'indexing',
              totalEmails: result.totalEmails,
              processedEmails: result.emailsProcessed + result.emailsSkipped,
              currentBatch: batchNumber,
              totalBatches,
              errors: result.errors
            });
          }

          // Update sync state with progress
          await this.syncStateManager.updateLastSync(
            userId,
            rawEmails.length > 0 ? rawEmails[rawEmails.length - 1].id : undefined,
            batchResult.processed
          );

          pageToken = emailListResult.nextPageToken;

          // Add delay between batches to avoid rate limiting
          if (pageToken) {
            await this.delay(50); // Reduced for faster tests
          }

        } catch (batchError) {
          const errorMsg = `Failed to process batch ${batchNumber}: ${batchError}`;
          console.error('❌', errorMsg);
          result.errors.push(errorMsg);
          
          // Continue with next batch instead of failing completely
          pageToken = undefined; // This will exit the loop
        }

      } while (pageToken && batchNumber < totalBatches);

      // Mark initial sync as complete
      await this.syncStateManager.markInitialSyncComplete(userId);
      
      result.isComplete = true;
      result.endTime = new Date();

      console.log(`✅ Full indexing completed for user ${userId}: ${result.emailsProcessed} processed, ${result.emailsSkipped} skipped, ${result.errors.length} errors`);

      if (progressCallback) {
        progressCallback({
          phase: 'completed',
          totalEmails: result.totalEmails,
          processedEmails: result.emailsProcessed + result.emailsSkipped,
          currentBatch: batchNumber,
          totalBatches,
          errors: result.errors
        });
      }

    } catch (error) {
      const errorMsg = `Full indexing failed for user ${userId}: ${error}`;
      console.error('❌', errorMsg);
      result.errors.push(errorMsg);
      result.endTime = new Date();
      
      // Update sync status to error
      await this.syncStateManager.updateSyncStatus(userId, 'error', errorMsg);

      if (progressCallback) {
        progressCallback({
          phase: 'error',
          totalEmails: result.totalEmails,
          processedEmails: result.emailsProcessed + result.emailsSkipped,
          currentBatch: 0,
          totalBatches: 0,
          errors: result.errors
        });
      }
    }

    return result;
  }

  /**
   * Process a batch of emails
   */
  private async processBatch(userId: string, rawEmails: RawEmailData[]): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    const batchResult = {
      processed: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const rawEmail of rawEmails) {
      this.debugLog(`Evaluating email ${rawEmail.id}`);
      try {
        // Check for deduplication using Gmail message ID
        const existing = await this.getExistingEmailRecord(userId, rawEmail.id);
        if (existing) {
          if (!existing.vector_id) {
            // Email exists but is missing embedding; generate and attach vector
            const parsedEmail = await this.emailParser.parseEmail(rawEmail);
            try {
              const emailVector = await this.vectorService.processEmailEmbedding(
                existing.id,
                userId,
                this.prepareContentForEmbedding({
                  id: existing.id,
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
                } as any)
              );
              await this.updateEmailVectorId(existing.id, emailVector.id);
              this.debugLog(`Re-embedded existing email ${existing.id} (messageId: ${rawEmail.id})`);
              batchResult.processed++;
            } catch (embeddingError) {
              console.error(`⚠️  Failed to (re)generate embedding for existing email ${existing.id}:`, embeddingError);
              batchResult.errors.push(String(embeddingError));
            }
          } else {
            console.log(`⏭️  Skipping duplicate email: ${rawEmail.id}`);
            batchResult.skipped++;
          }
          continue;
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
        this.debugLog(`Stored email ${email.id} (messageId: ${email.messageId}) from ${email.sender} with subject: ${email.subject}`);

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

        batchResult.processed++;

      } catch (error) {
        const errorMsg = `Failed to process email ${rawEmail.id}: ${error}`;
        console.error('❌', errorMsg);
        batchResult.errors.push(errorMsg);
      }
    }

    return batchResult;
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
   * Get existing email record (id and vector status) by user and Gmail message id
   */
  private async getExistingEmailRecord(userId: string, messageId: string): Promise<{ id: string; vector_id: string | null } | null> {
    const row = await this.db.get(
      'SELECT id, vector_id FROM emails WHERE user_id = ? AND message_id = ?',
      [userId, messageId]
    );
    if (!row) return null;
    return { id: row.id, vector_id: row.vector_id };
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
   * Utility method to add delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get full indexing statistics
   */
  async getFullIndexingStats(): Promise<{
    totalUsers: number;
    usersWithCompletedIndexing: number;
    usersCurrentlyIndexing: number;
    averageEmailsPerUser: number;
  }> {
    const stats = await this.db.get<{
      total_users: number;
      completed_indexing: number;
      currently_indexing: number;
      avg_emails: number;
    }>(
      `SELECT 
        COUNT(DISTINCT s.user_id) as total_users,
        SUM(CASE WHEN s.is_initial_sync_complete = 1 THEN 1 ELSE 0 END) as completed_indexing,
        SUM(CASE WHEN s.current_sync_status = 'syncing' THEN 1 ELSE 0 END) as currently_indexing,
        COALESCE(AVG(s.total_emails_indexed), 0) as avg_emails
       FROM sync_state s`
    );

    return {
      totalUsers: stats?.total_users || 0,
      usersWithCompletedIndexing: stats?.completed_indexing || 0,
      usersCurrentlyIndexing: stats?.currently_indexing || 0,
      averageEmailsPerUser: Math.round(stats?.avg_emails || 0)
    };
  }

  /**
   * Resume interrupted full indexing
   */
  async resumeFullIndexing(
    userId: string,
    progressCallback?: (progress: FullIndexingProgress) => void
  ): Promise<FullIndexingResult> {
    console.log(`🔄 Resuming full indexing for user ${userId}`);
    
    // Check if user has incomplete indexing
    const syncState = await this.syncStateManager.getSyncState(userId);
    if (!syncState || syncState.isInitialSyncComplete) {
      throw new Error(`No incomplete indexing found for user ${userId}`);
    }

    // Resume from where we left off
    return this.processFullIndexing(userId, progressCallback);
  }

  /**
   * Cancel ongoing full indexing
   */
  async cancelFullIndexing(userId: string): Promise<void> {
    console.log(`🛑 Cancelling full indexing for user ${userId}`);
    
    // Update sync status to idle
    await this.syncStateManager.updateSyncStatus(userId, 'idle');
    
    // Note: In a real implementation, you might want to set a cancellation flag
    // that the indexing process checks periodically
  }
}

/**
 * Progress information for full indexing
 */
export interface FullIndexingProgress {
  phase: 'initializing' | 'indexing' | 'completed' | 'error';
  totalEmails: number;
  processedEmails: number;
  currentBatch: number;
  totalBatches: number;
  errors: string[];
}

/**
 * Result of full indexing operation
 */
export interface FullIndexingResult {
  totalEmails: number;
  emailsProcessed: number;
  emailsSkipped: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  isComplete: boolean;
}