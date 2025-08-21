import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { IndexingController } from '../../controllers/IndexingController';
import { IncrementalIndexer } from '../../services/indexing/IncrementalIndexer';
import { FullIndexer } from '../../services/indexing/FullIndexer';
import { SyncStateManager } from '../../services/sync/SyncStateManager';
import { EmailRepository } from '../../repositories/EmailRepository';
import { QdrantRepository } from '../../repositories/QdrantRepository';
import { authenticateToken } from '../../middleware/auth';
import { SyncState } from '../../types/models';

// Mock dependencies
jest.mock('../../services/indexing/IncrementalIndexer');
jest.mock('../../services/indexing/FullIndexer');
jest.mock('../../services/sync/SyncStateManager');
jest.mock('../../repositories/EmailRepository');
jest.mock('../../repositories/QdrantRepository');

describe('IndexingController', () => {
  let app: express.Application;
  let incrementalIndexer: jest.Mocked<IncrementalIndexer>;
  let fullIndexer: jest.Mocked<FullIndexer>;
  let syncStateManager: jest.Mocked<SyncStateManager>;
  let emailRepository: jest.Mocked<EmailRepository>;
  let qdrantRepository: jest.Mocked<QdrantRepository>;
  let indexingController: IndexingController;

  const JWT_SECRET = 'test-secret';
  const mockUser = { id: 'user-1', email: 'test@ashoka.edu.in' };
  const mockToken = jwt.sign(mockUser, JWT_SECRET);

  const mockSyncState: SyncState = {
    userId: 'user-1',
    lastSyncAt: new Date('2023-01-01'),
    totalEmailsIndexed: 50,
    isInitialSyncComplete: true,
    currentSyncStatus: 'idle'
  };

  const mockFullIndexingResult = {
    totalEmails: 100,
    emailsProcessed: 100,
    emailsSkipped: 0,
    errors: [],
    startTime: new Date(),
    endTime: new Date(),
    isComplete: true
  };

  const mockIncrementalResult = {
    emailsProcessed: 5,
    emailsSkipped: 0,
    errors: []
  };

  beforeEach(() => {
    // Create mock instances
    incrementalIndexer = new IncrementalIndexer(
      {} as any, {} as any, {} as any, {} as any, {} as any
    ) as jest.Mocked<IncrementalIndexer>;
    fullIndexer = new FullIndexer(
      {} as any, {} as any, {} as any, {} as any, {} as any
    ) as jest.Mocked<FullIndexer>;
    syncStateManager = new SyncStateManager({} as any) as jest.Mocked<SyncStateManager>;
    emailRepository = new EmailRepository() as jest.Mocked<EmailRepository>;
    qdrantRepository = new QdrantRepository({} as any) as jest.Mocked<QdrantRepository>;

    indexingController = new IndexingController(
      incrementalIndexer,
      fullIndexer,
      syncStateManager,
      emailRepository,
      qdrantRepository
    );

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(authenticateToken(JWT_SECRET));

    // Setup routes
    app.post('/api/indexing/full', indexingController.triggerFullIndexing.bind(indexingController));
    app.post('/api/indexing/incremental', indexingController.triggerIncrementalIndexing.bind(indexingController));
    app.post('/api/indexing/sync', indexingController.triggerSync.bind(indexingController));
    app.get('/api/indexing/status', indexingController.getIndexingStatus.bind(indexingController));
    app.get('/api/indexing/progress', indexingController.getIndexingProgress.bind(indexingController));
    app.post('/api/indexing/cancel', indexingController.cancelIndexing.bind(indexingController));
    app.get('/api/indexing/stats', indexingController.getIndexingStats.bind(indexingController));
    app.post('/api/indexing/reset', indexingController.resetIndexingState.bind(indexingController));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/indexing/full', () => {
    it('should trigger full indexing successfully', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      fullIndexer.processFullIndexing.mockResolvedValue(mockFullIndexingResult);

      const response = await request(app)
        .post('/api/indexing/full')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Full indexing started',
        userId: 'user-1',
        type: 'full',
        status: 'started'
      });

      expect(fullIndexer.processFullIndexing).toHaveBeenCalledWith(
        'user-1',
        expect.any(Function)
      );
    });

    it('should create sync state if it does not exist', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);
      syncStateManager.createSyncState.mockResolvedValue(mockSyncState);
      fullIndexer.processFullIndexing.mockResolvedValue(mockFullIndexingResult);

      await request(app)
        .post('/api/indexing/full')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(syncStateManager.createSyncState).toHaveBeenCalledWith('user-1');
    });

    it('should return 409 if indexing is already in progress', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);

      await request(app)
        .post('/api/indexing/full')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(409);
    });

    it('should allow force override when indexing is in progress', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);
      fullIndexer.processFullIndexing.mockResolvedValue(mockFullIndexingResult);

      await request(app)
        .post('/api/indexing/full')
        .send({ force: true })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(fullIndexer.processFullIndexing).toHaveBeenCalled();
    });
  });

  describe('POST /api/indexing/incremental', () => {
    it('should trigger incremental indexing successfully', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      incrementalIndexer.processIncrementalSync.mockResolvedValue(mockIncrementalResult);

      const response = await request(app)
        .post('/api/indexing/incremental')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Incremental indexing started',
        userId: 'user-1',
        type: 'incremental',
        status: 'started'
      });

      expect(incrementalIndexer.processIncrementalSync).toHaveBeenCalledWith('user-1');
    });

    it('should return 404 if sync state does not exist', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);

      await request(app)
        .post('/api/indexing/incremental')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });

    it('should return 409 if indexing is already in progress', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);

      await request(app)
        .post('/api/indexing/incremental')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(409);
    });
  });

  describe('POST /api/indexing/sync', () => {
    it('should trigger full sync for new user', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);
      syncStateManager.createSyncState.mockResolvedValue(mockSyncState);
      fullIndexer.processFullIndexing.mockResolvedValue(mockFullIndexingResult);

      const response = await request(app)
        .post('/api/indexing/sync')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.type).toBe('full');
      expect(syncStateManager.createSyncState).toHaveBeenCalledWith('user-1');
      expect(fullIndexer.processFullIndexing).toHaveBeenCalledWith('user-1');
    });

    it('should trigger incremental sync for existing user', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      incrementalIndexer.processIncrementalSync.mockResolvedValue(mockIncrementalResult);

      const response = await request(app)
        .post('/api/indexing/sync')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.type).toBe('incremental');
      expect(incrementalIndexer.processIncrementalSync).toHaveBeenCalledWith('user-1');
    });

    it('should respect explicit sync type', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      fullIndexer.processFullIndexing.mockResolvedValue(mockFullIndexingResult);

      await request(app)
        .post('/api/indexing/sync')
        .send({ type: 'full' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(fullIndexer.processFullIndexing).toHaveBeenCalledWith('user-1');
    });

    it('should return 400 for invalid sync type', async () => {
      await request(app)
        .post('/api/indexing/sync')
        .send({ type: 'invalid' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });
  });

  describe('GET /api/indexing/status', () => {
    it('should return indexing status successfully', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      emailRepository.getUserEmailCount.mockResolvedValue(100);
      qdrantRepository.getUserVectorCount.mockResolvedValue(80);

      const response = await request(app)
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        userId: 'user-1',
        syncState: {
          lastSyncAt: '2023-01-01T00:00:00.000Z',
          totalEmailsIndexed: 50,
          isInitialSyncComplete: true,
          currentSyncStatus: 'idle',
          lastError: undefined
        },
        statistics: {
          totalEmails: 100,
          vectorizedEmails: 80,
          indexingProgress: 80
        }
      });
    });

    it('should return 404 if sync state not found', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);

      await request(app)
        .get('/api/indexing/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('GET /api/indexing/progress', () => {
    it('should return same as status endpoint', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      emailRepository.getUserEmailCount.mockResolvedValue(100);
      qdrantRepository.getUserVectorCount.mockResolvedValue(80);

      const response = await request(app)
        .get('/api/indexing/progress')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.userId).toBe('user-1');
      expect(response.body.statistics.indexingProgress).toBe(80);
    });
  });

  describe('POST /api/indexing/cancel', () => {
    it('should cancel ongoing indexing', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);
      syncStateManager.updateSyncStatus.mockResolvedValue();

      const response = await request(app)
        .post('/api/indexing/cancel')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Indexing cancellation requested',
        userId: 'user-1',
        status: 'cancelling'
      });

      expect(syncStateManager.updateSyncStatus).toHaveBeenCalledWith('user-1', 'idle');
    });

    it('should return 400 if no indexing in progress', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);

      await request(app)
        .post('/api/indexing/cancel')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 404 if sync state not found', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);

      await request(app)
        .post('/api/indexing/cancel')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('GET /api/indexing/stats', () => {
    it('should return comprehensive indexing statistics', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      emailRepository.getUserEmailCount.mockResolvedValue(100);
      emailRepository.getUserEmailCountByImportance
        .mockResolvedValueOnce(30) // important
        .mockResolvedValueOnce(20); // unclassified
      qdrantRepository.getUserVectorCount.mockResolvedValue(80);

      const response = await request(app)
        .get('/api/indexing/stats')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        userId: 'user-1',
        syncState: {
          lastSyncAt: '2023-01-01T00:00:00.000Z',
          totalEmailsIndexed: 50,
          isInitialSyncComplete: true,
          currentSyncStatus: 'idle',
          lastError: undefined
        },
        emailStatistics: {
          total: 100,
          important: 30,
          notImportant: 50,
          unclassified: 20
        },
        indexingStatistics: {
          vectorizedEmails: 80,
          indexingProgress: 80,
          classificationProgress: 80
        },
        performance: {
          averageEmailsPerSync: expect.any(Number),
          lastSyncDuration: null
        }
      });
    });

    it('should return 404 if sync state not found', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);

      await request(app)
        .get('/api/indexing/stats')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('POST /api/indexing/reset', () => {
    it('should reset indexing state with confirmation', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      syncStateManager.updateSyncState.mockResolvedValue();

      const response = await request(app)
        .post('/api/indexing/reset')
        .send({ confirm: true })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Indexing state reset successfully',
        userId: 'user-1',
        status: 'reset'
      });

      expect(syncStateManager.updateSyncState).toHaveBeenCalledWith({
        ...mockSyncState,
        lastSyncAt: expect.any(Date),
        lastMessageId: undefined,
        totalEmailsIndexed: 0,
        isInitialSyncComplete: false,
        currentSyncStatus: 'idle',
        lastError: undefined
      });
    });

    it('should return 400 without confirmation', async () => {
      await request(app)
        .post('/api/indexing/reset')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 409 if indexing is in progress', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);

      await request(app)
        .post('/api/indexing/reset')
        .send({ confirm: true })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(409);
    });
  });

  describe('Authentication', () => {
    it('should return 401 without authentication token', async () => {
      await request(app)
        .get('/api/indexing/status')
        .expect(401);
    });

    it('should return 403 with invalid token', async () => {
      await request(app)
        .get('/api/indexing/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });
  });
});