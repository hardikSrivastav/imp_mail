import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sqlite';
import { getDatabase } from '../../config/database';
import { EmailRepository } from '../../repositories/EmailRepository';
import { UserExpectationsManager } from '../ml/UserExpectationsManager';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { QdrantRepository } from '../../repositories/QdrantRepository';
import { EmailSummaryService } from '../ml/EmailSummaryService';
import { EmailDeliveryService } from '../email/EmailDeliveryService';

interface DigestItem {
  emailId: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  similarity: number;
  summary?: string;
}

interface ComputeOptions {
  windowHours?: number; // default 12
  minItems?: number; // default 5
  emailFilter?: 'all' | 'important'; // default 'all'
  generateSummaries?: boolean; // default false
}

interface DigestSettings {
  enabled: boolean;
  times: string[];
  timezone: string;
  emailFilter: 'all' | 'important';
  emailDelivery: 'email' | 'none';
}

interface DigestHistoryItem {
  id: string;
  sentAt: Date;
  threadsCount: number;
  emailFilter: string;
  deliveryMethod: string;
  windowHours: number;
  emailIds: string[];
}

export class DigestService {
  private db: Database | null = null;
  private emailRepository: EmailRepository;
  private expectationsManager: UserExpectationsManager;
  private embeddingService: VectorEmbeddingService;
  private qdrantRepository: QdrantRepository;
  private summaryService: EmailSummaryService;
  private emailDeliveryService: EmailDeliveryService;

