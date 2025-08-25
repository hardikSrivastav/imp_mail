import { Redis } from 'ioredis';
import { getRedisClient } from '../config/redis';
import { Email, EmailVector } from '../types/models';

/**
 * CacheRepository handles Redis caching for frequently accessed emails and embeddings
 */
export class CacheRepository {
  private redis: Redis;
  private readonly EMAIL_TTL = 3600; // 1 hour
  private readonly VECTOR_TTL = 7200; // 2 hours
  private readonly SEARCH_TTL = 1800; // 30 minutes

  constructor() {
    this.redis = getRedisClient();
  }

  /**
   * Cache email data
   */
  async cacheEmail(email: Email): Promise<void> {
    try {
      const key = this.getEmailKey(email.id);
      await this.redis.setex(key, this.EMAIL_TTL, JSON.stringify(email));
    } catch (error) {
      console.error('❌ Failed to cache email:', error);
      // Don't throw - caching failures shouldn't break the application
    }
  }

  /**
   * Get cached email
   */
  async getCachedEmail(emailId: string): Promise<Email | null> {
    try {
      const key = this.getEmailKey(emailId);
      const cached = await this.redis.get(key);
      
      if (!cached) return null;
      
      const email = JSON.parse(cached);
      // Convert date strings back to Date objects
      email.receivedAt = new Date(email.receivedAt);
      email.indexedAt = new Date(email.indexedAt);
      
      return email;
    } catch (error) {
      console.error('❌ Failed to get cached email:', error);
      return null;
    }
  }

