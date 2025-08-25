import { Database } from 'sqlite';
import { SyncState, SyncStateRow } from '../../types/models';

/**
 * SyncStateManager handles tracking of email indexing progress and timestamps
 * for each user. It provides operations to store and retrieve sync state information.
 */
export class SyncStateManager {
  constructor(private db: Database) {}

  /**
   * Get sync state for a user
   */
  async getSyncState(userId: string): Promise<SyncState | null> {
    const row = await this.db.get<SyncStateRow>(
      'SELECT * FROM sync_state WHERE user_id = ?',
      [userId]
    );

    if (!row) {
      return null;
    }

    return this.rowToSyncState(row);
  }

  /**
   * Create initial sync state for a new user
   */
  async createSyncState(userId: string): Promise<SyncState> {
    const now = new Date().toISOString();
    
    const syncState: SyncState = {
      userId,
      lastSyncAt: new Date(now),
      lastMessageId: undefined,
      totalEmailsIndexed: 0,
      isInitialSyncComplete: false,
      currentSyncStatus: 'idle',
      lastError: undefined
    };

    await this.db.run(
      `INSERT INTO sync_state (
        user_id, last_sync_at, last_message_id, total_emails_indexed,
        is_initial_sync_complete, current_sync_status, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        syncState.userId,
        now,
        syncState.lastMessageId,
        syncState.totalEmailsIndexed,
        syncState.isInitialSyncComplete ? 1 : 0,
        syncState.currentSyncStatus,
        syncState.lastError
      ]
    );

    return syncState;
  }

  /**
   * Update sync state for a user
   */
  async updateSyncState(syncState: SyncState): Promise<void> {
    await this.db.run(
      `UPDATE sync_state SET
        last_sync_at = ?,
        last_message_id = ?,
        total_emails_indexed = ?,
        is_initial_sync_complete = ?,
        current_sync_status = ?,
        last_error = ?
      WHERE user_id = ?`,
      [
        syncState.lastSyncAt.toISOString(),
        syncState.lastMessageId,
        syncState.totalEmailsIndexed,
        syncState.isInitialSyncComplete ? 1 : 0,
        syncState.currentSyncStatus,
        syncState.lastError,
        syncState.userId
      ]
    );
  }

  /**
   * Update sync status for a user
   */
  async updateSyncStatus(
    userId: string, 
    status: 'idle' | 'syncing' | 'error',
    error?: string
  ): Promise<void> {
    await this.db.run(
      `UPDATE sync_state SET
        current_sync_status = ?,
        last_error = ?
      WHERE user_id = ?`,
      [status, error, userId]
    );
  }

  /**
   * Try to acquire a sync "lock" by setting status to 'syncing' only if not already syncing.
   * Returns true if the lock was acquired.
   */
  async tryAcquireSyncLock(userId: string): Promise<boolean> {
    const result = await this.db.run(
      `UPDATE sync_state SET current_sync_status = 'syncing', last_error = NULL
       WHERE user_id = ? AND current_sync_status != 'syncing'`,
      [userId]
    );
    // sqlite run returns an object with changes
    // @ts-ignore - typings may vary
    return Boolean(result && result.changes > 0);
  }

  /**
   * Update last sync timestamp and message ID
   */
  async updateLastSync(
    userId: string,
    lastMessageId?: string,
    emailsProcessed: number = 0
  ): Promise<void> {
    const now = new Date().toISOString();
    
    await this.db.run(
      `UPDATE sync_state SET
        last_sync_at = ?,
        last_message_id = ?,
        total_emails_indexed = total_emails_indexed + ?
      WHERE user_id = ?`,
      [now, lastMessageId, emailsProcessed, userId]
    );
  }

  /**
   * Mark initial sync as complete
   */
  async markInitialSyncComplete(userId: string): Promise<void> {
    await this.db.run(
      `UPDATE sync_state SET
        is_initial_sync_complete = 1,
        current_sync_status = 'idle'
      WHERE user_id = ?`,
      [userId]
    );
  }

  /**
   * Get all users that need incremental sync (last sync was more than X minutes ago)
   */
  async getUsersNeedingSync(maxMinutesSinceLastSync: number = 5): Promise<string[]> {
    const cutoffTime = new Date(Date.now() - maxMinutesSinceLastSync * 60 * 1000).toISOString();
    
    const rows = await this.db.all<{ user_id: string }[]>(
      `SELECT user_id FROM sync_state 
       WHERE current_sync_status = 'idle' 
       AND last_sync_at < ?`,
      [cutoffTime]
    );

    return (rows || []).map((row: { user_id: string }) => row.user_id);
  }

  /**
   * Get users with sync errors
   */
  async getUsersWithSyncErrors(): Promise<Array<{ userId: string; lastError: string }>> {
    const rows = await this.db.all<{ user_id: string; last_error: string }[]>(
      `SELECT user_id, last_error FROM sync_state 
       WHERE current_sync_status = 'error' 
       AND last_error IS NOT NULL`
    );

    return (rows || []).map((row: { user_id: string; last_error: string }) => ({
      userId: row.user_id,
      lastError: row.last_error
    }));
  }

  /**
   * Get sync statistics for monitoring
   */
  async getSyncStatistics(): Promise<{
    totalUsers: number;
    usersWithCompletedInitialSync: number;
    usersCurrentlySyncing: number;
    usersWithErrors: number;
    totalEmailsIndexed: number;
  }> {
    const stats = await this.db.get<{
      total_users: number;
      completed_initial_sync: number;
      currently_syncing: number;
      with_errors: number;
      total_emails: number;
    }>(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_initial_sync_complete = 1 THEN 1 ELSE 0 END) as completed_initial_sync,
        SUM(CASE WHEN current_sync_status = 'syncing' THEN 1 ELSE 0 END) as currently_syncing,
        SUM(CASE WHEN current_sync_status = 'error' THEN 1 ELSE 0 END) as with_errors,
        SUM(total_emails_indexed) as total_emails
       FROM sync_state`
    );

    return {
      totalUsers: stats?.total_users || 0,
      usersWithCompletedInitialSync: stats?.completed_initial_sync || 0,
      usersCurrentlySyncing: stats?.currently_syncing || 0,
      usersWithErrors: stats?.with_errors || 0,
      totalEmailsIndexed: stats?.total_emails || 0
    };
  }

  /**
   * Delete sync state for a user (when user is deleted)
   */
  async deleteSyncState(userId: string): Promise<void> {
    await this.db.run('DELETE FROM sync_state WHERE user_id = ?', [userId]);
  }

  /**
   * Convert database row to SyncState model
   */
  private rowToSyncState(row: SyncStateRow): SyncState {
    return {
      userId: row.user_id,
      lastSyncAt: new Date(row.last_sync_at),
      lastMessageId: row.last_message_id,
      totalEmailsIndexed: row.total_emails_indexed,
      isInitialSyncComplete: Boolean(row.is_initial_sync_complete),
      currentSyncStatus: row.current_sync_status as 'idle' | 'syncing' | 'error',
      lastError: row.last_error
    };
  }
}