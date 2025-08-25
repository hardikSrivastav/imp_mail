import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { runMigrations, rollbackMigration, migrations } from '../../database/migrations';
import { promises as fs } from 'fs';
import path from 'path';

describe('Database Migrations', () => {
  let db: Database;
  let testDbPath: string;

  beforeEach(async () => {
    // Create a temporary database for testing
    testDbPath = path.join(__dirname, `test_${Date.now()}.db`);
    db = await open({
      filename: testDbPath,
      driver: sqlite3.Database
    });
    
    // Enable foreign keys for testing
    await db.exec('PRAGMA foreign_keys = ON;');
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
    
    // Clean up test database file
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('runMigrations', () => {
    it('should run all migrations successfully', async () => {
      await runMigrations(db);

      // Check that migration history table exists and has all migrations
      const migrationHistory = await db.all('SELECT * FROM migration_history ORDER BY version');
      expect(migrationHistory).toHaveLength(migrations.length);

      // Verify each migration was recorded
      migrations.forEach((migration, index) => {
        expect(migrationHistory[index].version).toBe(migration.version);
        expect(migrationHistory[index].name).toBe(migration.name);
        expect(migrationHistory[index].applied_at).toBeDefined();
      });
    });

    it('should create all required tables', async () => {
      await runMigrations(db);

      // Check that all tables exist
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      
      const tableNames = tables.map(t => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('emails');
      expect(tableNames).toContain('emails_fts');
      expect(tableNames).toContain('training_examples');
      expect(tableNames).toContain('sync_state');
      expect(tableNames).toContain('migration_history');
    });

    it('should create proper indexes', async () => {
      await runMigrations(db);

      // Check that indexes exist
      const indexes = await db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
      );
      
      const indexNames = indexes.map(i => i.name);
      expect(indexNames).toContain('idx_users_email');
      expect(indexNames).toContain('idx_emails_user_id');
      expect(indexNames).toContain('idx_emails_message_id');
      expect(indexNames).toContain('idx_training_examples_user_id');
      expect(indexNames).toContain('idx_sync_state_last_sync_at');
    });

    it('should not run migrations twice', async () => {
      // Run migrations first time
      await runMigrations(db);
      const firstRun = await db.all('SELECT * FROM migration_history');

      // Run migrations second time
      await runMigrations(db);
      const secondRun = await db.all('SELECT * FROM migration_history');

      // Should have same number of records
      expect(secondRun).toHaveLength(firstRun.length);
    });

    it('should handle migration failures gracefully', async () => {
      // Create a migration that will fail
      const failingMigration = {
        version: 999,
        name: 'failing_migration',
        up: async (db: Database) => {
          throw new Error('Intentional failure');
        },
        down: async (db: Database) => {
          // Do nothing
        }
      };

      // Add failing migration temporarily
      const originalMigrations = [...migrations];
      migrations.push(failingMigration);

      try {
        await expect(runMigrations(db)).rejects.toThrow('Intentional failure');
        
        // Check that the failing migration was not recorded
        const migrationHistory = await db.all('SELECT * FROM migration_history WHERE version = 999');
        expect(migrationHistory).toHaveLength(0);
      } finally {
        // Restore original migrations
        migrations.length = originalMigrations.length;
      }
    });
  });

  describe('rollbackMigration', () => {
    beforeEach(async () => {
      // Run all migrations first
      await runMigrations(db);
    });

    it('should rollback to specified version', async () => {
      const targetVersion = 2;
      await rollbackMigration(db, targetVersion);

      // Check migration history - migration_history table (version 5) should remain
      const migrationHistory = await db.all('SELECT * FROM migration_history ORDER BY version');
      expect(migrationHistory).toHaveLength(targetVersion + 1); // +1 for migration_history table (5) which doesn't get rolled back

      // Check that rolled back tables don't exist
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      );
      const tableNames = tables.map(t => t.name);
      
      // Tables from migrations > targetVersion (but not migration_history) should not exist
      expect(tableNames).not.toContain('training_examples');
      expect(tableNames).not.toContain('sync_state');
      expect(tableNames).toContain('migration_history'); // Should still exist
    });

    it('should not rollback if target version is current or higher', async () => {
      const currentVersion = Math.max(...migrations.map(m => m.version));
      
      // Should not throw and should not change anything
      await rollbackMigration(db, currentVersion);
      
      const migrationHistory = await db.all('SELECT * FROM migration_history');
      expect(migrationHistory).toHaveLength(migrations.length);
    });
  });

  describe('Table Constraints', () => {
    beforeEach(async () => {
      await runMigrations(db);
    });

    it('should enforce email domain constraint on users table', async () => {
      // Valid email should work
      await expect(
        db.run(
          'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['user1', 'test@ashoka.edu.in', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
        )
      ).resolves.toBeDefined();

      // Invalid email should fail
      await expect(
        db.run(
          'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['user2', 'test@gmail.com', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
        )
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      // Insert a user first
      await db.run(
        'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['user1', 'test@ashoka.edu.in', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
      );

      // Email with valid user_id should work
      await expect(
        db.run(
          'INSERT INTO emails (id, user_id, message_id, subject, sender, recipients, content, received_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ['email1', 'user1', 'msg1', 'Subject', 'sender@test.com', '[]', 'Content', '2023-01-01', '2023-01-01']
        )
      ).resolves.toBeDefined();

      // Email with invalid user_id should fail
      await expect(
        db.run(
          'INSERT INTO emails (id, user_id, message_id, subject, sender, recipients, content, received_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ['email2', 'nonexistent', 'msg2', 'Subject', 'sender@test.com', '[]', 'Content', '2023-01-01', '2023-01-01']
        )
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      // Insert a user
      await db.run(
        'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['user1', 'test@ashoka.edu.in', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
      );

      // Duplicate email should fail
      await expect(
        db.run(
          'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ['user2', 'test@ashoka.edu.in', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
        )
      ).rejects.toThrow();

      // Insert an email
      await db.run(
        'INSERT INTO emails (id, user_id, message_id, subject, sender, recipients, content, received_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['email1', 'user1', 'msg1', 'Subject', 'sender@test.com', '[]', 'Content', '2023-01-01', '2023-01-01']
      );

      // Duplicate user_id + message_id should fail
      await expect(
        db.run(
          'INSERT INTO emails (id, user_id, message_id, subject, sender, recipients, content, received_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ['email2', 'user1', 'msg1', 'Subject2', 'sender2@test.com', '[]', 'Content2', '2023-01-01', '2023-01-01']
        )
      ).rejects.toThrow();
    });
  });

  describe('Full-Text Search', () => {
    beforeEach(async () => {
      await runMigrations(db);
      
      // Insert test user and email
      await db.run(
        'INSERT INTO users (id, email, created_at, last_login_at, oauth_access_token, oauth_refresh_token, oauth_expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['user1', 'test@ashoka.edu.in', '2023-01-01', '2023-01-01', 'token', 'refresh', '2023-01-02']
      );
      
      await db.run(
        'INSERT INTO emails (id, user_id, message_id, subject, sender, recipients, content, received_at, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['email1', 'user1', 'msg1', 'Important Meeting', 'boss@company.com', '[]', 'Please attend the quarterly review meeting', '2023-01-01', '2023-01-01']
      );
    });

    it('should create FTS entries when emails are inserted', async () => {
      const ftsResults = await db.all('SELECT * FROM emails_fts');
      expect(ftsResults).toHaveLength(1);
      expect(ftsResults[0].subject).toBe('Important Meeting');
    });

    it('should support full-text search', async () => {
      const searchResults = await db.all(
        'SELECT * FROM emails_fts WHERE emails_fts MATCH ?',
        ['meeting']
      );
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe('email1');
    });

    it('should update FTS entries when emails are updated', async () => {
      await db.run(
        'UPDATE emails SET subject = ? WHERE id = ?',
        ['Updated Subject', 'email1']
      );

      const ftsResults = await db.all('SELECT * FROM emails_fts WHERE id = ?', ['email1']);
      expect(ftsResults[0].subject).toBe('Updated Subject');
    });

    it('should remove FTS entries when emails are deleted', async () => {
      await db.run('DELETE FROM emails WHERE id = ?', ['email1']);

      const ftsResults = await db.all('SELECT * FROM emails_fts WHERE id = ?', ['email1']);
      expect(ftsResults).toHaveLength(0);
    });
  });
});