import { Request, Response } from 'express';
import { IncrementalIndexer } from '../services/indexing/IncrementalIndexer';
import { FullIndexer } from '../services/indexing/FullIndexer';
import { SyncStateManager } from '../services/sync/SyncStateManager';
import { EmailRepository } from '../repositories/EmailRepository';
import { QdrantRepository } from '../repositories/QdrantRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { Database } from 'sqlite';
import { OAuthManager } from '../services/auth/OAuthManager';
import { TokenStore } from '../services/auth/TokenStore';
import { EmailFetcher } from '../services/email/EmailFetcher';
import { EmailParser } from '../services/email/EmailParser';
import { VectorEmbeddingService } from '../services/embedding/VectorEmbeddingService';
import { getDatabase } from '../config/database';

export interface TriggerSyncRequest {
  type?: 'full' | 'incremental';
  force?: boolean;
}

export interface IndexingProgressResponse {
  userId: string;
  syncState: {
    lastSyncAt: Date;
    totalEmailsIndexed: number;
    isInitialSyncComplete: boolean;
    currentSyncStatus: 'idle' | 'syncing' | 'error';
    lastError?: string;
  };
  statistics: {
    totalEmails: number;
    vectorizedEmails: number;
    indexingProgress: number;
  };
}

/**
 * IndexingController handles HTTP requests for email indexing operations
 */
export class IndexingController {
  constructor(
    private db: Database,
    private oauthManager: OAuthManager,
    private tokenStore: TokenStore,
    private emailParser: EmailParser,
    private vectorService: VectorEmbeddingService,
    private syncStateManager: SyncStateManager,
    private emailRepository: EmailRepository,
    private qdrantRepository: QdrantRepository
  ) {}

  private async createEmailFetcherForUser(userId: string): Promise<EmailFetcher> {
    const tokens = await this.tokenStore.getTokens(userId);
    if (!tokens) {
      throw new Error('No OAuth tokens found for user. Please authenticate again.');
    }
    return new EmailFetcher(this.oauthManager, tokens);
  }

  /**
   * POST /api/indexing/full - Trigger full email indexing
   */
  async triggerFullIndexing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { force = false } = req.body as { force?: boolean };

