import OpenAI from 'openai';
import { Database } from 'sqlite';
import { getDatabase } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

interface EmailData {
  id: string;
  subject: string;
  sender: string;
  content: string;
  receivedAt: Date;
}

export class EmailSummaryService {
  private openai: OpenAI;
  private db: Database | null = null;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  private async getDb(): Promise<Database> {
    if (!this.db) this.db = await getDatabase();
    return this.db;
  }

  /**
   * Generate a concise summary of an email using ChatGPT
   */
  async generateEmailSummary(email: EmailData): Promise<string> {
    try {
      const prompt = this.buildSummaryPrompt(email);
      
      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_SUMMARY_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an expert email summarizer. Create concise, informative summaries of emails that capture the key points and action items. Keep summaries under 150 words and focus on what's most important for the recipient to know.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.3,
        presence_penalty: 0,
        frequency_penalty: 0.1,
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary) {
        throw new Error('Empty summary received from OpenAI');
      }

      return summary;

    } catch (error) {
      console.error('Failed to generate email summary:', error);
      // Return a fallback summary based on subject and sender
      return this.generateFallbackSummary(email);
    }
  }

  /**
   * Generate a content hash for caching purposes
   */
  private generateContentHash(email: EmailData): string {
    const content = `${email.subject}|${email.sender}|${email.content}`;
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Check for cached summary based on content hash
   */
  async getCachedSummary(email: EmailData): Promise<string | null> {
    const db = await this.getDb();
    const contentHash = this.generateContentHash(email);
    
    const row = await db.get<{ summary: string }>(
      `SELECT summary FROM email_summary_cache 
       WHERE content_hash = ? AND created_at > datetime('now', '-30 days')`,
      [contentHash]
    );

    return row?.summary || null;
  }

  /**
   * Cache a summary based on content hash
   */
  async cacheSummary(email: EmailData, summary: string): Promise<void> {
    const db = await this.getDb();
    const contentHash = this.generateContentHash(email);
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    await db.run(
      `INSERT OR REPLACE INTO email_summary_cache (id, content_hash, summary, created_at) 
       VALUES (?, ?, ?, ?)`,
      [id, contentHash, summary, createdAt]
    );
  }

  /**
   * Generate summaries for multiple emails in batch with intelligent caching
   */
  async generateBatchSummaries(emails: EmailData[]): Promise<Map<string, string>> {
    const summaries = new Map<string, string>();
    const emailsNeedingSummaries: EmailData[] = [];
    
    // Check cache for existing summaries first
    for (const email of emails) {
      const cachedSummary = await this.getCachedSummary(email);
      if (cachedSummary) {
        summaries.set(email.id, cachedSummary);
      } else {
        emailsNeedingSummaries.push(email);
      }
    }

    if (emailsNeedingSummaries.length === 0) {
      return summaries;
    }

    console.log(`📝 Generating ${emailsNeedingSummaries.length} new summaries (${emails.length - emailsNeedingSummaries.length} from cache)`);

    const batchSize = 5; // Process in small batches to avoid rate limits

    for (let i = 0; i < emailsNeedingSummaries.length; i += batchSize) {
      const batch = emailsNeedingSummaries.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (email) => {
        try {
          const summary = await this.generateEmailSummary(email);
          // Cache the generated summary
          await this.cacheSummary(email, summary);
          return { emailId: email.id, summary };
        } catch (error) {
          console.error(`Failed to summarize email ${email.id}:`, error);
          const fallbackSummary = this.generateFallbackSummary(email);
          // Cache fallback summary too (to avoid repeated failures)
          await this.cacheSummary(email, fallbackSummary);
          return { 
            emailId: email.id, 
            summary: fallbackSummary
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      for (const result of batchResults) {
        summaries.set(result.emailId, result.summary);
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < emailsNeedingSummaries.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return summaries;
  }

  /**
   * Store email summary in database
   */
  async storeSummary(
    emailId: string, 
    digestLogId: string, 
    summary: string, 
    modelUsed: string = 'gpt-3.5-turbo'
  ): Promise<void> {
    const db = await this.getDb();
    const id = uuidv4();
    const generatedAt = new Date().toISOString();

    await db.run(
      `INSERT INTO digest_email_summaries (id, email_id, digest_log_id, summary, generated_at, model_used) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, emailId, digestLogId, summary, generatedAt, modelUsed]
    );
  }

  /**
   * Get stored summary for an email
   */
  async getStoredSummary(emailId: string, digestLogId: string): Promise<string | null> {
    const db = await this.getDb();
    
    const row = await db.get<{ summary: string }>(
      `SELECT summary FROM digest_email_summaries 
       WHERE email_id = ? AND digest_log_id = ?`,
      [emailId, digestLogId]
    );

    return row?.summary || null;
  }

  /**
   * Build the prompt for email summarization
   */
  private buildSummaryPrompt(email: EmailData): string {
    const contentPreview = email.content.length > 2000 
      ? email.content.substring(0, 2000) + '...' 
      : email.content;

    return `Please provide a concise summary of this email:

Subject: ${email.subject}
From: ${email.sender}
Received: ${email.receivedAt.toLocaleDateString()}

Content:
${contentPreview}

Summary guidelines:
- Keep it under 150 words
- Focus on key information, decisions, and action items
- Use clear, professional language
- Highlight any deadlines or urgent matters
- Mention if this is informational, requires action, or is time-sensitive`;
  }

  /**
   * Generate a simple fallback summary when AI summarization fails
   */
  private generateFallbackSummary(email: EmailData): string {
    const subject = email.subject || '(No Subject)';
    const sender = email.sender;
    const date = email.receivedAt.toLocaleDateString();
    
    // Extract first sentence or paragraph as a basic summary
    const sentences = email.content
      .replace(/\s+/g, ' ')
      .split(/[.!?]+/)
      .filter(s => s.trim().length > 10);
    
    const firstSentence = sentences[0]?.trim() || 'Email content not available';
    const preview = firstSentence.length > 100 
      ? firstSentence.substring(0, 100) + '...' 
      : firstSentence;

    return `Email from ${sender} on ${date} regarding "${subject}". ${preview}`;
  }

  /**
   * Clean up old summaries and cache to manage database size
   */
  async cleanupOldSummaries(daysToKeep: number = 90): Promise<number> {
    const db = await this.getDb();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    // Clean up digest summaries
    const digestResult = await db.run(
      `DELETE FROM digest_email_summaries 
       WHERE generated_at < ?`,
      [cutoffDate.toISOString()]
    );

    // Clean up summary cache (keep for 30 days)
    const cacheCutoffDate = new Date();
    cacheCutoffDate.setDate(cacheCutoffDate.getDate() - 30);
    
    const cacheResult = await db.run(
      `DELETE FROM email_summary_cache 
       WHERE created_at < ?`,
      [cacheCutoffDate.toISOString()]
    );

    const digestDeleted = digestResult.changes || 0;
    const cacheDeleted = cacheResult.changes || 0;
    const totalDeleted = digestDeleted + cacheDeleted;
    
    if (totalDeleted > 0) {
      console.log(`🧹 Cleaned up ${digestDeleted} old digest summaries and ${cacheDeleted} cached summaries`);
    }

    return totalDeleted;
  }

  /**
   * Get summary statistics
   */
  async getSummaryStats(): Promise<{
    totalSummaries: number;
    summariesLast7Days: number;
    summariesLast30Days: number;
    averageSummaryLength: number;
  }> {
    const db = await this.getDb();
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalRow, last7Row, last30Row, avgRow] = await Promise.all([
      db.get<{ count: number }>(`SELECT COUNT(*) as count FROM digest_email_summaries`),
      db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM digest_email_summaries WHERE generated_at >= ?`,
        [sevenDaysAgo.toISOString()]
      ),
      db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM digest_email_summaries WHERE generated_at >= ?`,
        [thirtyDaysAgo.toISOString()]
      ),
      db.get<{ avg_length: number }>(
        `SELECT AVG(LENGTH(summary)) as avg_length FROM digest_email_summaries`
      )
    ]);

    return {
      totalSummaries: totalRow?.count || 0,
      summariesLast7Days: last7Row?.count || 0,
      summariesLast30Days: last30Row?.count || 0,
      averageSummaryLength: Math.round(avgRow?.avg_length || 0),
    };
  }
}
