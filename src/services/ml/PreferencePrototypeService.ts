import { getDatabase } from '../../config/database';
import { QdrantRepository } from '../../repositories/QdrantRepository';

export interface UserPreferencesRecord {
  userId: string;
  likedEmailIds: string[];
  dislikedEmailIds: string[];
  updatedAt: string; // ISO
}

export interface UserPrototypes {
  userId: string;
  likedCentroid: number[];
  dislikedCentroid: number[];
  updatedAt: string; // ISO
}

/**
 * Manages user liked/disliked selections and computes dual-centroid prototypes from Qdrant vectors.
 */
export class PreferencePrototypeService {
  private qdrant: QdrantRepository;
  private prototypeCache: Map<string, UserPrototypes> = new Map();

  constructor() {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    this.qdrant = new QdrantRepository(qdrantUrl, qdrantApiKey);
  }

  /** Ensure the backing table exists. */
  private async ensureTable(): Promise<void> {
    const db = await getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        liked_ids TEXT NOT NULL DEFAULT '[]',
        disliked_ids TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )
    `);
  }

  async getPreferences(userId: string): Promise<UserPreferencesRecord | null> {
    await this.ensureTable();
    const db = await getDatabase();
    const row = await db.get<any>(
      'SELECT user_id, liked_ids, disliked_ids, updated_at FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    if (!row) return null;
    let liked: string[] = [];
    let disliked: string[] = [];
    try { liked = JSON.parse(row.liked_ids || '[]'); } catch {}
    try { disliked = JSON.parse(row.disliked_ids || '[]'); } catch {}
    return {
      userId: row.user_id,
      likedEmailIds: liked,
      dislikedEmailIds: disliked,
      updatedAt: row.updated_at,
    };
  }

  async savePreferences(userId: string, likedEmailIds: string[], dislikedEmailIds: string[]): Promise<UserPreferencesRecord> {
    await this.ensureTable();
    const db = await getDatabase();
    const now = new Date().toISOString();
    const liked = JSON.stringify(Array.from(new Set(likedEmailIds)));
    const disliked = JSON.stringify(Array.from(new Set(dislikedEmailIds)));
    await db.run(
      `INSERT INTO user_preferences (user_id, liked_ids, disliked_ids, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET liked_ids=excluded.liked_ids, disliked_ids=excluded.disliked_ids, updated_at=excluded.updated_at`,
      [userId, liked, disliked, now]
    );
    // Invalidate cache
    this.prototypeCache.delete(userId);
    return { userId, likedEmailIds: JSON.parse(liked), dislikedEmailIds: JSON.parse(disliked), updatedAt: now };
  }

  /** Compute dual centroids from Qdrant vectors; caches result by user. */
  async computePrototypes(userId: string): Promise<UserPrototypes> {
    const cached = this.prototypeCache.get(userId);
    if (cached) return cached;
    const prefs = await this.getPreferences(userId);
    if (!prefs) throw new Error('No preferences saved for user');
    if (prefs.likedEmailIds.length < 5 || prefs.dislikedEmailIds.length < 5) {
      throw new Error('At least 5 liked and 5 disliked emails are required');
    }
    // Fetch vectors
    const likedVectors = await this.qdrant.getVectorsByEmailIds(prefs.likedEmailIds);
    const dislikedVectors = await this.qdrant.getVectorsByEmailIds(prefs.dislikedEmailIds);
    const likedEmb = likedVectors.map(v => v.embedding);
    const dislikedEmb = dislikedVectors.map(v => v.embedding);
    if (likedEmb.length === 0 || dislikedEmb.length === 0) {
      throw new Error('Vectors not found for selected emails');
    }
    const likedCentroid = this.centroid(likedEmb);
    const dislikedCentroid = this.centroid(dislikedEmb);
    const result: UserPrototypes = { userId, likedCentroid, dislikedCentroid, updatedAt: new Date().toISOString() };
    this.prototypeCache.set(userId, result);
    return result;
  }

  clearCache(userId?: string) {
    if (userId) this.prototypeCache.delete(userId); else this.prototypeCache.clear();
  }

  private centroid(vectors: number[][]): number[] {
    const dim = vectors[0].length;
    const sum = new Array<number>(dim).fill(0);
    for (const v of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += v[i];
    }
    for (let i = 0; i < dim; i++) sum[i] /= vectors.length;
    return sum;
  }
}
