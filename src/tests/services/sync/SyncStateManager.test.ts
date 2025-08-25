import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Database, open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { SyncStateManager } from '../../../services/sync/SyncStateManager';
import { runMigrations } from '../../../database/migrations';

describe('SyncStateManager', () => {
  let db: Database;
  let syncStateManager: SyncStateManager;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Run migrations to set up schema
    await runMigrations(db);

    // Create test user
    await db.run(
      `INSERT INTO users (id, email, created_at, last_login_at) 
       VALUES ('test-user-1', 'test@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
    );

    syncStateManager = new SyncStateManager(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('createSyncState', () => {
    it('should create initial sync state for a new user', async () => {
      const syncState = await syncStateManager.createSyncState('test-user-1');

      expect(syncState.userId).toBe('test-user-1');
      expect(syncState.totalEmailsIndexed).toBe(0);
      expect(syncState.isInitialSyncComplete).toBe(false);
      expect(syncState.currentSyncStatus).toBe('idle');
      expect(syncState.lastMessageId).toBeUndefined();
      expect(syncState.lastError).toBeUndefined();
      expect(syncState.lastSyncAt).toBeInstanceOf(Date);
    });

    it('should persist sync state to database', async () => {
      await syncStateManager.createSyncState('test-user-1');

      const row = await db.get(
        'SELECT * FROM sync_state WHERE user_id = ?',
        ['test-user-1']
      );

      expect(row).toBeDefined();
      expect(row.user_id).toBe('test-user-1');
      expect(row.total_emails_indexed).toBe(0);
      expect(row.is_initial_sync_complete).toBe(0);
      expect(row.current_sync_status).toBe('idle');
    });
  });

  describe('getSyncState', () => {
    it('should return null for non-existent user', async () => {
      const syncState = await syncStateManager.getSyncState('non-existent-user');
      expect(syncState).toBeNull();
    });

    it('should return sync state for existing user', async () => {
      await syncStateManager.createSyncState('test-user-1');
      const syncState = await syncStateManager.getSyncState('test-user-1');

      expect(syncState).toBeDefined();
      expect(syncState!.userId).toBe('test-user-1');
      expect(syncState!.totalEmailsIndexed).toBe(0);
      expect(syncState!.isInitialSyncComplete).toBe(false);
      expect(syncState!.currentSyncStatus).toBe('idle');
    });

    it('should correctly convert database row to model', async () => {
      // Insert test data directly
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO sync_state (
          user_id, last_sync_at, last_message_id, total_emails_indexed,
          is_initial_sync_complete, current_sync_status, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['test-user-1', now, 'msg-123', 50, 1, 'syncing', 'Test error']
      );

      const syncState = await syncStateManager.getSyncState('test-user-1');

      expect(syncState).toBeDefined();
      expect(syncState!.userId).toBe('test-user-1');
      expect(syncState!.lastMessageId).toBe('msg-123');
      expect(syncState!.totalEmailsIndexed).toBe(50);
      expect(syncState!.isInitialSyncComplete).toBe(true);
      expect(syncState!.currentSyncStatus).toBe('syncing');
      expect(syncState!.lastError).toBe('Test error');
      expect(syncState!.lastSyncAt).toBeInstanceOf(Date);
    });
  });

  describe('updateSyncState', () => {
    it('should update all sync state fields', async () => {
      const originalState = await syncStateManager.createSyncState('test-user-1');
      
      const updatedState = {
        ...originalState,
        lastMessageId: 'msg-456',
        totalEmailsIndexed: 100,
        isInitialSyncComplete: true,
        currentSyncStatus: 'syncing' as const,
        lastError: 'Updated error'
      };

      await syncStateManager.updateSyncState(updatedState);

      const retrievedState = await syncStateManager.getSyncState('test-user-1');
      expect(retrievedState!.lastMessageId).toBe('msg-456');
      expect(retrievedState!.totalEmailsIndexed).toBe(100);
      expect(retrievedState!.isInitialSyncComplete).toBe(true);
      expect(retrievedState!.currentSyncStatus).toBe('syncing');
      expect(retrievedState!.lastError).toBe('Updated error');
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status and error', async () => {
      await syncStateManager.createSyncState('test-user-1');
      
      await syncStateManager.updateSyncStatus('test-user-1', 'error', 'Connection failed');

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState!.currentSyncStatus).toBe('error');
      expect(syncState!.lastError).toBe('Connection failed');
    });

    it('should clear error when status is not error', async () => {
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.updateSyncStatus('test-user-1', 'error', 'Test error');
      
      await syncStateManager.updateSyncStatus('test-user-1', 'idle');

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState!.currentSyncStatus).toBe('idle');
      expect(syncState!.lastError).toBeNull();
    });
  });

  describe('updateLastSync', () => {
    it('should update last sync timestamp and message ID', async () => {
      await syncStateManager.createSyncState('test-user-1');
      const beforeUpdate = new Date();
      
      await syncStateManager.updateLastSync('test-user-1', 'msg-789', 25);

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState!.lastMessageId).toBe('msg-789');
      expect(syncState!.totalEmailsIndexed).toBe(25);
      expect(syncState!.lastSyncAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should increment total emails indexed', async () => {
      await syncStateManager.createSyncState('test-user-1');
      
      await syncStateManager.updateLastSync('test-user-1', 'msg-1', 10);
      await syncStateManager.updateLastSync('test-user-1', 'msg-2', 15);

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState!.totalEmailsIndexed).toBe(25);
      expect(syncState!.lastMessageId).toBe('msg-2');
    });
  });

  describe('markInitialSyncComplete', () => {
    it('should mark initial sync as complete and set status to idle', async () => {
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.updateSyncStatus('test-user-1', 'syncing');
      
      await syncStateManager.markInitialSyncComplete('test-user-1');

      const syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState!.isInitialSyncComplete).toBe(true);
      expect(syncState!.currentSyncStatus).toBe('idle');
    });
  });

  describe('getUsersNeedingSync', () => {
    it('should return users that need sync based on time threshold', async () => {
      // Create users with different sync times
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.createSyncState('test-user-2');
      
      // Add another user to database
      await db.run(
        `INSERT INTO users (id, email, created_at, last_login_at) 
         VALUES ('test-user-2', 'test2@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
      );

      // Update one user's sync time to be old
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      await db.run(
        'UPDATE sync_state SET last_sync_at = ? WHERE user_id = ?',
        [oldTime, 'test-user-1']
      );

      const usersNeedingSync = await syncStateManager.getUsersNeedingSync(5);
      expect(usersNeedingSync).toContain('test-user-1');
      expect(usersNeedingSync).not.toContain('test-user-2');
    });

    it('should not return users currently syncing', async () => {
      await syncStateManager.createSyncState('test-user-1');
      
      // Set old sync time but status as syncing
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await db.run(
        `UPDATE sync_state SET last_sync_at = ?, current_sync_status = 'syncing' 
         WHERE user_id = ?`,
        [oldTime, 'test-user-1']
      );

      const usersNeedingSync = await syncStateManager.getUsersNeedingSync(5);
      expect(usersNeedingSync).not.toContain('test-user-1');
    });
  });

  describe('getUsersWithSyncErrors', () => {
    it('should return users with sync errors', async () => {
      await syncStateManager.createSyncState('test-user-1');
      await syncStateManager.updateSyncStatus('test-user-1', 'error', 'Test error message');

      const usersWithErrors = await syncStateManager.getUsersWithSyncErrors();
      
      expect(usersWithErrors).toHaveLength(1);
      expect(usersWithErrors[0].userId).toBe('test-user-1');
      expect(usersWithErrors[0].lastError).toBe('Test error message');
    });

    it('should not return users without errors', async () => {
      await syncStateManager.createSyncState('test-user-1');
      
      const usersWithErrors = await syncStateManager.getUsersWithSyncErrors();
      expect(usersWithErrors).toHaveLength(0);
    });
  });

  describe('getSyncStatistics', () => {
    it('should return correct statistics', async () => {
      // Create multiple users with different states
      await syncStateManager.createSyncState('test-user-1');
      
      await db.run(
        `INSERT INTO users (id, email, created_at, last_login_at) 
         VALUES ('test-user-2', 'test2@ashoka.edu.in', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`
      );
      await syncStateManager.createSyncState('test-user-2');

      // Set different states
      await syncStateManager.markInitialSyncComplete('test-user-1');
      await syncStateManager.updateLastSync('test-user-1', 'msg-1', 50);
      await syncStateManager.updateSyncStatus('test-user-2', 'error', 'Test error');
      await syncStateManager.updateLastSync('test-user-2', 'msg-2', 25);

      const stats = await syncStateManager.getSyncStatistics();
      
      expect(stats.totalUsers).toBe(2);
      expect(stats.usersWithCompletedInitialSync).toBe(1);
      expect(stats.usersCurrentlySyncing).toBe(0);
      expect(stats.usersWithErrors).toBe(1);
      expect(stats.totalEmailsIndexed).toBe(75);
    });

    it('should return zero statistics for empty database', async () => {
      const stats = await syncStateManager.getSyncStatistics();
      
      expect(stats.totalUsers).toBe(0);
      expect(stats.usersWithCompletedInitialSync).toBe(0);
      expect(stats.usersCurrentlySyncing).toBe(0);
      expect(stats.usersWithErrors).toBe(0);
      expect(stats.totalEmailsIndexed).toBe(0);
    });
  });

  describe('deleteSyncState', () => {
    it('should delete sync state for a user', async () => {
      await syncStateManager.createSyncState('test-user-1');
      
      let syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState).toBeDefined();

      await syncStateManager.deleteSyncState('test-user-1');
      
      syncState = await syncStateManager.getSyncState('test-user-1');
      expect(syncState).toBeNull();
    });

    it('should not throw error for non-existent user', async () => {
      await expect(
        syncStateManager.deleteSyncState('non-existent-user')
      ).resolves.not.toThrow();
    });
  });
});