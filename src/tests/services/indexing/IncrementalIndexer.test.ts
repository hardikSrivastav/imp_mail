import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { IncrementalIndexer } from '../../../services/indexing/IncrementalIndexer';
import { EmailFetcher } from '../../../services/email/EmailFetcher';
import { EmailParser } from '../../../services/email/EmailParser';
import { VectorEmbeddingService } from '../../../services/embedding/VectorEmbeddingService';
import { SyncStateManager } from '../../../services/sync/SyncStateManager';
import { runMigrations } from '../../../database/migrations';
import { SyncState, EmailVector } from '../../../types/models';

// Mock the dependencies
const mockEmailFetcher = {
  fetchEmailsSince: jest.fn(),
  fetchEmailsBatch: jest.fn(),
  fetchEmailList: jest.fn(),
  fetchEmailById: jest.fn(),
  fetchAllEmails: jest.fn(),
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

const mockSyncStateManager = {
  getSyncState: jest.fn(),
  createSyncState: jest.fn(),
  updateSyncState: jest.fn(),
  updateSyncStatus: jest.fn(),
  updateLastSync: jest.fn(),
  markInitialSyncComplete: jest.fn(),
  getUsersNeedingSync: jest.fn(),
  getUsersWithSyncErrors: jest.fn(),
  getSyncStatistics: jest.fn(),
  deleteSyncState: jest.fn()
} as any;

describe('IncrementalIndexer', () => {
  let db: Database;
  let incrementalIndexer: IncrementalIndexer;

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

    incrementalIndexer = new IncrementalIndexer(
      db,
      mockEmailFetcher,
      mockEmailParser,
      mockVectorService,
      mockSyncStateManager
    );
  });

  afterEach(async () => {
    await db.close();
  });

  describe('processIncrementalSync', () => {
    const mockSyncState: SyncState = {
      userId: 'test-user-1',
      lastSyncAt: new Date('2024-01-01T00:00:00Z'),
      lastMessageId: 'last-msg-123',
      totalEmailsIndexed: 10,
      isInitialSyncComplete: true,
      currentSyncStatus: 'idle',
      lastError: undefined
    };

    it('should process new emails successfully', async () => {
      // Setup mocks
      mockSyncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: undefined,
        resultSizeEstimate: 2
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      
      const mockRawEmails = [
        { 
          id: 'msg-1', 
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: 'Test 1',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '123',
          sizeEstimate: 1000
        },
        { 
          id: 'msg-2', 
          threadId: 'thread-2',
          labelIds: ['INBOX'],
          snippet: 'Test 2',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '124',
          sizeEstimate: 1000
        }
      ];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail1 = {
        messageId: 'msg-1',
        subject: 'Test Email 1',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content 1',
        htmlContent: '<p>Test content 1</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };
      
      const mockParsedEmail2 = {
        messageId: 'msg-2',
        subject: 'Test Email 2',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Test content 2',
        htmlContent: '<p>Test content 2</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-2',
          labels: ['INBOX']
        }
      };
      
      mockEmailParser.parseEmail
        .mockResolvedValueOnce(mockParsedEmail1)
        .mockResolvedValueOnce(mockParsedEmail2);

      const mockEmailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Execute
      const result = await incrementalIndexer.processIncrementalSync('test-user-1');

      // Verify
      expect(result.emailsProcessed).toBe(2);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(mockSyncStateManager.updateSyncStatus).toHaveBeenCalledWith('test-user-1', 'syncing');
      expect(mockSyncStateManager.updateSyncStatus).toHaveBeenCalledWith('test-user-1', 'idle');
      expect(mockSyncStateManager.updateLastSync).toHaveBeenCalledWith('test-user-1', 'msg-2', 2);

      // Check emails were stored in database
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(2);
    });

    it('should skip duplicate emails', async () => {
      // Setup existing email in database
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

      mockSyncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: undefined,
        resultSizeEstimate: 2
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      
      const mockRawEmails = [
        { 
          id: 'msg-1', 
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: 'Duplicate',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '123',
          sizeEstimate: 1000
        },
        { 
          id: 'msg-2', 
          threadId: 'thread-2',
          labelIds: ['INBOX'],
          snippet: 'New Email',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '124',
          sizeEstimate: 1000
        }
      ];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      const mockParsedEmail = {
        messageId: 'msg-2',
        subject: 'New Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'New content',
        htmlContent: '<p>New content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-2',
          labels: ['INBOX']
        }
      };
      mockEmailParser.parseEmail.mockResolvedValue(mockParsedEmail);

      const mockEmailVector: EmailVector = {
        id: 'vector-2',
        emailId: 'email-2',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Execute
      const result = await incrementalIndexer.processIncrementalSync('test-user-1');

      // Verify
      expect(result.emailsProcessed).toBe(1);
      expect(result.emailsSkipped).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Check only one new email was added
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(2); // 1 existing + 1 new
    });

    it('should handle email processing errors gracefully', async () => {
      mockSyncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }, { id: 'msg-2' }],
        nextPageToken: undefined,
        resultSizeEstimate: 2
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      
      const mockRawEmails = [
        { 
          id: 'msg-1', 
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          snippet: 'Good Email',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '123',
          sizeEstimate: 1000
        },
        { 
          id: 'msg-2', 
          threadId: 'thread-2',
          labelIds: ['INBOX'],
          snippet: 'Bad Email',
          payload: { headers: [] },
          internalDate: '1640995200000',
          historyId: '124',
          sizeEstimate: 1000
        }
      ];
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue(mockRawEmails);

      // First email succeeds
      const mockParsedEmail = {
        messageId: 'msg-1',
        subject: 'Good Email',
        sender: 'sender@example.com',
        recipients: ['recipient@example.com'],
        content: 'Good content',
        htmlContent: '<p>Good content</p>',
        receivedAt: new Date('2024-01-02T00:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread-1',
          labels: ['INBOX']
        }
      };

      // Second email fails
      mockEmailParser.parseEmail
        .mockResolvedValueOnce(mockParsedEmail)
        .mockRejectedValueOnce(new Error('Parsing failed'));

      const mockEmailVector: EmailVector = {
        id: 'vector-1',
        emailId: 'email-1',
        userId: 'test-user-1',
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: 'text-embedding-3-small',
        createdAt: new Date()
      };
      mockVectorService.processEmailEmbedding.mockResolvedValue(mockEmailVector);

      // Execute
      const result = await incrementalIndexer.processIncrementalSync('test-user-1');

      // Verify
      expect(result.emailsProcessed).toBe(1);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to process email msg-2');

      // Sync should still complete successfully
      expect(mockSyncStateManager.updateSyncStatus).toHaveBeenCalledWith('test-user-1', 'idle');
    });

    it('should handle sync state not found', async () => {
      mockSyncStateManager.getSyncState.mockResolvedValue(null);

      const result = await incrementalIndexer.processIncrementalSync('test-user-1');

      expect(result.emailsProcessed).toBe(0);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No sync state found for user test-user-1');

      expect(mockSyncStateManager.updateSyncStatus).toHaveBeenCalledWith(
        'test-user-1', 
        'error', 
        expect.stringContaining('No sync state found')
      );
    });

    it('should continue processing even if embedding generation fails', async () => {
      mockSyncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      
      const mockEmailListResult = {
        messages: [{ id: 'msg-1' }],
        nextPageToken: undefined,
        resultSizeEstimate: 1
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      
      const mockRawEmails = [{ 
        id: 'msg-1', 
        threadId: 'thread-1',
        labelIds: ['INBOX'],
        snippet: 'Test Email',
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

      // Execute
      const result = await incrementalIndexer.processIncrementalSync('test-user-1');

      // Verify email was still processed and stored
      expect(result.emailsProcessed).toBe(1);
      expect(result.emailsSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Check email was stored in database
      const storedEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(storedEmails).toHaveLength(1);
      expect(storedEmails[0].vector_id).toBeNull(); // No vector ID since embedding failed
    });
  });

  describe('processMultipleUsers', () => {
    it('should process multiple users successfully', async () => {
      // Add second user
      await db.run(
        `INSERT INTO users (id, email, created_at, last_login_at) 
         VALUES ('test-user-2', 'test2@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
      );

      const mockSyncState: SyncState = {
        userId: 'test-user-1',
        lastSyncAt: new Date('2024-01-01T00:00:00Z'),
        lastMessageId: 'last-msg-123',
        totalEmailsIndexed: 10,
        isInitialSyncComplete: true,
        currentSyncStatus: 'idle',
        lastError: undefined
      };

      mockSyncStateManager.getSyncState.mockResolvedValue(mockSyncState);
      const mockEmailListResult = {
        messages: [],
        nextPageToken: undefined,
        resultSizeEstimate: 0
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue([]);

      const result = await incrementalIndexer.processMultipleUsers(['test-user-1', 'test-user-2']);

      expect(result.totalProcessed).toBe(0);
      expect(result.totalSkipped).toBe(0);
      expect(result.totalErrors).toBe(0);
      expect(Object.keys(result.userResults)).toHaveLength(2);
      expect(result.userResults['test-user-1']).toBeDefined();
      expect(result.userResults['test-user-2']).toBeDefined();
    });

    it('should handle individual user failures', async () => {
      mockSyncStateManager.getSyncState
        .mockResolvedValueOnce(null) // First user fails
        .mockResolvedValueOnce({     // Second user succeeds
          userId: 'test-user-2',
          lastSyncAt: new Date('2024-01-01T00:00:00Z'),
          lastMessageId: 'last-msg-123',
          totalEmailsIndexed: 10,
          isInitialSyncComplete: true,
          currentSyncStatus: 'idle',
          lastError: undefined
        });

      const mockEmailListResult = {
        messages: [],
        nextPageToken: undefined,
        resultSizeEstimate: 0
      };
      mockEmailFetcher.fetchEmailsSince.mockResolvedValue(mockEmailListResult);
      mockEmailFetcher.fetchEmailsBatch.mockResolvedValue([]);

      const result = await incrementalIndexer.processMultipleUsers(['test-user-1', 'test-user-2']);

      expect(result.totalErrors).toBe(1);
      expect(result.userResults['test-user-1'].errors).toHaveLength(1);
      expect(result.userResults['test-user-2'].errors).toHaveLength(0);
    });
  });

  describe('getIndexingStats', () => {
    it('should return indexing statistics', async () => {
      // Add test emails
      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, 
          labels, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'email-1', 'test-user-1', 'msg-1', 'Email 1',
          'sender@example.com', '["recipient@example.com"]', 'Content 1',
          '2024-01-01T00:00:00Z', new Date().toISOString(), 'unclassified', 0, 0, 
          '[]', 'vector-1'
        ]
      );

      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, 
          labels, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'email-2', 'test-user-1', 'msg-2', 'Email 2',
          'sender@example.com', '["recipient@example.com"]', 'Content 2',
          '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'unclassified', 0, 0, 
          '[]', null // No vector
        ]
      );

      const stats = await incrementalIndexer.getIndexingStats();

      expect(stats.totalEmails).toBe(2);
      expect(stats.emailsWithEmbeddings).toBe(1);
      expect(stats.recentlyIndexed).toBe(1); // One was indexed recently
    });
  });

  describe('cleanupFailedIndexing', () => {
    it('should clean up emails without embeddings older than 1 hour', async () => {
      // Use SQLite datetime format for consistency
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const recentTime = new Date().toISOString(); // Now

      // Add old email without vector (should be cleaned)
      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, 
          labels, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'old-email', 'test-user-1', 'msg-old', 'Old Email',
          'sender@example.com', '["recipient@example.com"]', 'Old content',
          oldTime, oldTime, 'unclassified', 0, 0, '[]', null
        ]
      );

      // Add recent email without vector (should not be cleaned)
      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, 
          labels, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'recent-email', 'test-user-1', 'msg-recent', 'Recent Email',
          'sender@example.com', '["recipient@example.com"]', 'Recent content',
          recentTime, recentTime, 'unclassified', 0, 0, '[]', null
        ]
      );

      // Add email with vector (should not be cleaned even if old)
      await db.run(
        `INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, user_labeled, has_attachments, 
          labels, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'email-with-vector', 'test-user-1', 'msg-vector', 'Email with Vector',
          'sender@example.com', '["recipient@example.com"]', 'Vector content',
          oldTime, oldTime, 'unclassified', 0, 0, '[]', 'vector-123'
        ]
      );

      // Verify initial state
      const initialEmails = await db.all('SELECT * FROM emails WHERE user_id = ?', ['test-user-1']);
      expect(initialEmails).toHaveLength(3);

      await incrementalIndexer.cleanupFailedIndexing('test-user-1');

      const remainingEmails = await db.all('SELECT * FROM emails WHERE user_id = ? ORDER BY id', ['test-user-1']);
      
      // Should have 2 emails: one with vector (not cleaned) and one recent without vector (not cleaned)
      // The old email without vector should be cleaned up
      expect(remainingEmails).toHaveLength(2);
      
      const remainingIds = remainingEmails.map(e => e.id).sort();
      expect(remainingIds).toEqual(['email-with-vector', 'recent-email']);
    });
  });
});