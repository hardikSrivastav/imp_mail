import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import dotenv from 'dotenv';
import { createRoutes } from './routes';
import { getDatabase } from './config/database';
import { runMigrations } from './database/migrations';
import { startDigestScheduler } from './services/digest/DigestScheduler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:3000', 'http://localhost:3005'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware for OAuth state management
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'intelligent-email-filter',
    version: '1.0.0'
  });
});

// Initialize and mount API routes
async function startServer() {
  try {
    console.log('🔧 Initializing services...');
    
    // Initialize database and run migrations
    console.log('📊 Setting up database...');
    const db = await getDatabase();
    await runMigrations(db);
    
    const apiRoutes = await createRoutes();
    
    // Mount API routes
    app.use('/api', apiRoutes);

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: {
          health: 'GET /health',
          auth: 'POST /api/auth/*',
          emails: 'GET /api/emails',
          filter: 'POST /api/filter/*',
          indexing: 'POST /api/indexing/*'
        }
      });
    });

    // Error handler
    app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Unhandled error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📧 Intelligent Email Filter API`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API endpoints: http://localhost:${PORT}/api`);
    });

    // Start digest scheduler (background)
    try {
      await startDigestScheduler();
      console.log('⏰ Digest scheduler started');
    } catch (e) {
      console.error('Failed to start digest scheduler:', e);
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;