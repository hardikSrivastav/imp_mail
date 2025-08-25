import { FilteringPipeline } from '../../../services/ml/FilteringPipeline';
import { EmailClassifier } from '../../../services/ml/EmailClassifier';
import { UserExpectationsManager } from '../../../services/ml/UserExpectationsManager';
import { Email, UserExpectations } from '../../../types/models';
import { initializeDatabase, closeDatabase } from '../../../config/database';
import { v4 as uuidv4 } from 'uuid';

// Mock the services
jest.mock('../../../services/ml/EmailClassifier');
jest.mock('../../../services/ml/UserExpectationsManager');

describe('FilteringPipeline', () => {
  let pipeline: FilteringPipeline;
  let mockClassifier: jest.Mocked<EmailClassifier>;
  let mockExpectationsManager: jest.Mocked<UserExpectationsManager>;
  let testUserId: string;
  let testExpectations: UserExpectations;

  beforeAll(async () => {
    // Use in-memory database for testing
    process.env.DATABASE_URL = 'sqlite::memory:';
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create pipeline instance
    pipeline = new FilteringPipeline();

    // Get mocked services
    mockClassifier = (pipeline as any).classifier;
    mockExpectationsManager = (pipeline as any).expectationsManager;

    // Create test data
    testUserId = uuidv4();
    
    testExpectations = {
      id: uuidv4(),
      userId: testUserId,
      title: 'Academic Work',
      description: 'Emails related to coursework, research, and academic deadlines are important',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      examples: {
        important: ['Project deadlines', 'Research updates'],
        notImportant: ['Social events', 'Newsletter']
      }
    };

    // Create test user in database
    const db = await import('../../../config/database').then(m => m.getDatabase());
    await db.run(`
      INSERT INTO users (id, email, created_at, last_login_at, auto_classify, confidence_threshold)
      VALUES (?, ?, ?, ?, 1, 0.7)
    `, [testUserId, `test-${testUserId}@ashoka.edu.in`, new Date().toISOString(), new Date().toISOString()]);

    // Mock classifier methods
    mockClassifier.shouldFlagForReview = jest.fn().mockImplementation((result) => {
      return result.confidence < 0.7 || result.method === 'fallback';
    });
  });

  describe('processNewEmails', () => {
    it('should process unclassified emails successfully', async () => {
      // Setup test emails in database
      const testEmails = await createTestEmails(testUserId, 3, 'unclassified');
      
      // Mock expectations manager
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      // Mock classifier results
      mockClassifier.classifyEmailsBatch.mockResolvedValue([
        {
          emailId: testEmails[0].id,
          importance: 'important',
          confidence: 0.9,
          reasoning: 'Academic email',
          classifiedAt: new Date(),
          method: 'openai'
        },
        {
          emailId: testEmails[1].id,
          importance: 'not_important',
          confidence: 0.8,
          reasoning: 'Social event',
          classifiedAt: new Date(),
          method: 'openai'
        },
        {
          emailId: testEmails[2].id,
          importance: 'important',
          confidence: 0.6,
          reasoning: 'Low confidence classification',
          classifiedAt: new Date(),
          method: 'openai'
        }
      ]);

      const stats = await pipeline.processNewEmails(testUserId);

      expect(stats.totalProcessed).toBe(3);
      expect(stats.importantCount).toBe(2);
      expect(stats.notImportantCount).toBe(1);
      expect(stats.flaggedForReview).toBe(1); // One email with confidence < 0.7
      expect(stats.averageConfidence).toBe(0.77); // (0.9 + 0.8 + 0.6) / 3
      expect(stats.processingTimeMs).toBeGreaterThan(0);

      expect(mockExpectationsManager.getActiveExpectations).toHaveBeenCalledWith(testUserId);
      expect(mockClassifier.classifyEmailsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: testEmails[0].id }),
          expect.objectContaining({ id: testEmails[1].id }),
          expect.objectContaining({ id: testEmails[2].id })
        ]),
        testUserId,
        testExpectations
      );
    });

    it('should return empty stats when no expectations found', async () => {
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(null);

      const stats = await pipeline.processNewEmails(testUserId);

      expect(stats.totalProcessed).toBe(0);
      expect(stats.importantCount).toBe(0);
      expect(stats.notImportantCount).toBe(0);
      expect(stats.flaggedForReview).toBe(0);
      expect(mockClassifier.classifyEmailsBatch).not.toHaveBeenCalled();
    });

    it('should return empty stats when no unclassified emails found', async () => {
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);

      const stats = await pipeline.processNewEmails(testUserId);

      expect(stats.totalProcessed).toBe(0);
      expect(stats.importantCount).toBe(0);
      expect(stats.notImportantCount).toBe(0);
      expect(stats.flaggedForReview).toBe(0);
      expect(mockClassifier.classifyEmailsBatch).not.toHaveBeenCalled();
    });

    it('should process emails in batches', async () => {
      // Create more emails than batch size
      const testEmails = await createTestEmails(testUserId, 15, 'unclassified');
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      // Mock classifier to return results for each batch
      mockClassifier.classifyEmailsBatch.mockImplementation((emails) => {
        return Promise.resolve(emails.map(email => ({
          emailId: email.id,
          importance: 'important' as const,
          confidence: 0.8,
          reasoning: 'Test classification',
          classifiedAt: new Date(),
          method: 'openai' as const
        })));
      });

      const stats = await pipeline.processNewEmails(testUserId, { batchSize: 5 });

      expect(stats.totalProcessed).toBe(15);
      expect(mockClassifier.classifyEmailsBatch).toHaveBeenCalledTimes(3); // 15 emails / 5 batch size = 3 batches
    });

    it('should skip already classified emails by default', async () => {
      // Create mix of classified and unclassified emails
      await createTestEmails(testUserId, 2, 'important');
      const unclassifiedEmails = await createTestEmails(testUserId, 2, 'unclassified');
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      mockClassifier.classifyEmailsBatch.mockImplementation((emails) => {
        return Promise.resolve(emails.map(email => ({
          emailId: email.id,
          importance: 'important' as const,
          confidence: 0.8,
          reasoning: 'Test classification',
          classifiedAt: new Date(),
          method: 'openai' as const
        })));
      });

      const stats = await pipeline.processNewEmails(testUserId);

      expect(stats.totalProcessed).toBe(2); // Only unclassified emails
      expect(mockClassifier.classifyEmailsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: unclassifiedEmails[0].id }),
          expect.objectContaining({ id: unclassifiedEmails[1].id })
        ]),
        testUserId,
        testExpectations
      );
    });

    it('should process all emails when skipAlreadyClassified is false', async () => {
      // Create mix of classified and unclassified emails
      await createTestEmails(testUserId, 2, 'important');
      await createTestEmails(testUserId, 2, 'unclassified');
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      mockClassifier.classifyEmailsBatch.mockImplementation((emails) => {
        return Promise.resolve(emails.map(email => ({
          emailId: email.id,
          importance: 'important' as const,
          confidence: 0.8,
          reasoning: 'Test classification',
          classifiedAt: new Date(),
          method: 'openai' as const
        })));
      });

      const stats = await pipeline.processNewEmails(testUserId, { skipAlreadyClassified: false });

      expect(stats.totalProcessed).toBe(4); // All emails
    });
  });

  describe('processSpecificEmails', () => {
    it('should process specified emails', async () => {
      const testEmails = await createTestEmails(testUserId, 3, 'unclassified');
      const emailIds = [testEmails[0].id, testEmails[2].id]; // Process only 2 out of 3
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      mockClassifier.classifyEmailsBatch.mockResolvedValue([
        {
          emailId: testEmails[0].id,
          importance: 'important',
          confidence: 0.9,
          reasoning: 'Academic email',
          classifiedAt: new Date(),
          method: 'openai'
        },
        {
          emailId: testEmails[2].id,
          importance: 'not_important',
          confidence: 0.8,
          reasoning: 'Social event',
          classifiedAt: new Date(),
          method: 'openai'
        }
      ]);

      const stats = await pipeline.processSpecificEmails(emailIds, testUserId);

      expect(stats.totalProcessed).toBe(2);
      expect(stats.importantCount).toBe(1);
      expect(stats.notImportantCount).toBe(1);
      expect(mockClassifier.classifyEmailsBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: testEmails[0].id }),
          expect.objectContaining({ id: testEmails[2].id })
        ]),
        testUserId,
        testExpectations
      );
    });

    it('should throw error when no expectations found', async () => {
      const emailIds = [uuidv4()];
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(null);

      await expect(
        pipeline.processSpecificEmails(emailIds, testUserId)
      ).rejects.toThrow('No active expectations found for user');
    });

    it('should return empty stats for empty email ID list', async () => {
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);

      const stats = await pipeline.processSpecificEmails([], testUserId);

      expect(stats.totalProcessed).toBe(0);
      expect(mockClassifier.classifyEmailsBatch).not.toHaveBeenCalled();
    });
  });

  describe('processAllUnclassifiedEmails', () => {
    it('should process all emails including already classified ones', async () => {
      await createTestEmails(testUserId, 2, 'important');
      await createTestEmails(testUserId, 2, 'unclassified');
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      
      mockClassifier.classifyEmailsBatch.mockImplementation((emails) => {
        return Promise.resolve(emails.map(email => ({
          emailId: email.id,
          importance: 'important' as const,
          confidence: 0.8,
          reasoning: 'Test classification',
          classifiedAt: new Date(),
          method: 'openai' as const
        })));
      });

      const stats = await pipeline.processAllUnclassifiedEmails(testUserId);

      expect(stats.totalProcessed).toBe(4); // All emails processed
    });
  });

  describe('getFilteringStats', () => {
    it('should return correct filtering statistics', async () => {
      // Create test emails with different classifications
      await createTestEmails(testUserId, 2, 'important', 0.9);
      await createTestEmails(testUserId, 3, 'not_important', 0.8);
      await createTestEmails(testUserId, 1, 'unclassified');
      await createTestEmails(testUserId, 1, 'important', 0.5); // Low confidence

      const stats = await pipeline.getFilteringStats(testUserId);

      expect(stats.totalEmails).toBe(7);
      expect(stats.classifiedEmails).toBe(6);
      expect(stats.importantEmails).toBe(3);
      expect(stats.notImportantEmails).toBe(3);
      expect(stats.unclassifiedEmails).toBe(1);
      expect(stats.flaggedForReview).toBe(1); // One with confidence < 0.7
      expect(stats.lastProcessedAt).toBeInstanceOf(Date);
    });

    it('should return zero stats for user with no emails', async () => {
      const stats = await pipeline.getFilteringStats(testUserId);

      expect(stats.totalEmails).toBe(0);
      expect(stats.classifiedEmails).toBe(0);
      expect(stats.importantEmails).toBe(0);
      expect(stats.notImportantEmails).toBe(0);
      expect(stats.unclassifiedEmails).toBe(0);
      expect(stats.flaggedForReview).toBe(0);
      expect(stats.lastProcessedAt).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle classifier errors gracefully', async () => {
      await createTestEmails(testUserId, 2, 'unclassified');
      
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      mockClassifier.classifyEmailsBatch.mockRejectedValue(new Error('Classifier error'));

      await expect(
        pipeline.processNewEmails(testUserId)
      ).rejects.toThrow('Classifier error');
    });

    it('should handle expectations manager errors gracefully', async () => {
      mockExpectationsManager.getActiveExpectations.mockRejectedValue(new Error('Expectations error'));

      await expect(
        pipeline.processNewEmails(testUserId)
      ).rejects.toThrow('Expectations error');
    });
  });

  // Helper function to create test emails
  async function createTestEmails(
    userId: string, 
    count: number, 
    importance: 'important' | 'not_important' | 'unclassified',
    confidence?: number
  ): Promise<Email[]> {
    const db = await import('../../../config/database').then(m => m.getDatabase());
    const emails: Email[] = [];

    for (let i = 0; i < count; i++) {
      const email: Email = {
        id: uuidv4(),
        userId: userId,
        messageId: `test-message-${userId}-${i}-${Date.now()}-${Math.random()}`,
        subject: `Test Email ${i}`,
        sender: `sender${i}@example.com`,
        recipients: [`recipient${i}@ashoka.edu.in`],
        content: `This is test email content ${i}`,
        receivedAt: new Date(Date.now() - i * 1000),
        indexedAt: new Date(),
        importance: importance,
        importanceConfidence: confidence,
        userLabeled: false,
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      await db.run(`
        INSERT INTO emails (
          id, user_id, message_id, subject, sender, recipients, content,
          received_at, indexed_at, importance, importance_confidence, user_labeled, 
          has_attachments, labels
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        email.id, email.userId, email.messageId, email.subject,
        email.sender, JSON.stringify(email.recipients), email.content,
        email.receivedAt.toISOString(), email.indexedAt.toISOString(),
        email.importance, email.importanceConfidence, email.userLabeled ? 1 : 0,
        email.metadata.hasAttachments ? 1 : 0, JSON.stringify(email.metadata.labels)
      ]);

      emails.push(email);
    }

    return emails;
  }
});