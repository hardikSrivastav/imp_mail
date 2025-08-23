import { Request, Response } from 'express';
import { UserExpectationsManager } from '../services/ml/UserExpectationsManager';
import { FilteringPipeline } from '../services/ml/FilteringPipeline';
import { OpenAIFilterService } from '../services/ml/OpenAIFilterService';
import { EmailRepository } from '../repositories/EmailRepository';
import { AuthenticatedRequest } from '../middleware/auth';
import { UserExpectations } from '../types/models';
import { VectorEmbeddingService } from '../services/embedding/VectorEmbeddingService';
import { QdrantRepository } from '../repositories/QdrantRepository';
import { DigestService } from '../services/digest/DigestService';
import { getDatabase } from '../config/database';

export interface CreateExpectationsRequest {
  title: string;
  description: string;
  // Preferred shape
  examples?: {
    important: string[];
    notImportant: string[];
  } | string[] | string; // Accept flexible inputs (array or single string)
  // Optional helper inputs: choose emails instead of typing JSON
  selectedImportantEmailIds?: string[];
  selectedNotImportantEmailIds?: string[];
}

export interface UpdateExpectationsRequest {
  title?: string;
  description?: string;
  // Preferred shape
  examples?: {
    important: string[];
    notImportant: string[];
  } | string[] | string; // Accept flexible inputs (array or single string)
  // Optional helper inputs
  selectedImportantEmailIds?: string[];
  selectedNotImportantEmailIds?: string[];
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
      const { title, description } = req.body as CreateExpectationsRequest;

      // Debug log incoming body shape (non-sensitive summary)
      try {
        const body = req.body as any;
        console.log('[Expectations][create] userId=%s title.len=%s desc.len=%s has.examples=%s selImp.len=%s selNotImp.len=%s',
          userId,
          typeof body.title === 'string' ? body.title.length : 'n/a',
          typeof body.description === 'string' ? body.description.length : 'n/a',
          body.examples ? typeof body.examples : 'none',
          Array.isArray(body.selectedImportantEmailIds) ? body.selectedImportantEmailIds.length : 0,
          Array.isArray(body.selectedNotImportantEmailIds) ? body.selectedNotImportantEmailIds.length : 0,
        );
      } catch (_) { /* noop */ }

      // Debug: log incoming payload shape (without large text)
      try {
        const dbg = {
          userId,
          hasExamples: typeof (req.body as any).examples !== 'undefined',
          examplesType: typeof (req.body as any).examples,
          selectedImportantEmailIdsCount: Array.isArray((req.body as any).selectedImportantEmailIds)
            ? (req.body as any).selectedImportantEmailIds.length
            : 0,
          selectedNotImportantEmailIdsCount: Array.isArray((req.body as any).selectedNotImportantEmailIds)
            ? (req.body as any).selectedNotImportantEmailIds.length
            : 0,
        };
        console.log('[Expectations] create payload dbg:', dbg);
      } catch {}

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

