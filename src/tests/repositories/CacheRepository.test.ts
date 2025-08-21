import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CacheRepository } from '../../repositories/CacheRepository';
import { Email, EmailVector } from '../../types/models';

// Mock Redis
const mockRedis = {
  setex: jest.fn(),
  get: jest.fn(),
  mget: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  flushdb: jest.fn(),
  info: jest.fn(),
  pipeline: jest.fn(() => ({
    setex: jest.fn(),
    exec: jest.fn()
  }))
};

jest.mock('../../config/redis', () => ({
  getRedisClient: () => mockRedis
}));

describe('CacheRepository', () => {
  let repository: CacheRepository;

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
    repository = new CacheRepository();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('cacheEmail', () => {
    it('should cache email with correct key and TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await repository.cacheEmail(mockEmail);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'email:email-1',
        3600, // EMAIL_TTL
        JSON.stringify(mockEmail)
      );
    });

    it('should not throw on Redis error', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(repository.cacheEmail(mockEmail)).resolves.not.toThrow();
    });
  });

  describe('getCachedEmail', () => {
    it('should retrieve and parse cached email', async () => {
      const cachedData = JSON.stringify(mockEmail);
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await repository.getCachedEmail('email-1');

      expect(mockRedis.get).toHaveBeenCalledWith('email:email-1');
      expect(result).toEqual({
        ...mockEmail,
        receivedAt: new Date(mockEmail.receivedAt),
        indexedAt: new Date(mockEmail.indexedAt)
      });
    });

    it('should return null when email not cached', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await repository.getCachedEmail('email-1');

      expect(result).toBeNull();
    });

    it('should return null on Redis error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await repository.getCachedEmail('email-1');

      expect(result).toBeNull();
    });
  });

  describe('cacheEmails', () => {
    it('should cache multiple emails using pipeline', async () => {
      const emails = [mockEmail, { ...mockEmail, id: 'email-2' }];
      const mockPipeline = {
        setex: vi.fn(),
        exec: vi.fn().mockResolvedValue([])
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await repository.cacheEmails(emails);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.setex).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty array', async () => {
      await repository.cacheEmails([]);

      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('getCachedEmails', () => {
    it('should retrieve multiple cached emails', async () => {
      const emails = [mockEmail, { ...mockEmail, id: 'email-2' }];
      const cachedData = emails.map(email => JSON.stringify(email));
      mockRedis.mget.mockResolvedValue(cachedData);

      const result = await repository.getCachedEmails(['email-1', 'email-2']);

      expect(mockRedis.mget).toHaveBeenCalledWith('email:email-1', 'email:email-2');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('email-1');
      expect(result[1].id).toBe('email-2');
    });

    it('should handle mixed cached/uncached emails', async () => {
      mockRedis.mget.mockResolvedValue([JSON.stringify(mockEmail), null]);

      const result = await repository.getCachedEmails(['email-1', 'email-2']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('email-1');
    });

    it('should return empty array for empty input', async () => {
      const result = await repository.getCachedEmails([]);

      expect(result).toEqual([]);
      expect(mockRedis.mget).not.toHaveBeenCalled();
    });
  });

  describe('cacheVector', () => {
    it('should cache vector with correct key and TTL', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await repository.cacheVector(mockVector);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'vector:vector-1',
        7200, // VECTOR_TTL
        JSON.stringify(mockVector)
      );
    });
  });

  describe('getCachedVector', () => {
    it('should retrieve and parse cached vector', async () => {
      const cachedData = JSON.stringify(mockVector);
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await repository.getCachedVector('vector-1');

      expect(mockRedis.get).toHaveBeenCalledWith('vector:vector-1');
      expect(result).toEqual({
        ...mockVector,
        createdAt: new Date(mockVector.createdAt)
      });
    });
  });

  describe('cacheSearchResults', () => {
    it('should cache search results with default TTL', async () => {
      const results = [mockEmail];
      mockRedis.setex.mockResolvedValue('OK');

      await repository.cacheSearchResults('search-key', results);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'search:search-key',
        1800, // SEARCH_TTL
        JSON.stringify(results)
      );
    });

    it('should cache search results with custom TTL', async () => {
      const results = [mockEmail];
      mockRedis.setex.mockResolvedValue('OK');

      await repository.cacheSearchResults('search-key', results, 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'search:search-key',
        3600,
        JSON.stringify(results)
      );
    });
  });

  describe('getCachedSearchResults', () => {
    it('should retrieve and parse cached search results', async () => {
      const results = [mockEmail];
      const cachedData = JSON.stringify(results);
      mockRedis.get.mockResolvedValue(cachedData);

      const result = await repository.getCachedSearchResults('search-key');

      expect(mockRedis.get).toHaveBeenCalledWith('search:search-key');
      expect(result).toHaveLength(1);
      expect(result![0].id).toBe('email-1');
    });
  });

  describe('cacheUserEmailCount', () => {
    it('should cache user email count', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await repository.cacheUserEmailCount('user-1', 42);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'count:user-1',
        3600,
        '42'
      );
    });
  });

  describe('getCachedUserEmailCount', () => {
    it('should retrieve cached user email count', async () => {
      mockRedis.get.mockResolvedValue('42');

      const result = await repository.getCachedUserEmailCount('user-1');

      expect(mockRedis.get).toHaveBeenCalledWith('count:user-1');
      expect(result).toBe(42);
    });

    it('should return null when count not cached', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await repository.getCachedUserEmailCount('user-1');

      expect(result).toBeNull();
    });
  });

  describe('invalidateEmail', () => {
    it('should delete email cache', async () => {
      mockRedis.del.mockResolvedValue(1);

      await repository.invalidateEmail('email-1');

      expect(mockRedis.del).toHaveBeenCalledWith('email:email-1');
    });
  });

  describe('invalidateUserEmails', () => {
    it('should invalidate all user email caches', async () => {
      const emailKeys = ['email:email-1', 'email:email-2'];
      const cachedEmails = [
        JSON.stringify({ ...mockEmail, userId: 'user-1' }),
        JSON.stringify({ ...mockEmail, userId: 'user-2' })
      ];
      
      mockRedis.keys
        .mockResolvedValueOnce(emailKeys) // email pattern
        .mockResolvedValueOnce(['search:user-1:query']); // search pattern
      
      mockRedis.mget.mockResolvedValue(cachedEmails);
      mockRedis.del.mockResolvedValue(1);

      await repository.invalidateUserEmails('user-1');

      expect(mockRedis.keys).toHaveBeenCalledWith('email:*');
      expect(mockRedis.del).toHaveBeenCalledWith('email:email-1');
      expect(mockRedis.del).toHaveBeenCalledWith('count:user-1');
      expect(mockRedis.keys).toHaveBeenCalledWith('search:user-1:*');
    });
  });

  describe('clearAllCaches', () => {
    it('should flush all caches', async () => {
      mockRedis.flushdb.mockResolvedValue('OK');

      await repository.clearAllCaches();

      expect(mockRedis.flushdb).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.keys
        .mockResolvedValueOnce(['email:1', 'email:2']) // email keys
        .mockResolvedValueOnce(['vector:1']) // vector keys
        .mockResolvedValueOnce(['search:1', 'search:2', 'search:3']); // search keys
      
      mockRedis.info.mockResolvedValue('used_memory_human:1.5M\nother_info:value');

      const stats = await repository.getCacheStats();

      expect(stats).toEqual({
        emailCount: 2,
        vectorCount: 1,
        searchCount: 3,
        memoryUsage: '1.5M'
      });
    });
  });

  describe('generateSearchKey', () => {
    it('should generate consistent search key', () => {
      const filters = {
        importance: 'important',
        sender: 'test@example.com',
        dateFrom: new Date('2024-01-01'),
        limit: 10
      };

      const key1 = repository.generateSearchKey('user-1', 'test query', filters);
      const key2 = repository.generateSearchKey('user-1', 'test query', filters);

      expect(key1).toBe(key2);
      expect(key1).toContain('user-1');
      expect(key1).toContain('test query');
    });

    it('should generate different keys for different filters', () => {
      const filters1 = { importance: 'important' };
      const filters2 = { importance: 'not_important' };

      const key1 = repository.generateSearchKey('user-1', 'query', filters1);
      const key2 = repository.generateSearchKey('user-1', 'query', filters2);

      expect(key1).not.toBe(key2);
    });
  });
});