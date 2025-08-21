import { EmailRepository } from '../../repositories/EmailRepository';
import { QdrantRepository } from '../../repositories/QdrantRepository';
import { CacheRepository } from '../../repositories/CacheRepository';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { Email } from '../../types/models';

export interface SearchOptions {
  importance?: 'important' | 'not_important' | 'unclassified';
  sender?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  useSemanticSearch?: boolean;
  semanticThreshold?: number;
  combineResults?: boolean;
}

export interface SearchResult {
  email: Email;
  score?: number;
  source: 'text' | 'semantic' | 'combined';
}

/**
 * EmailSearchService combines semantic search using Qdrant vector similarity
 * with SQLite full-text search for comprehensive email retrieval
 */
export class EmailSearchService {
  private emailRepository: EmailRepository;
  private qdrantRepository: QdrantRepository;
  private cacheRepository: CacheRepository;
  private embeddingService: VectorEmbeddingService;

  constructor(
    emailRepository: EmailRepository,
    qdrantRepository: QdrantRepository,
    cacheRepository: CacheRepository,
    embeddingService: VectorEmbeddingService
  ) {
    this.emailRepository = emailRepository;
    this.qdrantRepository = qdrantRepository;
    this.cacheRepository = cacheRepository;
    this.embeddingService = embeddingService;
  }

