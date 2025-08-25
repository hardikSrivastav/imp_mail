import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { VectorEmbeddingService } from '../../../services/embedding/VectorEmbeddingService';
import { EmailVector } from '../../../types/models';

// Mock OpenAI
const mockOpenAI = {
  embeddings: {
    create: jest.fn() as jest.MockedFunction<any>
  }
};

// Mock Qdrant
const mockQdrant = {
  getCollections: jest.fn() as jest.MockedFunction<any>,
  createCollection: jest.fn() as jest.MockedFunction<any>,
  upsert: jest.fn() as jest.MockedFunction<any>,
  search: jest.fn() as jest.MockedFunction<any>,
  delete: jest.fn() as jest.MockedFunction<any>,
  getCollection: jest.fn() as jest.MockedFunction<any>
};

// Mock the modules
jest.mock('openai', () => ({
  OpenAI: jest.fn(() => mockOpenAI)
}));

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn(() => mockQdrant)
}));

describe('VectorEmbeddingService', () => {
  let vectorService: VectorEmbeddingService;
  const mockApiKey = 'test-openai-key';
  const mockQdrantUrl = 'http://localhost:6333';
  const mockQdrantApiKey = 'test-qdrant-key';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    vectorService = new VectorEmbeddingService(
      mockApiKey,
      mockQdrantUrl,
      mockQdrantApiKey,
      'test_collection',
      'text-embedding-3-small'
    );
  });

  describe('initializeCollection', () => {
    it('should create collection if it does not exist', async () => {
      mockQdrant.getCollections.mockResolvedValue({
        collections: []
      });

      await vectorService.initializeCollection();

      expect(mockQdrant.getCollections).toHaveBeenCalled();
      expect(mockQdrant.createCollection).toHaveBeenCalledWith('test_collection', {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        },
        optimizers_config: {
          default_segment_number: 2
        },
        replication_factor: 1
      });
    });

    it('should not create collection if it already exists', async () => {
      mockQdrant.getCollections.mockResolvedValue({
        collections: [{ name: 'test_collection' }]
      });

      await vectorService.initializeCollection();

      expect(mockQdrant.getCollections).toHaveBeenCalled();
      expect(mockQdrant.createCollection).not.toHaveBeenCalled();
    });

    it('should throw error if collection creation fails', async () => {
      mockQdrant.getCollections.mockResolvedValue({
        collections: []
      });
      mockQdrant.createCollection.mockRejectedValue(new Error('Creation failed'));

      await expect(vectorService.initializeCollection()).rejects.toThrow('Creation failed');
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for content', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });

      const result = await vectorService.generateEmbedding('test content');

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test content',
        encoding_format: 'float'
      });
      expect(result).toEqual(mockEmbedding);
    });

    it('should truncate long content', async () => {
      const longContent = 'a'.repeat(10000);
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });

      await vectorService.generateEmbedding(longContent);

      const callArgs = mockOpenAI.embeddings.create.mock.calls[0][0] as any;
      expect(callArgs.input.length).toBeLessThan(longContent.length);
      expect(callArgs.input).toMatch(/\.\.\.$/);
    });

    it('should throw error if no embedding data received', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: []
      });

      await expect(vectorService.generateEmbedding('test')).rejects.toThrow('No embedding data received from OpenAI');
    });

    it('should throw error if OpenAI call fails', async () => {
      mockOpenAI.embeddings.create.mockRejectedValue(new Error('API error'));

      await expect(vectorService.generateEmbedding('test')).rejects.toThrow('API error');
    });
  });

  describe('storeEmbedding', () => {
    it('should store embedding in Qdrant', async () => {
      const emailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date('2024-01-01T00:00:00Z')
      };

      await vectorService.storeEmbedding(emailVector);

      expect(mockQdrant.upsert).toHaveBeenCalledWith('test_collection', {
        wait: true,
        points: [{
          id: 'vector-1',
          vector: [0.1, 0.2, 0.3],
          payload: {
            emailId: 'email-1',
            userId: 'user-1',
            embeddingModel: 'text-embedding-3-small',
            createdAt: '2024-01-01T00:00:00.000Z'
          }
        }]
      });
    });

    it('should throw error if Qdrant storage fails', async () => {
      const emailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };

      mockQdrant.upsert.mockRejectedValue(new Error('Storage failed'));

      await expect(vectorService.storeEmbedding(emailVector)).rejects.toThrow('Storage failed');
    });
  });

  describe('processEmailEmbedding', () => {
    it('should generate and store embedding for email', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });
      mockQdrant.upsert.mockResolvedValue({});

      const result = await vectorService.processEmailEmbedding(
        'email-1',
        'user-1',
        'test email content'
      );

      expect(result.id).toBe('email-1_embedding');
      expect(result.emailId).toBe('email-1');
      expect(result.userId).toBe('user-1');
      expect(result.embedding).toEqual(mockEmbedding);
      expect(result.embeddingModel).toBe('text-embedding-3-small');
      expect(result.createdAt).toBeInstanceOf(Date);

      expect(mockQdrant.upsert).toHaveBeenCalled();
    });
  });

  describe('findSimilarEmails', () => {
    it('should find similar emails using vector search', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }]
      });

      const mockSearchResults = [
        {
          payload: { emailId: 'email-1' },
          score: 0.9
        },
        {
          payload: { emailId: 'email-2' },
          score: 0.8
        }
      ];
      mockQdrant.search.mockResolvedValue(mockSearchResults);

      const results = await vectorService.findSimilarEmails(
        'test content',
        'user-1',
        5,
        0.7
      );

      expect(mockQdrant.search).toHaveBeenCalledWith('test_collection', {
        vector: mockEmbedding,
        limit: 5,
        score_threshold: 0.7,
        filter: {
          must: [{
            key: 'userId',
            match: { value: 'user-1' }
          }]
        },
        with_payload: true
      });

      expect(results).toEqual([
        { emailId: 'email-1', score: 0.9 },
        { emailId: 'email-2', score: 0.8 }
      ]);
    });

    it('should handle search errors', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }]
      });
      mockQdrant.search.mockRejectedValue(new Error('Search failed'));

      await expect(
        vectorService.findSimilarEmails('test', 'user-1')
      ).rejects.toThrow('Search failed');
    });
  });

  describe('deleteEmbedding', () => {
    it('should delete embedding from Qdrant', async () => {
      await vectorService.deleteEmbedding('email-1');

      expect(mockQdrant.delete).toHaveBeenCalledWith('test_collection', {
        wait: true,
        points: ['email-1_embedding']
      });
    });

    it('should handle deletion errors', async () => {
      mockQdrant.delete.mockRejectedValue(new Error('Deletion failed'));

      await expect(vectorService.deleteEmbedding('email-1')).rejects.toThrow('Deletion failed');
    });
  });

  describe('deleteUserEmbeddings', () => {
    it('should delete all embeddings for a user', async () => {
      mockQdrant.delete.mockResolvedValue({});
      
      await vectorService.deleteUserEmbeddings('user-1');

      expect(mockQdrant.delete).toHaveBeenCalledWith('test_collection', {
        wait: true,
        filter: {
          must: [{
            key: 'userId',
            match: { value: 'user-1' }
          }]
        }
      });
    });
  });

  describe('getEmbeddingStats', () => {
    it('should return embedding statistics', async () => {
      const mockCollectionInfo = {
        points_count: 100,
        other_info: 'test'
      };
      mockQdrant.getCollection.mockResolvedValue(mockCollectionInfo);

      const stats = await vectorService.getEmbeddingStats();

      expect(stats.totalEmbeddings).toBe(100);
      expect(stats.collectionInfo).toEqual(mockCollectionInfo);
    });

    it('should handle missing points count', async () => {
      mockQdrant.getCollection.mockResolvedValue({});

      const stats = await vectorService.getEmbeddingStats();

      expect(stats.totalEmbeddings).toBe(0);
    });
  });

  describe('healthCheck', () => {
    it('should return health status for both services', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1] }]
      });
      mockQdrant.getCollections.mockResolvedValue({ collections: [] });

      const health = await vectorService.healthCheck();

      expect(health.openai).toBe(true);
      expect(health.qdrant).toBe(true);
    });

    it('should handle OpenAI failure', async () => {
      mockOpenAI.embeddings.create.mockRejectedValue(new Error('OpenAI failed'));
      mockQdrant.getCollections.mockResolvedValue({ collections: [] });

      const health = await vectorService.healthCheck();

      expect(health.openai).toBe(false);
      expect(health.qdrant).toBe(true);
    });

    it('should handle Qdrant failure', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue({
        data: [{ embedding: [0.1] }]
      });
      mockQdrant.getCollections.mockRejectedValue(new Error('Qdrant failed'));

      const health = await vectorService.healthCheck();

      expect(health.openai).toBe(true);
      expect(health.qdrant).toBe(false);
    });
  });
});