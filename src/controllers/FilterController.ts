import { Request, Response } from 'express';
import { UserExpectationsManager } from '../services/ml/UserExpectationsManager';
import { FilteringPipeline } from '../services/ml/FilteringPipeline';
import { OpenAIFilterService } from '../services/ml/OpenAIFilterService';
import { EmailRepository } from '../repositories/EmailRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserExpectations } from '../types/models';
import { VectorEmbeddingService } from '../services/embedding/VectorEmbeddingService';
import { QdrantRepository } from '../repositories/QdrantRepository';

export interface CreateExpectationsRequest {
  title: string;
  description: string;
  examples?: {
    important: string[];
    notImportant: string[];
  };
}

export interface UpdateExpectationsRequest {
  title?: string;
  description?: string;
  examples?: {
    important: string[];
    notImportant: string[];
  };
}

export interface BatchFilterRequest {
  emailIds?: string[];
  filterUnclassified?: boolean;
  confidenceThreshold?: number;
  batchSize?: number;
}

/**
 * FilterController handles HTTP requests for OpenAI filtering service operations
 */
export class FilterController {
  constructor(
    private expectationsManager: UserExpectationsManager,
    private filteringPipeline: FilteringPipeline,
    private openaiService: OpenAIFilterService,
    private emailRepository: EmailRepository
  ) {}

  /**
   * POST /api/filter/expectations - Create user expectations for filtering
   */
  async createExpectations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { title, description, examples } = req.body as CreateExpectationsRequest;

