import { Email } from '../../types/models';
import { EmailClassifier, ClassificationResult } from './EmailClassifier';
import { UserExpectationsManager } from './UserExpectationsManager';
import { getDatabase } from '../../config/database';

export interface FilteringStats {
  totalProcessed: number;
  importantCount: number;
  notImportantCount: number;
  flaggedForReview: number;
  averageConfidence: number;
  processingTimeMs: number;
}

export interface FilteringOptions {
  batchSize?: number;
  confidenceThreshold?: number;
  skipAlreadyClassified?: boolean;
}

/**
 * Intelligent filtering pipeline that orchestrates automatic email classification
 * Processes emails in batches and handles confidence-based flagging
 */
export class FilteringPipeline {
  private classifier: EmailClassifier;
  private expectationsManager: UserExpectationsManager;

  constructor() {
    this.classifier = new EmailClassifier();
    this.expectationsManager = new UserExpectationsManager();
  }

  /**
   * Process newly indexed emails for a user
   */
  async processNewEmails(userId: string, options: FilteringOptions = {}): Promise<FilteringStats> {
    const startTime = Date.now();
    const {
      batchSize = 10,
      confidenceThreshold = 0.7,
      skipAlreadyClassified = true
    } = options;

    try {
      // Check if user has active expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        console.log(`No active expectations found for user ${userId}, skipping filtering`);
        return this.createEmptyStats(Date.now() - startTime);
      }

      // Get unclassified emails for the user
      const emails = await this.getUnclassifiedEmails(userId, skipAlreadyClassified);
      if (emails.length === 0) {
        console.log(`No unclassified emails found for user ${userId}`);
        return this.createEmptyStats(Date.now() - startTime);
      }

      console.log(`Processing ${emails.length} emails for user ${userId}`);

      // Process emails in batches
      const allResults: ClassificationResult[] = [];
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(emails.length / batchSize)}`);
        
        const batchResults = await this.classifier.classifyEmailsBatch(batch, userId, expectations);
        allResults.push(...batchResults);

        // Add delay between batches to avoid overwhelming external services
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Flag emails for manual review based on confidence
      const flaggedEmails = await this.flagLowConfidenceEmails(allResults, confidenceThreshold);

      // Generate statistics
      const stats = this.generateStats(allResults, Date.now() - startTime);
      stats.flaggedForReview = flaggedEmails.length;

      console.log(`Filtering completed for user ${userId}:`, stats);
      return stats;

    } catch (error) {
      console.error(`Error processing emails for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process specific emails (for manual triggering or reprocessing)
   */
  async processSpecificEmails(
    emailIds: string[],
    userId: string,
    options: FilteringOptions = {}
  ): Promise<FilteringStats> {
    const startTime = Date.now();
    const { batchSize = 10, confidenceThreshold = 0.7 } = options;

    try {
      // Check if user has active expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        throw new Error(`No active expectations found for user ${userId}`);
      }

      // Get specified emails
      const emails = await this.getEmailsByIds(emailIds, userId);
      if (emails.length === 0) {
        console.log(`No emails found for the specified IDs`);
        return this.createEmptyStats(Date.now() - startTime);
      }

      console.log(`Processing ${emails.length} specific emails for user ${userId}`);

      // Process emails in batches
      const allResults: ClassificationResult[] = [];
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        const batchResults = await this.classifier.classifyEmailsBatch(batch, userId, expectations);
        allResults.push(...batchResults);

        // Add delay between batches
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Flag emails for manual review
      const flaggedEmails = await this.flagLowConfidenceEmails(allResults, confidenceThreshold);

      // Generate statistics
      const stats = this.generateStats(allResults, Date.now() - startTime);
      stats.flaggedForReview = flaggedEmails.length;

      return stats;

    } catch (error) {
      console.error(`Error processing specific emails for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Process all unclassified emails for a user (full reprocessing)
   */
  async processAllUnclassifiedEmails(userId: string, options: FilteringOptions = {}): Promise<FilteringStats> {
    return this.processNewEmails(userId, { ...options, skipAlreadyClassified: false });
  }

  /**
   * Get filtering statistics for a user
   */
  async getFilteringStats(userId: string): Promise<{
    totalEmails: number;
    classifiedEmails: number;
    importantEmails: number;
    notImportantEmails: number;
    unclassifiedEmails: number;
    flaggedForReview: number;
    lastProcessedAt?: Date;
  }> {
    const db = await getDatabase();

    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_emails,
        SUM(CASE WHEN importance != 'unclassified' THEN 1 ELSE 0 END) as classified_emails,
        SUM(CASE WHEN importance = 'important' THEN 1 ELSE 0 END) as important_emails,
        SUM(CASE WHEN importance = 'not_important' THEN 1 ELSE 0 END) as not_important_emails,
        SUM(CASE WHEN importance = 'unclassified' THEN 1 ELSE 0 END) as unclassified_emails,
        SUM(CASE WHEN importance_confidence IS NOT NULL AND importance_confidence < 0.7 THEN 1 ELSE 0 END) as flagged_for_review,
        MAX(indexed_at) as last_processed_at
      FROM emails 
      WHERE user_id = ?
    `, [userId]);

    return {
      totalEmails: stats?.total_emails || 0,
      classifiedEmails: stats?.classified_emails || 0,
      importantEmails: stats?.important_emails || 0,
      notImportantEmails: stats?.not_important_emails || 0,
      unclassifiedEmails: stats?.unclassified_emails || 0,
      flaggedForReview: stats?.flagged_for_review || 0,
      lastProcessedAt: stats?.last_processed_at ? new Date(stats.last_processed_at) : undefined
    };
  }