  /**
   * Perform full-text search across email content
   */
  async textSearch(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      // Check cache first
      const cacheKey = this.cacheRepository.generateSearchKey(userId, `text:${query}`, options);
      const cached = await this.cacheRepository.getCachedSearchResults(cacheKey);
      
      if (cached) {
        return cached.map(email => ({
          email,
          source: 'text' as const
        }));
      }

      // Perform text search
      const emails = await this.emailRepository.searchEmails(userId, query, {
        importance: options.importance,
        limit: options.limit,
        offset: options.offset
      });

      // Apply additional filters
      const filteredEmails = this.applyFilters(emails, options);

      // Cache results
      await this.cacheRepository.cacheSearchResults(cacheKey, filteredEmails);

      return filteredEmails.map(email => ({
        email,
        source: 'text' as const
      }));
    } catch (error) {
      console.error('❌ Text search failed:', error);
      throw error;
    }
  }

  /**
   * Perform semantic search using vector embeddings
   */
  async semanticSearch(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      // Check cache first
      const cacheKey = this.cacheRepository.generateSearchKey(userId, `semantic:${query}`, options);
      const cached = await this.cacheRepository.getCachedSearchResults(cacheKey);
      
      if (cached) {
        return cached.map(email => ({
          email,
          source: 'semantic' as const
        }));
      }

      // Generate embedding for search query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Search for similar vectors
      const similarVectors = await this.qdrantRepository.searchSimilar(
        queryEmbedding,
        userId,
        options.limit || 10,
        options.semanticThreshold || 0.7
      );

      if (similarVectors.length === 0) {
        return [];
      }

      // Get email details
      const emailIds = similarVectors.map(v => v.emailId);
      const emails = await this.emailRepository.getByIds(emailIds);

      // Apply additional filters
      const filteredEmails = this.applyFilters(emails, options);

      // Create results with scores
      const results: SearchResult[] = [];
      for (const email of filteredEmails) {
        const vectorResult = similarVectors.find(v => v.emailId === email.id);
        results.push({
          email,
          score: vectorResult?.score,
          source: 'semantic'
        });
      }

      // Sort by score (highest first)
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Cache results
      await this.cacheRepository.cacheSearchResults(cacheKey, filteredEmails);

      return results;
    } catch (error) {
      console.error('❌ Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Perform combined search using both text and semantic search
   */
  async combinedSearch(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      // Check cache first
      const cacheKey = this.cacheRepository.generateSearchKey(userId, `combined:${query}`, options);
      const cached = await this.cacheRepository.getCachedSearchResults(cacheKey);
      
      if (cached) {
        return cached.map(email => ({
          email,
          source: 'combined' as const
        }));
      }

      // Perform both searches in parallel
      const [textResults, semanticResults] = await Promise.all([
        this.textSearch(userId, query, { ...options, limit: options.limit }),
        this.semanticSearch(userId, query, { ...options, limit: options.limit })
      ]);

      // Combine and deduplicate results
      const combinedResults = new Map<string, SearchResult>();

      // Add text search results
      for (const result of textResults) {
        combinedResults.set(result.email.id, {
          ...result,
          source: 'combined'
        });
      }

      // Add semantic search results, boosting score for emails found in both
      for (const result of semanticResults) {
        const existing = combinedResults.get(result.email.id);
        if (existing) {
          // Email found in both searches - boost relevance
          combinedResults.set(result.email.id, {
            email: result.email,
            score: (existing.score || 1) + (result.score || 0.5),
            source: 'combined'
          });
        } else {
          combinedResults.set(result.email.id, {
            ...result,
            source: 'combined'
          });
        }
      }

      // Convert to array and sort by score
      const results = Array.from(combinedResults.values());
      results.sort((a, b) => (b.score || 0) - (a.score || 0));

      // Apply limit after combining
      const limitedResults = options.limit ? results.slice(0, options.limit) : results;

      // Cache results
      const emailsToCache = limitedResults.map(r => r.email);
      await this.cacheRepository.cacheSearchResults(cacheKey, emailsToCache);

      return limitedResults;
    } catch (error) {
      console.error('❌ Combined search failed:', error);
      throw error;
    }
  }

  /**
   * Main search method that chooses the appropriate search strategy
   */
  async search(
    userId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (options.useSemanticSearch === false) {
      return this.textSearch(userId, query, options);
    } else if (options.combineResults === false && options.useSemanticSearch === true) {
      return this.semanticSearch(userId, query, options);
    } else {
      // Default to combined search
      return this.combinedSearch(userId, query, options);
    }
  }

  /**
   * Get emails with filtering (no search query)
   */
  async getFilteredEmails(
    userId: string,
    options: SearchOptions = {}
  ): Promise<Email[]> {
    try {
      // Check cache first
      const cacheKey = this.cacheRepository.generateSearchKey(userId, 'filtered', options);
      const cached = await this.cacheRepository.getCachedSearchResults(cacheKey);
      
      if (cached) {
        return cached;
      }

      // Get emails with filters
      const emails = await this.emailRepository.getEmailsForUser(userId, {
        importance: options.importance,
        sender: options.sender,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        limit: options.limit,
        offset: options.offset,
        orderBy: 'received_at',
        orderDirection: 'DESC'
      });

      // Cache results
      await this.cacheRepository.cacheSearchResults(cacheKey, emails);

      return emails;
    } catch (error) {
      console.error('❌ Failed to get filtered emails:', error);
      throw error;
    }
  }

  /**
   * Find similar emails to a given email using semantic search
   */
  async findSimilarEmails(
    userId: string,
    emailId: string,
    limit: number = 5,
    threshold: number = 0.8
  ): Promise<SearchResult[]> {
    try {
      // Get the email and its vector
      const email = await this.emailRepository.getById(emailId);
      if (!email || email.userId !== userId) {
        throw new Error('Email not found or access denied');
      }

      if (!email.vectorId) {
        throw new Error('Email has no vector embedding');
      }

      // Get the email's vector
      const vector = await this.qdrantRepository.getVector(email.vectorId);
      if (!vector) {
        throw new Error('Vector not found');
      }

      // Search for similar vectors
      const similarVectors = await this.qdrantRepository.searchSimilar(
        vector.embedding,
        userId,
        limit + 1, // +1 to exclude the original email
        threshold
      );

      // Filter out the original email and get email details
      const filteredVectors = similarVectors.filter(v => v.emailId !== emailId);
      const emailIds = filteredVectors.slice(0, limit).map(v => v.emailId);
      const similarEmails = await this.emailRepository.getByIds(emailIds);

      // Create results with scores
      const results: SearchResult[] = [];
      for (const similarEmail of similarEmails) {
        const vectorResult = filteredVectors.find(v => v.emailId === similarEmail.id);
        results.push({
          email: similarEmail,
          score: vectorResult?.score,
          source: 'semantic'
        });
      }

      return results;
    } catch (error) {
      console.error('❌ Failed to find similar emails:', error);
      throw error;
    }
  }

  /**
   * Apply additional filters to email results
   */
  private applyFilters(emails: Email[], options: SearchOptions): Email[] {
    let filtered = emails;

    if (options.sender) {
      filtered = filtered.filter(email => 
        email.sender.toLowerCase().includes(options.sender!.toLowerCase())
      );
    }

    if (options.dateFrom) {
      filtered = filtered.filter(email => email.receivedAt >= options.dateFrom!);
    }

    if (options.dateTo) {
      filtered = filtered.filter(email => email.receivedAt <= options.dateTo!);
    }

    if (options.offset) {
      filtered = filtered.slice(options.offset);
    }

    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Invalidate search caches for a user
   */
  async invalidateUserSearchCache(userId: string): Promise<void> {
    await this.cacheRepository.invalidateUserEmails(userId);
  }

  /**
   * Get search statistics
   */
  async getSearchStats(userId: string): Promise<{
    totalEmails: number;
    importantEmails: number;
    unclassifiedEmails: number;
    vectorizedEmails: number;
  }> {
    try {
      const [totalEmails, importantEmails, unclassifiedEmails, vectorCount] = await Promise.all([
        this.emailRepository.getUserEmailCount(userId),
        this.emailRepository.getUserEmailCountByImportance(userId, 'important'),
        this.emailRepository.getUserEmailCountByImportance(userId, 'unclassified'),
        this.qdrantRepository.getUserVectorCount(userId)
      ]);

      return {
        totalEmails,
        importantEmails,
        unclassifiedEmails,
        vectorizedEmails: vectorCount
      };
    } catch (error) {
      console.error('❌ Failed to get search stats:', error);
      throw error;
    }
  }
}