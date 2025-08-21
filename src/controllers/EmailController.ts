import { Request, Response } from 'express';
import { EmailRepository } from '../repositories/EmailRepository';
import { EmailSearchService } from '../services/search/EmailSearchService';
import { SyncStateManager } from '../services/sync/SyncStateManager';
import { IncrementalIndexer } from '../services/indexing/IncrementalIndexer';
import { FullIndexer } from '../services/indexing/FullIndexer';
import { AuthenticatedRequest } from '../middleware/auth';
import { Email } from '../types/models';

export interface EmailQueryParams {
  importance?: 'important' | 'not_important' | 'unclassified';
  sender?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
  search?: string;
  useSemanticSearch?: string;
  combineResults?: string;
}

export interface EmailImportanceUpdateRequest {
  importance: 'important' | 'not_important' | 'unclassified';
  userLabeled?: boolean;
}

/**
 * EmailController handles HTTP requests for email management operations
 */
export class EmailController {
  constructor(
    private emailRepository: EmailRepository,
    private emailSearchService: EmailSearchService,
    private syncStateManager: SyncStateManager,
    private incrementalIndexer: IncrementalIndexer,
    private fullIndexer: FullIndexer
  ) {}

  /**
   * GET /api/emails - Retrieve emails for the authenticated user
   */
  async getEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const params = req.query as EmailQueryParams;

      // Parse query parameters
      const options = {
        importance: params.importance,
        sender: params.sender,
        dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
        dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
        limit: params.limit ? parseInt(params.limit, 10) : 50,
        offset: params.offset ? parseInt(params.offset, 10) : 0
      };

      // Validate date parameters
      if (params.dateFrom && isNaN(options.dateFrom!.getTime())) {
        res.status(400).json({
          error: 'Invalid dateFrom parameter',
          message: 'dateFrom must be a valid ISO date string'
        });
        return;
      }

      if (params.dateTo && isNaN(options.dateTo!.getTime())) {
        res.status(400).json({
          error: 'Invalid dateTo parameter',
          message: 'dateTo must be a valid ISO date string'
        });
        return;
      }

      // Validate limit and offset
      if (options.limit < 1 || options.limit > 100) {
        res.status(400).json({
          error: 'Invalid limit parameter',
          message: 'limit must be between 1 and 100'
        });
        return;
      }

      if (options.offset < 0) {
        res.status(400).json({
          error: 'Invalid offset parameter',
          message: 'offset must be non-negative'
        });
        return;
      }

      const emails = await this.emailSearchService.getFilteredEmails(userId, options);

