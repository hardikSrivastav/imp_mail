import { Database } from 'sqlite';
import { Email, EmailRow } from '../types/models';
import { getDatabase } from '../config/database';

/**
 * EmailRepository handles CRUD operations for email metadata in SQLite
 */
export class EmailRepository {
  private db: Database | null = null;

  private async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await getDatabase();
    }
    return this.db;
  }

  /**
   * Convert EmailRow to Email model
   */
  private rowToEmail(row: EmailRow): Email {
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

  /**
   * Convert Email model to EmailRow
   */
  private emailToRow(email: Email): Omit<EmailRow, 'id'> {
    return {
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

  /**
   * Create a new email record
   */
  async create(email: Email): Promise<void> {
    const db = await this.getDb();
    const row = this.emailToRow(email);

    try {
      await db.run(`
        INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content, html_content,
          received_at, indexed_at, importance, importance_confidence, user_labeled,
          vector_id, has_attachments, thread_id, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        email.id, row.user_id, row.message_id, row.subject, row.sender, row.recipients,
        row.content, row.html_content, row.received_at, row.indexed_at, row.importance,
        row.importance_confidence, row.user_labeled, row.vector_id, row.has_attachments,
        row.thread_id, row.labels
      ]);
    } catch (error) {
      console.error('❌ Failed to create email:', error);
      throw error;
    }
  }

  /**
   * Get email by ID
   */
  async getById(emailId: string): Promise<Email | null> {
    const db = await this.getDb();

    try {
      const row = await db.get<EmailRow>('SELECT * FROM emails WHERE id = ?', [emailId]);
      return row ? this.rowToEmail(row) : null;
    } catch (error) {
      console.error('❌ Failed to get email by ID:', error);
      throw error;
    }
  }

  /**
   * Get email by message ID and user ID
   */
  async getByMessageId(messageId: string, userId: string): Promise<Email | null> {
    const db = await this.getDb();

    try {
      const row = await db.get<EmailRow>(
        'SELECT * FROM emails WHERE message_id = ? AND user_id = ?',
        [messageId, userId]
      );
      return row ? this.rowToEmail(row) : null;
    } catch (error) {
      console.error('❌ Failed to get email by message ID:', error);
      throw error;
    }
  }

  /**
   * Update email record
   */
  async update(email: Email): Promise<void> {
    const db = await this.getDb();
    const row = this.emailToRow(email);

    try {
      await db.run(`
        UPDATE emails SET
          user_id = ?, message_id = ?, subject = ?, sender = ?, recipients = ?,
          content = ?, html_content = ?, received_at = ?, indexed_at = ?,
          importance = ?, importance_confidence = ?, user_labeled = ?,
          vector_id = ?, has_attachments = ?, thread_id = ?, labels = ?
        WHERE id = ?
      `, [
        row.user_id, row.message_id, row.subject, row.sender, row.recipients,
        row.content, row.html_content, row.received_at, row.indexed_at,
        row.importance, row.importance_confidence, row.user_labeled,
        row.vector_id, row.has_attachments, row.thread_id, row.labels,
        email.id
      ]);
    } catch (error) {
      console.error('❌ Failed to update email:', error);
      throw error;
    }
  }

  /**
   * Delete email by ID
   */
  async delete(emailId: string): Promise<void> {
    const db = await this.getDb();

    try {
      await db.run('DELETE FROM emails WHERE id = ?', [emailId]);
    } catch (error) {
      console.error('❌ Failed to delete email:', error);
      throw error;
    }
  }

  /**
   * Get emails for a user with filtering and pagination
   */
  async getEmailsForUser(
    userId: string,
    options: {
      importance?: 'important' | 'not_important' | 'unclassified';
      sender?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
      orderBy?: 'received_at' | 'indexed_at' | 'importance_confidence';
      orderDirection?: 'ASC' | 'DESC';
    } = {}
  ): Promise<Email[]> {
    const db = await this.getDb();
    
    let query = 'SELECT * FROM emails WHERE user_id = ?';
    const params: any[] = [userId];

    // Add filters
    if (options.importance) {
      query += ' AND importance = ?';
      params.push(options.importance);
    }

    if (options.sender) {
      query += ' AND sender LIKE ?';
      params.push(`%${options.sender}%`);
    }

    if (options.dateFrom) {
      query += ' AND received_at >= ?';
      params.push(options.dateFrom.toISOString());
    }

    if (options.dateTo) {
      query += ' AND received_at <= ?';
      params.push(options.dateTo.toISOString());
    }

    // Add ordering
    const orderBy = options.orderBy || 'received_at';
    const orderDirection = options.orderDirection || 'DESC';
    query += ` ORDER BY ${orderBy} ${orderDirection}`;

    // Add pagination
    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    try {
      const rows = await db.all<EmailRow[]>(query, params);
      return rows.map(row => this.rowToEmail(row));
    } catch (error) {
      console.error('❌ Failed to get emails for user:', error);
      throw error;
    }
  }

  /**
   * Get count of emails for a user with the same filters as getEmailsForUser
   */
  async getEmailsCountForUser(
    userId: string,
    options: {
      importance?: 'important' | 'not_important' | 'unclassified';
      sender?: string;
      dateFrom?: Date;
      dateTo?: Date;
    } = {}
  ): Promise<number> {
    const db = await this.getDb();

    let query = 'SELECT COUNT(*) as count FROM emails WHERE user_id = ?';
    const params: any[] = [userId];

    if (options.importance) {
      query += ' AND importance = ?';
      params.push(options.importance);
    }

    if (options.sender) {
      query += ' AND sender LIKE ?';
      params.push(`%${options.sender}%`);
    }

    if (options.dateFrom) {
      query += ' AND received_at >= ?';
      params.push(options.dateFrom.toISOString());
    }

    if (options.dateTo) {
      query += ' AND received_at <= ?';
      params.push(options.dateTo.toISOString());
    }

    try {
      const row = await db.get<{ count: number }>(query, params);
      return row?.count || 0;
    } catch (error) {
      console.error('❌ Failed to get emails count for user:', error);
      throw error;
    }
  }

  /**
   * Find the most recent email id for a user by exact subject match
   */
  async getLatestEmailIdBySubject(userId: string, subject: string): Promise<string | null> {
    const db = await this.getDb();
    try {
      const row = await db.get<{ id: string }>(
        'SELECT id FROM emails WHERE user_id = ? AND subject = ? ORDER BY received_at DESC LIMIT 1',
        [userId, subject],
      );
      return row?.id || null;
    } catch (error) {
      console.error('❌ Failed to get latest email id by subject:', error);
      throw error;
    }
  }

  /**
   * Find most recent email id by subject (exact or prefix match)
   */
  async getLatestEmailIdBySubjectLike(userId: string, subjectKey: string): Promise<string | null> {
    const db = await this.getDb();
    try {
      const row = await db.get<{ id: string }>(
        'SELECT id FROM emails WHERE user_id = ? AND (subject = ? OR subject LIKE ?) ORDER BY received_at DESC LIMIT 1',
        [userId, subjectKey, `${subjectKey}%`],
      );
      return row?.id || null;
    } catch (error) {
      console.error('❌ Failed to get latest email id by subject like:', error);
      throw error;
    }
  }

  /**
   * Full-text search across email content
   */
  async searchEmails(
    userId: string,
    searchQuery: string,
    options: {
      importance?: 'important' | 'not_important' | 'unclassified';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Email[]> {
    const db = await this.getDb();
    
    let query = `
      SELECT * FROM emails 
      WHERE user_id = ? 
      AND (
        subject LIKE ? OR 
        sender LIKE ? OR 
        content LIKE ?
      )
    `;
    
    const searchPattern = `%${searchQuery}%`;
    const params: any[] = [userId, searchPattern, searchPattern, searchPattern];

    if (options.importance) {
      query += ' AND importance = ?';
      params.push(options.importance);
    }

    query += ' ORDER BY received_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    try {
      const rows = await db.all<EmailRow[]>(query, params);
      return rows.map(row => this.rowToEmail(row));
    } catch (error) {
      console.error('❌ Failed to search emails:', error);
      throw error;
    }
  }

  /**
   * Get count of search results with the same filters as searchEmails
   */
  async getSearchEmailsCount(
    userId: string,
    searchQuery: string,
    options: {
      importance?: 'important' | 'not_important' | 'unclassified';
    } = {}
  ): Promise<number> {
    const db = await this.getDb();
    
    let query = `
      SELECT COUNT(*) as count FROM emails 
      WHERE user_id = ? 
      AND (
        subject LIKE ? OR 
        sender LIKE ? OR 
        content LIKE ?
      )
    `;
    
    const searchPattern = `%${searchQuery}%`;
    const params: any[] = [userId, searchPattern, searchPattern, searchPattern];

    if (options.importance) {
      query += ' AND importance = ?';
      params.push(options.importance);
    }

    try {
      const row = await db.get<{ count: number }>(query, params);
      return row?.count || 0;
    } catch (error) {
      console.error('❌ Failed to get search emails count:', error);
      throw error;
    }
  }

  /**
   * Update email importance
   */
  async updateImportance(
    emailId: string,
    importance: 'important' | 'not_important' | 'unclassified',
    confidence?: number,
    userLabeled: boolean = false
  ): Promise<void> {
    const db = await this.getDb();

    try {
      await db.run(`
        UPDATE emails 
        SET importance = ?, importance_confidence = ?, user_labeled = ?
        WHERE id = ?
      `, [importance, confidence, userLabeled ? 1 : 0, emailId]);
    } catch (error) {
      console.error('❌ Failed to update email importance:', error);
      throw error;
    }
  }

  /**
   * Get emails by IDs
   */
  async getByIds(emailIds: string[]): Promise<Email[]> {
    if (emailIds.length === 0) return [];
    
    const db = await this.getDb();
    const placeholders = emailIds.map(() => '?').join(',');
    
    try {
      const rows = await db.all<EmailRow[]>(
        `SELECT * FROM emails WHERE id IN (${placeholders})`,
        emailIds
      );
      return rows.map(row => this.rowToEmail(row));
    } catch (error) {
      console.error('❌ Failed to get emails by IDs:', error);
      throw error;
    }
  }

  /**
   * Get user email count
   */
  async getUserEmailCount(userId: string): Promise<number> {
    const db = await this.getDb();

    try {
      const result = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM emails WHERE user_id = ?',
        [userId]
      );
      return result?.count || 0;
    } catch (error) {
      console.error('❌ Failed to get user email count:', error);
      throw error;
    }
  }

  /**
   * Get user email count by importance
   */
  async getUserEmailCountByImportance(
    userId: string,
    importance: 'important' | 'not_important' | 'unclassified'
  ): Promise<number> {
    const db = await this.getDb();

    try {
      const result = await db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM emails WHERE user_id = ? AND importance = ?',
        [userId, importance]
      );
      return result?.count || 0;
    } catch (error) {
      console.error('❌ Failed to get user email count by importance:', error);
      throw error;
    }
  }

  /**
   * Reset classifications for all emails of a user to 'unclassified'
   */
  async resetClassificationsForUser(userId: string): Promise<number> {
    const db = await this.getDb();
    try {
      const result: any = await db.run(
        `UPDATE emails
         SET importance = 'unclassified',
             importance_confidence = NULL,
             user_labeled = 0
         WHERE user_id = ?`,
        [userId]
      );
      return result?.changes || 0;
    } catch (error) {
      console.error('❌ Failed to reset classifications for user:', userId, error);
      throw error;
    }
  }

  /**
   * Batch create emails
   */
  async batchCreate(emails: Email[]): Promise<void> {
    if (emails.length === 0) return;

    const db = await this.getDb();

    try {
      await db.exec('BEGIN TRANSACTION');

      const stmt = await db.prepare(`
        INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content, html_content,
          received_at, indexed_at, importance, importance_confidence, user_labeled,
          vector_id, has_attachments, thread_id, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const email of emails) {
        const row = this.emailToRow(email);
        await stmt.run([
          email.id, row.user_id, row.message_id, row.subject, row.sender, row.recipients,
          row.content, row.html_content, row.received_at, row.indexed_at, row.importance,
          row.importance_confidence, row.user_labeled, row.vector_id, row.has_attachments,
          row.thread_id, row.labels
        ]);
      }

      await stmt.finalize();
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      console.error('❌ Failed to batch create emails:', error);
      throw error;
    }
  }

  /**
   * Delete all emails for a user
   */
  async deleteUserEmails(userId: string): Promise<void> {
    const db = await this.getDb();

    try {
      await db.run('DELETE FROM emails WHERE user_id = ?', [userId]);
    } catch (error) {
      console.error('❌ Failed to delete user emails:', error);
      throw error;
    }
  }
}