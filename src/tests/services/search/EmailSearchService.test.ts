import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EmailSearchService, SearchOptions } from '../../../services/search/EmailSearchService';
import { EmailRepository } from '../../../repositories/EmailRepository';
import { QdrantRepository } from '../../../repositories/QdrantRepository';
import { CacheRepository } from '../../../repositories/CacheRepository';
import { VectorEmbeddingService } from '../../../services/embedding/VectorEmbeddingService';
import { Email, EmailVector } from '../../../types/models';

// Mock dependencies
const mockEmailRepository = {
  searchEmails: jest.fn(),
  getByIds: jest.fn(),
  getUserEmailCount: jest.fn(),
  getUserEmailCountByImportance: jest.fn(),
  getEmailsForUser: jest.fn(),
  getById: jest.fn()
} as any;

const mockQdrantRepository = {
  searchSimilar: jest.fn(),
  getVector: jest.fn(),
  getUserVectorCount: jest.fn()
} as any;

const mockCacheRepository = {
  generateSearchKey: jest.fn(),
  getCachedSearchResults: jest.fn(),
  cacheSearchResults: jest.fn(),
  invalidateUserEmails: jest.fn()
} as any;

const mockEmbeddingService = {
  generateEmbedding: jest.fn()
} as any;

describe('EmailSearchService', () => {
  let service: EmailSearchService;

  const mockEmail: Email = {
    id: 'email-1',
    userId: 'user-1',
    messageId: 'msg-123',
    subject: 'Test Email',
    sender: 'sender@example.com',
    recipients: ['recipient@example.com'],
    content: 'This is a test email content',
    htmlContent: '<p>This is a test email content</p>',
    receivedAt: new Date('2024-01-01T10:00:00Z'),
    indexedAt: new Date('2024-01-01T10:05:00Z'),
    importance: 'unclassified',
    importanceConfidence: 0.5,
    userLabeled: false,
    vectorId: 'vector-1',
    metadata: {
      hasAttachments: false,
      threadId: 'thread-1',
      labels: ['inbox']
    }
  };

  const mockVector: EmailVector = {
    id: 'vector-1',
    emailId: 'email-1',
    userId: 'user-1',
    embedding: [0.1, 0.2, 0.3],
    embeddingModel: 'text-embedding-ada-002',
    createdAt: new Date('2024-01-01T10:05:00Z')
  };

  beforeEach(() => {
    service = new EmailSearchService(
      mockEmailRepository,
      mockQdrantRepository,
      mockCacheRepository,
      mockEmbeddingService
    );
    jest.clearAllMocks();
  });

  describe('textSearch', () => {
    it('should return cached results when available', async () => {
      const cachedResults = [mockEmail];
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(cachedResults);

      const results = await service.textSearch('user-1', 'test query');

      expect(mockCacheRepository.getCachedSearchResults).toHaveBeenCalledWith('cache-key');
      expect(results).toHaveLength(1);
      expect(results[0].email).toEqual(mockEmail);
      expect(results[0].source).toBe('text');
      expect(mockEmailRepository.searchEmails).not.toHaveBeenCalled();
    });

    it('should perform text search when not cached', async () => {
      const searchResults = [mockEmail];
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmailRepository.searchEmails.mockResolvedValue(searchResults);

      const results = await service.textSearch('user-1', 'test query');

      expect(mockEmailRepository.searchEmails).toHaveBeenCalledWith('user-1', 'test query', {
        importance: undefined,
        limit: undefined,
        offset: undefined
      });
      expect(mockCacheRepository.cacheSearchResults).toHaveBeenCalledWith('cache-key', searchResults);
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('text');
    });

    it('should apply filters correctly', async () => {
      const options: SearchOptions = {
        importance: 'important',
        limit: 10,
        offset: 5
      };
      
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmailRepository.searchEmails.mockResolvedValue([mockEmail]);

      await service.textSearch('user-1', 'test query', options);

      expect(mockEmailRepository.searchEmails).toHaveBeenCalledWith('user-1', 'test query', {
        importance: 'important',
        limit: 10,
        offset: 5
      });
    });
  });

  describe('semanticSearch', () => {
    it('should return cached results when available', async () => {
      const cachedResults = [mockEmail];
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(cachedResults);

      const results = await service.semanticSearch('user-1', 'test query');

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('semantic');
      expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should perform semantic search when not cached', async () => {
      const queryEmbedding = [0.4, 0.5, 0.6];
      const similarVectors = [
        { emailId: 'email-1', score: 0.9, vectorId: 'vector-1' }
      ];
      
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(queryEmbedding);
      mockQdrantRepository.searchSimilar.mockResolvedValue(similarVectors);
      mockEmailRepository.getByIds.mockResolvedValue([mockEmail]);

      const results = await service.semanticSearch('user-1', 'test query');

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith('test query');
      expect(mockQdrantRepository.searchSimilar).toHaveBeenCalledWith(
        queryEmbedding,
        'user-1',
        10,
        0.7
      );
      expect(mockEmailRepository.getByIds).toHaveBeenCalledWith(['email-1']);
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.9);
      expect(results[0].source).toBe('semantic');
    });

    it('should return empty results when no similar vectors found', async () => {
      const queryEmbedding = [0.4, 0.5, 0.6];
      
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmbeddingService.generateEmbedding.mockResolvedValue(queryEmbedding);
      mockQdrantRepository.searchSimilar.mockResolvedValue([]);

      const results = await service.semanticSearch('user-1', 'test query');

      expect(results).toHaveLength(0);
      expect(mockEmailRepository.getByIds).not.toHaveBeenCalled();
    });

    it('should apply semantic threshold and limit', async () => {
      const options: SearchOptions = {
        limit: 5,
        semanticThreshold: 0.8
      };
      
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmbeddingService.generateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockQdrantRepository.searchSimilar.mockResolvedValue([]);

      await service.semanticSearch('user-1', 'test query', options);

      expect(mockQdrantRepository.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'user-1',
        5,
        0.8
      );
    });
  });

  describe('combinedSearch', () => {
    it('should combine text and semantic search results', async () => {
      const textResults = [
        { email: { ...mockEmail, id: 'email-1' }, source: 'text' as const }
      ];
      const semanticResults = [
        { email: { ...mockEmail, id: 'email-2' }, score: 0.8, source: 'semantic' as const }
      ];

      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);

      // Mock the individual search methods
      jest.spyOn(service, 'textSearch').mockResolvedValue(textResults);
      jest.spyOn(service, 'semanticSearch').mockResolvedValue(semanticResults);

      const results = await service.combinedSearch('user-1', 'test query');

      expect(results).toHaveLength(2);
      expect(results.map(r => r.email.id)).toContain('email-1');
      expect(results.map(r => r.email.id)).toContain('email-2');
      expect(results.every(r => r.source === 'combined')).toBe(true);
    });

    it('should boost scores for emails found in both searches', async () => {
      const sharedEmail = { ...mockEmail, id: 'email-shared' };
      const textResults = [
        { email: sharedEmail, source: 'text' as const }
      ];
      const semanticResults = [
        { email: sharedEmail, score: 0.8, source: 'semantic' as const }
      ];

      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);

      jest.spyOn(service, 'textSearch').mockResolvedValue(textResults);
      jest.spyOn(service, 'semanticSearch').mockResolvedValue(semanticResults);

      const results = await service.combinedSearch('user-1', 'test query');

      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('email-shared');
      expect(results[0].score).toBe(1.8); // 1 (text default) + 0.8 (semantic)
    });
  });

  describe('search', () => {
    it('should use text search when useSemanticSearch is false', async () => {
      const textResults = [{ email: mockEmail, source: 'text' as const }];
      jest.spyOn(service, 'textSearch').mockResolvedValue(textResults);

      const results = await service.search('user-1', 'test query', {
        useSemanticSearch: false
      });

      expect(service.textSearch).toHaveBeenCalled();
      expect(results).toEqual(textResults);
    });

    it('should use semantic search when useSemanticSearch is true and combineResults is false', async () => {
      const semanticResults = [{ email: mockEmail, score: 0.9, source: 'semantic' as const }];
      jest.spyOn(service, 'semanticSearch').mockResolvedValue(semanticResults);

      const results = await service.search('user-1', 'test query', {
        useSemanticSearch: true,
        combineResults: false
      });

      expect(service.semanticSearch).toHaveBeenCalled();
      expect(results).toEqual(semanticResults);
    });

    it('should use combined search by default', async () => {
      const combinedResults = [{ email: mockEmail, score: 1.5, source: 'combined' as const }];
      jest.spyOn(service, 'combinedSearch').mockResolvedValue(combinedResults);

      const results = await service.search('user-1', 'test query');

      expect(service.combinedSearch).toHaveBeenCalled();
      expect(results).toEqual(combinedResults);
    });
  });

  describe('getFilteredEmails', () => {
    it('should return cached filtered emails', async () => {
      const cachedEmails = [mockEmail];
      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(cachedEmails);

      const results = await service.getFilteredEmails('user-1', {
        importance: 'important'
      });

      expect(results).toEqual(cachedEmails);
      expect(mockEmailRepository.getEmailsForUser).not.toHaveBeenCalled();
    });

    it('should fetch and cache filtered emails when not cached', async () => {
      const emails = [mockEmail];
      const options: SearchOptions = {
        importance: 'important',
        sender: 'test@example.com',
        limit: 10
      };

      mockCacheRepository.generateSearchKey.mockReturnValue('cache-key');
      mockCacheRepository.getCachedSearchResults.mockResolvedValue(null);
      mockEmailRepository.getEmailsForUser.mockResolvedValue(emails);

      const results = await service.getFilteredEmails('user-1', options);

      expect(mockEmailRepository.getEmailsForUser).toHaveBeenCalledWith('user-1', {
        importance: 'important',
        sender: 'test@example.com',
        dateFrom: undefined,
        dateTo: undefined,
        limit: 10,
        offset: undefined,
        orderBy: 'received_at',
        orderDirection: 'DESC'
      });
      expect(mockCacheRepository.cacheSearchResults).toHaveBeenCalledWith('cache-key', emails);
      expect(results).toEqual(emails);
    });
  });

  describe('findSimilarEmails', () => {
    it('should find similar emails using vector similarity', async () => {
      const targetEmail = { ...mockEmail, vectorId: 'vector-1' };
      const similarVectors = [
        { emailId: 'email-2', score: 0.9, vectorId: 'vector-2' },
        { emailId: 'email-3', score: 0.8, vectorId: 'vector-3' }
      ];
      const similarEmails = [
        { ...mockEmail, id: 'email-2' },
        { ...mockEmail, id: 'email-3' }
      ];

      mockEmailRepository.getById.mockResolvedValue(targetEmail);
      mockQdrantRepository.getVector.mockResolvedValue(mockVector);
      mockQdrantRepository.searchSimilar.mockResolvedValue([
        { emailId: 'email-1', score: 1.0, vectorId: 'vector-1' }, // Original email
        ...similarVectors
      ]);
      mockEmailRepository.getByIds.mockResolvedValue(similarEmails);

      const results = await service.findSimilarEmails('user-1', 'email-1', 2, 0.8);

      expect(mockEmailRepository.getById).toHaveBeenCalledWith('email-1');
      expect(mockQdrantRepository.getVector).toHaveBeenCalledWith('vector-1');
      expect(mockQdrantRepository.searchSimilar).toHaveBeenCalledWith(
        mockVector.embedding,
        'user-1',
        3, // limit + 1
        0.8
      );
      expect(results).toHaveLength(2);
      expect(results[0].email.id).toBe('email-2');
      expect(results[0].score).toBe(0.9);
    });

    it('should throw error when email not found', async () => {
      mockEmailRepository.getById.mockResolvedValue(null);

      await expect(
        service.findSimilarEmails('user-1', 'non-existent', 5, 0.8)
      ).rejects.toThrow('Email not found or access denied');
    });

    it('should throw error when email has no vector', async () => {
      const emailWithoutVector = { ...mockEmail, vectorId: undefined };
      mockEmailRepository.getById.mockResolvedValue(emailWithoutVector);

      await expect(
        service.findSimilarEmails('user-1', 'email-1', 5, 0.8)
      ).rejects.toThrow('Email has no vector embedding');
    });
  });

  describe('getSearchStats', () => {
    it('should return search statistics', async () => {
      mockEmailRepository.getUserEmailCount.mockResolvedValue(100);
      mockEmailRepository.getUserEmailCountByImportance
        .mockResolvedValueOnce(30) // important
        .mockResolvedValueOnce(20); // unclassified
      mockQdrantRepository.getUserVectorCount.mockResolvedValue(95);

      const stats = await service.getSearchStats('user-1');

      expect(stats).toEqual({
        totalEmails: 100,
        importantEmails: 30,
        unclassifiedEmails: 20,
        vectorizedEmails: 95
      });
    });
  });

  describe('invalidateUserSearchCache', () => {
    it('should invalidate user search cache', async () => {
      await service.invalidateUserSearchCache('user-1');

      expect(mockCacheRepository.invalidateUserEmails).toHaveBeenCalledWith('user-1');
    });
  });
});