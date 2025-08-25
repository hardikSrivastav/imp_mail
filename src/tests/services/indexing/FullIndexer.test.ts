import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { FullIndexer, FullIndexingProgress } from '../../../services/indexing/FullIndexer';
import { SyncStateManager } from '../../../services/sync/SyncStateManager';
import { runMigrations } from '../../../database/migrations';
import { EmailVector } from '../../../types/models';

// Mock the dependencies
const mockEmailFetcher = {
  fetchAllEmails: jest.fn(),
  fetchEmailsBatch: jest.fn(),
  fetchEmailsSince: jest.fn(),
  fetchEmailList: jest.fn(),
  fetchEmailById: jest.fn(),
  getProfile: jest.fn()
} as any;

const mockEmailParser = {
  parseEmail: jest.fn(),
  toEmailModel: jest.fn(),
  validateParsedEmail: jest.fn(),
  extractFeatures: jest.fn()
} as any;

const mockVectorService = {
  processEmailEmbedding: jest.fn(),
  initializeCollection: jest.fn(),
  generateEmbedding: jest.fn(),
  storeEmbedding: jest.fn(),
  findSimilarEmails: jest.fn(),
  deleteEmbedding: jest.fn(),
  deleteUserEmbeddings: jest.fn(),
  getEmbeddingStats: jest.fn(),
  healthCheck: jest.fn()
} as any;

