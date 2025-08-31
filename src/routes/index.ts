import { Router } from 'express';
import { EmailController } from '../controllers/EmailController';
import { FilterController } from '../controllers/FilterController';
import { IndexingController } from '../controllers/IndexingController';
import { AuthController } from '../controllers/AuthController';
import { EmailRepository } from '../repositories/EmailRepository';
import { PreferencePrototypeService } from '../services/ml/PreferencePrototypeService';
import { PreferenceController } from '../controllers/PreferenceController';
import { EmailSearchService } from '../services/search/EmailSearchService';
import { QdrantRepository } from '../repositories/QdrantRepository';
import { CacheRepository } from '../repositories/CacheRepository';
import { VectorEmbeddingService } from '../services/embedding/VectorEmbeddingService';
import { SyncStateManager } from '../services/sync/SyncStateManager';
import { IncrementalIndexer } from '../services/indexing/IncrementalIndexer';
import { FullIndexer } from '../services/indexing/FullIndexer';
import { UserExpectationsManager } from '../services/ml/UserExpectationsManager';
import { FilteringPipeline } from '../services/ml/FilteringPipeline';
import { OpenAIFilterService } from '../services/ml/OpenAIFilterService';
import { EmailFetcher } from '../services/email/EmailFetcher';
import { EmailParser } from '../services/email/EmailParser';
import { OAuthManager } from '../services/auth/OAuthManager';
import { TokenStore } from '../services/auth/TokenStore';
import { DomainValidator } from '../services/auth/DomainValidator';
import { authenticateToken } from '../middleware/auth';
import { getDatabase } from '../config/database';
import { getQdrantClient } from '../config/qdrant';
import { getRedisClient } from '../config/redis';

/**
 * Initialize and configure all API routes
 */