  constructor() {
    this.emailRepository = new EmailRepository();
    this.expectationsManager = new UserExpectationsManager();
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    this.embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
    this.qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);
    this.summaryService = new EmailSummaryService(openaiApiKey);
    this.emailDeliveryService = new EmailDeliveryService();
  }

  private async getDb(): Promise<Database> {
    if (!this.db) this.db = await getDatabase();
    return this.db;
  }

  private normalizeSubject(subject: string): string {
    let s = (subject || '').trim();
    const prefixRe = /^(re|fwd|fw)\s*[:：\-]\s*/i;
    for (let i = 0; i < 5; i++) {
      if (prefixRe.test(s)) s = s.replace(prefixRe, ''); else break;
    }
    return s.replace(/\s+/g, ' ').toLowerCase();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y; na += x * x; nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }

  async computeDigestForUser(userId: string, opts: ComputeOptions = {}): Promise<DigestItem[]> {
    const db = await this.getDb();
    const windowHours = opts.windowHours ?? 12;
    const minItems = opts.minItems ?? 5;
    const emailFilter = opts.emailFilter ?? 'all';
    const generateSummaries = opts.generateSummaries ?? false;

    // Load expectations
    const expectations = await this.expectationsManager.getActiveExpectations(userId);
    if (!expectations) return [];

    // Window bounds
    const now = new Date();
    const lastRow = await db.get<{ last_digest_at?: string }>(
      'SELECT last_digest_at FROM users WHERE id = ?',
      [userId],
    );
    const lastDigestAt = lastRow?.last_digest_at ? new Date(lastRow.last_digest_at) : new Date(now.getTime() - windowHours * 3600 * 1000);
    const windowStart = lastDigestAt;
    const windowEnd = now;

    // Get recent emails in window, newest first
    const emailQueryOptions: any = {
      dateFrom: windowStart,
      dateTo: windowEnd,
      orderBy: 'received_at',
      orderDirection: 'DESC',
      limit: 500,
    };

    // Apply email filter if specified
    if (emailFilter === 'important') {
      emailQueryOptions.importance = 'important';
    }

    const emails = await this.emailRepository.getEmailsForUser(userId, emailQueryOptions);
    if (emails.length === 0) return [];

    // Prototype vector (use service cache)
    const text = [expectations.title, expectations.description, ...(expectations.examples?.important || []), ...(expectations.examples?.notImportant || [])].join('\n');
    const proto = await this.embeddingService.generateEmbedding(text);

    // Fetch vectors only for these emails
    const vectors = await this.qdrantRepository.getVectorsByEmailIds(emails.map(e => e.id));
    const idToVector = new Map(vectors.map(v => [v.emailId, v.embedding]));

    // Score per thread (keep best per thread)
    const byThread = new Map<string, { emailId: string; subject: string; sender: string; receivedAt: Date; sim: number }>();
    for (const e of emails) {
      const emb = idToVector.get(e.id);
      if (!emb) continue;
      const sim = this.cosineSimilarity(proto, emb);
      const threadKey = e.metadata?.threadId
        ? `thread:${e.metadata.threadId}`
        : `subj:${this.normalizeSubject(e.subject)}|from:${(e.sender||'').toLowerCase().trim()}`;
      const prev = byThread.get(threadKey);
      if (!prev || sim > prev.sim) {
        byThread.set(threadKey, { emailId: e.id, subject: e.subject, sender: e.sender, receivedAt: e.receivedAt, sim });
      }
    }

    // Static score based solely on similarity (no time factor)
    let items = Array.from(byThread.values()).map(v => ({
      emailId: v.emailId,
      subject: v.subject,
      sender: v.sender,
      receivedAt: v.receivedAt,
      similarity: v.sim,
    } as DigestItem));

    // Sort by relevance and take top items
    let filtered = items.sort((a, b) => b.similarity - a.similarity);
    
    // If we have too many items, limit to reasonable number for digest
    if (filtered.length > minItems * 2) {
      filtered = filtered.slice(0, minItems * 2);
    }
    
    // Final presentation order: newest first
    filtered.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

    // Generate summaries if requested
    if (generateSummaries && filtered.length > 0) {
      try {
        const emailsWithContent = await Promise.all(
          filtered.map(async (item) => {
            const email = emails.find(e => e.id === item.emailId);
            return email ? {
              id: item.emailId,
              subject: item.subject,
              sender: item.sender,
              content: email.content,
              receivedAt: item.receivedAt,
            } : null;
          })
        );

        const validEmails = emailsWithContent.filter(e => e !== null) as any[];
        const summaries = await this.summaryService.generateBatchSummaries(validEmails);

        // Add summaries to digest items
        filtered = filtered.map(item => ({
          ...item,
          summary: summaries.get(item.emailId),
        }));
      } catch (error) {
        console.error('Failed to generate summaries for digest:', error);
        // Continue without summaries
      }
    }

    return filtered;
  }

  async recordDigestSent(
    userId: string, 
    threads: DigestItem[], 
    options: {
      emailFilter?: string;
      deliveryMethod?: string;
      digestContent?: string;
      windowHours?: number;
    } = {}
  ): Promise<string> {
    const db = await this.getDb();
    const nowIso = new Date().toISOString();
    const id = uuidv4();
    
    await db.run(
      `INSERT INTO digest_log (
        id, user_id, sent_at, threads_count, email_ids_json, 
        email_filter, delivery_method, digest_content, window_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, userId, nowIso, threads.length, 
        JSON.stringify(threads.map(t => t.emailId)),
        options.emailFilter || 'all',
        options.deliveryMethod || 'email',
        options.digestContent || null,
        options.windowHours || 12
      ],
    );
    
    await db.run('UPDATE users SET last_digest_at = ? WHERE id = ?', [nowIso, userId]);

    // Store summaries if they exist
    for (const thread of threads) {
      if (thread.summary) {
        try {
          await this.summaryService.storeSummary(
            thread.emailId, 
            id, 
            thread.summary
          );
        } catch (error) {
          console.error(`Failed to store summary for email ${thread.emailId}:`, error);
        }
      }
    }

    return id;
  }

  /**
   * Get user's digest settings
   */
  async getDigestSettings(userId: string): Promise<DigestSettings> {
    const db = await this.getDb();
    
    const user = await db.get<{
      digest_enabled: number;
      digest_times: string;
      timezone: string;
      digest_email_filter: string;
      digest_email_delivery: string;
    }>(
      `SELECT digest_enabled, digest_times, timezone, digest_email_filter, digest_email_delivery 
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      throw new Error('User not found');
    }

    let times: string[] = ['11:00', '21:00'];
    try {
      if (user.digest_times) {
        times = JSON.parse(user.digest_times);
      }
    } catch (e) {
      console.warn('Invalid digest_times JSON, using default');
    }

    return {
      enabled: Boolean(user.digest_enabled),
      times: times,
      timezone: user.timezone || 'Asia/Kolkata',
      emailFilter: (user.digest_email_filter as 'all' | 'important') || 'all',
      emailDelivery: (user.digest_email_delivery as 'email' | 'none') || 'email',
    };
  }

  /**
   * Update user's digest settings
   */
  async updateDigestSettings(userId: string, settings: Partial<DigestSettings>): Promise<void> {
    const db = await this.getDb();
    
    const updates: string[] = [];
    const values: any[] = [];

    if (settings.enabled !== undefined) {
      updates.push('digest_enabled = ?');
      values.push(settings.enabled ? 1 : 0);
    }

    if (settings.times !== undefined) {
      // Validate max 2 times per day
      if (settings.times.length > 2) {
        throw new Error('Maximum 2 digest times per day allowed');
      }
      
      // Validate time format
      for (const time of settings.times) {
        if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
          throw new Error(`Invalid time format: ${time}. Use HH:MM format.`);
        }
      }

      updates.push('digest_times = ?');
      values.push(JSON.stringify(settings.times));
    }

    if (settings.timezone !== undefined) {
      updates.push('timezone = ?');
      values.push(settings.timezone);
    }

    if (settings.emailFilter !== undefined) {
      if (!['all', 'important'].includes(settings.emailFilter)) {
        throw new Error('Email filter must be "all" or "important"');
      }
      updates.push('digest_email_filter = ?');
      values.push(settings.emailFilter);
    }

    if (settings.emailDelivery !== undefined) {
      if (!['email', 'none'].includes(settings.emailDelivery)) {
        throw new Error('Email delivery must be "email" or "none"');
      }
      updates.push('digest_email_delivery = ?');
      values.push(settings.emailDelivery);
    }

    if (updates.length === 0) {
      return; // No updates to make
    }

    values.push(userId);
    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Get digest history for a user
   */
  async getDigestHistory(userId: string, limit: number = 50): Promise<DigestHistoryItem[]> {
    const db = await this.getDb();
    
    const rows = await db.all<any[]>(
      `SELECT id, sent_at, threads_count, email_filter, delivery_method, 
              window_hours, email_ids_json
       FROM digest_log 
       WHERE user_id = ? 
       ORDER BY sent_at DESC 
       LIMIT ?`,
      [userId, limit]
    );

    return rows.map(row => ({
      id: row.id,
      sentAt: new Date(row.sent_at),
      threadsCount: row.threads_count,
      emailFilter: row.email_filter || 'all',
      deliveryMethod: row.delivery_method || 'email',
      windowHours: row.window_hours || 12,
      emailIds: JSON.parse(row.email_ids_json || '[]'),
    }));
  }

  /**
   * Get detailed digest by ID
   */
  async getDigestById(userId: string, digestId: string): Promise<{
    digest: DigestHistoryItem;
    emails: DigestItem[];
  } | null> {
    const db = await this.getDb();
    
    // Get digest log entry
    const digestRow = await db.get<any>(
      `SELECT id, sent_at, threads_count, email_filter, delivery_method, 
              window_hours, email_ids_json, digest_content
       FROM digest_log 
       WHERE id = ? AND user_id = ?`,
      [digestId, userId]
    );

    if (!digestRow) {
      return null;
    }

    const emailIds: string[] = JSON.parse(digestRow.email_ids_json || '[]');
    
    // Get email details
    if (emailIds.length === 0) {
      return {
        digest: {
          id: digestRow.id,
          sentAt: new Date(digestRow.sent_at),
          threadsCount: digestRow.threads_count,
          emailFilter: digestRow.email_filter || 'all',
          deliveryMethod: digestRow.delivery_method || 'email',
          windowHours: digestRow.window_hours || 12,
          emailIds: [],
        },
        emails: [],
      };
    }

    // Get email details and summaries
    const emails = await this.emailRepository.getByIds(emailIds);
    const summaries = new Map<string, string>();

    // Get stored summaries
    const summaryRows = await db.all<{ email_id: string; summary: string }>(
      `SELECT email_id, summary FROM digest_email_summaries 
       WHERE digest_log_id = ? AND email_id IN (${emailIds.map(() => '?').join(',')})`,
      [digestId, ...emailIds]
    );

    for (const row of summaryRows) {
      summaries.set(row.email_id, row.summary);
    }

    const digestItems: DigestItem[] = emails.map(email => ({
      emailId: email.id,
      subject: email.subject,
      sender: email.sender,
      receivedAt: email.receivedAt,
      similarity: 0, // Not stored in digest log, would need to recalculate
      summary: summaries.get(email.id),
    }));

    return {
      digest: {
        id: digestRow.id,
        sentAt: new Date(digestRow.sent_at),
        threadsCount: digestRow.threads_count,
        emailFilter: digestRow.email_filter || 'all',
        deliveryMethod: digestRow.delivery_method || 'email',
        windowHours: digestRow.window_hours || 12,
        emailIds,
      },
      emails: digestItems,
    };
  }

  /**
   * Send digest email to user
   */
  async sendDigestEmail(userId: string, userEmail: string, digestItems: DigestItem[], options: ComputeOptions = {}): Promise<boolean> {
    try {
      const deliveryOptions = {
        windowHours: options.windowHours || 12,
        emailFilter: options.emailFilter || 'all',
        digestContent: JSON.stringify(digestItems), // Store for history
      };

      const success = await this.emailDeliveryService.sendDigestEmail(
        userId,
        userEmail,
        digestItems,
        deliveryOptions
      );

      return success;
    } catch (error) {
      console.error(`Failed to send digest email to ${userEmail}:`, error);
      return false;
    }
  }

  /**
   * Process and send digest for a user (complete workflow)
   */
  async processDigestForUser(userId: string, userEmail: string): Promise<void> {
    try {
      // Get user settings
      const settings = await this.getDigestSettings(userId);
      
      if (!settings.enabled) {
        console.log(`Digest disabled for user ${userId}`);
        return;
      }

      // Compute digest
      const digestItems = await this.computeDigestForUser(userId, {
        emailFilter: settings.emailFilter,
        generateSummaries: true, // Always generate summaries for email delivery
      });

      // Record the digest
      const digestLogId = await this.recordDigestSent(userId, digestItems, {
        emailFilter: settings.emailFilter,
        deliveryMethod: settings.emailDelivery,
        digestContent: JSON.stringify(digestItems),
      });

      // Send email if delivery is enabled
      if (settings.emailDelivery === 'email' && digestItems.length > 0) {
        const emailSent = await this.sendDigestEmail(userId, userEmail, digestItems, {
          emailFilter: settings.emailFilter,
        });

        if (emailSent) {
          console.log(`✅ Digest processed and sent to ${userEmail} (${digestItems.length} items)`);
        } else {
          console.log(`⚠️ Digest processed but email delivery failed for ${userEmail}`);
        }
      } else {
        console.log(`📝 Digest processed for ${userEmail} (${digestItems.length} items, delivery: ${settings.emailDelivery})`);
      }

    } catch (error) {
      console.error(`Failed to process digest for user ${userId}:`, error);
      throw error;
    }
  }
}
