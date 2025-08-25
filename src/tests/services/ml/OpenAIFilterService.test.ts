import { OpenAIFilterService } from '../../../services/ml/OpenAIFilterService';
import { Email, UserExpectations } from '../../../types/models';
import { v4 as uuidv4 } from 'uuid';

// Mock OpenAI
const mockModels = {
  list: jest.fn()
};

const mockChat = {
  completions: {
    create: jest.fn()
  }
};

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      models: mockModels,
      chat: mockChat
    }))
  };
});

describe('OpenAIFilterService', () => {
  let service: OpenAIFilterService;
  let testEmail: Email;
  let testExpectations: UserExpectations;

  beforeAll(() => {
    // Set required environment variables
    process.env.OPENAI_API_KEY = 'test-api-key';
    process.env.OPENAI_MODEL = 'gpt-4';
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    service = new OpenAIFilterService();

    // Create test data
    testEmail = {
      id: uuidv4(),
      userId: uuidv4(),
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
      userId: uuidv4(),
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
  });

  describe('constructor', () => {
    it('should throw error if OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => new OpenAIFilterService()).toThrow('OPENAI_API_KEY environment variable is required');
      
      // Restore for other tests
      process.env.OPENAI_API_KEY = 'test-api-key';
    });

    it('should use default model if OPENAI_MODEL is not set', () => {
      delete process.env.OPENAI_MODEL;
      
      const service = new OpenAIFilterService();
      expect(service).toBeDefined();
      
      // Restore for other tests
      process.env.OPENAI_MODEL = 'gpt-4';
    });
  });

  describe('isAvailable', () => {
    it('should return true when OpenAI API is accessible', async () => {
      mockModels.list.mockResolvedValue({ data: [] });
      
      const isAvailable = await service.isAvailable();
      expect(isAvailable).toBe(true);
      expect(mockModels.list).toHaveBeenCalled();
    });

    it('should return false when OpenAI API is not accessible', async () => {
      mockModels.list.mockRejectedValue(new Error('API Error'));
      
      const isAvailable = await service.isAvailable();
      expect(isAvailable).toBe(false);
    });
  });

  describe('classifyEmail', () => {
    it('should classify email as important with high confidence', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'important',
              confidence: 0.9,
              reasoning: 'This email is about a project deadline which matches the user\'s academic work expectations'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      const result = await service.classifyEmail(testEmail, testExpectations);

      expect(result.importance).toBe('important');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toContain('project deadline');
      expect(mockChat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      );
    });

    it('should classify email as not important with low confidence', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'not_important',
              confidence: 0.3,
              reasoning: 'This appears to be a social event invitation which is not important for academic work'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      const socialEmail = {
        ...testEmail,
        subject: 'Party Invitation',
        content: 'Join us for a fun party this weekend!'
      };

      const result = await service.classifyEmail(socialEmail, testExpectations);

      expect(result.importance).toBe('not_important');
      expect(result.confidence).toBe(0.3);
      expect(result.reasoning).toContain('social event');
    });

    it('should handle OpenAI API errors gracefully', async () => {
      mockChat.completions.create.mockRejectedValue(new Error('API Rate Limit'));

      await expect(
        service.classifyEmail(testEmail, testExpectations)
      ).rejects.toThrow('Failed to classify email: API Rate Limit');
    });

    it('should handle invalid JSON responses', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      await expect(
        service.classifyEmail(testEmail, testExpectations)
      ).rejects.toThrow('Invalid JSON response from OpenAI');
    });

    it('should validate response structure', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'invalid_value',
              confidence: 0.9,
              reasoning: 'Test reasoning'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      await expect(
        service.classifyEmail(testEmail, testExpectations)
      ).rejects.toThrow('Failed to classify email: Invalid JSON response from OpenAI');
    });

    it('should sanitize email content', async () => {
      const emailWithSensitiveData = {
        ...testEmail,
        content: 'My credit card is 1234-5678-9012-3456 and SSN is 123-45-6789. Contact me at test@example.com or call 1234567890.'
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'not_important',
              confidence: 0.8,
              reasoning: 'Contains sensitive information'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      await service.classifyEmail(emailWithSensitiveData, testExpectations);

      const callArgs = mockChat.completions.create.mock.calls[0][0];
      const prompt = callArgs.messages[1].content;

      expect(prompt).toContain('[CARD_NUMBER]');
      expect(prompt).toContain('[SSN]');
      expect(prompt).toContain('[EMAIL]');
      expect(prompt).toContain('[PHONE]');
      expect(prompt).not.toContain('1234-5678-9012-3456');
      expect(prompt).not.toContain('123-45-6789');
    });

    it('should truncate long content', async () => {
      const longContent = 'a'.repeat(3000);
      const emailWithLongContent = {
        ...testEmail,
        content: longContent
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'not_important',
              confidence: 0.5,
              reasoning: 'Long content email'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      await service.classifyEmail(emailWithLongContent, testExpectations);

      const callArgs = mockChat.completions.create.mock.calls[0][0];
      const prompt = callArgs.messages[1].content;

      expect(prompt).toContain('[truncated]');
      expect(prompt.length).toBeLessThan(longContent.length + 1000); // Account for other prompt content
    });
  });

  describe('classifyEmailsBatch', () => {
    it('should classify multiple emails in batches', async () => {
      const emails = [testEmail, { ...testEmail, id: uuidv4() }];
      
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: 'important',
              confidence: 0.8,
              reasoning: 'Academic email'
            })
          }
        }]
      };

      mockChat.completions.create.mockResolvedValue(mockResponse);

      const results = await service.classifyEmailsBatch(emails, testExpectations, 2);

      expect(results).toHaveLength(2);
      expect(results[0].emailId).toBe(emails[0].id);
      expect(results[1].emailId).toBe(emails[1].id);
      expect(mockChat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('should handle individual email classification failures in batch', async () => {
      const emails = [testEmail, { ...testEmail, id: uuidv4() }];
      
      mockChat.completions.create
        .mockResolvedValueOnce({
          choices: [{
            message: {
              content: JSON.stringify({
                importance: 'important',
                confidence: 0.8,
                reasoning: 'Academic email'
              })
            }
          }]
        })
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await service.classifyEmailsBatch(emails, testExpectations, 2);

      expect(results).toHaveLength(2);
      expect(results[0].importance).toBe('important');
      expect(results[1].importance).toBe('not_important'); // Fallback for failed classification
      expect(results[1].confidence).toBe(0);
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      mockModels.list.mockResolvedValue({ data: [] });

      const stats = await service.getUsageStats();

      expect(stats.model).toBe('gpt-4');
      expect(stats.isAvailable).toBe(true);
      expect(stats.lastChecked).toBeInstanceOf(Date);
    });
  });
});