import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { EmailController } from '../../controllers/EmailController';
import { EmailRepository } from '../../repositories/EmailRepository';
import { EmailSearchService } from '../../services/search/EmailSearchService';
import { SyncStateManager } from '../../services/sync/SyncStateManager';
import { IncrementalIndexer } from '../../services/indexing/IncrementalIndexer';
import { FullIndexer } from '../../services/indexing/FullIndexer';
import { authenticateToken } from '../../middleware/auth';
import { Email, SyncState } from '../../types/models';

// Mock dependencies
jest.mock('../../repositories/EmailRepository');
jest.mock('../../services/search/EmailSearchService');
jest.mock('../../services/sync/SyncStateManager');
jest.mock('../../services/indexing/IncrementalIndexer');
jest.mock('../../services/indexing/FullIndexer');

describe('EmailController', () => {
  let app: express.Application;
  let emailRepository: jest.Mocked<EmailRepository>;
  let emailSearchService: jest.Mocked<EmailSearchService>;
  let syncStateManager: jest.Mocked<SyncStateManager>;
  let incrementalIndexer: jest.Mocked<IncrementalIndexer>;
  let fullIndexer: jest.Mocked<FullIndexer>;
  let emailController: EmailController;

  const JWT_SECRET = 'test-secret';
  const mockUser = { id: 'user-1', email: 'test@ashoka.edu.in' };
  const mockToken = jwt.sign(mockUser, JWT_SECRET);

  const mockEmail: Email = {
    id: 'email-1',
    userId: 'user-1',
    messageId: 'msg-1',
    subject: 'Test Email',
    sender: 'sender@example.com',
    recipients: ['test@ashoka.edu.in'],
    content: 'Test email content',
    receivedAt: new Date('2023-01-01'),
    indexedAt: new Date('2023-01-01'),
    importance: 'unclassified',
    userLabeled: false,
    metadata: {
      hasAttachments: false,
      labels: []
    }
  };

  // Expected JSON serialized version for API responses
  const mockEmailJson = {
    ...mockEmail,
    receivedAt: '2023-01-01T00:00:00.000Z',
    indexedAt: '2023-01-01T00:00:00.000Z'
  };

  const mockSyncState: SyncState = {
    userId: 'user-1',
    lastSyncAt: new Date('2023-01-01'),
    totalEmailsIndexed: 10,
    isInitialSyncComplete: true,
    currentSyncStatus: 'idle'
  };

  beforeEach(() => {
    // Create mock instances
    emailRepository = new EmailRepository() as jest.Mocked<EmailRepository>;
    emailSearchService = new EmailSearchService(
      emailRepository,
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<EmailSearchService>;
    syncStateManager = new SyncStateManager({} as any) as jest.Mocked<SyncStateManager>;
    incrementalIndexer = new IncrementalIndexer(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<IncrementalIndexer>;
    fullIndexer = new FullIndexer(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    ) as jest.Mocked<FullIndexer>;

    emailController = new EmailController(
      emailRepository,
      emailSearchService,
      syncStateManager,
      incrementalIndexer,
      fullIndexer
    );

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(authenticateToken(JWT_SECRET));

    // Setup routes
    app.get('/api/emails', emailController.getEmails.bind(emailController));
    app.get('/api/emails/search', emailController.searchEmails.bind(emailController));
    app.get('/api/emails/sync/status', emailController.getSyncStatus.bind(emailController));
    app.get('/api/emails/:id', emailController.getEmailById.bind(emailController));
    app.get('/api/emails/:id/similar', emailController.getSimilarEmails.bind(emailController));
    app.put('/api/emails/:id/importance', emailController.updateEmailImportance.bind(emailController));
    app.post('/api/emails/sync', emailController.triggerSync.bind(emailController));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/emails', () => {
    it('should return emails for authenticated user', async () => {
      const mockEmails = [mockEmail];
      emailSearchService.getFilteredEmails.mockResolvedValue(mockEmails);

      const response = await request(app)
        .get('/api/emails')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        emails: [mockEmailJson],
        pagination: {
          limit: 50,
          offset: 0,
          total: 1
        }
      });

      expect(emailSearchService.getFilteredEmails).toHaveBeenCalledWith('user-1', {
        importance: undefined,
        sender: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        limit: 50,
        offset: 0
      });
    });

    it('should handle query parameters correctly', async () => {
      emailSearchService.getFilteredEmails.mockResolvedValue([]);

      await request(app)
        .get('/api/emails')
        .query({
          importance: 'important',
          sender: 'test@example.com',
          dateFrom: '2023-01-01T00:00:00.000Z',
          dateTo: '2023-12-31T23:59:59.999Z',
          limit: '10',
          offset: '5'
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(emailSearchService.getFilteredEmails).toHaveBeenCalledWith('user-1', {
        importance: 'important',
        sender: 'test@example.com',
        dateFrom: new Date('2023-01-01T00:00:00.000Z'),
        dateTo: new Date('2023-12-31T23:59:59.999Z'),
        limit: 10,
        offset: 5
      });
    });

    it('should return 400 for invalid date parameters', async () => {
      await request(app)
        .get('/api/emails')
        .query({ dateFrom: 'invalid-date' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 400 for invalid limit', async () => {
      await request(app)
        .get('/api/emails')
        .query({ limit: '200' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 401 without authentication', async () => {
      await request(app)
        .get('/api/emails')
        .expect(401);
    });
  });

  describe('GET /api/emails/search', () => {
    it('should search emails successfully', async () => {
      const mockResults = [{ email: mockEmail, source: 'text' as const }];
      const expectedResults = [{ email: mockEmailJson, source: 'text' as const }];
      emailSearchService.search.mockResolvedValue(mockResults);

      const response = await request(app)
        .get('/api/emails/search')
        .query({ search: 'test query' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        results: expectedResults,
        query: 'test query',
        searchType: 'text',
        pagination: {
          limit: 20,
          offset: 0,
          total: 1
        }
      });
    });

    it('should return 400 without search parameter', async () => {
      await request(app)
        .get('/api/emails/search')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should handle semantic search parameters', async () => {
      emailSearchService.search.mockResolvedValue([]);

      await request(app)
        .get('/api/emails/search')
        .query({
          search: 'test',
          useSemanticSearch: 'true',
          combineResults: 'false'
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(emailSearchService.search).toHaveBeenCalledWith('user-1', 'test', {
        importance: undefined,
        sender: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        limit: 20,
        offset: 0,
        useSemanticSearch: true,
        combineResults: false,
        semanticThreshold: 0.7
      });
    });
  });

  describe('GET /api/emails/:id', () => {
    it('should return email by ID for owner', async () => {
      emailRepository.getById.mockResolvedValue(mockEmail);

      const response = await request(app)
        .get('/api/emails/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({ email: mockEmailJson });
    });

    it('should return 404 for non-existent email', async () => {
      emailRepository.getById.mockResolvedValue(null);

      await request(app)
        .get('/api/emails/non-existent')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });

    it('should return 403 for email owned by different user', async () => {
      const otherUserEmail = { ...mockEmail, userId: 'other-user' };
      emailRepository.getById.mockResolvedValue(otherUserEmail);

      await request(app)
        .get('/api/emails/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(403);
    });
  });

  describe('PUT /api/emails/:id/importance', () => {
    it('should update email importance successfully', async () => {
      const updatedEmail = { ...mockEmail, importance: 'important' as const };
      const updatedEmailJson = { ...mockEmailJson, importance: 'important' as const };
      emailRepository.getById
        .mockResolvedValueOnce(mockEmail)
        .mockResolvedValueOnce(updatedEmail);
      emailRepository.updateImportance.mockResolvedValue();
      emailSearchService.invalidateUserSearchCache.mockResolvedValue();

      const response = await request(app)
        .put('/api/emails/email-1/importance')
        .send({ importance: 'important' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.message).toBe('Email importance updated successfully');
      expect(response.body.email).toEqual(updatedEmailJson);
      expect(emailRepository.updateImportance).toHaveBeenCalledWith(
        'email-1',
        'important',
        undefined,
        true
      );
    });

    it('should return 400 for invalid importance value', async () => {
      await request(app)
        .put('/api/emails/email-1/importance')
        .send({ importance: 'invalid' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent email', async () => {
      emailRepository.getById.mockResolvedValue(null);

      await request(app)
        .put('/api/emails/non-existent/importance')
        .send({ importance: 'important' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('POST /api/emails/sync', () => {
    it('should trigger incremental sync successfully', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      incrementalIndexer.processIncrementalSync.mockResolvedValue({
        emailsProcessed: 5,
        emailsSkipped: 0,
        errors: []
      });

      const response = await request(app)
        .post('/api/emails/sync')
        .send({ type: 'incremental' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'incremental synchronization started',
        syncType: 'incremental',
        status: 'started'
      });
    });

    it('should trigger full sync successfully', async () => {
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      fullIndexer.processFullIndexing.mockResolvedValue({
        totalEmails: 100,
        emailsProcessed: 100,
        emailsSkipped: 0,
        errors: [],
        startTime: new Date(),
        endTime: new Date(),
        isComplete: true
      });

      await request(app)
        .post('/api/emails/sync')
        .send({ type: 'full' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);
    });

    it('should return 409 if sync already in progress', async () => {
      const syncingState = { ...mockSyncState, currentSyncStatus: 'syncing' as const };
      syncStateManager.getSyncState.mockResolvedValue(syncingState);

      await request(app)
        .post('/api/emails/sync')
        .send({ type: 'incremental' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(409);
    });

    it('should return 400 for invalid sync type', async () => {
      await request(app)
        .post('/api/emails/sync')
        .send({ type: 'invalid' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });
  });

  describe('GET /api/emails/sync/status', () => {
    it('should return sync status successfully', async () => {
      const mockStats = {
        totalEmails: 100,
        importantEmails: 30,
        unclassifiedEmails: 50,
        vectorizedEmails: 90
      };
      
      syncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      emailSearchService.getSearchStats.mockResolvedValue(mockStats);

      const response = await request(app)
        .get('/api/emails/sync/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        syncState: {
          userId: mockSyncState.userId,
          lastSyncAt: '2023-01-01T00:00:00.000Z',
          totalEmailsIndexed: mockSyncState.totalEmailsIndexed,
          isInitialSyncComplete: mockSyncState.isInitialSyncComplete,
          currentSyncStatus: mockSyncState.currentSyncStatus,
          lastError: mockSyncState.lastError
        },
        statistics: mockStats
      });
    });

    it('should return 404 if sync state not found', async () => {
      syncStateManager.getSyncState.mockResolvedValue(null);

      await request(app)
        .get('/api/emails/sync/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('GET /api/emails/:id/similar', () => {
    it('should return similar emails successfully', async () => {
      const mockSimilarEmails = [
        { email: mockEmail, score: 0.9, source: 'semantic' as const }
      ];
      const expectedSimilarEmails = [
        { email: mockEmailJson, score: 0.9, source: 'semantic' as const }
      ];
      emailSearchService.findSimilarEmails.mockResolvedValue(mockSimilarEmails);

      const response = await request(app)
        .get('/api/emails/email-1/similar')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body).toEqual({
        emailId: 'email-1',
        similarEmails: expectedSimilarEmails,
        parameters: {
          limit: 5,
          threshold: 0.8
        }
      });
    });

    it('should handle custom parameters', async () => {
      emailSearchService.findSimilarEmails.mockResolvedValue([]);

      await request(app)
        .get('/api/emails/email-1/similar')
        .query({ limit: '10', threshold: '0.9' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(emailSearchService.findSimilarEmails).toHaveBeenCalledWith(
        'user-1',
        'email-1',
        10,
        0.9
      );
    });

    it('should return 400 for invalid parameters', async () => {
      await request(app)
        .get('/api/emails/email-1/similar')
        .query({ limit: '25' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should handle email not found error', async () => {
      emailSearchService.findSimilarEmails.mockRejectedValue(
        new Error('Email not found or access denied')
      );

      await request(app)
        .get('/api/emails/non-existent/similar')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });
});