import {
  userRowToModel,
  userModelToRow,
  emailRowToModel,
  emailModelToRow,
  trainingExampleRowToModel,
  trainingExampleModelToRow,
  syncStateRowToModel,
  syncStateModelToRow,
  safeJsonParse,
  safeJsonStringify,
  transformUserRows,
  transformEmailRows
} from '../../models/transformers';
import { User, Email, TrainingExample, SyncState, UserRow, EmailRow, TrainingExampleRow, SyncStateRow } from '../../types/models';

describe('Model Transformers', () => {
  describe('User Transformations', () => {
    const userModel: User = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@ashoka.edu.in',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      lastLoginAt: new Date('2023-01-02T00:00:00.000Z'),
      oauthTokens: {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        expiresAt: new Date('2023-01-03T00:00:00.000Z')
      },
      preferences: {
        autoClassify: true,
        confidenceThreshold: 0.7
      }
    };

    const userRow: UserRow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@ashoka.edu.in',
      created_at: '2023-01-01T00:00:00.000Z',
      last_login_at: '2023-01-02T00:00:00.000Z',
      oauth_access_token: 'access_token',
      oauth_refresh_token: 'refresh_token',
      oauth_expires_at: '2023-01-03T00:00:00.000Z',
      auto_classify: 1,
      confidence_threshold: 0.7
    };

    it('should convert user row to model', () => {
      const result = userRowToModel(userRow);
      expect(result).toEqual(userModel);
    });

    it('should convert user model to row', () => {
      const result = userModelToRow(userModel);
      expect(result).toEqual(userRow);
    });

    it('should handle boolean conversion correctly', () => {
      const rowWithFalse = { ...userRow, auto_classify: 0 };
      const result = userRowToModel(rowWithFalse);
      expect(result.preferences.autoClassify).toBe(false);

      const modelWithFalse = { ...userModel, preferences: { ...userModel.preferences, autoClassify: false } };
      const rowResult = userModelToRow(modelWithFalse);
      expect(rowResult.auto_classify).toBe(0);
    });
  });

  describe('Email Transformations', () => {
    const emailModel: Email = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      messageId: 'msg123',
      subject: 'Test Subject',
      sender: 'sender@example.com',
      recipients: ['recipient1@example.com', 'recipient2@example.com'],
      content: 'Test content',
      htmlContent: '<p>Test content</p>',
      receivedAt: new Date('2023-01-01T00:00:00.000Z'),
      indexedAt: new Date('2023-01-02T00:00:00.000Z'),
      importance: 'important',
      importanceConfidence: 0.8,
      userLabeled: true,
      vectorId: 'vector123',
      metadata: {
        hasAttachments: true,
        threadId: 'thread123',
        labels: ['inbox', 'important']
      }
    };

    const emailRow: EmailRow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      user_id: '123e4567-e89b-12d3-a456-426614174001',
      message_id: 'msg123',
      subject: 'Test Subject',
      sender: 'sender@example.com',
      recipients: '["recipient1@example.com","recipient2@example.com"]',
      content: 'Test content',
      html_content: '<p>Test content</p>',
      received_at: '2023-01-01T00:00:00.000Z',
      indexed_at: '2023-01-02T00:00:00.000Z',
      importance: 'important',
      importance_confidence: 0.8,
      user_labeled: 1,
      vector_id: 'vector123',
      has_attachments: 1,
      thread_id: 'thread123',
      labels: '["inbox","important"]'
    };

    it('should convert email row to model', () => {
      const result = emailRowToModel(emailRow);
      expect(result).toEqual(emailModel);
    });

    it('should convert email model to row', () => {
      const result = emailModelToRow(emailModel);
      expect(result).toEqual(emailRow);
    });

    it('should handle optional fields correctly', () => {
      const emailWithoutOptionals = {
        ...emailModel,
        htmlContent: undefined,
        importanceConfidence: undefined,
        vectorId: undefined,
        metadata: {
          ...emailModel.metadata,
          threadId: undefined
        }
      };

      const result = emailModelToRow(emailWithoutOptionals);
      expect(result.html_content).toBeUndefined();
      expect(result.importance_confidence).toBeUndefined();
      expect(result.vector_id).toBeUndefined();
      expect(result.thread_id).toBeUndefined();
    });

    it('should handle JSON arrays correctly', () => {
      const emailWithEmptyArrays = {
        ...emailModel,
        recipients: [],
        metadata: {
          ...emailModel.metadata,
          labels: []
        }
      };

      const result = emailModelToRow(emailWithEmptyArrays);
      expect(result.recipients).toBe('[]');
      expect(result.labels).toBe('[]');

      const backToModel = emailRowToModel(result);
      expect(backToModel.recipients).toEqual([]);
      expect(backToModel.metadata.labels).toEqual([]);
    });
  });

  describe('TrainingExample Transformations', () => {
    const trainingExampleModel: TrainingExample = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      emailId: '123e4567-e89b-12d3-a456-426614174002',
      importance: 'important',
      createdAt: new Date('2023-01-01T00:00:00.000Z'),
      features: {
        subject: 'Test Subject',
        sender: 'sender@example.com',
        content: 'Test content',
        hasAttachments: true
      }
    };

    const trainingExampleRow: TrainingExampleRow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      user_id: '123e4567-e89b-12d3-a456-426614174001',
      email_id: '123e4567-e89b-12d3-a456-426614174002',
      importance: 'important',
      created_at: '2023-01-01T00:00:00.000Z',
      subject: 'Test Subject',
      sender: 'sender@example.com',
      content: 'Test content',
      has_attachments: 1
    };

    it('should convert training example row to model', () => {
      const result = trainingExampleRowToModel(trainingExampleRow);
      expect(result).toEqual(trainingExampleModel);
    });

    it('should convert training example model to row', () => {
      const result = trainingExampleModelToRow(trainingExampleModel);
      expect(result).toEqual(trainingExampleRow);
    });
  });

  describe('SyncState Transformations', () => {
    const syncStateModel: SyncState = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      lastSyncAt: new Date('2023-01-01T00:00:00.000Z'),
      lastMessageId: 'msg123',
      totalEmailsIndexed: 100,
      isInitialSyncComplete: true,
      currentSyncStatus: 'idle',
      lastError: 'Some error message'
    };

    const syncStateRow: SyncStateRow = {
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      last_sync_at: '2023-01-01T00:00:00.000Z',
      last_message_id: 'msg123',
      total_emails_indexed: 100,
      is_initial_sync_complete: 1,
      current_sync_status: 'idle',
      last_error: 'Some error message'
    };

    it('should convert sync state row to model', () => {
      const result = syncStateRowToModel(syncStateRow);
      expect(result).toEqual(syncStateModel);
    });

    it('should convert sync state model to row', () => {
      const result = syncStateModelToRow(syncStateModel);
      expect(result).toEqual(syncStateRow);
    });

    it('should handle optional fields correctly', () => {
      const syncStateWithoutOptionals = {
        ...syncStateModel,
        lastMessageId: undefined,
        lastError: undefined
      };

      const result = syncStateModelToRow(syncStateWithoutOptionals);
      expect(result.last_message_id).toBeUndefined();
      expect(result.last_error).toBeUndefined();
    });
  });

  describe('Utility Functions', () => {
    describe('safeJsonParse', () => {
      it('should parse valid JSON', () => {
        const jsonString = '{"key": "value"}';
        const result = safeJsonParse(jsonString, {});
        expect(result).toEqual({ key: 'value' });
      });

      it('should return fallback for invalid JSON', () => {
        const invalidJson = '{"key": invalid}';
        const fallback = { default: true };
        const result = safeJsonParse(invalidJson, fallback);
        expect(result).toEqual(fallback);
      });

      it('should handle arrays correctly', () => {
        const arrayJson = '["item1", "item2"]';
        const result = safeJsonParse(arrayJson, []);
        expect(result).toEqual(['item1', 'item2']);
      });
    });

    describe('safeJsonStringify', () => {
      it('should stringify valid objects', () => {
        const obj = { key: 'value' };
        const result = safeJsonStringify(obj);
        expect(result).toBe('{"key":"value"}');
      });

      it('should handle arrays', () => {
        const arr = ['item1', 'item2'];
        const result = safeJsonStringify(arr);
        expect(result).toBe('["item1","item2"]');
      });

      it('should return empty object string for circular references', () => {
        const circular: any = { key: 'value' };
        circular.self = circular;
        const result = safeJsonStringify(circular);
        expect(result).toBe('{}');
      });
    });
  });

  describe('Batch Transformation Functions', () => {
    it('should transform multiple user rows', () => {
      const userRows: UserRow[] = [
        {
          id: 'user1',
          email: 'user1@ashoka.edu.in',
          created_at: '2023-01-01T00:00:00.000Z',
          last_login_at: '2023-01-01T00:00:00.000Z',
          oauth_access_token: 'token1',
          oauth_refresh_token: 'refresh1',
          oauth_expires_at: '2023-01-02T00:00:00.000Z',
          auto_classify: 1,
          confidence_threshold: 0.7
        },
        {
          id: 'user2',
          email: 'user2@ashoka.edu.in',
          created_at: '2023-01-01T00:00:00.000Z',
          last_login_at: '2023-01-01T00:00:00.000Z',
          oauth_access_token: 'token2',
          oauth_refresh_token: 'refresh2',
          oauth_expires_at: '2023-01-02T00:00:00.000Z',
          auto_classify: 0,
          confidence_threshold: 0.8
        }
      ];

      const result = transformUserRows(userRows);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('user1');
      expect(result[0].preferences.autoClassify).toBe(true);
      expect(result[1].id).toBe('user2');
      expect(result[1].preferences.autoClassify).toBe(false);
    });

    it('should transform multiple email rows', () => {
      const emailRows: EmailRow[] = [
        {
          id: 'email1',
          user_id: 'user1',
          message_id: 'msg1',
          subject: 'Subject 1',
          sender: 'sender1@example.com',
          recipients: '["recipient1@example.com"]',
          content: 'Content 1',
          received_at: '2023-01-01T00:00:00.000Z',
          indexed_at: '2023-01-01T00:00:00.000Z',
          importance: 'important',
          user_labeled: 1,
          has_attachments: 0,
          labels: '["inbox"]'
        },
        {
          id: 'email2',
          user_id: 'user1',
          message_id: 'msg2',
          subject: 'Subject 2',
          sender: 'sender2@example.com',
          recipients: '["recipient2@example.com"]',
          content: 'Content 2',
          received_at: '2023-01-02T00:00:00.000Z',
          indexed_at: '2023-01-02T00:00:00.000Z',
          importance: 'not_important',
          user_labeled: 0,
          has_attachments: 1,
          labels: '["spam"]'
        }
      ];

      const result = transformEmailRows(emailRows);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('email1');
      expect(result[0].importance).toBe('important');
      expect(result[0].userLabeled).toBe(true);
      expect(result[1].id).toBe('email2');
      expect(result[1].importance).toBe('not_important');
      expect(result[1].userLabeled).toBe(false);
    });
  });
});