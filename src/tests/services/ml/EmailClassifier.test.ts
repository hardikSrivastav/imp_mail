import { EmailClassifier } from '../../../services/ml/EmailClassifier';
import { OpenAIFilterService } from '../../../services/ml/OpenAIFilterService';
import { UserExpectationsManager } from '../../../services/ml/UserExpectationsManager';
import { Email, UserExpectations } from '../../../types/models';
import { initializeDatabase, closeDatabase } from '../../../config/database';
import { v4 as uuidv4 } from 'uuid';

// Mock the services
jest.mock('../../../services/ml/OpenAIFilterService');
jest.mock('../../../services/ml/UserExpectationsManager');

describe('EmailClassifier', () => {
  let classifier: EmailClassifier;
  let mockOpenAIService: jest.Mocked<OpenAIFilterService>;
  let mockExpectationsManager: jest.Mocked<UserExpectationsManager>;
  let testEmail: Email;
  let testExpectations: UserExpectations;
  let testUserId: string;

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

    // Create classifier instance
    classifier = new EmailClassifier();

    // Get mocked services
    mockOpenAIService = (classifier as any).openaiService;
    mockExpectationsManager = (classifier as any).expectationsManager;

    // Create test data
    testUserId = uuidv4();
    
    testEmail = {
      id: uuidv4(),
      userId: testUserId,
      messageId: 'test-message-id',
      subject: 'Important Project Update',
      sender: 'professor@ashoka.edu.in',
      recipients: ['student@ashoka.edu.in'],
      content: 'This is an important update about your research project deadline.',
      receivedAt: new Date(),
      indexedAt: new Date(),
      importance: 'unclassified',
      userLabeled: false,
      metadata: {
        hasAttachments: false,
        labels: []
      }
    };

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

    // Insert test email
    await db.run(`
      INSERT INTO emails (
        id, user_id, message_id, subject, sender, recipients, content,
        received_at, indexed_at, importance, user_labeled, has_attachments, labels
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      testEmail.id, testEmail.userId, testEmail.messageId, testEmail.subject,
      testEmail.sender, JSON.stringify(testEmail.recipients), testEmail.content,
      testEmail.receivedAt.toISOString(), testEmail.indexedAt.toISOString(),
      testEmail.importance, testEmail.userLabeled ? 1 : 0,
      testEmail.metadata.hasAttachments ? 1 : 0, JSON.stringify(testEmail.metadata.labels)
    ]);
  });

  describe('classifyEmail', () => {
    it('should classify email using OpenAI when service is available', async () => {
      // Mock OpenAI service responses
      mockOpenAIService.isAvailable.mockResolvedValue(true);
      mockOpenAIService.classifyEmail.mockResolvedValue({
        importance: 'important',
        confidence: 0.9,
        reasoning: 'This is an academic project update'
      });

      const result = await classifier.classifyEmail(testEmail, testUserId, testExpectations);

      expect(result.emailId).toBe(testEmail.id);
      expect(result.importance).toBe('important');
      expect(result.confidence).toBe(0.9);
      expect(result.method).toBe('openai');
      expect(mockOpenAIService.classifyEmail).toHaveBeenCalledWith(testEmail, testExpectations);
    });

    it('should get user expectations if not provided', async () => {
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(testExpectations);
      mockOpenAIService.isAvailable.mockResolvedValue(true);
      mockOpenAIService.classifyEmail.mockResolvedValue({
        importance: 'important',
        confidence: 0.8,
        reasoning: 'Academic email'
      });

      const result = await classifier.classifyEmail(testEmail, testUserId);

      expect(mockExpectationsManager.getActiveExpectations).toHaveBeenCalledWith(testUserId);
      expect(result.method).toBe('openai');
    });

    it('should use fallback when no expectations found', async () => {
      mockExpectationsManager.getActiveExpectations.mockResolvedValue(null);

      const result = await classifier.classifyEmail(testEmail, testUserId);

      expect(result.method).toBe('fallback');
      expect(result.confidence).toBe(0.3);
      expect(mockExpectationsManager.getActiveExpectations).toHaveBeenCalledWith(testUserId);
    });

    it('should use fallback when OpenAI is unavailable', async () => {
      mockOpenAIService.isAvailable.mockResolvedValue(false);

      const result = await classifier.classifyEmail(testEmail, testUserId, testExpectations);

      expect(result.method).toBe('fallback');
      expect(result.confidence).toBe(0.3);
      expect(result.reasoning).toContain('fallback method');
      expect(mockOpenAIService.classifyEmail).not.toHaveBeenCalled();
    });

    it('should use fallback when OpenAI classification fails', async () => {
      mockOpenAIService.isAvailable.mockResolvedValue(true);
      mockOpenAIService.classifyEmail.mockRejectedValue(new Error('OpenAI API Error'));

      const result = await classifier.classifyEmail(testEmail, testUserId, testExpectations);

      expect(result.method).toBe('fallback');
      expect(result.confidence).toBe(0.3);
    });

    it('should classify academic email as important using fallback', async () => {
      mockOpenAIService.isAvailable.mockResolvedValue(false);

      const academicEmail = {
        ...testEmail,
        subject: 'Urgent: Assignment Deadline Tomorrow',
        content: 'Please submit your research project by tomorrow deadline'
      };

      const result = await classifier.classifyEmail(academicEmail, testUserId, testExpectations);

      expect(result.importance).toBe('important');
      expect(result.method).toBe('fallback');
    });

    it('should classify promotional email as not important using fallback', async () => {
      mockOpenAIService.isAvailable.mockResolvedValue(false);

      const promotionalEmail = {
        ...testEmail,
        subject: 'Special Sale - 50% Off Everything!',
        content: 'Limited time offer! Get 50% discount on all items. Unsubscribe here.'
      };

      const result = await classifier.classifyEmail(promotionalEmail, testUserId, testExpectations);

      expect(result.importance).toBe('not_important');
      expect(result.method).toBe('fallback');
    });
  });

  describe('classifyEmailsBatch', () => {
    it('should classify multiple emails using OpenAI', async () => {
      const emails = [testEmail, { ...testEmail, id: uuidv4() }];
      
      mockOpenAIService.isAvailable.mockResolvedValue(true);
      mockOpenAIService.classifyEmailsBatch.mockResolvedValue([
        {
          emailId: emails[0].id,
          importance: 'important',
          confidence: 0.9,
          reasoning: 'Academic project update'
        },
        {
          emailId: emails[1].id,
          importance: 'not_important',
          confidence: 0.7,
          reasoning: 'Social event invitation'
        }
      ]);

      const results = await classifier.classifyEmailsBatch(emails, testUserId, testExpectations);

      expect(results).toHaveLength(2);
      expect(results[0].method).toBe('openai');
      expect(results[1].method).toBe('openai');
      expect(mockOpenAIService.classifyEmailsBatch).toHaveBeenCalledWith(emails, testExpectations);
    });

    it('should return empty array for empty email list', async () => {
      const results = await classifier.classifyEmailsBatch([], testUserId, testExpectations);
      expect(results).toEqual([]);
    });

    it('should use fallback for batch when OpenAI is unavailable', async () => {
      const emails = [testEmail];
      mockOpenAIService.isAvailable.mockResolvedValue(false);

      const results = await classifier.classifyEmailsBatch(emails, testUserId, testExpectations);

      expect(results).toHaveLength(1);
      expect(results[0].method).toBe('fallback');
    });
  });

  describe('confidence threshold and flagging', () => {
    it('should get confidence threshold from environment', () => {
      process.env.CLASSIFICATION_CONFIDENCE_THRESHOLD = '0.8';
      const threshold = classifier.getConfidenceThreshold();
      expect(threshold).toBe(0.8);
    });

    it('should use default confidence threshold', () => {
      delete process.env.CLASSIFICATION_CONFIDENCE_THRESHOLD;
      const threshold = classifier.getConfidenceThreshold();
      expect(threshold).toBe(0.7);
    });

    it('should flag low confidence results for review', () => {
      const lowConfidenceResult = {
        emailId: testEmail.id,
        importance: 'important' as const,
        confidence: 0.5,
        reasoning: 'Uncertain classification',
        classifiedAt: new Date(),
        method: 'openai' as const
      };

      const shouldFlag = classifier.shouldFlagForReview(lowConfidenceResult);
      expect(shouldFlag).toBe(true);
    });

    it('should flag fallback results for review', () => {
      const fallbackResult = {
        emailId: testEmail.id,
        importance: 'important' as const,
        confidence: 0.8,
        reasoning: 'Fallback classification',
        classifiedAt: new Date(),
        method: 'fallback' as const
      };

      const shouldFlag = classifier.shouldFlagForReview(fallbackResult);
      expect(shouldFlag).toBe(true);
    });

    it('should not flag high confidence OpenAI results', () => {
      const highConfidenceResult = {
        emailId: testEmail.id,
        importance: 'important' as const,
        confidence: 0.9,
        reasoning: 'Clear academic email',
        classifiedAt: new Date(),
        method: 'openai' as const
      };

      const shouldFlag = classifier.shouldFlagForReview(highConfidenceResult);
      expect(shouldFlag).toBe(false);
    });
  });

  describe('database integration', () => {
    it('should store classification result in database', async () => {
      mockOpenAIService.isAvailable.mockResolvedValue(true);
      mockOpenAIService.classifyEmail.mockResolvedValue({
        importance: 'important',
        confidence: 0.9,
        reasoning: 'Academic project update'
      });

      await classifier.classifyEmail(testEmail, testUserId, testExpectations);

      // Verify email was updated in database
      const db = await import('../../../config/database').then(m => m.getDatabase());
      const updatedEmail = await db.get(
        'SELECT importance, importance_confidence, user_labeled FROM emails WHERE id = ?',
        [testEmail.id]
      );

      expect(updatedEmail.importance).toBe('important');
      expect(updatedEmail.importance_confidence).toBe(0.9);
      expect(updatedEmail.user_labeled).toBe(0);
    });
  });
});