  /**
   * Cache multiple emails
   */
  async cacheEmails(emails: Email[]): Promise<void> {
    if (emails.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();
      
      for (const email of emails) {
        const key = this.getEmailKey(email.id);
        pipeline.setex(key, this.EMAIL_TTL, JSON.stringify(email));
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('❌ Failed to cache emails:', error);
    }
  }

  /**
   * Get multiple cached emails
   */
  async getCachedEmails(emailIds: string[]): Promise<Email[]> {
    if (emailIds.length === 0) return [];

    try {
      const keys = emailIds.map(id => this.getEmailKey(id));
      const cached = await this.redis.mget(...keys);
      
      const emails: Email[] = [];
      for (const item of cached) {
        if (item) {
          const email = JSON.parse(item);
          // Convert date strings back to Date objects
          email.receivedAt = new Date(email.receivedAt);
          email.indexedAt = new Date(email.indexedAt);
          emails.push(email);
        }
      }
      
      return emails;
    } catch (error) {
      console.error('❌ Failed to get cached emails:', error);
      return [];
    }
  }

  /**
   * Cache email vector
   */
  async cacheVector(vector: EmailVector): Promise<void> {
    try {
      const key = this.getVectorKey(vector.id);
      await this.redis.setex(key, this.VECTOR_TTL, JSON.stringify(vector));
    } catch (error) {
      console.error('❌ Failed to cache vector:', error);
    }
  }

  /**
   * Get cached email vector
   */
  async getCachedVector(vectorId: string): Promise<EmailVector | null> {
    try {
      const key = this.getVectorKey(vectorId);
      const cached = await this.redis.get(key);
      
      if (!cached) return null;
      
      const vector = JSON.parse(cached);
      // Convert date string back to Date object
      vector.createdAt = new Date(vector.createdAt);
      
      return vector;
    } catch (error) {
      console.error('❌ Failed to get cached vector:', error);
      return null;
    }
  }

  /**
   * Cache search results
   */
  async cacheSearchResults(
    searchKey: string,
    results: Email[],
    ttl: number = this.SEARCH_TTL
  ): Promise<void> {
    try {
      const key = this.getSearchKey(searchKey);
      await this.redis.setex(key, ttl, JSON.stringify(results));
    } catch (error) {
      console.error('❌ Failed to cache search results:', error);
    }
  }

  /**
   * Get cached search results
   */
  async getCachedSearchResults(searchKey: string): Promise<Email[] | null> {
    try {
      const key = this.getSearchKey(searchKey);
      const cached = await this.redis.get(key);
      
      if (!cached) return null;
      
      const results = JSON.parse(cached);
      // Convert date strings back to Date objects
      for (const email of results) {
        email.receivedAt = new Date(email.receivedAt);
        email.indexedAt = new Date(email.indexedAt);
      }
      
      return results;
    } catch (error) {
      console.error('❌ Failed to get cached search results:', error);
      return null;
    }
  }

  /**
   * Cache user email count
   */
  async cacheUserEmailCount(userId: string, count: number): Promise<void> {
    try {
      const key = this.getUserCountKey(userId);
      await this.redis.setex(key, this.EMAIL_TTL, count.toString());
    } catch (error) {
      console.error('❌ Failed to cache user email count:', error);
    }
  }

  /**
   * Get cached user email count
   */
  async getCachedUserEmailCount(userId: string): Promise<number | null> {
    try {
      const key = this.getUserCountKey(userId);
      const cached = await this.redis.get(key);
      return cached ? parseInt(cached, 10) : null;
    } catch (error) {
      console.error('❌ Failed to get cached user email count:', error);
      return null;
    }
  }

  /**
   * Invalidate email cache
   */
  async invalidateEmail(emailId: string): Promise<void> {
    try {
      const key = this.getEmailKey(emailId);
      await this.redis.del(key);
    } catch (error) {
      console.error('❌ Failed to invalidate email cache:', error);
    }
  }

  /**
   * Invalidate user's email caches
   */
  async invalidateUserEmails(userId: string): Promise<void> {
    try {
      const pattern = `email:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        // Get all cached emails to check which belong to the user
        const cached = await this.redis.mget(...keys);
        const keysToDelete: string[] = [];
        
        for (let i = 0; i < cached.length; i++) {
          if (cached[i]) {
            try {
              const email = JSON.parse(cached[i]!);
              if (email.userId === userId) {
                keysToDelete.push(keys[i]);
              }
            } catch (e) {
              // Invalid JSON, delete anyway
              keysToDelete.push(keys[i]);
            }
          }
        }
        
        if (keysToDelete.length > 0) {
          await this.redis.del(...keysToDelete);
        }
      }
      
      // Also invalidate user count cache
      const countKey = this.getUserCountKey(userId);
      await this.redis.del(countKey);
      
      // Invalidate search caches for this user
      const searchPattern = `search:${userId}:*`;
      const searchKeys = await this.redis.keys(searchPattern);
      if (searchKeys.length > 0) {
        await this.redis.del(...searchKeys);
      }
    } catch (error) {
      console.error('❌ Failed to invalidate user email caches:', error);
    }
  }

  /**
   * Invalidate search cache
   */
  async invalidateSearchCache(searchKey: string): Promise<void> {
    try {
      const key = this.getSearchKey(searchKey);
      await this.redis.del(key);
    } catch (error) {
      console.error('❌ Failed to invalidate search cache:', error);
    }
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error('❌ Failed to clear all caches:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    emailCount: number;
    vectorCount: number;
    searchCount: number;
    memoryUsage: string;
  }> {
    try {
      const emailKeys = await this.redis.keys('email:*');
      const vectorKeys = await this.redis.keys('vector:*');
      const searchKeys = await this.redis.keys('search:*');
      const info = await this.redis.info('memory');
      
      // Extract memory usage from info string
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';
      
      return {
        emailCount: emailKeys.length,
        vectorCount: vectorKeys.length,
        searchCount: searchKeys.length,
        memoryUsage
      };
    } catch (error) {
      console.error('❌ Failed to get cache stats:', error);
      return {
        emailCount: 0,
        vectorCount: 0,
        searchCount: 0,
        memoryUsage: 'unknown'
      };
    }
  }

  /**
   * Generate search cache key
   */
  generateSearchKey(
    userId: string,
    query: string,
    filters: {
      importance?: string;
      sender?: string;
      dateFrom?: Date;
      dateTo?: Date;
      limit?: number;
      offset?: number;
    }
  ): string {
    const filterStr = JSON.stringify({
      ...filters,
      dateFrom: filters.dateFrom?.toISOString(),
      dateTo: filters.dateTo?.toISOString()
    });
    return `${userId}:${query}:${Buffer.from(filterStr).toString('base64')}`;
  }

  // Private helper methods
  private getEmailKey(emailId: string): string {
    return `email:${emailId}`;
  }

  private getVectorKey(vectorId: string): string {
    return `vector:${vectorId}`;
  }

  private getSearchKey(searchKey: string): string {
    return `search:${searchKey}`;
  }

  private getUserCountKey(userId: string): string {
    return `count:${userId}`;
  }
}