import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { FilterController } from '../../controllers/FilterController';
import { UserExpectationsManager } from '../../services/ml/UserExpectationsManager';
import { FilteringPipeline } from '../../services/ml/FilteringPipeline';
import { OpenAIFilterService } from '../../services/ml/OpenAIFilterService';
import { EmailRepository } from '../../repositories/EmailRepository';
import { authenticateToken } from '../../middleware/auth';
import { UserExpectations, Email } from '../../types/models';

// Mock dependencies
jest.mock('../../services/ml/UserExpectationsManager');
jest.mock('../../services/ml/FilteringPipeline');
jest.mock('../../services/ml/OpenAIFilterService');
jest.mock('../../repositories/EmailRepository');

describe('FilterController', () => {
  let app: express.Application;
  let expectationsManager: jest.Mocked<UserExpectationsManager>;
  let filteringPipeline: jest.Mocked<FilteringPipeline>;
  let openaiService: jest.Mocked<OpenAIFilterService>;
  let emailRepository: jest.Mocked<EmailRepository>;
  let filterController: FilterController;

  const JWT_SECRET = 'test-secret';
  const mockUser = { id: 'user-1', email: 'test@ashoka.edu.in' };
  const mockToken = jwt.sign(mockUser, JWT_SECRET);

  const mockExpectations: UserExpectations = {
    id: 'exp-1',
    userId: 'user-1',
    title: 'Work Emails',
    description: 'Emails related to work projects and meetings',
    isActive: true,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01'),
    examples: {
      important: ['Meeting invitations', 'Project updates'],
      notImportant: ['Newsletter', 'Promotional emails']
    }
  };

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

  beforeEach(() => {
    // Create mock instances
    expectationsManager = new UserExpectationsManager() as jest.Mocked<UserExpectationsManager>;
    filteringPipeline = new FilteringPipeline() as jest.Mocked<FilteringPipeline>;
    openaiService = new OpenAIFilterService() as jest.Mocked<OpenAIFilterService>;
    emailRepository = new EmailRepository() as jest.Mocked<EmailRepository>;

    filterController = new FilterController(
      expectationsManager,
      filteringPipeline,
      openaiService,
      emailRepository
    );

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(authenticateToken(JWT_SECRET));

    // Setup routes
    app.post('/api/filter/expectations', filterController.createExpectations.bind(filterController));
    app.get('/api/filter/expectations', filterController.getExpectations.bind(filterController));
    app.put('/api/filter/expectations', filterController.updateExpectations.bind(filterController));
    app.delete('/api/filter/expectations', filterController.deactivateExpectations.bind(filterController));
    app.post('/api/filter/batch', filterController.batchFilter.bind(filterController));
    app.get('/api/filter/status', filterController.getFilteringStatus.bind(filterController));
    app.post('/api/filter/classify/:id', filterController.classifySingleEmail.bind(filterController));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/filter/expectations', () => {
    it('should create expectations successfully', async () => {
      expectationsManager.createExpectations.mockResolvedValue(mockExpectations);

      const response = await request(app)
        .post('/api/filter/expectations')
        .send({
          title: 'Work Emails',
          description: 'Emails related to work projects and meetings',
          examples: {
            important: ['Meeting invitations'],
            notImportant: ['Newsletter']
          }
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(201);

      expect(response.body.message).toBe('Expectations created successfully');
      expect(response.body.expectations).toBeDefined();
      expect(expectationsManager.createExpectations).toHaveBeenCalledWith(
        'user-1',
        'Work Emails',
        'Emails related to work projects and meetings',
        {
          important: ['Meeting invitations'],
          notImportant: ['Newsletter']
        }
      );
    });

    it('should return 400 for missing required fields', async () => {
      await request(app)
        .post('/api/filter/expectations')
        .send({ title: 'Work Emails' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 400 for invalid title length', async () => {
      await request(app)
        .post('/api/filter/expectations')
        .send({
          title: 'AB',
          description: 'Valid description here'
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 400 for invalid description length', async () => {
      await request(app)
        .post('/api/filter/expectations')
        .send({
          title: 'Valid Title',
          description: 'Short'
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 400 for invalid examples format', async () => {
      await request(app)
        .post('/api/filter/expectations')
        .send({
          title: 'Valid Title',
          description: 'Valid description here',
          examples: {
            important: 'not an array',
            notImportant: []
          }
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });
  });

  describe('GET /api/filter/expectations', () => {
    it('should return user expectations', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);

      const response = await request(app)
        .get('/api/filter/expectations')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.expectations).toBeDefined();
      expect(expectationsManager.getActiveExpectations).toHaveBeenCalledWith('user-1');
    });

    it('should return 404 when no expectations found', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(null);

      await request(app)
        .get('/api/filter/expectations')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/filter/expectations', () => {
    it('should update expectations successfully', async () => {
      const updatedExpectations = { ...mockExpectations, title: 'Updated Title' };
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      expectationsManager.updateExpectations.mockResolvedValue(updatedExpectations);

      const response = await request(app)
        .put('/api/filter/expectations')
        .send({ title: 'Updated Title' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.message).toBe('Expectations updated successfully');
      expect(expectationsManager.updateExpectations).toHaveBeenCalledWith(
        'exp-1',
        {
          title: 'Updated Title',
          description: undefined,
          examples: undefined
        }
      );
    });

    it('should return 404 when no expectations to update', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(null);

      await request(app)
        .put('/api/filter/expectations')
        .send({ title: 'Updated Title' })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('DELETE /api/filter/expectations', () => {
    it('should deactivate expectations successfully', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      expectationsManager.deactivateExpectations.mockResolvedValue({
        ...mockExpectations,
        isActive: false
      });

      const response = await request(app)
        .delete('/api/filter/expectations')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.message).toBe('Expectations deactivated successfully');
      expect(expectationsManager.deactivateExpectations).toHaveBeenCalledWith('exp-1');
    });

    it('should return 404 when no expectations to deactivate', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(null);

      await request(app)
        .delete('/api/filter/expectations')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });
  });

  describe('POST /api/filter/batch', () => {
    const mockStats = {
      totalProcessed: 10,
      importantCount: 3,
      notImportantCount: 7,
      flaggedForReview: 1,
      averageConfidence: 0.85,
      processingTimeMs: 5000
    };

    it('should process batch filtering successfully', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      openaiService.isAvailable.mockResolvedValue(true);
      filteringPipeline.processNewEmails.mockResolvedValue(mockStats);

      const response = await request(app)
        .post('/api/filter/batch')
        .send({
          filterUnclassified: true,
          confidenceThreshold: 0.8,
          batchSize: 5
        })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.message).toBe('Batch filtering completed');
      expect(response.body.stats).toEqual(mockStats);
      expect(filteringPipeline.processNewEmails).toHaveBeenCalledWith('user-1', {
        confidenceThreshold: 0.8,
        batchSize: 5,
        skipAlreadyClassified: true
      });
    });

    it('should return 400 when no expectations found', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(null);

      await request(app)
        .post('/api/filter/batch')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 503 when OpenAI is unavailable', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      openaiService.isAvailable.mockResolvedValue(false);

      await request(app)
        .post('/api/filter/batch')
        .send({})
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(503);
    });

    it('should return 400 for invalid confidence threshold', async () => {
      await request(app)
        .post('/api/filter/batch')
        .send({ confidenceThreshold: 1.5 })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 400 for invalid batch size', async () => {
      await request(app)
        .post('/api/filter/batch')
        .send({ batchSize: 100 })
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });
  });

  describe('GET /api/filter/status', () => {
    it('should return filtering status successfully', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      openaiService.isAvailable.mockResolvedValue(true);
      emailRepository.getUserEmailCount.mockResolvedValue(100);
      emailRepository.getUserEmailCountByImportance
        .mockResolvedValueOnce(30) // important
        .mockResolvedValueOnce(20); // unclassified

      const response = await request(app)
        .get('/api/filter/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.status.hasExpectations).toBe(true);
      expect(response.body.status.openaiAvailable).toBe(true);
      expect(response.body.emailStats.total).toBe(100);
      expect(response.body.emailStats.important).toBe(30);
      expect(response.body.emailStats.unclassified).toBe(20);
      expect(response.body.emailStats.notImportant).toBe(50);
    });

    it('should handle case with no expectations', async () => {
      expectationsManager.getActiveExpectations.mockResolvedValue(null);
      openaiService.isAvailable.mockResolvedValue(true);
      emailRepository.getUserEmailCount.mockResolvedValue(0);
      emailRepository.getUserEmailCountByImportance
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const response = await request(app)
        .get('/api/filter/status')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.status.hasExpectations).toBe(false);
      expect(response.body.expectations).toBeNull();
    });
  });

  describe('POST /api/filter/classify/:id', () => {
    it('should classify single email successfully', async () => {
      const classificationResult = {
        importance: 'important' as const,
        confidence: 0.9,
        reasoning: 'This email contains important project information'
      };
      const updatedEmail = { ...mockEmail, importance: 'important' as const };

      emailRepository.getById
        .mockResolvedValueOnce(mockEmail)
        .mockResolvedValueOnce(updatedEmail);
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      openaiService.isAvailable.mockResolvedValue(true);
      openaiService.classifyEmail.mockResolvedValue(classificationResult);
      emailRepository.updateImportance.mockResolvedValue();

      const response = await request(app)
        .post('/api/filter/classify/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(200);

      expect(response.body.message).toBe('Email classified successfully');
      expect(response.body.classification).toEqual(classificationResult);
      expect(emailRepository.updateImportance).toHaveBeenCalledWith(
        'email-1',
        'important',
        0.9,
        false
      );
    });

    it('should return 404 for non-existent email', async () => {
      emailRepository.getById.mockResolvedValue(null);

      await request(app)
        .post('/api/filter/classify/non-existent')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(404);
    });

    it('should return 403 for email owned by different user', async () => {
      const otherUserEmail = { ...mockEmail, userId: 'other-user' };
      emailRepository.getById.mockResolvedValue(otherUserEmail);

      await request(app)
        .post('/api/filter/classify/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(403);
    });

    it('should return 400 when no expectations found', async () => {
      emailRepository.getById.mockResolvedValue(mockEmail);
      expectationsManager.getActiveExpectations.mockResolvedValue(null);

      await request(app)
        .post('/api/filter/classify/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(400);
    });

    it('should return 503 when OpenAI is unavailable', async () => {
      emailRepository.getById.mockResolvedValue(mockEmail);
      expectationsManager.getActiveExpectations.mockResolvedValue(mockExpectations);
      openaiService.isAvailable.mockResolvedValue(false);

      await request(app)
        .post('/api/filter/classify/email-1')
        .set('Authorization', `Bearer ${mockToken}`)
        .expect(503);
    });
  });

  describe('Authentication', () => {
    it('should return 401 without authentication token', async () => {
      await request(app)
        .get('/api/filter/expectations')
        .expect(401);
    });

    it('should return 403 with invalid token', async () => {
      await request(app)
        .get('/api/filter/expectations')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });
  });
});