  /**
   * Get unclassified emails for a user
   */
  private async getUnclassifiedEmails(userId: string, skipAlreadyClassified: boolean): Promise<Email[]> {
    const db = await getDatabase();
    
    let query = `
      SELECT * FROM emails 
      WHERE user_id = ?
    `;
    
    if (skipAlreadyClassified) {
      query += ` AND importance = 'unclassified'`;
    }
    
    query += ` ORDER BY received_at DESC`;

    const rows = await db.all(query, [userId]);
    
    return rows.map(row => ({
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
        labels: JSON.parse(row.labels || '[]')
      }
    }));
  }

  /**
   * Get emails by specific IDs
   */
  private async getEmailsByIds(emailIds: string[], userId: string): Promise<Email[]> {
    if (emailIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = emailIds.map(() => '?').join(',');
    
    const query = `
      SELECT * FROM emails 
      WHERE id IN (${placeholders}) AND user_id = ?
      ORDER BY received_at DESC
    `;

    const rows = await db.all(query, [...emailIds, userId]);
    
    return rows.map(row => ({
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
        labels: JSON.parse(row.labels || '[]')
      }
    }));
  }

  /**
   * Flag low confidence emails for manual review
   */
  private async flagLowConfidenceEmails(
    results: ClassificationResult[],
    confidenceThreshold: number
  ): Promise<string[]> {
    const flaggedEmails: string[] = [];
    
    for (const result of results) {
      if (this.classifier.shouldFlagForReview(result)) {
        flaggedEmails.push(result.emailId);
        console.log(`Email ${result.emailId} flagged for review (confidence: ${result.confidence}, method: ${result.method})`);
      }
    }

    // Store flagging information in database (could be a separate table for review queue)
    if (flaggedEmails.length > 0) {
      console.log(`${flaggedEmails.length} emails flagged for manual review`);
    }

    return flaggedEmails;
  }

  /**
   * Generate filtering statistics
   */
  private generateStats(results: ClassificationResult[], processingTimeMs: number): FilteringStats {
    const totalProcessed = results.length;
    const importantCount = results.filter(r => r.importance === 'important').length;
    const notImportantCount = results.filter(r => r.importance === 'not_important').length;
    
    const totalConfidence = results.reduce((sum, r) => sum + r.confidence, 0);
    const averageConfidence = totalProcessed > 0 ? totalConfidence / totalProcessed : 0;

    return {
      totalProcessed,
      importantCount,
      notImportantCount,
      flaggedForReview: 0, // Will be set by caller
      averageConfidence: Math.round(averageConfidence * 100) / 100,
      processingTimeMs
    };
  }

  /**
   * Create empty statistics object
   */
  private createEmptyStats(processingTimeMs: number): FilteringStats {
    return {
      totalProcessed: 0,
      importantCount: 0,
      notImportantCount: 0,
      flaggedForReview: 0,
      averageConfidence: 0,
      processingTimeMs
    };
  }
}