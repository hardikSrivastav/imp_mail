import { Database } from 'sqlite';

/**
 * Database migration scripts for SQLite schema creation
 */

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'create_users_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL,
          last_login_at TEXT NOT NULL,
          auto_classify INTEGER DEFAULT 1,
          confidence_threshold REAL DEFAULT 0.7,
          CONSTRAINT email_domain_check CHECK (email LIKE '%@ashoka.edu.in')
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TABLE IF EXISTS users;');
    }
  },

  {
    version: 2,
    name: 'create_emails_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS emails (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          sender TEXT NOT NULL,
          recipients TEXT NOT NULL, -- JSON array
          content TEXT NOT NULL,
          html_content TEXT,
          received_at TEXT NOT NULL,
          indexed_at TEXT NOT NULL,
          importance TEXT DEFAULT 'unclassified' CHECK (importance IN ('important', 'not_important', 'unclassified')),
          importance_confidence REAL,
          user_labeled INTEGER DEFAULT 0,
          vector_id TEXT,
          has_attachments INTEGER DEFAULT 0,
          thread_id TEXT,
          labels TEXT DEFAULT '[]', -- JSON array
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_emails_user_id ON emails(user_id);
        CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
        CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
        CREATE INDEX IF NOT EXISTS idx_emails_importance ON emails(importance);
        CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
        CREATE INDEX IF NOT EXISTS idx_emails_user_importance ON emails(user_id, importance);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_message ON emails(user_id, message_id);
      `);

      // Create full-text search index
      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS emails_fts USING fts5(
          id UNINDEXED,
          subject,
          sender,
          content,
          content='emails',
          content_rowid='rowid'
        );
      `);

      // Create triggers to maintain FTS index
      await db.exec(`
        CREATE TRIGGER IF NOT EXISTS emails_fts_insert AFTER INSERT ON emails BEGIN
          INSERT INTO emails_fts(id, subject, sender, content) 
          VALUES (new.id, new.subject, new.sender, new.content);
        END;
      `);

      await db.exec(`
        CREATE TRIGGER IF NOT EXISTS emails_fts_delete AFTER DELETE ON emails BEGIN
          DELETE FROM emails_fts WHERE id = old.id;
        END;
      `);

      await db.exec(`
        CREATE TRIGGER IF NOT EXISTS emails_fts_update AFTER UPDATE ON emails BEGIN
          DELETE FROM emails_fts WHERE id = old.id;
          INSERT INTO emails_fts(id, subject, sender, content) 
          VALUES (new.id, new.subject, new.sender, new.content);
        END;
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TRIGGER IF EXISTS emails_fts_update;');
      await db.exec('DROP TRIGGER IF EXISTS emails_fts_delete;');
      await db.exec('DROP TRIGGER IF EXISTS emails_fts_insert;');
      await db.exec('DROP TABLE IF EXISTS emails_fts;');
      await db.exec('DROP TABLE IF EXISTS emails;');
    }
  },

  {
    version: 3,
    name: 'create_training_examples_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS training_examples (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          email_id TEXT NOT NULL,
          importance TEXT NOT NULL CHECK (importance IN ('important', 'not_important')),
          created_at TEXT NOT NULL,
          subject TEXT NOT NULL,
          sender TEXT NOT NULL,
          content TEXT NOT NULL,
          has_attachments INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_training_examples_user_id ON training_examples(user_id);
        CREATE INDEX IF NOT EXISTS idx_training_examples_email_id ON training_examples(email_id);
        CREATE INDEX IF NOT EXISTS idx_training_examples_importance ON training_examples(importance);
        CREATE INDEX IF NOT EXISTS idx_training_examples_created_at ON training_examples(created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_training_examples_user_email ON training_examples(user_id, email_id);
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TABLE IF EXISTS training_examples;');
    }
  },

  {
    version: 4,
    name: 'create_sync_state_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS sync_state (
          user_id TEXT PRIMARY KEY,
          last_sync_at TEXT NOT NULL,
          last_message_id TEXT,
          total_emails_indexed INTEGER DEFAULT 0,
          is_initial_sync_complete INTEGER DEFAULT 0,
          current_sync_status TEXT DEFAULT 'idle' CHECK (current_sync_status IN ('idle', 'syncing', 'error')),
          last_error TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_sync_state_last_sync_at ON sync_state(last_sync_at);
        CREATE INDEX IF NOT EXISTS idx_sync_state_status ON sync_state(current_sync_status);
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TABLE IF EXISTS sync_state;');
    }
  },

  {
    version: 5,
    name: 'create_oauth_tokens_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          user_id TEXT PRIMARY KEY,
          encrypted_access_token TEXT NOT NULL,
          encrypted_refresh_token TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires_at ON oauth_tokens(expires_at);
        CREATE INDEX IF NOT EXISTS idx_oauth_tokens_updated_at ON oauth_tokens(updated_at);
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TABLE IF EXISTS oauth_tokens;');
    }
  },

  {
    version: 6,
    name: 'create_migration_history_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS migration_history (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);
    },
    down: async (db: Database) => {
      // Don't drop migration_history table as it's needed for tracking
      // This migration should not be rolled back
    }
  },

  {
    version: 7,
    name: 'create_user_expectations_table',
    up: async (db: Database) => {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_expectations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          important_examples TEXT DEFAULT '[]', -- JSON array
          not_important_examples TEXT DEFAULT '[]', -- JSON array
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `);

      // Create indexes for performance
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_expectations_user_id ON user_expectations(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_expectations_is_active ON user_expectations(is_active);
        CREATE INDEX IF NOT EXISTS idx_user_expectations_created_at ON user_expectations(created_at);
        CREATE INDEX IF NOT EXISTS idx_user_expectations_user_active ON user_expectations(user_id, is_active);
      `);
    },
    down: async (db: Database) => {
      await db.exec('DROP TABLE IF EXISTS user_expectations;');
    }
  }
];

export async function runMigrations(db: Database): Promise<void> {
  console.log('🔄 Running database migrations...');

  // Ensure migration history table exists first
  const migrationHistoryMigration = migrations.find(m => m.name === 'create_migration_history_table');
  if (migrationHistoryMigration) {
    await migrationHistoryMigration.up(db);
  }

  // Get current migration version
  const currentVersionResult = await db.get(
    'SELECT MAX(version) as version FROM migration_history'
  );
  const currentVersion = currentVersionResult?.version || 0;

  // Run pending migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`🔄 Running migration ${migration.version}: ${migration.name}`);
      
      try {
        await db.exec('BEGIN TRANSACTION;');
        await migration.up(db);
        
        // Record migration in history
        await db.run(
          'INSERT INTO migration_history (version, name, applied_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, new Date().toISOString()]
        );
        
        await db.exec('COMMIT;');
        console.log(`✅ Migration ${migration.version} completed successfully`);
      } catch (error) {
        await db.exec('ROLLBACK;');
        console.error(`❌ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }
  }

  console.log('✅ All migrations completed successfully');
}