      // Check current sync state
      let syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        // Create initial sync state if it doesn't exist
        syncState = await this.syncStateManager.createSyncState(userId);
      }
      if (force) {
        await this.syncStateManager.updateSyncStatus(userId, 'syncing');
      } else {
        const acquired = await this.syncStateManager.tryAcquireSyncLock(userId);
        if (!acquired) {
          res.status(409).json({
            error: 'Indexing in progress',
            message: 'Full indexing is already in progress. Use force=true to override.'
          });
          return;
        }
      }

      // Create per-user indexer with authenticated Gmail client
      const emailFetcher = await this.createEmailFetcherForUser(userId);
      const fullIndexer = new FullIndexer(
        this.db,
        emailFetcher,
        this.emailParser,
        this.vectorService,
        this.syncStateManager
      );

      // Start full indexing (async)
      this
        .safeProcessFullIndexing(fullIndexer, userId, (progress) => {
        // Progress callback - could be used for real-time updates via WebSocket
        console.log(`Full indexing progress for ${userId}:`, progress);
        })
        .catch(error => {
          console.error(`❌ Full indexing failed for user ${userId}:`, error);
        });

      res.json({
        message: 'Full indexing started',
        userId,
        type: 'full',
        status: 'started'
      });
    } catch (error) {
      console.error('❌ Failed to trigger full indexing:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to trigger full indexing'
      });
    }
  }

  private async safeProcessFullIndexing(
    fullIndexer: FullIndexer,
    userId: string,
    progressCb?: (p: any) => void
  ) {
    return fullIndexer.processFullIndexing(userId, progressCb);
  }

  /**
   * POST /api/indexing/incremental - Trigger incremental email indexing
   */
  async triggerIncrementalIndexing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { force = false } = req.body as { force?: boolean };

      // Check current sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized. Run full indexing first.'
        });
        return;
      }

      if (force) {
        await this.syncStateManager.updateSyncStatus(userId, 'syncing');
      } else {
        const acquired = await this.syncStateManager.tryAcquireSyncLock(userId);
        if (!acquired) {
          res.status(409).json({
            error: 'Indexing in progress',
            message: 'Incremental indexing is already in progress. Use force=true to override.'
          });
          return;
        }
      }

      const emailFetcher = await this.createEmailFetcherForUser(userId);
      const incrementalIndexer = new IncrementalIndexer(
        this.db,
        emailFetcher,
        this.emailParser,
        this.vectorService,
        this.syncStateManager
      );

      // Start incremental indexing (async)
      incrementalIndexer.processIncrementalSync(userId).catch(error => {
        console.error(`❌ Incremental indexing failed for user ${userId}:`, error);
      });

      res.json({
        message: 'Incremental indexing started',
        userId,
        type: 'incremental',
        status: 'started'
      });
    } catch (error) {
      console.error('❌ Failed to trigger incremental indexing:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to trigger incremental indexing'
      });
    }
  }

  /**
   * POST /api/indexing/sync - Generic sync endpoint that chooses appropriate indexing type
   */
  async triggerSync(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { type, force = false } = req.body as TriggerSyncRequest;

      // Check current sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      
      // Determine sync type if not specified
      let syncType = type;
      if (!syncType) {
        if (!syncState || !syncState.isInitialSyncComplete) {
          syncType = 'full';
        } else {
          syncType = 'incremental';
        }
      }

      // Validate sync type
      if (!['full', 'incremental'].includes(syncType)) {
        res.status(400).json({
          error: 'Invalid sync type',
          message: 'type must be either "full" or "incremental"'
        });
        return;
      }

      // Check if sync is already in progress
      if (syncState && syncState.currentSyncStatus === 'syncing' && !force) {
        res.status(409).json({
          error: 'Sync in progress',
          message: `${syncState.currentSyncStatus} is already in progress. Use force=true to override.`
        });
        return;
      }

      // Start appropriate sync type
      if (syncType === 'full') {
        // Create sync state if it doesn't exist
        if (!syncState) {
          await this.syncStateManager.createSyncState(userId);
        }
        const emailFetcher = await this.createEmailFetcherForUser(userId);
        const fullIndexer = new FullIndexer(
          this.db,
          emailFetcher,
          this.emailParser,
          this.vectorService,
          this.syncStateManager
        );
        fullIndexer.processFullIndexing(userId).catch(error => {
          console.error(`❌ Full sync failed for user ${userId}:`, error);
        });
      } else {
        if (!syncState) {
          res.status(400).json({
            error: 'Sync state not found',
            message: 'Cannot perform incremental sync without initial full sync'
          });
          return;
        }

        const emailFetcher = await this.createEmailFetcherForUser(userId);
        const incrementalIndexer = new IncrementalIndexer(
          this.db,
          emailFetcher,
          this.emailParser,
          this.vectorService,
          this.syncStateManager
        );
        incrementalIndexer.processIncrementalSync(userId).catch(error => {
          console.error(`❌ Incremental sync failed for user ${userId}:`, error);
        });
      }

      res.json({
        message: `${syncType} synchronization started`,
        userId,
        type: syncType,
        status: 'started'
      });
    } catch (error) {
      console.error('❌ Failed to trigger sync:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to trigger synchronization'
      });
    }
  }

  /**
   * GET /api/indexing/status - Get indexing status and progress
   */
  async getIndexingStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Get sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized'
        });
        return;
      }

      // Get email statistics
      const [totalEmails, vectorCount] = await Promise.all([
        this.emailRepository.getUserEmailCount(userId),
        this.qdrantRepository.getUserVectorCount(userId)
      ]);

      // Calculate indexing progress
      const indexingProgress = totalEmails > 0 ? (vectorCount / totalEmails) * 100 : 0;

      const response: IndexingProgressResponse = {
        userId,
        syncState: {
          lastSyncAt: syncState.lastSyncAt,
          totalEmailsIndexed: syncState.totalEmailsIndexed,
          isInitialSyncComplete: syncState.isInitialSyncComplete,
          currentSyncStatus: syncState.currentSyncStatus,
          lastError: syncState.lastError
        },
        statistics: {
          totalEmails,
          vectorizedEmails: vectorCount,
          indexingProgress: Math.round(indexingProgress * 100) / 100
        }
      };

      res.json(response);
    } catch (error) {
      console.error('❌ Failed to get indexing status:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve indexing status'
      });
    }
  }

  /**
   * GET /api/indexing/auto-sync/settings
   */
  async getAutoSyncSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const row = await this.db.get<any>('SELECT auto_sync_enabled, auto_sync_interval_minutes FROM users WHERE id = ?', [userId]);
      res.json({
        enabled: row?.auto_sync_enabled ? Boolean(row.auto_sync_enabled) : true,
        intervalMinutes: row?.auto_sync_interval_minutes ?? 5,
      });
    } catch (error) {
      console.error('❌ Failed to get auto-sync settings:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to get auto-sync settings' });
    }
  }

  /**
   * PUT /api/indexing/auto-sync/settings
   * Body: { enabled?: boolean, intervalMinutes?: number }
   */
  async updateAutoSyncSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { enabled, intervalMinutes } = req.body || {};
      const fields: string[] = [];
      const values: any[] = [];
      if (enabled !== undefined) { fields.push('auto_sync_enabled = ?'); values.push(enabled ? 1 : 0); }
      if (intervalMinutes !== undefined) {
        const n = Number(intervalMinutes);
        if (!Number.isFinite(n) || n < 1 || n > 60) {
          res.status(400).json({ error: 'Invalid interval', message: 'intervalMinutes must be between 1 and 60' });
          return;
        }
        fields.push('auto_sync_interval_minutes = ?'); values.push(n);
      }
      if (fields.length === 0) {
        res.status(400).json({ error: 'No changes', message: 'Provide enabled or intervalMinutes' });
        return;
      }
      values.push(userId);
      await this.db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
      res.json({ message: 'Auto-sync settings updated' });
    } catch (error) {
      console.error('❌ Failed to update auto-sync settings:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to update auto-sync settings' });
    }
  }

  /**
   * GET /api/indexing/progress - Get detailed indexing progress (alias for status)
   */
  async getIndexingProgress(req: AuthenticatedRequest, res: Response): Promise<void> {
    return this.getIndexingStatus(req, res);
  }

  /**
   * POST /api/indexing/cancel - Cancel ongoing indexing operation
   */
  async cancelIndexing(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Check current sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized'
        });
        return;
      }

      if (syncState.currentSyncStatus !== 'syncing') {
        res.status(400).json({
          error: 'No indexing in progress',
          message: 'There is no active indexing operation to cancel'
        });
        return;
      }

      // Update sync status to idle (this will signal the indexer to stop)
      await this.syncStateManager.updateSyncStatus(userId, 'idle');

      // Note: The actual cancellation logic would need to be implemented in the indexers
      // This would typically involve checking the sync status periodically during processing

      res.json({
        message: 'Indexing cancellation requested',
        userId,
        status: 'cancelling'
      });
    } catch (error) {
      console.error('❌ Failed to cancel indexing:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to cancel indexing'
      });
    }
  }

  /**
   * GET /api/indexing/stats - Get comprehensive indexing statistics
   */
  async getIndexingStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Get sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized'
        });
        return;
      }

      // Get detailed statistics
      const [
        totalEmails,
        importantEmails,
        unclassifiedEmails,
        vectorCount
      ] = await Promise.all([
        this.emailRepository.getUserEmailCount(userId),
        this.emailRepository.getUserEmailCountByImportance(userId, 'important'),
        this.emailRepository.getUserEmailCountByImportance(userId, 'unclassified'),
        this.qdrantRepository.getUserVectorCount(userId)
      ]);

      const notImportantEmails = totalEmails - importantEmails - unclassifiedEmails;
      const indexingProgress = totalEmails > 0 ? (vectorCount / totalEmails) * 100 : 0;
      const classificationProgress = totalEmails > 0 ? ((totalEmails - unclassifiedEmails) / totalEmails) * 100 : 0;

      res.json({
        userId,
        syncState: {
          lastSyncAt: syncState.lastSyncAt,
          totalEmailsIndexed: syncState.totalEmailsIndexed,
          isInitialSyncComplete: syncState.isInitialSyncComplete,
          currentSyncStatus: syncState.currentSyncStatus,
          lastError: syncState.lastError
        },
        emailStatistics: {
          total: totalEmails,
          important: importantEmails,
          notImportant: notImportantEmails,
          unclassified: unclassifiedEmails
        },
        indexingStatistics: {
          vectorizedEmails: vectorCount,
          indexingProgress: Math.round(indexingProgress * 100) / 100,
          classificationProgress: Math.round(classificationProgress * 100) / 100
        },
        performance: {
          averageEmailsPerSync: syncState.totalEmailsIndexed > 0 ? 
            Math.round(syncState.totalEmailsIndexed / Math.max(1, this.calculateSyncCount(syncState))) : 0,
          lastSyncDuration: this.estimateLastSyncDuration(syncState)
        }
      });
    } catch (error) {
      console.error('❌ Failed to get indexing stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve indexing statistics'
      });
    }
  }

  /**
   * POST /api/indexing/reset - Reset indexing state (for development/testing)
   */
  async resetIndexingState(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { confirm = false } = req.body as { confirm?: boolean };

      if (!confirm) {
        res.status(400).json({
          error: 'Confirmation required',
          message: 'This operation will reset all indexing progress. Set confirm=true to proceed.'
        });
        return;
      }

      // Check if indexing is in progress
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (syncState && syncState.currentSyncStatus === 'syncing') {
        res.status(409).json({
          error: 'Indexing in progress',
          message: 'Cannot reset indexing state while indexing is in progress'
        });
        return;
      }

      // Reset sync state
      if (syncState) {
        await this.syncStateManager.updateSyncState({
          ...syncState,
          lastSyncAt: new Date(),
          lastMessageId: undefined,
          totalEmailsIndexed: 0,
          isInitialSyncComplete: false,
          currentSyncStatus: 'idle',
          lastError: undefined
        });
      }

      res.json({
        message: 'Indexing state reset successfully',
        userId,
        status: 'reset'
      });
    } catch (error) {
      console.error('❌ Failed to reset indexing state:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to reset indexing state'
      });
    }
  }

  /**
   * Helper method to calculate approximate number of sync operations
   */
  private calculateSyncCount(syncState: any): number {
    // This is a rough estimate - in a real implementation, you might track this separately
    const daysSinceCreation = Math.max(1, Math.floor(
      (Date.now() - new Date(syncState.lastSyncAt).getTime()) / (1000 * 60 * 60 * 24)
    ));
    return Math.max(1, daysSinceCreation * 2); // Assume 2 syncs per day on average
  }

  /**
   * Helper method to estimate last sync duration
   */
  private estimateLastSyncDuration(syncState: any): number | null {
    // This would need to be tracked during actual sync operations
    // For now, return null to indicate unknown
    return null;
  }
}