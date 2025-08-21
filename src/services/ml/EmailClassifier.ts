import { Email, UserExpectations } from '../../types/models';
import { OpenAIFilterService } from './OpenAIFilterService';
import { UserExpectationsManager } from './UserExpectationsManager';
import { getDatabase } from '../../config/database';
import { VectorEmbeddingService } from '../embedding/VectorEmbeddingService';
import { QdrantRepository } from '../../repositories/QdrantRepository';

export interface ClassificationResult {
  emailId: string;
  importance: 'important' | 'not_important';
  confidence: number;
  reasoning: string;
  classifiedAt: Date;
  method: 'prototype' | 'openai' | 'fallback';
}

/**
 * Main email classifier that orchestrates the classification process
 * Uses OpenAI for intelligent classification with fallback mechanisms
 */
export class EmailClassifier {
  private openaiService: OpenAIFilterService;
  private expectationsManager: UserExpectationsManager;
  private embeddingService: VectorEmbeddingService;
  private qdrantRepository: QdrantRepository;
  private prototypeCache: Map<string, number[]> = new Map();

  constructor() {
    this.openaiService = new OpenAIFilterService();
    this.expectationsManager = new UserExpectationsManager();
    const openaiApiKey = process.env.OPENAI_API_KEY || '';
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    this.embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
    this.qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);
  }

  /**
   * Classify a single email based on user expectations
   */
  async classifyEmail(
    email: Email,
    userId: string,
    expectations?: UserExpectations
  ): Promise<ClassificationResult> {
    try {
      // Get user expectations if not provided
      if (!expectations) {
        const activeExpectations = await this.expectationsManager.getActiveExpectations(userId);
        if (!activeExpectations) {
          throw new Error('No active expectations found for user');
        }
        expectations = activeExpectations;
      }

      // Prototype-only path for single email
      const protoVector = await this.getExpectationPrototype(expectations);
      // Attempt to fetch vector for the single email via Qdrant scroll helper
      const vectors = await this.qdrantRepository.getVectorsByEmailIds([email.id]);
      const embedding = vectors[0]?.embedding;
      const HIGH_THRESHOLD = parseFloat(process.env.PROTOTYPE_HIGH_THRESHOLD || '0.80');
      const LOW_THRESHOLD = parseFloat(process.env.PROTOTYPE_LOW_THRESHOLD || '0.60');

      if (embedding) {
        const sim = this.cosineSimilarity(protoVector, embedding);
        const isDebug = process.env.INDEXING_DEBUG === 'true';
        if (isDebug) console.log(`[CLASSIFY DEBUG] email ${email.id} sim=${sim.toFixed(3)}`);
        if (sim >= HIGH_THRESHOLD) {
          const normConf = Math.min(1, Math.max(0, (sim - LOW_THRESHOLD) / (HIGH_THRESHOLD - LOW_THRESHOLD)));
          const res = { importance: 'important' as const, confidence: Math.round(normConf * 100) / 100, reasoning: `Prototype similarity ${sim.toFixed(3)} ≥ ${HIGH_THRESHOLD}` };
          await this.storeClassificationResult(email.id, res, 'prototype');
          return { emailId: email.id, importance: res.importance, confidence: res.confidence, reasoning: res.reasoning, classifiedAt: new Date(), method: 'prototype' };
        }
        if (sim <= LOW_THRESHOLD) {
          const normConf = Math.min(1, Math.max(0, (HIGH_THRESHOLD - sim) / (HIGH_THRESHOLD - LOW_THRESHOLD)));
          const res = { importance: 'not_important' as const, confidence: Math.round(normConf * 100) / 100, reasoning: `Prototype similarity ${sim.toFixed(3)} ≤ ${LOW_THRESHOLD}` };
          await this.storeClassificationResult(email.id, res, 'prototype');
          return { emailId: email.id, importance: res.importance, confidence: res.confidence, reasoning: res.reasoning, classifiedAt: new Date(), method: 'prototype' };
        }
      }
      // Borderline or missing vector: try OpenAI, fallback if unavailable
      const isOpenAIAvailable = await this.openaiService.isAvailable();
      if (isOpenAIAvailable) {
        try {
          const result = await this.openaiService.classifyEmail(email, expectations);
          await this.storeClassificationResult(email.id, result, 'openai');
          return {
            emailId: email.id,
            importance: result.importance,
            confidence: result.confidence,
            reasoning: result.reasoning,
            classifiedAt: new Date(),
            method: 'openai'
          };
        } catch (openaiError) {
          console.error('OpenAI single-email classification failed, using fallback:', openaiError);
        }
      }
      return this.fallbackClassification(email, expectations);
    } catch (error) {
      console.error('Email classification error:', error);
      return this.fallbackClassification(email, expectations);
    }
  }

  /**
   * Classify multiple emails in batch
   */
  async classifyEmailsBatch(
    emails: Email[],
    userId: string,
    expectations?: UserExpectations
  ): Promise<ClassificationResult[]> {
    if (emails.length === 0) {
      return [];
    }

    try {
      // Get user expectations if not provided
      if (!expectations) {
        const activeExpectations = await this.expectationsManager.getActiveExpectations(userId);
        if (!activeExpectations) {
          throw new Error('No active expectations found for user');
        }
        expectations = activeExpectations;
      }
      // Cosine-similarity prototype classification first
      const protoVector = await this.getExpectationPrototype(expectations);
      const emailIds = emails.map(e => e.id);
      const vectors = await this.qdrantRepository.getVectorsByEmailIds(emailIds);
      const idToVector = new Map(vectors.map(v => [v.emailId, v.embedding]));

      const HIGH_THRESHOLD = parseFloat(process.env.PROTOTYPE_HIGH_THRESHOLD || '0.80');
      const LOW_THRESHOLD = parseFloat(process.env.PROTOTYPE_LOW_THRESHOLD || '0.60');

      const borderlineEmails: Email[] = [];
      const resultsSoFar: ClassificationResult[] = [];

      for (const email of emails) {
        const embedding = idToVector.get(email.id);
        if (!embedding) {
          // No vector: push to borderline for fallback (silent; count logged later)
          borderlineEmails.push(email);
          continue;
        }
        const sim = this.cosineSimilarity(protoVector, embedding);
        if (sim >= HIGH_THRESHOLD) {
          const res = {
            importance: 'important' as const,
            confidence: Math.round(sim * 100) / 100,
            reasoning: `Prototype similarity ${sim.toFixed(3)} ≥ ${HIGH_THRESHOLD}`
          };
          await this.storeClassificationResult(email.id, res, 'prototype');
          if (process.env.INDEXING_DEBUG === 'true') {
            console.log(`[CLASSIFY DEBUG] email ${email.id} sim=${sim.toFixed(3)} decision=important conf=${res.confidence}`);
          }
          resultsSoFar.push({
            emailId: email.id,
            importance: res.importance,
            confidence: res.confidence,
            reasoning: res.reasoning,
            classifiedAt: new Date(),
            method: 'prototype'
          });
        } else if (sim <= LOW_THRESHOLD) {
          const res = {
            importance: 'not_important' as const,
            confidence: Math.round((1 - sim) * 100) / 100,
            reasoning: `Prototype similarity ${sim.toFixed(3)} ≤ ${LOW_THRESHOLD}`
          };
          await this.storeClassificationResult(email.id, res, 'prototype');
          if (process.env.INDEXING_DEBUG === 'true') {
            console.log(`[CLASSIFY DEBUG] email ${email.id} sim=${sim.toFixed(3)} decision=not_important conf=${res.confidence}`);
          }
          resultsSoFar.push({
            emailId: email.id,
            importance: res.importance,
            confidence: res.confidence,
            reasoning: res.reasoning,
            classifiedAt: new Date(),
            method: 'prototype'
          });
        } else {
          // Borderline: defer to fallback (silent; count logged later)
          borderlineEmails.push(email);
        }
      }

      if (borderlineEmails.length === 0) {
        return resultsSoFar;
      }

      // Borderline: try OpenAI on this subset; fallback if unavailable/errors
      if (process.env.INDEXING_DEBUG === 'true') {
        console.log(`[CLASSIFY DEBUG] borderline emails count=${borderlineEmails.length}`);
      }
      const isOpenAIAvailable = await this.openaiService.isAvailable();
      if (isOpenAIAvailable) {
        try {
          const llmResults = await this.openaiService.classifyEmailsBatch(borderlineEmails, expectations);
          for (const result of llmResults) {
            await this.storeClassificationResult(result.emailId, result, 'openai');
            resultsSoFar.push({
              emailId: result.emailId,
              importance: result.importance,
              confidence: result.confidence,
              reasoning: result.reasoning,
              classifiedAt: new Date(),
              method: 'openai'
            });
          }
          return resultsSoFar;
        } catch (openaiError) {
          console.error('OpenAI borderline classification failed, using fallback:', openaiError);
        }
      }
      resultsSoFar.push(...this.fallbackBatchClassification(borderlineEmails, expectations));
      return resultsSoFar;
    } catch (error) {
      console.error('Batch email classification error:', error);
      return this.fallbackBatchClassification(emails, expectations);
    }
  }

  /**
   * Get classification confidence threshold for flagging uncertain results
   */
  getConfidenceThreshold(): number {
    return parseFloat(process.env.CLASSIFICATION_CONFIDENCE_THRESHOLD || '0.7');
  }

  /**
   * Check if classification result should be flagged for manual review
   */
  shouldFlagForReview(result: ClassificationResult): boolean {
    // Flag fallback always
    if (result.method === 'fallback') return true;
    // For prototype, only flag if confidence is very low (< 0.5)
    return result.confidence < 0.5;
  }

  /**
   * Fallback classification when OpenAI is unavailable
   * Uses simple keyword-based heuristics
   */
  private fallbackClassification(
    email: Email,
    expectations?: UserExpectations
  ): ClassificationResult {
    const importance = this.simpleKeywordClassification(email, expectations);
    
    const result = {
      importance,
      confidence: 0.3, // Low confidence for fallback method
      reasoning: 'Classified using fallback method due to OpenAI unavailability'
    };

    // Store fallback classification
    this.storeClassificationResult(email.id, result, 'fallback').catch(error => {
      console.error('Failed to store fallback classification:', error);
    });

    return {
      emailId: email.id,
      importance: result.importance,
      confidence: result.confidence,
      reasoning: result.reasoning,
      classifiedAt: new Date(),
      method: 'fallback'
    };
  }

  /**
   * Fallback batch classification
   */
  private fallbackBatchClassification(
    emails: Email[],
    expectations?: UserExpectations
  ): ClassificationResult[] {
    return emails.map(email => this.fallbackClassification(email, expectations));
  }

  /**
   * Simple keyword-based classification as fallback
   */
  private simpleKeywordClassification(
    email: Email,
    expectations?: UserExpectations
  ): 'important' | 'not_important' {
    const content = `${email.subject} ${email.content}`.toLowerCase();
    
    // Important keywords (basic heuristics)
    const importantKeywords = [
      'urgent', 'important', 'deadline', 'meeting', 'project', 'assignment',
      'grade', 'exam', 'test', 'interview', 'application', 'admission',
      'scholarship', 'research', 'conference', 'publication', 'thesis',
      'dissertation', 'faculty', 'professor', 'dean', 'registrar'
    ];

    // Not important keywords
    const unimportantKeywords = [
      'newsletter', 'promotion', 'sale', 'discount', 'offer', 'deal',
      'marketing', 'advertisement', 'spam', 'unsubscribe', 'social media',
      'notification', 'update', 'reminder'
    ];

    // Check for important keywords
    const importantMatches = importantKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;

    // Check for unimportant keywords
    const unimportantMatches = unimportantKeywords.filter(keyword => 
      content.includes(keyword)
    ).length;

    // Simple scoring
    if (importantMatches > unimportantMatches) {
      return 'important';
    } else if (unimportantMatches > importantMatches) {
      return 'not_important';
    }

    // Default to not important if unclear
    return 'not_important';
  }

  /**
   * Store classification result in database
   */
  private async storeClassificationResult(
    emailId: string,
    result: { importance: string; confidence: number; reasoning: string },
    method: 'prototype' | 'openai' | 'fallback'
  ): Promise<void> {
    try {
      const db = await getDatabase();
      
      // Update email with classification result
      await db.run(`
        UPDATE emails 
        SET importance = ?, importance_confidence = ?, user_labeled = 0
        WHERE id = ?
      `, [result.importance, result.confidence, emailId]);

      // Log classification for audit trail, but skip fallback logs to reduce noise
      if (method !== 'fallback') {
        console.log(`Email ${emailId} classified as ${result.importance} (confidence: ${result.confidence}, method: ${method})`);
      }
    } catch (error) {
      console.error('Failed to store classification result:', error);
      throw error;
    }
  }

  // --- Prototype utilities ---
  private buildExpectationsText(expectations: UserExpectations): string {
    const important = expectations.examples?.important?.join('\n') || '';
    const notImportant = expectations.examples?.notImportant?.join('\n') || '';
    return [
      expectations.title || '',
      expectations.description || '',
      important,
      notImportant
    ].join('\n').trim();
  }

  private async getExpectationPrototype(expectations: UserExpectations): Promise<number[]> {
    const key = JSON.stringify({
      t: expectations.title,
      d: expectations.description,
      i: expectations.examples?.important || [],
      n: expectations.examples?.notImportant || []
    });
    const cached = this.prototypeCache.get(key);
    if (cached) return cached;

    const text = this.buildExpectationsText(expectations);
    const vector = await this.embeddingService.generateEmbedding(text);
    this.prototypeCache.set(key, vector);
    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
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
}