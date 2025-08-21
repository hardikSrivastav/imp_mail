import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { EmailRepository } from '../../repositories/EmailRepository';
import { Email } from '../../types/models';
import { runMigrations } from '../../database/migrations';

describe('EmailRepository', () => {
  let db: Database;
  let repository: EmailRepository;

  const createMockEmail = (overrides: Partial<Email> = {}): Email => ({
    id: `email-${Date.now()}-${Math.random()}`,
    userId: 'user-1',
    messageId: `msg-${Date.now()}-${Math.random()}`,
    subject: 'Test Email',
    sender: 'sender@example.com',
    recipients: ['recipient@example.com'],
    content: 'This is a test email content',
    htmlContent: '<p>This is a test email content</p>',
    receivedAt: new Date('2024-01-01T10:00:00Z'),
    indexedAt: new Date('2024-01-01T10:05:00Z'),
    importance: 'unclassified',
    importanceConfidence: 0.5,
    userLabeled: false,
    vectorId: 'vector-1',
    metadata: {
      hasAttachments: false,
      threadId: 'thread-1',
      labels: ['inbox']
    },
    ...overrides
  });

  beforeEach(async () => {
    // Create in-memory database for testing
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Run migrations
    await runMigrations(db);

    repository = new EmailRepository();
    // Inject test database
    (repository as any).db = db;
  });

  afterEach(async () => {
    await db.close();
  });

  describe('create', () => {
    it('should create a new email record', async () => {
      const mockEmail = createMockEmail();
      await repository.create(mockEmail);

      const result = await db.get('SELECT * FROM emails WHERE id = ?', [mockEmail.id]);
      expect(result).toBeDefined();
      expect(result.subject).toBe(mockEmail.subject);
      expect(result.sender).toBe(mockEmail.sender);
    });
  });

  describe('getById', () => {
    it('should retrieve email by ID', async () => {
      const testEmail = createMockEmail();
      await repository.create(testEmail);

      const result = await repository.getById(testEmail.id);

      expect(result).toBeDefined();
      expect(result!.id).toBe(testEmail.id);
      expect(result!.subject).toBe(testEmail.subject);
    });

    it('should return null for non-existent email', async () => {
      const result = await repository.getById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('updateImportance', () => {
    it('should update email importance', async () => {
      const testEmail = createMockEmail();
      await repository.create(testEmail);

      await repository.updateImportance(testEmail.id, 'important', 0.9, true);

      const result = await repository.getById(testEmail.id);
      expect(result!.importance).toBe('important');
      expect(result!.importanceConfidence).toBe(0.9);
      expect(result!.userLabeled).toBe(true);
    });
  });

  describe('getUserEmailCount', () => {
    it('should get correct email count for user', async () => {
      const emails: Email[] = [
        createMockEmail({ userId: 'user-1' }),
        createMockEmail({ userId: 'user-1' }),
        createMockEmail({ userId: 'user-2' })
      ];

      for (const email of emails) {
        await repository.create(email);
      }

      const count = await repository.getUserEmailCount('user-1');
      expect(count).toBe(2);
    });
  });
});