describe('FullIndexer', () => {
  let db: Database;
  let syncStateManager: SyncStateManager;
  let fullIndexer: FullIndexer;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Run migrations to set up schema
    await runMigrations(db);

    // Create test user
    await db.run(
      `INSERT INTO users (id, email, created_at, last_login_at) 
       VALUES ('test-user-1', 'test@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
    );

    // Reset all mocks
    jest.clearAllMocks();

    syncStateManager = new SyncStateManager(db);
    fullIndexer = new FullIndexer(
      db,
      mockEmailFetcher,
      mockEmailParser,
      mockVectorService,
      syncStateManager
    );
  });

  afterEach(async () => {
    await db.close();
  });

  describe('processFullIndexing', () => {
    it('should process single email successfully', async () => {
      // Setup mocks for successful indexing
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchAllEmails.mockResolvedValue(mockEmailListResult);

      const mockRawEmails = [{
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Test email 1',
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: '123',
        sizeEstimate: 1000
      }];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail = {
        messageId: 'msg-1',
        subject: 'Test Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };
      mockEmailParser.parseEmail.mockResolvedValue(mockParsedEmail);

      const mockEmailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Execute full indexing
      const result = await fullIndexer.processFullIndexing('test-user-1');

      // Verify result
      expect(result.isComplete).toBe(true);
      expect(result.totalEmails).toBe(1);
      expect(result.emailsProcessed).toBe(1);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify sync state was updated
      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState?.isInitialSyncComplete).toBe(true);
      expect(syncState?.currentSyncStatus).toBe('idle');

      // Verify email was stored in database
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(1);
    });

    it('should handle progress tracking', async () => {
      // Setup mocks
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchAllEmails.mockResolvedValue(mockEmailListResult);

      const mockRawEmails = [{
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Test email',
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: '123',
        sizeEstimate: 1000
      }];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail = {
        messageId: 'msg-1',
        subject: 'Test Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };
      mockEmailParser.parseEmail.mockResolvedValue(mockParsedEmail);

      const mockEmailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Track progress updates
      const progressUpdates: FullIndexingProgress[] = [];
      const progressCallback = (progress: FullIndexingProgress) => {
        progressUpdates.push(progress);
      };

      // Execute full indexing
      const result = await fullIndexer.processFullIndexing('test-user-1', progressCallback);

      // Verify progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0].phase).toBe('initializing');
      expect(progressUpdates[progressUpdates.length - 1].phase).toBe('completed');
      expect(result.isComplete).toBe(true);
    });

    it('should handle duplicate emails correctly', async () => {
      // Pre-populate database with existing email
      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'existing-email-1', 'test-user-1', 'msg-1', 'Existing Email',
          'sender@example.com', '["recipient@example.com"]', 'Existing content',
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'unclassified', 0, 0, '[]'
        ]
      );

      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }], // Duplicate
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchAllEmails.mockResolvedValue(mockEmailListResult);

      const mockRawEmails = [{
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Duplicate email',
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: '123',
        sizeEstimate: 1000
      }];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      // Execute full indexing
      const result = await fullIndexer.processFullIndexing('test-user-1');

      // Verify result
      expect(result.isComplete).toBe(true);
      expect(result.emailsProcessed).toBe(0); // No new emails processed
      expect(result.emailsSkipped).toBe(1);   // Duplicate skipped
      expect(result.errors).toHaveLength(0);

      // Verify total emails in database (only the existing one)
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(1);
    });

    it('should continue processing even if embedding generation fails', async () => {
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchAllEmails.mockResolvedValue(mockEmailListResult);

      const mockRawEmails = [{
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Test email',
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: '123',
        sizeEstimate: 1000
      }];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail = {
        messageId: 'msg-1',
        subject: 'Test Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };
      mockEmailParser.parseEmail.mockResolvedValue(mockParsedEmail);

      // Embedding generation fails
      mockVectorService.processEmailEmbedding.mockRejectedValue(new Error('Embedding failed'));

      // Execute full indexing
      const result = await fullIndexer.processFullIndexing('test-user-1');

      // Verify email was still processed and stored
      expect(result.isComplete).toBe(true);
      expect(result.emailsProcessed).toBe(1);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0); // Embedding errors don't count as processing errors

      // Check email was stored in database
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(1);
      expect(storedEmails[0].vector_id).toBeNull(); // No vector ID since embedding failed
    });
  });

  describe('getFullIndexingStats', () => {
    it('should return correct indexing statistics', async () => {
      // Create sync states for multiple users
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.markInitialSyncComplete('test-user-1');
      await syncStateManager.updateLastSync('test-user-1', 'msg-1', 50);

      await db.run(
        `INSERT INTO users (id, email, created_at, last_login_at) 
         VALUES ('test-user-2', 'test2@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
      );
      await syncStateManager.createSyncState('test-user-2');
      await syncStateManager.updateSyncStatus('test-user-2', 'syncing');
      await syncStateManager.updateLastSync('test-user-2', 'msg-2', 25);

      const stats = await fullIndexer.getFullIndexingStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.usersWithCompletedIndexing).toBe(1);
      expect(stats.usersCurrentlyIndexing).toBe(1);
      expect(stats.averageEmailsPerUser).toBe(38); // (50 + 25) / 2 = 37.5, rounded to 38
    });
  });

  describe('resumeFullIndexing', () => {
    it('should resume incomplete indexing', async () => {
      // Create incomplete sync state
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.updateSyncStatus('test-user-1', 'idle');

      // Setup mocks
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchAllEmails.mockResolvedValue(mockEmailListResult);

      const mockRawEmails = [{
        id: 'msg-1',
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Test email',
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: '123',
        sizeEstimate: 1000
      }];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail = {
        messageId: 'msg-1',
        subject: 'Test Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };
      mockEmailParser.parseEmail.mockResolvedValue(mockParsedEmail);

      const mockEmailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Resume indexing
      const result = await fullIndexer.resumeFullIndexing('test-user-1');

      expect(result.isComplete).toBe(true);
      expect(result.emailsProcessed).toBe(1);
    });

    it('should throw error if no incomplete indexing found', async () => {
      // Create completed sync state
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.markInitialSyncComplete('test-user-1');

      await expect(
        fullIndexer.resumeFullIndexing('test-user-1')
      ).rejects.toThrow('No incomplete indexing found for user test-user-1');
    });
  });

  describe('cancelFullIndexing', () => {
    it('should cancel ongoing indexing', async () => {
      // Create syncing state
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.updateSyncStatus('test-user-1', 'syncing');

      await fullIndexer.cancelFullIndexing('test-user-1');

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState?.currentSyncStatus).toBe('idle');
    });
  });
});