export async function rollbackMigration(db: Database, targetVersion: number): Promise<void> {
  console.log(`🔄 Rolling back to migration version ${targetVersion}...`);

  // Get current migration version
  const currentVersionResult = await db.get(
    'SELECT MAX(version) as version FROM migration_history'
  );
  const currentVersion = currentVersionResult?.version || 0;

  if (targetVersion >= currentVersion) {
    console.log('No rollback needed - target version is current or higher');
    return;
  }

  // Rollback migrations in reverse order, but skip migration_history table (version 6)
  const migrationsToRollback = migrations
    .filter(m => m.version > targetVersion && m.version <= currentVersion && m.version !== 6)
    .sort((a, b) => b.version - a.version);

  for (const migration of migrationsToRollback) {
    console.log(`🔄 Rolling back migration ${migration.version}: ${migration.name}`);
    
    try {
      await db.exec('BEGIN TRANSACTION;');
      await migration.down(db);
      
      // Remove migration from history
      await db.run(
        'DELETE FROM migration_history WHERE version = ?',
        [migration.version]
      );
      
      await db.exec('COMMIT;');
      console.log(`✅ Migration ${migration.version} rolled back successfully`);
    } catch (error) {
      await db.exec('ROLLBACK;');
      console.error(`❌ Rollback of migration ${migration.version} failed:`, error);
      throw error;
    }
  }

  console.log(`✅ Rollback to version ${targetVersion} completed successfully`);
}