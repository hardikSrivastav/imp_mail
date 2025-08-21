import { UserExpectationsManager } from '../../../services/ml/UserExpectationsManager';
import { initializeDatabase, closeDatabase } from '../../../config/database';
import { v4 as uuidv4 } from 'uuid';

describe('UserExpectationsManager', () => {
  let manager: UserExpectationsManager;
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
    manager = new UserExpectationsManager();
    testUserId = uuidv4();
    
    // Create a test user to satisfy foreign key constraint
    const db = await import('../../../config/database').then(m => m.getDatabase());
    await db.run(`
      INSERT INTO users (id, email, created_at, last_login_at, auto_classify, confidence_threshold)
      VALUES (?, ?, ?, ?, 1, 0.7)
    `, [testUserId, `test-${testUserId}@ashoka.edu.in`, new Date().toISOString(), new Date().toISOString()]);
  });

  describe('createExpectations', () => {
    it('should create new expectations successfully', async () => {
      const title = 'Work Emails';
      const description = 'Emails related to work projects and meetings are important';
      const examples = {
        important: ['Project updates', 'Meeting invitations'],
        notImportant: ['Newsletter subscriptions', 'Promotional emails']
      };

      const expectations = await manager.createExpectations(testUserId, title, description, examples);

      expect(expectations.id).toBeDefined();
      expect(expectations.userId).toBe(testUserId);
      expect(expectations.title).toBe(title);
      expect(expectations.description).toBe(description);
      expect(expectations.isActive).toBe(true);
      expect(expectations.examples?.important).toEqual(examples.important);
      expect(expectations.examples?.notImportant).toEqual(examples.notImportant);
      expect(expectations.createdAt).toBeInstanceOf(Date);
      expect(expectations.updatedAt).toBeInstanceOf(Date);
    });

    it('should create expectations without examples', async () => {
      const title = 'Simple Filter';
      const description = 'Only important work emails';

      const expectations = await manager.createExpectations(testUserId, title, description);

      expect(expectations.examples?.important).toEqual([]);
      expect(expectations.examples?.notImportant).toEqual([]);
    });

    it('should deactivate existing expectations when creating new ones', async () => {
      // Create first expectations
      const first = await manager.createExpectations(testUserId, 'First', 'First description');
      expect(first.isActive).toBe(true);

      // Create second expectations
      const second = await manager.createExpectations(testUserId, 'Second', 'Second description');
      expect(second.isActive).toBe(true);

      // First should now be inactive
      const updatedFirst = await manager.getExpectationsById(first.id);
      expect(updatedFirst.isActive).toBe(false);
    });

    it('should validate title is required', async () => {
      await expect(
        manager.createExpectations(testUserId, '', 'Description')
      ).rejects.toThrow('Title is required and cannot be empty');
    });

    it('should validate title length', async () => {
      const longTitle = 'a'.repeat(201);
      await expect(
        manager.createExpectations(testUserId, longTitle, 'Description')
      ).rejects.toThrow('Title cannot exceed 200 characters');
    });

    it('should validate description is required', async () => {
      await expect(
        manager.createExpectations(testUserId, 'Title', '')
      ).rejects.toThrow('Description is required and cannot be empty');
    });

    it('should validate description length', async () => {
      const longDescription = 'a'.repeat(2001);
      await expect(
        manager.createExpectations(testUserId, 'Title', longDescription)
      ).rejects.toThrow('Description cannot exceed 2000 characters');
    });

    it('should validate examples format', async () => {
      await expect(
        manager.createExpectations(testUserId, 'Title', 'Description', {
          important: 'not an array' as any,
          notImportant: []
        })
      ).rejects.toThrow('Important examples must be an array');
    });

    it('should validate maximum number of examples', async () => {
      const tooManyExamples = Array(11).fill('example');
      await expect(
        manager.createExpectations(testUserId, 'Title', 'Description', {
          important: tooManyExamples,
          notImportant: []
        })
      ).rejects.toThrow('Cannot have more than 10 important examples');
    });

    it('should validate example length', async () => {
      const longExample = 'a'.repeat(501);
      await expect(
        manager.createExpectations(testUserId, 'Title', 'Description', {
          important: [longExample],
          notImportant: []
        })
      ).rejects.toThrow('Each important example must be a string with max 500 characters');
    });
  });

  describe('getActiveExpectations', () => {
    it('should return active expectations for user', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      const active = await manager.getActiveExpectations(testUserId);

      expect(active).not.toBeNull();
      expect(active!.id).toBe(created.id);
      expect(active!.isActive).toBe(true);
    });

    it('should return null when no active expectations exist', async () => {
      const active = await manager.getActiveExpectations(testUserId);
      expect(active).toBeNull();
    });

    it('should return most recent active expectations', async () => {
      // Create first expectations and deactivate
      const first = await manager.createExpectations(testUserId, 'First', 'First description');
      await manager.deactivateExpectations(first.id);

      // Create second expectations (should be active)
      const second = await manager.createExpectations(testUserId, 'Second', 'Second description');

      const active = await manager.getActiveExpectations(testUserId);
      expect(active!.id).toBe(second.id);
    });
  });

  describe('getExpectationsById', () => {
    it('should return expectations by ID', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      const retrieved = await manager.getExpectationsById(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.title).toBe(created.title);
    });

    it('should throw error for non-existent ID', async () => {
      const nonExistentId = uuidv4();
      await expect(
        manager.getExpectationsById(nonExistentId)
      ).rejects.toThrow(`User expectations not found with id: ${nonExistentId}`);
    });
  });

  describe('getAllExpectationsForUser', () => {
    it('should return all expectations for user in chronological order', async () => {
      const first = await manager.createExpectations(testUserId, 'First', 'First description');
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const second = await manager.createExpectations(testUserId, 'Second', 'Second description');

      const all = await manager.getAllExpectationsForUser(testUserId);

      expect(all).toHaveLength(2);
      expect(all[0].id).toBe(second.id); // Most recent first
      expect(all[1].id).toBe(first.id);
    });

    it('should return empty array for user with no expectations', async () => {
      const all = await manager.getAllExpectationsForUser(testUserId);
      expect(all).toEqual([]);
    });
  });

  describe('updateExpectations', () => {
    it('should update title and description', async () => {
      const created = await manager.createExpectations(testUserId, 'Original Title', 'Original Description');
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const updated = await manager.updateExpectations(created.id, {
        title: 'Updated Title',
        description: 'Updated Description'
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.description).toBe('Updated Description');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
    });

    it('should update examples', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      
      const newExamples = {
        important: ['New important example'],
        notImportant: ['New not important example']
      };

      const updated = await manager.updateExpectations(created.id, {
        examples: newExamples
      });

      expect(updated.examples?.important).toEqual(newExamples.important);
      expect(updated.examples?.notImportant).toEqual(newExamples.notImportant);
    });

    it('should validate updated inputs', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      
      await expect(
        manager.updateExpectations(created.id, { title: '' })
      ).rejects.toThrow('Title is required and cannot be empty');
    });

    it('should throw error for non-existent ID', async () => {
      const nonExistentId = uuidv4();
      await expect(
        manager.updateExpectations(nonExistentId, { title: 'New Title' })
      ).rejects.toThrow(`User expectations not found with id: ${nonExistentId}`);
    });
  });

  describe('activateExpectations', () => {
    it('should activate specific expectations and deactivate others', async () => {
      const first = await manager.createExpectations(testUserId, 'First', 'First description');
      const second = await manager.createExpectations(testUserId, 'Second', 'Second description');

      // Second should be active, first should be inactive
      expect((await manager.getExpectationsById(first.id)).isActive).toBe(false);
      expect((await manager.getExpectationsById(second.id)).isActive).toBe(true);

      // Activate first
      await manager.activateExpectations(first.id);

      // Now first should be active, second should be inactive
      expect((await manager.getExpectationsById(first.id)).isActive).toBe(true);
      expect((await manager.getExpectationsById(second.id)).isActive).toBe(false);
    });
  });

  describe('deactivateExpectations', () => {
    it('should deactivate expectations', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      expect(created.isActive).toBe(true);

      const deactivated = await manager.deactivateExpectations(created.id);
      expect(deactivated.isActive).toBe(false);
    });
  });

  describe('deleteExpectations', () => {
    it('should delete expectations', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      
      await manager.deleteExpectations(created.id);

      await expect(
        manager.getExpectationsById(created.id)
      ).rejects.toThrow(`User expectations not found with id: ${created.id}`);
    });

    it('should throw error for non-existent ID', async () => {
      const nonExistentId = uuidv4();
      await expect(
        manager.deleteExpectations(nonExistentId)
      ).rejects.toThrow(`User expectations not found with id: ${nonExistentId}`);
    });
  });

  describe('hasExpectations', () => {
    it('should return true when user has expectations', async () => {
      await manager.createExpectations(testUserId, 'Title', 'Description');
      const hasExpectations = await manager.hasExpectations(testUserId);
      expect(hasExpectations).toBe(true);
    });

    it('should return false when user has no expectations', async () => {
      const hasExpectations = await manager.hasExpectations(testUserId);
      expect(hasExpectations).toBe(false);
    });

    it('should return true even for inactive expectations', async () => {
      const created = await manager.createExpectations(testUserId, 'Title', 'Description');
      await manager.deactivateExpectations(created.id);
      
      const hasExpectations = await manager.hasExpectations(testUserId);
      expect(hasExpectations).toBe(true);
    });
  });
});