import { 
  validateUser, 
  validateEmail, 
  validateEmailVector, 
  validateTrainingExample, 
  validateSyncState,
  isAshokaEmail,
  isValidImportance,
  isValidSyncStatus,
  validateConfidenceScore,
  validateEmbeddingDimension,
  sanitizeEmailContent,
  validateEmailAddress,
  validateMessageId,
  ValidationError
} from '../../models/validation';
import { User, Email, EmailVector, TrainingExample, SyncState } from '../../types/models';

describe('Model Validation', () => {
  describe('User Validation', () => {
    const validUser: User = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@ashoka.edu.in',
      createdAt: new Date(),
      lastLoginAt: new Date(),
      oauthTokens: {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date(Date.now() + 3600000)
      },
      preferences: {
        autoClassify: true,
        confidenceThreshold: 0.7
      }
    };

    it('should validate a valid user', () => {
      const result = validateUser(validUser);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validUser);
    });

    it('should reject user with invalid email domain', () => {
      const invalidUser = { ...validUser, email: 'test@gmail.com' };
      const result = validateUser(invalidUser);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('@ashoka.edu.in');
    });

    it('should reject user with invalid UUID', () => {
      const invalidUser = { ...validUser, id: 'invalid-uuid' };
      const result = validateUser(invalidUser);
      expect(result.error).toBeDefined();
    });

    it('should reject user with invalid confidence threshold', () => {
      const invalidUser = { 
        ...validUser, 
        preferences: { ...validUser.preferences, confidenceThreshold: 1.5 }
      };
      const result = validateUser(invalidUser);
      expect(result.error).toBeDefined();
    });
  });

  describe('Email Validation', () => {
    const validEmail: Email = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      messageId: 'msg123',
      subject: 'Test Subject',
      sender: 'sender@example.com',
      recipients: ['recipient@example.com'],
      content: 'Test content',
      htmlContent: '<p>Test content</p>',
      receivedAt: new Date(),
      indexedAt: new Date(),
      importance: 'unclassified',
      importanceConfidence: 0.5,
      userLabeled: false,
      vectorId: 'vector123',
      metadata: {
        hasAttachments: false,
        threadId: 'thread123',
        labels: ['inbox']
      }
    };

    it('should validate a valid email', () => {
      const result = validateEmail(validEmail);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validEmail);
    });

    it('should reject email with invalid importance', () => {
      const invalidEmail = { ...validEmail, importance: 'invalid' as any };
      const result = validateEmail(invalidEmail);
      expect(result.error).toBeDefined();
    });

    it('should reject email with invalid sender email', () => {
      const invalidEmail = { ...validEmail, sender: 'invalid-email' };
      const result = validateEmail(invalidEmail);
      expect(result.error).toBeDefined();
    });

    it('should reject email with empty recipients array', () => {
      const invalidEmail = { ...validEmail, recipients: [] };
      const result = validateEmail(invalidEmail);
      expect(result.error).toBeDefined();
    });
  });

  describe('EmailVector Validation', () => {
    const validEmailVector: EmailVector = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      emailId: '123e4567-e89b-12d3-a456-426614174001',
      userId: '123e4567-e89b-12d3-a456-426614174002',
      embedding: new Array(1536).fill(0.1),
      embeddingModel: 'text-embedding-ada-002',
      createdAt: new Date()
    };

    it('should validate a valid email vector', () => {
      const result = validateEmailVector(validEmailVector);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validEmailVector);
    });

    it('should reject email vector with empty embedding', () => {
      const invalidVector = { ...validEmailVector, embedding: [] };
      const result = validateEmailVector(invalidVector);
      expect(result.error).toBeDefined();
    });
  });

  describe('TrainingExample Validation', () => {
    const validTrainingExample: TrainingExample = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      emailId: '123e4567-e89b-12d3-a456-426614174002',
      importance: 'important',
      createdAt: new Date(),
      features: {
        subject: 'Test Subject',
        sender: 'sender@example.com',
        content: 'Test content',
        hasAttachments: false
      }
    };

    it('should validate a valid training example', () => {
      const result = validateTrainingExample(validTrainingExample);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validTrainingExample);
    });

    it('should reject training example with invalid importance', () => {
      const invalidExample = { ...validTrainingExample, importance: 'unclassified' as any };
      const result = validateTrainingExample(invalidExample);
      expect(result.error).toBeDefined();
    });
  });

  describe('SyncState Validation', () => {
    const validSyncState: SyncState = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      lastSyncAt: new Date(),
      lastMessageId: 'msg123',
      totalEmailsIndexed: 100,
      isInitialSyncComplete: true,
      currentSyncStatus: 'idle',
      lastError: undefined
    };

    it('should validate a valid sync state', () => {
      const result = validateSyncState(validSyncState);
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual(validSyncState);
    });

    it('should reject sync state with invalid status', () => {
      const invalidState = { ...validSyncState, currentSyncStatus: 'invalid' as any };
      const result = validateSyncState(invalidState);
      expect(result.error).toBeDefined();
    });

    it('should reject sync state with negative email count', () => {
      const invalidState = { ...validSyncState, totalEmailsIndexed: -1 };
      const result = validateSyncState(invalidState);
      expect(result.error).toBeDefined();
    });
  });

  describe('Domain-specific validation functions', () => {
    describe('isAshokaEmail', () => {
      it('should return true for valid Ashoka email', () => {
        expect(isAshokaEmail('test@ashoka.edu.in')).toBe(true);
      });

      it('should return false for invalid email domain', () => {
        expect(isAshokaEmail('test@gmail.com')).toBe(false);
        expect(isAshokaEmail('test@ashoka.com')).toBe(false);
      });
    });

    describe('isValidImportance', () => {
      it('should return true for valid importance values', () => {
        expect(isValidImportance('important')).toBe(true);
        expect(isValidImportance('not_important')).toBe(true);
        expect(isValidImportance('unclassified')).toBe(true);
      });

      it('should return false for invalid importance values', () => {
        expect(isValidImportance('invalid')).toBe(false);
        expect(isValidImportance('')).toBe(false);
      });
    });

    describe('isValidSyncStatus', () => {
      it('should return true for valid sync status values', () => {
        expect(isValidSyncStatus('idle')).toBe(true);
        expect(isValidSyncStatus('syncing')).toBe(true);
        expect(isValidSyncStatus('error')).toBe(true);
      });

      it('should return false for invalid sync status values', () => {
        expect(isValidSyncStatus('invalid')).toBe(false);
        expect(isValidSyncStatus('')).toBe(false);
      });
    });

    describe('validateConfidenceScore', () => {
      it('should return true for valid confidence scores', () => {
        expect(validateConfidenceScore(0)).toBe(true);
        expect(validateConfidenceScore(0.5)).toBe(true);
        expect(validateConfidenceScore(1)).toBe(true);
      });

      it('should return false for invalid confidence scores', () => {
        expect(validateConfidenceScore(-0.1)).toBe(false);
        expect(validateConfidenceScore(1.1)).toBe(false);
        expect(validateConfidenceScore(NaN)).toBe(false);
      });
    });

    describe('validateEmbeddingDimension', () => {
      it('should return true for valid embedding dimensions', () => {
        const validEmbedding = new Array(1536).fill(0.1);
        expect(validateEmbeddingDimension(validEmbedding)).toBe(true);
      });

      it('should return false for invalid embedding dimensions', () => {
        const invalidEmbedding = new Array(100).fill(0.1);
        expect(validateEmbeddingDimension(invalidEmbedding)).toBe(false);
        
        const embeddingWithNaN = new Array(1536).fill(0.1);
        embeddingWithNaN[0] = NaN;
        expect(validateEmbeddingDimension(embeddingWithNaN)).toBe(false);
      });
    });

    describe('sanitizeEmailContent', () => {
      it('should remove control characters and normalize whitespace', () => {
        const dirtyContent = 'Hello\x00\x08World\n\n\nTest   Content';
        const cleanContent = sanitizeEmailContent(dirtyContent);
        expect(cleanContent).toBe('HelloWorld Test Content');
      });

      it('should handle empty content', () => {
        expect(sanitizeEmailContent('')).toBe('');
        expect(sanitizeEmailContent('   ')).toBe('');
      });
    });

    describe('validateEmailAddress', () => {
      it('should return true for valid email addresses', () => {
        expect(validateEmailAddress('test@example.com')).toBe(true);
        expect(validateEmailAddress('user.name@domain.co.uk')).toBe(true);
      });

      it('should return false for invalid email addresses', () => {
        expect(validateEmailAddress('invalid-email')).toBe(false);
        expect(validateEmailAddress('@domain.com')).toBe(false);
        expect(validateEmailAddress('user@')).toBe(false);
      });
    });

    describe('validateMessageId', () => {
      it('should return true for valid message IDs', () => {
        expect(validateMessageId('msg123')).toBe(true);
        expect(validateMessageId('message-id_123.test')).toBe(true);
      });

      it('should return false for invalid message IDs', () => {
        expect(validateMessageId('')).toBe(false);
        expect(validateMessageId('msg with spaces')).toBe(false);
        expect(validateMessageId('msg@invalid')).toBe(false);
      });
    });
  });
});