      // Normalize and build examples from flexible input
      const normalizedExamples = await this.buildExamplesFromInput(req);
      console.log('[Expectations][create] normalizedExamples: imp.len=%s not.len=%s',
        normalizedExamples?.important.length ?? 0,
        normalizedExamples?.notImportant.length ?? 0,
      );
      console.log('[Expectations] create normalizedExamples counts:', {
        important: normalizedExamples?.important?.length || 0,
        notImportant: normalizedExamples?.notImportant?.length || 0,
      });
      if (normalizedExamples) {
        if (normalizedExamples.important.length > 10 || normalizedExamples.notImportant.length > 10) {
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
        normalizedExamples ?? undefined
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

      // Enhance response with best-guess email IDs for saved examples (by exact subject match)
      const emailRepo = this.emailRepository;
      const mapSubjectsToIds = async (subjects: string[] | undefined) => {
        const out: string[] = [];
        if (!subjects || subjects.length === 0) return out;
        for (const s of subjects) {
          // Extract subject line from the stored example
          // Examples are stored as "Subject | ... - Content" or "Subject — Content"
          let subjectLine = s;
          const dashIndex = s.indexOf(' - ');
          const emDashIndex = s.indexOf(' — ');
          const separatorIndex = dashIndex !== -1 ? dashIndex : emDashIndex;
          
          if (separatorIndex !== -1) {
            subjectLine = s.substring(0, separatorIndex).trim();
          }
          
          console.log(`[Expectations] Mapping example to subject: "${s.substring(0, 50)}..." -> "${subjectLine}"`);
          
          const idExact = await (emailRepo as any).getLatestEmailIdBySubject?.(userId, subjectLine).catch(() => null);
          const idLike = idExact || await (emailRepo as any).getLatestEmailIdBySubjectLike?.(userId, subjectLine).catch(() => null);
          const id = idLike;
          if (id) {
            console.log(`[Expectations] Found email ID ${id} for subject "${subjectLine}"`);
            out.push(id);
          } else {
            console.log(`[Expectations] No email ID found for subject "${subjectLine}"`);
          }
        }
        return out;
      };
      const importantIds = await mapSubjectsToIds(expectations?.examples?.important);
      const notImportantIds = await mapSubjectsToIds(expectations?.examples?.notImportant);

      res.json({ expectations, selectedExampleEmailIds: { important: importantIds, notImportant: notImportantIds } });
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
      const { title, description } = req.body as UpdateExpectationsRequest;

      // Debug log incoming body shape
      try {
        const body = req.body as any;
        console.log('[Expectations][update] userId=%s has.examples=%s selImp.len=%s selNotImp.len=%s',
          userId,
          body.examples ? typeof body.examples : 'none',
          Array.isArray(body.selectedImportantEmailIds) ? body.selectedImportantEmailIds.length : 0,
          Array.isArray(body.selectedNotImportantEmailIds) ? body.selectedNotImportantEmailIds.length : 0,
        );
      } catch (_) { /* noop */ }

      try {
        const dbg = {
          userId,
          hasExamples: typeof (req.body as any).examples !== 'undefined',
          examplesType: typeof (req.body as any).examples,
          selectedImportantEmailIdsCount: Array.isArray((req.body as any).selectedImportantEmailIds)
            ? (req.body as any).selectedImportantEmailIds.length
            : 0,
          selectedNotImportantEmailIdsCount: Array.isArray((req.body as any).selectedNotImportantEmailIds)
            ? (req.body as any).selectedNotImportantEmailIds.length
            : 0,
        };
        console.log('[Expectations] update payload dbg:', dbg);
      } catch {}

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

      const normalizedExamples = await this.buildExamplesFromInput(req);
      console.log('[Expectations][update] normalizedExamples: imp.len=%s not.len=%s',
        normalizedExamples?.important.length ?? 0,
        normalizedExamples?.notImportant.length ?? 0,
      );
      console.log('[Expectations] update normalizedExamples counts:', {
        important: normalizedExamples?.important?.length || 0,
        notImportant: normalizedExamples?.notImportant?.length || 0,
      });
      if (normalizedExamples) {
        if (normalizedExamples.important.length > 10 || normalizedExamples.notImportant.length > 10) {
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
          examples: normalizedExamples ?? undefined
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
   * POST /api/digest/send-now
   * Compute a digest for the current user and record it as sent (no email delivery here)
   * Body: { windowHours?: number, minItems?: number, threshold?: number, dryRun?: boolean }
   */
  async sendDigestNow(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { windowHours, minItems, threshold, dryRun } = req.body || {};
      const digestService = new DigestService();
      const items = await digestService.computeDigestForUser(userId, { windowHours, minItems, threshold });
      if (!dryRun) {
        await digestService.recordDigestSent(userId, items);
      }
      res.json({ count: items.length, results: items, recorded: !dryRun });
    } catch (error) {
      console.error('❌ Failed to compute/send digest:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to compute/send digest' });
    }
  }

  /**
   * GET /api/digest/settings
   * Returns digest settings for the current user
   */
  async getDigestSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const db = await getDatabase();
      const row = await db.get<any>(
        'SELECT digest_enabled, digest_times, timezone, last_digest_at FROM users WHERE id = ?',
        [userId],
      );
      let times: string[] = ["11:00","21:00"];
      try { if (row?.digest_times) times = JSON.parse(row.digest_times); } catch {}
      res.json({
        enabled: row?.digest_enabled ? Boolean(row.digest_enabled) : true,
        times,
        timezone: row?.timezone || 'Asia/Kolkata',
        lastDigestAt: row?.last_digest_at || null,
      });
    } catch (error) {
      console.error('❌ Failed to get digest settings:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to get digest settings' });
    }
  }

  /**
   * PUT /api/digest/settings
   * Body: { enabled?: boolean, times?: string[], timezone?: string }
   */
  async updateDigestSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { enabled, times, timezone } = req.body || {};

      // Validate times if provided (HH:MM 24h format)
      if (times !== undefined) {
        if (!Array.isArray(times) || times.length === 0) {
          res.status(400).json({ error: 'Invalid times', message: 'times must be a non-empty array' });
          return;
        }
        const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
        for (const t of times) {
          if (typeof t !== 'string' || !timeRe.test(t)) {
            res.status(400).json({ error: 'Invalid time format', message: `Invalid time: ${t}. Use HH:MM (24h)` });
            return;
          }
        }
      }

      const db = await getDatabase();
      const fields: string[] = [];
      const values: any[] = [];
      if (enabled !== undefined) { fields.push('digest_enabled = ?'); values.push(enabled ? 1 : 0); }
      if (times !== undefined) { fields.push('digest_times = ?'); values.push(JSON.stringify(times)); }
      if (timezone !== undefined) { fields.push('timezone = ?'); values.push(timezone); }
      if (fields.length === 0) {
        res.status(400).json({ error: 'No changes', message: 'Provide enabled, times or timezone' });
        return;
      }
      values.push(userId);
      await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);

      res.json({ message: 'Digest settings updated' });
    } catch (error) {
      console.error('❌ Failed to update digest settings:', error);
      res.status(500).json({ error: 'Internal server error', message: 'Failed to update digest settings' });
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
      const emails = await this.emailRepository.getEmailsForUser(userId, { limit: Math.max(limit, 200), orderBy: 'received_at', orderDirection: 'DESC' });
      const emailIds = emails.map(e => e.id);

      // Fetch vectors
      const vectors = await qdrantRepository.getVectorsByEmailIds(emailIds);
      const idToVector = new Map(vectors.map(v => [v.emailId, v.embedding]));

      // Group by conversation key (thread-aware)
      const getThreadKey = (e: any) => {
        const threadId = e?.metadata?.threadId;
        if (threadId) return `thread:${threadId}`;
        const subjectKey = this.normalizeSubject(e.subject || '');
        const senderKey = (e.sender || '').toLowerCase().trim();
        if (subjectKey) return `subj:${subjectKey}|from:${senderKey}`;
        if (e.messageId) return `msg:${e.messageId}`;
        return `email:${e.id}`;
      };

      const byThread = new Map<string, { email: any; similarity: number | null; hasVector: boolean }>();
      for (const e of emails) {
        const emb = idToVector.get(e.id);
        const sim = emb ? this.cosineSimilarity(proto, emb) : null;
        const key = getThreadKey(e);
        const prev = byThread.get(key);
        // Keep the best similarity (max) as representative
        if (!prev || ((sim ?? -1) > (prev.similarity ?? -1))) {
          byThread.set(key, {
            email: { id: e.id, subject: e.subject, sender: e.sender, receivedAt: e.receivedAt },
            similarity: sim,
            hasVector: !!emb,
          });
        }
      }

      const scored = Array.from(byThread.values());
      scored.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));

      // Return up to requested limit threads
      res.json({ count: Math.min(limit, scored.length), results: scored.slice(0, limit) });
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

      // Compute distances per email
      const distances = vectors.map(v => ({ emailId: v.emailId, distance: 1 - this.cosineSimilarity(centroid, v.embedding) }));

      // Load metadata to group by conversation key
      const emails = await this.emailRepository.getByIds(distances.map(d => d.emailId));
      const emailById = new Map(emails.map(e => [e.id, e]));
      const getThreadKey = (e: any) => {
        const threadId = e?.metadata?.threadId;
        if (threadId) return `thread:${threadId}`;
        const subjectKey = this.normalizeSubject(e.subject || '');
        const senderKey = (e.sender || '').toLowerCase().trim();
        if (subjectKey) return `subj:${subjectKey}|from:${senderKey}`;
        if (e.messageId) return `msg:${e.messageId}`;
        return `email:${e.id}`;
      };

      // Reduce to one representative per thread (max distance)
      const byThread = new Map<string, { emailId: string; distance: number }>();
      for (const d of distances) {
        const e = emailById.get(d.emailId);
        const key = e ? getThreadKey(e) : `email:${d.emailId}`;
        const prev = byThread.get(key);
        if (!prev || d.distance > prev.distance) byThread.set(key, { emailId: d.emailId, distance: d.distance });
      }

      const threadResults = Array.from(byThread.values());
      threadResults.sort((a, b) => b.distance - a.distance);
      const top = threadResults.slice(0, limit);

      const results = top.map(t => {
        const e = emailById.get(t.emailId);
        if (!e) return { email: { id: t.emailId }, distance: t.distance };
        return {
          email: {
            id: e.id,
            subject: e.subject,
            sender: e.sender,
            receivedAt: e.receivedAt,
          },
          distance: t.distance,
        };
      });

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

      // Fast vector search in Qdrant to get top-K candidates
      const K = 500; // coarse cap; we will dedupe and slice to percentile afterwards
      const hits = await qdrantRepository.searchSimilar(proto, userId, K, 0.0);
      if (hits.length === 0) {
        res.json({ count: 0, results: [] });
        return;
      }

      // Fetch metadata for candidate emails so we can dedupe by thread
      const emails = await this.emailRepository.getByIds(hits.map(h => h.emailId));
      const emailById = new Map(emails.map(e => [e.id, e]));

      // Determine unique conversation keys across all emails (thread-aware + subject fallback)
      const getThreadKey = (eid: string) => {
        const e = emailById.get(eid);
        if (!e) return `email:${eid}`;
        // Prefer Gmail thread id
        const threadId = e.metadata?.threadId;
        if (threadId) return `thread:${threadId}`;
        // Fallback: normalized subject + sender (helps when threadId missing but it's effectively the same thread)
        const subjectKey = this.normalizeSubject(e.subject || '')
        const senderKey = (e.sender || '').toLowerCase().trim();
        if (subjectKey) return `subj:${subjectKey}|from:${senderKey}`;
        // Last resort: message id
        if (e.messageId) return `msg:${e.messageId}`;
        return `email:${e.id}`;
      };
      const allThreadKeys = new Set<string>();
      for (const h of hits) allThreadKeys.add(getThreadKey(h.emailId));

      // Compute how many unique threads to take by percentile
      const takeThreads = Math.max(1, Math.ceil((percent / 100) * allThreadKeys.size));

      // Walk scored emails top-down, pick highest-similarity per thread only
      const seenThreads = new Set<string>();
      const picked: { emailId: string; similarity: number }[] = [];
      for (const h of hits) {
        const key = getThreadKey(h.emailId);
        if (seenThreads.has(key)) continue;
        seenThreads.add(key);
        picked.push({ emailId: h.emailId, similarity: h.score });
        if (picked.length >= takeThreads) break;
      }

      const results = picked.map(t => {
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
   * Normalize subject by removing common reply/forward prefixes and collapsing whitespace
   */
  private normalizeSubject(subject: string): string {
    let s = subject.trim();
    // Remove common prefixes: Re:, Fwd:, FW:, etc. Repeatedly strip
    const prefixRe = /^(re|fwd|fw)\s*[:：\-]\s*/i;
    for (let i = 0; i < 5; i++) {
      if (prefixRe.test(s)) s = s.replace(prefixRe, ''); else break;
    }
    return s.replace(/\s+/g, ' ').toLowerCase();
  }
  
  /**
   * Normalize flexible examples input into the canonical shape { important: string[]; notImportant: string[] }
   * Supports:
   * - req.body.examples as {important, notImportant}
   * - req.body.examples as string[] (treated as important)
   * - req.body.examples as string (single important example)
   * - req.body.selectedImportantEmailIds / selectedNotImportantEmailIds: derive examples from real emails
   */
  private async buildExamplesFromInput(
    req: AuthenticatedRequest,
  ): Promise<{ important: string[]; notImportant: string[] } | undefined> {
    const body = req.body as Partial<CreateExpectationsRequest & UpdateExpectationsRequest>;
    const userId = req.user!.id;

    let important: string[] = [];
    let notImportant: string[] = [];

    // From examples field
    if (body.examples) {
      if (Array.isArray(body.examples)) {
        important = important.concat(body.examples.filter(Boolean));
      } else if (typeof body.examples === 'string') {
        important.push(body.examples);
      } else if (typeof body.examples === 'object') {
        if (Array.isArray(body.examples.important)) important = important.concat(body.examples.important.filter(Boolean));
        if (Array.isArray(body.examples.notImportant)) notImportant = notImportant.concat(body.examples.notImportant.filter(Boolean));
      }
    }

    // From selected email IDs
    const impIds = (body.selectedImportantEmailIds || []).slice(0, 20); // guard
    const notImpIds = (body.selectedNotImportantEmailIds || []).slice(0, 20);

    const allIds = Array.from(new Set([...impIds, ...notImpIds]));
    if (allIds.length > 0) {
      console.log('[Expectations] buildExamplesFromInput fetching emails by IDs:', { impIds: impIds.length, notImpIds: notImpIds.length, all: allIds.length });
      const emails = await this.emailRepository.getByIds(allIds);
      const userEmails = emails.filter(e => e.userId === userId);
      const byId = new Map(userEmails.map(e => [e.id, e]));

      const toExample = (id: string) => {
        const e = byId.get(id);
        if (!e) return null;
        // Build a compact example text: subject + short snippet of content
        const subject = e.subject || '';
        const content = (e.content || '').replace(/\s+/g, ' ').trim();
        const snippet = content.length > 400 ? content.slice(0, 400) + '…' : content;
        return [subject, snippet].filter(Boolean).join(' — ');
      };

      important = important.concat(impIds.map(toExample).filter((v): v is string => !!v));
      notImportant = notImportant.concat(notImpIds.map(toExample).filter((v): v is string => !!v));
      console.log('[Expectations] buildExamplesFromInput resolved examples:', { important: important.length, notImportant: notImportant.length });
    }

    // If nothing provided, return null so caller can pass undefined
    if (important.length === 0 && notImportant.length === 0) {
      return undefined;
    }

    // Deduplicate and trim whitespace
    const dedupe = (arr: string[]) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));
    return { important: dedupe(important), notImportant: dedupe(notImportant) };
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