      // Validate required fields
      if (!title || !description) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'title and description are required'
        });
        return;
      }

      // Validate title length
      if (title.length < 3 || title.length > 100) {
        res.status(400).json({
          error: 'Invalid title',
          message: 'title must be between 3 and 100 characters'
        });
        return;
      }

      // Validate description length
      if (description.length < 10 || description.length > 1000) {
        res.status(400).json({
          error: 'Invalid description',
          message: 'description must be between 10 and 1000 characters'
        });
        return;
      }

      // Validate examples if provided
      if (examples) {
        if (!Array.isArray(examples.important) || !Array.isArray(examples.notImportant)) {
          res.status(400).json({
            error: 'Invalid examples format',
            message: 'examples.important and examples.notImportant must be arrays'
          });
          return;
        }

        if (examples.important.length > 10 || examples.notImportant.length > 10) {
          res.status(400).json({
            error: 'Too many examples',
            message: 'Maximum 10 examples allowed for each category'
          });
          return;
        }
      }

      const expectations = await this.expectationsManager.createExpectations(
        userId,
        title,
        description,
        examples
      );

      res.status(201).json({
        message: 'Expectations created successfully',
        expectations
      });
    } catch (error) {
      console.error('❌ Failed to create expectations:', error);
      
      if (error instanceof Error && error.message.includes('validation')) {
        res.status(400).json({
          error: 'Validation error',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create expectations'
      });
    }
  }

  /**
   * GET /api/filter/expectations - Get user's active expectations
   */
  async getExpectations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const expectations = await this.expectationsManager.getActiveExpectations(userId);

      if (!expectations) {
        res.status(404).json({
          error: 'No expectations found',
          message: 'User has no active filtering expectations'
        });
        return;
      }

      res.json({ expectations });
    } catch (error) {
      console.error('❌ Failed to get expectations:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve expectations'
      });
    }
  }

  /**
   * PUT /api/filter/expectations - Update user's expectations
   */
  async updateExpectations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { title, description, examples } = req.body as UpdateExpectationsRequest;

      // Get current expectations
      const currentExpectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!currentExpectations) {
        res.status(404).json({
          error: 'No expectations found',
          message: 'User has no active filtering expectations to update'
        });
        return;
      }

      // Validate fields if provided
      if (title !== undefined) {
        if (title.length < 3 || title.length > 100) {
          res.status(400).json({
            error: 'Invalid title',
            message: 'title must be between 3 and 100 characters'
          });
          return;
        }
      }

      if (description !== undefined) {
        if (description.length < 10 || description.length > 1000) {
          res.status(400).json({
            error: 'Invalid description',
            message: 'description must be between 10 and 1000 characters'
          });
          return;
        }
      }

      if (examples) {
        if (!Array.isArray(examples.important) || !Array.isArray(examples.notImportant)) {
          res.status(400).json({
            error: 'Invalid examples format',
            message: 'examples.important and examples.notImportant must be arrays'
          });
          return;
        }

        if (examples.important.length > 10 || examples.notImportant.length > 10) {
          res.status(400).json({
            error: 'Too many examples',
            message: 'Maximum 10 examples allowed for each category'
          });
          return;
        }
      }

      const updatedExpectations = await this.expectationsManager.updateExpectations(
        currentExpectations.id,
        {
          title,
          description,
          examples
        }
      );

      res.json({
        message: 'Expectations updated successfully',
        expectations: updatedExpectations
      });
    } catch (error) {
      console.error('❌ Failed to update expectations:', error);
      
      if (error instanceof Error && error.message.includes('validation')) {
        res.status(400).json({
          error: 'Validation error',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update expectations'
      });
    }
  }

  /**
   * DELETE /api/filter/expectations - Deactivate user's expectations
   */
  async deactivateExpectations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        res.status(404).json({
          error: 'No expectations found',
          message: 'User has no active filtering expectations'
        });
        return;
      }

      await this.expectationsManager.deactivateExpectations(expectations.id);

      res.json({
        message: 'Expectations deactivated successfully'
      });
    } catch (error) {
      console.error('❌ Failed to deactivate expectations:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to deactivate expectations'
      });
    }
  }

  /**
   * POST /api/filter/batch - Process batch filtering of emails
   */
  async batchFilter(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const {
        emailIds,
        filterUnclassified = true,
        confidenceThreshold = 0.7,
        batchSize = 10
      } = req.body as BatchFilterRequest;

      // Validate parameters
      if (confidenceThreshold < 0 || confidenceThreshold > 1) {
        res.status(400).json({
          error: 'Invalid confidence threshold',
          message: 'confidenceThreshold must be between 0 and 1'
        });
        return;
      }

      if (batchSize < 1 || batchSize > 50) {
        res.status(400).json({
          error: 'Invalid batch size',
          message: 'batchSize must be between 1 and 50'
        });
        return;
      }

      if (emailIds && emailIds.length > 100) {
        res.status(400).json({
          error: 'Too many email IDs',
          message: 'Maximum 100 email IDs allowed per batch'
        });
        return;
      }

      // Check if user has active expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        res.status(400).json({
          error: 'No expectations found',
          message: 'User must have active filtering expectations to perform batch filtering'
        });
        return;
      }

      // Check OpenAI availability
      const isOpenAIAvailable = await this.openaiService.isAvailable();
      if (!isOpenAIAvailable) {
        res.status(503).json({
          error: 'OpenAI service unavailable',
          message: 'OpenAI filtering service is currently unavailable'
        });
        return;
      }

      let stats;
      if (emailIds && emailIds.length > 0) {
        // Filter specific emails
        stats = await this.filterSpecificEmails(userId, emailIds, {
          confidenceThreshold,
          batchSize
        });
      } else if (filterUnclassified) {
        // Filter unclassified emails
        stats = await this.filteringPipeline.processNewEmails(userId, {
          confidenceThreshold,
          batchSize,
          skipAlreadyClassified: true
        });
      } else {
        // Filter all emails
        stats = await this.filteringPipeline.processNewEmails(userId, {
          confidenceThreshold,
          batchSize,
          skipAlreadyClassified: false
        });
      }

      res.json({
        message: 'Batch filtering completed',
        stats,
        parameters: {
          confidenceThreshold,
          batchSize,
          filterUnclassified,
          emailIds: emailIds?.length || 0
        }
      });
    } catch (error) {
      console.error('❌ Failed to process batch filtering:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to process batch filtering'
      });
    }
  }

  /**
   * GET /api/filter/status - Get filtering status and OpenAI usage metrics
   */
  async getFilteringStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Get user expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);

      // Check OpenAI availability
      const isOpenAIAvailable = await this.openaiService.isAvailable();

      // Get email statistics
      const [totalEmails, importantEmails, unclassifiedEmails] = await Promise.all([
        this.emailRepository.getUserEmailCount(userId),
        this.emailRepository.getUserEmailCountByImportance(userId, 'important'),
        this.emailRepository.getUserEmailCountByImportance(userId, 'unclassified')
      ]);

      const notImportantEmails = totalEmails - importantEmails - unclassifiedEmails;

      // Calculate filtering progress
      const classifiedEmails = totalEmails - unclassifiedEmails;
      const filteringProgress = totalEmails > 0 ? (classifiedEmails / totalEmails) * 100 : 0;

      res.json({
        status: {
          hasExpectations: !!expectations,
          openaiAvailable: isOpenAIAvailable,
          filteringProgress: Math.round(filteringProgress * 100) / 100
        },
        expectations: expectations ? {
          id: expectations.id,
          title: expectations.title,
          description: expectations.description,
          createdAt: expectations.createdAt,
          updatedAt: expectations.updatedAt
        } : null,
        emailStats: {
          total: totalEmails,
          important: importantEmails,
          notImportant: notImportantEmails,
          unclassified: unclassifiedEmails,
          classificationRate: filteringProgress
        },
        openaiStatus: {
          available: isOpenAIAvailable,
          model: process.env.OPENAI_MODEL || 'gpt-4'
        }
      });
    } catch (error) {
      console.error('❌ Failed to get filtering status:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve filtering status'
      });
    }
  }

  /**
   * POST /api/filter/classify/:id - Classify a single email
   */
  async classifySingleEmail(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Get email
      const email = await this.emailRepository.getById(emailId);
      if (!email) {
        res.status(404).json({
          error: 'Email not found',
          message: 'Email with the specified ID does not exist'
        });
        return;
      }

      // Check ownership
      if (email.userId !== userId) {
        res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to classify this email'
        });
        return;
      }

      // Get user expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        res.status(400).json({
          error: 'No expectations found',
          message: 'User must have active filtering expectations to classify emails'
        });
        return;
      }

      // Check OpenAI availability
      const isOpenAIAvailable = await this.openaiService.isAvailable();
      if (!isOpenAIAvailable) {
        res.status(503).json({
          error: 'OpenAI service unavailable',
          message: 'OpenAI filtering service is currently unavailable'
        });
        return;
      }

      // Classify email
      const result = await this.openaiService.classifyEmail(email, expectations);

      // Update email importance
      await this.emailRepository.updateImportance(
        emailId,
        result.importance,
        result.confidence,
        false // Not user-labeled
      );

      // Get updated email
      const updatedEmail = await this.emailRepository.getById(emailId);

      res.json({
        message: 'Email classified successfully',
        classification: result,
        email: updatedEmail
      });
    } catch (error) {
      console.error('❌ Failed to classify email:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to classify email'
      });
    }
  }

  /**
   * POST /api/filter/reset
   * Reset classifications for current user to 'unclassified' to enable re-classification with new expectations
   */
  async resetClassifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const changed = await this.emailRepository.resetClassificationsForUser(userId);

      res.json({
        message: 'Classifications reset to unclassified',
        updated: changed
      });
    } catch (error) {
      console.error('❌ Failed to reset classifications:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to reset classifications'
      });
    }
  }

  /**
   * POST /api/filter/rules/timeslots
   * Classify emails as important if a timeslot pattern is detected in subject or content
   */
  async classifyByTimeslots(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Fetch user's emails (unfiltered)
      const emails = await this.emailRepository.getEmailsForUser(userId);

      // Timeslot regexes (cover 12h/24h and common variants)
      const patterns: RegExp[] = [
        // 24h ranges: 16:30-18:30 or 16:30 to 18:30
        /\b([01]?\d|2[0-3]):[0-5]\d\s?(?:-|to|–|—)\s?([01]?\d|2[0-3]):[0-5]\d\b/i,
        // 12h ranges: 4:30 pm - 6:30 pm, 9 AM–10 AM, 4.30pm-5.30pm
        /\b\d{1,2}[:\.]\d{2}\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\b\s?(?:-|to|–|—)\s?\b\d{1,2}[:\.]\d{2}\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\b/i,
        // Hour-only 12h ranges: 9 AM - 10 AM, 3pm-5pm
        /\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\b\s?(?:-|to|–|—)\s?\b\d{1,2}\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\b/i,
        // Day + time ranges: Tue 3pm-5pm
        /\b(Mon|Tue|Tues|Wed|Thu|Thur|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b.*?\b\d{1,2}(:\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\s?(?:-|to|–|—)\s?\d{1,2}(:\d{2})?\s?(?:a\.?m\.?|p\.?m\.?|am|pm)\b/i
      ];

      let processed = 0;
      let markedImportant = 0;
      let skipped = 0;

      for (const email of emails) {
        // Only re-classify unclassified to avoid overwriting user labels
        if (email.importance !== 'unclassified') {
          skipped++;
          continue;
        }

        const haystack = `${email.subject}\n${email.content}`;
        const matched = patterns.some((re) => re.test(haystack));
        if (matched) {
          await this.emailRepository.updateImportance(email.id, 'important', 1.0, false);
          markedImportant++;
        } else {
          await this.emailRepository.updateImportance(email.id, 'not_important', 0.9, false);
        }
        processed++;
      }

      res.json({
        message: 'Rule-based timeslot classification completed',
        stats: { processed, markedImportant, skipped }
      });
    } catch (error) {
      console.error('❌ Failed timeslot rule classification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to run rule-based timeslot classification'
      });
    }
  }

  /**
   * POST /api/filter/rules/oweek
   * Classify emails as important if they mention "o-week" or "orientation week"
   */
  async classifyByOWeek(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;

      // Fetch user's emails
      const emails = await this.emailRepository.getEmailsForUser(userId);

      // Patterns (case-insensitive)
      const patterns: RegExp[] = [
        /\bo[-\s]?week\b/i,
        /\borientation\s+week\b/i
      ];

      let processed = 0;
      let markedImportant = 0;
      let skipped = 0;

      for (const email of emails) {
        if (email.importance !== 'unclassified') {
          skipped++;
          continue;
        }
        const text = `${email.subject}\n${email.content}`;
        const match = patterns.some((re) => re.test(text));
        if (match) {
          await this.emailRepository.updateImportance(email.id, 'important', 0.95, false);
          markedImportant++;
        } else {
          await this.emailRepository.updateImportance(email.id, 'not_important', 0.9, false);
        }
        processed++;
      }

      res.json({
        message: 'Rule-based O-Week classification completed',
        stats: { processed, markedImportant, skipped }
      });
    } catch (error) {
      console.error('❌ Failed O-Week rule classification:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to run O-Week rule-based classification'
      });
    }
  }

  /**
   * GET /api/filter/scores
   * Returns cosine similarity score for each of the user's emails relative to the expectations prototype.
   * Query: limit (default 100)
   */
  async getPrototypeScores(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      // Get expectations
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        res.status(404).json({ error: 'No expectations', message: 'Create expectations first' });
        return;
      }

      // Build prototype embedding from expectations
      const openaiApiKey = process.env.OPENAI_API_KEY || '';
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const qdrantApiKey = process.env.QDRANT_API_KEY;
      const embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
      const qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);

      const expectationsText = this.buildExpectationsText(expectations);
      const proto = await embeddingService.generateEmbedding(expectationsText);

      // Load recent emails
      const emails = await this.emailRepository.getEmailsForUser(userId, { limit, orderBy: 'received_at', orderDirection: 'DESC' });
      const emailIds = emails.map(e => e.id);

      // Fetch vectors
      const vectors = await qdrantRepository.getVectorsByEmailIds(emailIds);
      const idToVector = new Map(vectors.map(v => [v.emailId, v.embedding]));

      // Score
      const scored = emails.map(e => {
        const emb = idToVector.get(e.id);
        const similarity = emb ? this.cosineSimilarity(proto, emb) : null;
        return {
          email: { id: e.id, subject: e.subject, sender: e.sender, receivedAt: e.receivedAt },
          similarity,
          hasVector: !!emb
        };
      });

      // Sort by similarity desc (nulls last)
      scored.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));

      res.json({ count: scored.length, results: scored });
    } catch (error) {
      console.error('❌ Failed to compute prototype scores:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to compute prototype scores' });
    }
  }

  /**
   * GET /api/filter/outliers
   * Find emails whose vectors deviate most from the user centroid (cosine distance).
   * Query: limit (default 20)
   */
  async getOutliers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const qdrantApiKey = process.env.QDRANT_API_KEY;
      const qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);

      // Fetch all user vectors (capped internally)
      const vectors = await qdrantRepository.getUserVectors(userId);
      if (vectors.length === 0) {
        res.json({ count: 0, results: [] });
        return;
      }

      // Compute centroid
      const dim = vectors[0].embedding.length;
      const centroid = new Array<number>(dim).fill(0);
      for (const v of vectors) {
        for (let i = 0; i < dim; i++) centroid[i] += v.embedding[i];
      }
      for (let i = 0; i < dim; i++) centroid[i] /= vectors.length;

      // Score by distance (1 - cosine similarity)
      const scored = vectors.map(v => ({
        emailId: v.emailId,
        distance: 1 - this.cosineSimilarity(centroid, v.embedding)
      }));

      scored.sort((a, b) => b.distance - a.distance);

      // Get email metadata
      const top = scored.slice(0, limit);
      const emails = await this.emailRepository.getByIds(top.map(t => t.emailId));
      const emailById = new Map(emails.map(e => [e.id, e]));
      const results = top.map(t => ({
        email: emailById.get(t.emailId) ? {
          id: emailById.get(t.emailId)!.id,
          subject: emailById.get(t.emailId)!.subject,
          sender: emailById.get(t.emailId)!.sender,
          receivedAt: emailById.get(t.emailId)!.receivedAt
        } : { id: t.emailId },
        distance: t.distance
      }));

      res.json({ count: results.length, results });
    } catch (error) {
      console.error('❌ Failed to compute outliers:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to compute outliers' });
    }
  }

  /**
   * GET /api/filter/top-similar
   * Return the top X percentile of emails by cosine similarity to expectations prototype.
   * Query: percent (default 10)
   */
  async getTopSimilar(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const percent = req.query.percent ? Math.max(1, Math.min(100, parseInt(req.query.percent as string, 10))) : 10;
      const includeHtml = (req.query.includeHtml as string) === 'true';

      // Expectations and prototype
      const expectations = await this.expectationsManager.getActiveExpectations(userId);
      if (!expectations) {
        res.status(404).json({ error: 'No expectations', message: 'Create expectations first' });
        return;
      }
      const openaiApiKey = process.env.OPENAI_API_KEY || '';
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const qdrantApiKey = process.env.QDRANT_API_KEY;
      const embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
      const qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);
      const proto = await embeddingService.generateEmbedding(this.buildExpectationsText(expectations));

      // Vectors and scores
      const vectors = await qdrantRepository.getUserVectors(userId);
      if (vectors.length === 0) {
        res.json({ count: 0, results: [] });
        return;
      }
      const scored = vectors.map(v => ({ emailId: v.emailId, similarity: this.cosineSimilarity(proto, v.embedding) }));
      scored.sort((a, b) => (b.similarity - a.similarity));
      const take = Math.max(1, Math.ceil((percent / 100) * scored.length));
      const top = scored.slice(0, take);

      // Load metadata
      const emails = await this.emailRepository.getByIds(top.map(t => t.emailId));
      const emailById = new Map(emails.map(e => [e.id, e]));
      const results = top.map(t => {
        const e = emailById.get(t.emailId);
        if (!e) return { email: { id: t.emailId }, similarity: t.similarity };
        return {
          email: includeHtml ? {
            id: e.id,
            userId: e.userId,
            messageId: e.messageId,
            subject: e.subject,
            sender: e.sender,
            recipients: e.recipients,
            content: e.content,
            htmlContent: e.htmlContent,
            receivedAt: e.receivedAt,
            importance: e.importance,
            importanceConfidence: e.importanceConfidence,
            userLabeled: e.userLabeled,
            metadata: e.metadata
          } : {
            id: e.id,
            subject: e.subject,
            sender: e.sender,
            receivedAt: e.receivedAt
          },
          similarity: t.similarity
        };
      });

      res.json({ count: results.length, results });
    } catch (error) {
      console.error('❌ Failed to compute top similar:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to compute top similar emails' });
    }
  }

  private buildExpectationsText(expectations: UserExpectations): string {
    const important = expectations.examples?.important?.join('\n') || '';
    const notImportant = expectations.examples?.notImportant?.join('\n') || '';
    return [expectations.title || '', expectations.description || '', important, notImportant].join('\n').trim();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb);
    return denom === 0 ? 0 : dot / denom;
  }
  /**
   * Helper method to filter specific emails by IDs
   */
  private async filterSpecificEmails(
    userId: string,
    emailIds: string[],
    options: { confidenceThreshold: number; batchSize: number }
  ) {
    const startTime = Date.now();
    let totalProcessed = 0;
    let importantCount = 0;
    let notImportantCount = 0;
    let flaggedForReview = 0;
    let totalConfidence = 0;

    // Get user expectations
    const expectations = await this.expectationsManager.getActiveExpectations(userId);
    if (!expectations) {
      throw new Error('No active expectations found');
    }

    // Process emails in batches
    for (let i = 0; i < emailIds.length; i += options.batchSize) {
      const batchIds = emailIds.slice(i, i + options.batchSize);
      const emails = await this.emailRepository.getByIds(batchIds);

      // Filter emails belonging to the user
      const userEmails = emails.filter(email => email.userId === userId);

      for (const email of userEmails) {
        try {
          const result = await this.openaiService.classifyEmail(email, expectations);
          
          // Update email importance
          await this.emailRepository.updateImportance(
            email.id,
            result.importance,
            result.confidence,
            false
          );

          totalProcessed++;
          totalConfidence += result.confidence;

          if (result.importance === 'important') {
            importantCount++;
          } else {
            notImportantCount++;
          }

          if (result.confidence < options.confidenceThreshold) {
            flaggedForReview++;
          }
        } catch (error) {
          console.error(`Failed to classify email ${email.id}:`, error);
        }
      }
    }

    return {
      totalProcessed,
      importantCount,
      notImportantCount,
      flaggedForReview,
      averageConfidence: totalProcessed > 0 ? totalConfidence / totalProcessed : 0,
      processingTimeMs: Date.now() - startTime
    };
  }
}