export async function createRoutes(): Promise<Router> {
  const router = Router();

  // Initialize database and external services
  const db = await getDatabase();
  const redisClient = getRedisClient();

  // Get configuration from environment
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  const encryptionKey = process.env.ENCRYPTION_KEY || 'your-encryption-key';

  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Initialize repositories
  const emailRepository = new EmailRepository();
  const qdrantRepository = new QdrantRepository(qdrantUrl, qdrantApiKey);
  const cacheRepository = new CacheRepository();

  // Initialize core services
  const embeddingService = new VectorEmbeddingService(openaiApiKey, qdrantUrl, qdrantApiKey);
  // Ensure the Qdrant collection exists before serving requests
  try {
    await embeddingService.initializeCollection();
  } catch (e) {
    console.error('Failed to initialize Qdrant collection:', e);
    // Continue startup; requests that rely on vectors may fail until resolved
  }
  const syncStateManager = new SyncStateManager(db);
  const emailParser = new EmailParser();

  // OAuth configuration
  const oauthConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://15.206.169.99:3005/auth/callback'
  };
  const oauthManager = new OAuthManager(oauthConfig);

  // Note: EmailFetcher requires user-specific tokens, so we'll create a factory function
  // For now, we'll pass null and handle this in the actual indexing operations
  const createEmailFetcher = (tokens: any) => new EmailFetcher(oauthManager, tokens);

  // Initialize indexing services with a placeholder emailFetcher
  // In practice, these would be created per-user with their specific tokens
  const incrementalIndexer = new IncrementalIndexer(
    db,
    null as any, // Will be set per-user during actual operations
    emailParser,
    embeddingService,
    syncStateManager
  );
  const fullIndexer = new FullIndexer(
    db,
    null as any, // Will be set per-user during actual operations
    emailParser,
    embeddingService,
    syncStateManager
  );

  // Initialize search service
  const emailSearchService = new EmailSearchService(
    emailRepository,
    qdrantRepository,
    cacheRepository,
    embeddingService
  );

  // Initialize ML services
  const expectationsManager = new UserExpectationsManager();
  const filteringPipeline = new FilteringPipeline();
  const openaiService = new OpenAIFilterService();

  const allowedDomain = process.env.ALLOWED_DOMAIN || '@ashoka.edu.in';

  // Initialize controllers
  const authController = new AuthController(db, oauthConfig, encryptionKey, jwtSecret, allowedDomain);
  const emailController = new EmailController(
    emailRepository,
    emailSearchService,
    syncStateManager,
    incrementalIndexer,
    fullIndexer
  );
  const filterController = new FilterController(
    expectationsManager,
    filteringPipeline,
    openaiService,
    emailRepository
  );
  const preferenceService = new PreferencePrototypeService();
  const preferenceController = new PreferenceController(preferenceService, emailRepository);
  const tokenStore = new TokenStore(db, encryptionKey);
  const indexingController = new IndexingController(
    db,
    oauthManager,
    tokenStore,
    emailParser,
    embeddingService,
    syncStateManager,
    emailRepository,
    qdrantRepository
  );

  // Auth routes (no authentication required)
  router.post('/auth/login', authController.login.bind(authController));
  router.post('/auth/callback', authController.callback.bind(authController));
  router.get('/auth/callback', authController.callbackGet.bind(authController)); // Handle GET from Google
  router.post('/auth/refresh', authController.refresh.bind(authController));
  router.get('/auth/status', authController.status.bind(authController));
  
  // Logout route (can work with or without authentication)
  router.post('/auth/logout', authController.logout.bind(authController));

  // Protected routes (authentication required)
  router.use(authenticateToken(jwtSecret));

  // Email management routes
  router.get('/emails', emailController.getEmails.bind(emailController));
  router.get('/emails/search', emailController.searchEmails.bind(emailController));
  router.get('/emails/sync/status', emailController.getSyncStatus.bind(emailController));
  router.get('/emails/:id', emailController.getEmailById.bind(emailController));
  router.get('/emails/:id/similar', emailController.getSimilarEmails.bind(emailController));
  router.put('/emails/:id/importance', emailController.updateEmailImportance.bind(emailController));
  router.post('/emails/sync', emailController.triggerSync.bind(emailController));

  // Filter management routes
  router.post('/filter/expectations', filterController.createExpectations.bind(filterController));
  router.get('/filter/expectations', filterController.getExpectations.bind(filterController));
  router.put('/filter/expectations', filterController.updateExpectations.bind(filterController));
  router.delete('/filter/expectations', filterController.deactivateExpectations.bind(filterController));
  router.post('/filter/batch', filterController.batchFilter.bind(filterController));
  router.get('/filter/status', filterController.getFilteringStatus.bind(filterController));
  router.post('/filter/classify/:id', filterController.classifySingleEmail.bind(filterController));
  router.post('/filter/reset', filterController.resetClassifications.bind(filterController));
  
  // Preference prototype routes
  router.get('/preferences', preferenceController.getPreferences.bind(preferenceController));
  router.put('/preferences', preferenceController.savePreferences.bind(preferenceController));
  router.post('/preferences/train', preferenceController.train.bind(preferenceController));
  router.get('/preferences/score/:id', preferenceController.score.bind(preferenceController));
  // Digest routes
  router.post('/digest/send-now', filterController.sendDigestNow.bind(filterController));
  router.get('/digest/settings', filterController.getDigestSettings.bind(filterController));
  router.put('/digest/settings', filterController.updateDigestSettings.bind(filterController));
  router.get('/digest/history', filterController.getDigestHistory.bind(filterController));
  router.get('/digest/:id', filterController.getDigestById.bind(filterController));
  router.post('/digest/test-email', filterController.testDigestEmail.bind(filterController));
  // router.post('/filter/rules/timeslots', filterController.classifyByTimeslots.bind(filterController));
  // router.post('/filter/rules/oweek', filterController.classifyByOWeek.bind(filterController));
  router.get('/filter/scores', filterController.getPrototypeScores.bind(filterController));
  router.get('/filter/outliers', filterController.getOutliers.bind(filterController));
  router.get('/filter/top-similar', filterController.getTopSimilar.bind(filterController));

  // Indexing management routes
  router.post('/indexing/full', indexingController.triggerFullIndexing.bind(indexingController));
  router.post('/indexing/incremental', indexingController.triggerIncrementalIndexing.bind(indexingController));
  router.post('/indexing/sync', indexingController.triggerSync.bind(indexingController));
  router.get('/indexing/auto-sync/settings', indexingController.getAutoSyncSettings.bind(indexingController));
  router.put('/indexing/auto-sync/settings', indexingController.updateAutoSyncSettings.bind(indexingController));
  // Auto-sync settings endpoints (reusing FilterController DB util would be overkill; add minimal handlers here later if needed)
  router.get('/indexing/status', indexingController.getIndexingStatus.bind(indexingController));
  router.get('/indexing/progress', indexingController.getIndexingProgress.bind(indexingController));
  router.post('/indexing/cancel', indexingController.cancelIndexing.bind(indexingController));
  router.get('/indexing/stats', indexingController.getIndexingStats.bind(indexingController));
  router.post('/indexing/reset', indexingController.resetIndexingState.bind(indexingController));

  return router;
}