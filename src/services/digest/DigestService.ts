import { v4 as uuidv4 } from 'uuid';
import { Database } from 'sqlite';
import { getDatabase } from '../../config/database';
import { EmailRepository } from '../../repositories/EmailRepository';
import { UserExpectationsManager } from '../ml/UserExpectationsManager';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { QdrantRepository } from '../../repositories/QdrantRepository';

interface DigestItem {
  emailId: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  similarity: number;
}

interface ComputeOptions {
  windowHours?: number; // default 12
  minItems?: number; // default 5
  threshold?: number; // default 0.6
}

export class DigestService {
  private db: Database | null = null;
  private emailRepository: EmailRepository;
  private expectationsManager: UserExpectationsManager;
  private embeddingService: VectorEmbeddingService;
  private qdrantRepository: QdrantRepository;

  constructor() {
    this.emailRepository = new EmailRepository();
    this.expectationsManager = new UserExpectationsManager();
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    this.embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
    this.qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);
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
    const threshold = opts.threshold ?? parseFloat(process.env.DIGEST_THRESHOLD || '0.6');

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
    const emails = await this.emailRepository.getEmailsForUser(userId, {
      dateFrom: windowStart,
      dateTo: windowEnd,
      orderBy: 'received_at',
      orderDirection: 'DESC',
      limit: 500,
    });
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
    const items = Array.from(byThread.values()).map(v => ({
      emailId: v.emailId,
      subject: v.subject,
      sender: v.sender,
      receivedAt: v.receivedAt,
      similarity: v.sim,
    } as DigestItem));

    // Filter and guard rails
    let filtered = items.filter(i => i.similarity >= threshold);
    if (filtered.length === 0) {
      // Fallback: top by similarity
      filtered = items.sort((a, b) => b.similarity - a.similarity).slice(0, Math.min(minItems, items.length));
    } else {
      // Presentation order: newest first, but significance is similarity-based only
      filtered.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    }

    return filtered;
  }

  async recordDigestSent(userId: string, threads: DigestItem[]): Promise<void> {
    const db = await this.getDb();
    const nowIso = new Date().toISOString();
    const id = uuidv4();
    await db.run(
      'INSERT INTO digest_log (id, user_id, sent_at, threads_count, email_ids_json) VALUES (?, ?, ?, ?, ?)',
      [id, userId, nowIso, threads.length, JSON.stringify(threads.map(t => t.emailId))],
    );
    await db.run('UPDATE users SET last_digest_at = ? WHERE id = ?', [nowIso, userId]);
  }
}