      res.json({
        emails,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: emails.length
        }
      });
    } catch (error) {
      console.error('❌ Failed to get emails:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve emails'
      });
    }
  }

  /**
   * GET /api/emails/search - Search emails using text or semantic search
   */
  async searchEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const params = req.query as EmailQueryParams;

      if (!params.search) {
        res.status(400).json({
          error: 'Missing search parameter',
          message: 'search query is required'
        });
        return;
      }

      // Parse search options
      const options = {
        importance: params.importance,
        sender: params.sender,
        dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
        dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
        limit: params.limit ? parseInt(params.limit, 10) : 20,
        offset: params.offset ? parseInt(params.offset, 10) : 0,
        useSemanticSearch: params.useSemanticSearch === 'true',
        combineResults: params.combineResults !== 'false', // Default to true
        semanticThreshold: 0.7
      };

      // Validate parameters
      if (params.dateFrom && isNaN(options.dateFrom!.getTime())) {
        res.status(400).json({
          error: 'Invalid dateFrom parameter',
          message: 'dateFrom must be a valid ISO date string'
        });
        return;
      }

      if (params.dateTo && isNaN(options.dateTo!.getTime())) {
        res.status(400).json({
          error: 'Invalid dateTo parameter',
          message: 'dateTo must be a valid ISO date string'
        });
        return;
      }

      if (options.limit < 1 || options.limit > 50) {
        res.status(400).json({
          error: 'Invalid limit parameter',
          message: 'limit must be between 1 and 50 for search'
        });
        return;
      }

      const results = await this.emailSearchService.search(userId, params.search, options);

      res.json({
        results,
        query: params.search,
        searchType: options.useSemanticSearch ? 
          (options.combineResults ? 'combined' : 'semantic') : 'text',
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: results.length
        }
      });
    } catch (error) {
      console.error('❌ Failed to search emails:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to search emails'
      });
    }
  }

  /**
   * GET /api/emails/:id - Get a specific email by ID
   */
  async getEmailById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;

      if (!emailId) {
        res.status(400).json({
          error: 'Missing email ID',
          message: 'Email ID is required'
        });
        return;
      }

      const email = await this.emailRepository.getById(emailId);

      if (!email) {
        res.status(404).json({
          error: 'Email not found',
          message: 'Email with the specified ID does not exist'
        });
        return;
      }

      // Check if user owns this email
      if (email.userId !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to access this email'
        });
        return;
      }

      res.json({ email });
    } catch (error) {
      console.error('❌ Failed to get email by ID:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve email'
      });
    }
  }

  /**
   * PUT /api/emails/:id/importance - Update email importance classification
   */
  async updateEmailImportance(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      const { importance, userLabeled = true } = req.body as EmailImportanceUpdateRequest;

      if (!emailId) {
        res.status(400).json({
          error: 'Missing email ID',
          message: 'Email ID is required'
        });
        return;
      }

      if (!importance || !['important', 'not_important', 'unclassified'].includes(importance)) {
        res.status(400).json({
          error: 'Invalid importance value',
          message: 'importance must be one of: important, not_important, unclassified'
        });
        return;
      }

      // Check if email exists and user owns it
      const email = await this.emailRepository.getById(emailId);
      if (!email) {
        res.status(404).json({
          error: 'Email not found',
          message: 'Email with the specified ID does not exist'
        });
        return;
      }

      if (email.userId !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to modify this email'
        });
        return;
      }

      // Update importance
      await this.emailRepository.updateImportance(
        emailId,
        importance,
        undefined, // No confidence score for user-labeled emails
        userLabeled
      );

      // Get updated email
      const updatedEmail = await this.emailRepository.getById(emailId);

      // Invalidate search cache for this user
      await this.emailSearchService.invalidateUserSearchCache(userId);

      res.json({
        message: 'Email importance updated successfully',
        email: updatedEmail
      });
    } catch (error) {
      console.error('❌ Failed to update email importance:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update email importance'
      });
    }
  }

  /**
   * POST /api/emails/sync - Trigger email synchronization
   */
  async triggerSync(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { type = 'incremental' } = req.body as { type?: 'incremental' | 'full' };

      if (!['incremental', 'full'].includes(type)) {
        res.status(400).json({
          error: 'Invalid sync type',
          message: 'type must be either "incremental" or "full"'
        });
        return;
      }

      // Check current sync state
      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized'
        });
        return;
      }

      if (syncState.currentSyncStatus === 'syncing') {
        res.status(409).json({
          error: 'Sync in progress',
          message: 'Email synchronization is already in progress'
        });
        return;
      }

      // Start synchronization (async)
      if (type === 'full') {
        // Trigger full sync
        this.fullIndexer.processFullIndexing(userId).catch(error => {
          console.error(`❌ Full sync failed for user ${userId}:`, error);
        });
      } else {
        // Trigger incremental sync
        this.incrementalIndexer.processIncrementalSync(userId).catch(error => {
          console.error(`❌ Incremental sync failed for user ${userId}:`, error);
        });
      }

      res.json({
        message: `${type} synchronization started`,
        syncType: type,
        status: 'started'
      });
    } catch (error) {
      console.error('❌ Failed to trigger sync:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to trigger email synchronization'
      });
    }
  }

  /**
   * GET /api/emails/sync/status - Get synchronization status
   */
  async getSyncStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const syncState = await this.syncStateManager.getSyncState(userId);
      if (!syncState) {
        res.status(404).json({
          error: 'Sync state not found',
          message: 'User sync state not initialized'
        });
        return;
      }

      // Get additional statistics
      const stats = await this.emailSearchService.getSearchStats(userId);

      res.json({
        syncState: {
          userId: syncState.userId,
          lastSyncAt: syncState.lastSyncAt,
          totalEmailsIndexed: syncState.totalEmailsIndexed,
          isInitialSyncComplete: syncState.isInitialSyncComplete,
          currentSyncStatus: syncState.currentSyncStatus,
          lastError: syncState.lastError
        },
        statistics: stats
      });
    } catch (error) {
      console.error('❌ Failed to get sync status:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve sync status'
      });
    }
  }

  /**
   * GET /api/emails/:id/similar - Find emails similar to the specified email
   */
  async getSimilarEmails(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const emailId = req.params.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : 0.8;

      if (!emailId) {
        res.status(400).json({
          error: 'Missing email ID',
          message: 'Email ID is required'
        });
        return;
      }

      if (limit < 1 || limit > 20) {
        res.status(400).json({
          error: 'Invalid limit parameter',
          message: 'limit must be between 1 and 20'
        });
        return;
      }

      if (threshold < 0 || threshold > 1) {
        res.status(400).json({
          error: 'Invalid threshold parameter',
          message: 'threshold must be between 0 and 1'
        });
        return;
      }

      const similarEmails = await this.emailSearchService.findSimilarEmails(
        userId,
        emailId,
        limit,
        threshold
      );

      res.json({
        emailId,
        similarEmails,
        parameters: {
          limit,
          threshold
        }
      });
    } catch (error) {
      console.error('❌ Failed to get similar emails:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          res.status(404).json({
            error: 'Email not found',
            message: error.message
          });
          return;
        }
        
        if (error.message.includes('no vector embedding')) {
          res.status(400).json({
            error: 'Email not vectorized',
            message: 'This email has not been processed for semantic search'
          });
          return;
        }
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to find similar emails'
      });
    }
  }
}