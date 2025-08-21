/**
 * Unit tests for AuthController class
 */

import { Request, Response } from 'express';
import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import { AuthController } from '../../controllers/AuthController';

// Mock dependencies
jest.mock('jsonwebtoken');
const mockJwt = jwt as jest.Mocked<typeof jwt>;

// Mock the auth services
jest.mock('../../services/auth/DomainValidator');
jest.mock('../../services/auth/OAuthManager');
jest.mock('../../services/auth/TokenStore');

import { DomainValidator } from '../../services/auth/DomainValidator';
import { OAuthManager } from '../../services/auth/OAuthManager';
import { TokenStore } from '../../services/auth/TokenStore';

const MockDomainValidator = DomainValidator as jest.MockedClass<typeof DomainValidator>;
const MockOAuthManager = OAuthManager as jest.MockedClass<typeof OAuthManager>;
const MockTokenStore = TokenStore as jest.MockedClass<typeof TokenStore>;

describe('AuthController', () => {
  let db: Database;
  let authController: AuthController;
  let mockDomainValidator: jest.Mocked<DomainValidator>;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockTokenStore: jest.Mocked<TokenStore>;
  let req: Partial<Request & { session?: any; user?: any }>;
  let res: Partial<Response>;

  const config = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback'
  };

  beforeEach(async () => {
    // Create in-memory database
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Create users table
    await db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL,
        auto_classify INTEGER DEFAULT 1,
        confidence_threshold REAL DEFAULT 0.7
      );
    `);

    // Setup mocks
    mockDomainValidator = {
      validateEmail: jest.fn(),
      isValidDomain: jest.fn(),
      extractDomain: jest.fn(),
      getAllowedDomain: jest.fn()
    } as any;

    mockOAuthManager = {
      getAuthorizationUrl: jest.fn(),
      exchangeCodeForTokens: jest.fn(),
      getUserInfo: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeTokens: jest.fn(),
      validateAccessToken: jest.fn(),
      createAuthenticatedClient: jest.fn()
    } as any;

    mockTokenStore = {
      storeTokens: jest.fn(),
      getTokens: jest.fn(),
      updateAccessToken: jest.fn(),
      hasValidTokens: jest.fn(),
      deleteTokens: jest.fn(),
      cleanupExpiredTokens: jest.fn()
    } as any;

    MockDomainValidator.mockImplementation(() => mockDomainValidator);
    MockOAuthManager.mockImplementation(() => mockOAuthManager);
    MockTokenStore.mockImplementation(() => mockTokenStore);

    authController = new AuthController(
      db,
      config,
      'test-encryption-key',
      'test-jwt-secret'
    );

    // Setup request and response mocks
    req = {
      body: {},
      session: {}
    };

    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  afterEach(async () => {
    await db.close();
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should initiate OAuth flow successfully', async () => {
      const authUrl = 'https://accounts.google.com/oauth/authorize?...';
      mockOAuthManager.getAuthorizationUrl.mockReturnValue(authUrl);

      await authController.login(req as Request, res as Response);

      expect(mockOAuthManager.getAuthorizationUrl).toHaveBeenCalledWith(
        expect.any(String)
      );
      expect(res.json).toHaveBeenCalledWith({
        authUrl,
        message: 'Redirect to the provided URL to complete authentication'
      });
    });

    it('should validate email domain if provided', async () => {
      req.body = { email: 'user@gmail.com' };
      mockDomainValidator.validateEmail.mockReturnValue({
        isValid: false,
        error: 'Only @ashoka.edu.in email addresses are allowed'
      });

      await authController.login(req as Request, res as Response);

      expect(mockDomainValidator.validateEmail).toHaveBeenCalledWith('user@gmail.com');
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid email',
        message: 'Only @ashoka.edu.in email addresses are allowed'
      });
    });

    it('should handle errors gracefully', async () => {
      mockOAuthManager.getAuthorizationUrl.mockImplementation(() => {
        throw new Error('OAuth error');
      });

      await authController.login(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
        message: 'Unable to initiate login process'
      });
    });
  });

  describe('callback', () => {
    beforeEach(() => {
      req.body = { code: 'test-code', state: 'test-state' };
      req.session = { oauthState: 'test-state' };
    });

    it('should complete OAuth flow successfully', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date()
      };

      const mockUserInfo = {
        id: 'user-123',
        email: 'user@ashoka.edu.in',
        name: 'Test User'
      };

      mockOAuthManager.exchangeCodeForTokens.mockResolvedValue(mockTokens);
      mockOAuthManager.getUserInfo.mockResolvedValue(mockUserInfo);
      mockDomainValidator.validateEmail.mockReturnValue({ isValid: true });
      mockTokenStore.storeTokens.mockResolvedValue();
      mockJwt.sign.mockReturnValue('test-jwt-token' as any);

      await authController.callback(req as Request, res as Response);

      expect(mockOAuthManager.exchangeCodeForTokens).toHaveBeenCalledWith('test-code');
      expect(mockOAuthManager.getUserInfo).toHaveBeenCalledWith(mockTokens.accessToken);
      expect(mockDomainValidator.validateEmail).toHaveBeenCalledWith(mockUserInfo.email);
      expect(mockTokenStore.storeTokens).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: expect.any(String),
          email: mockUserInfo.email,
          name: mockUserInfo.name
        },
        token: 'test-jwt-token',
        message: 'Authentication successful'
      });
    });

    it('should reject invalid email domains', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date()
      };

      const mockUserInfo = {
        id: 'user-123',
        email: 'user@gmail.com',
        name: 'Test User'
      };

      mockOAuthManager.exchangeCodeForTokens.mockResolvedValue(mockTokens);
      mockOAuthManager.getUserInfo.mockResolvedValue(mockUserInfo);
      mockDomainValidator.validateEmail.mockReturnValue({
        isValid: false,
        error: 'Only @ashoka.edu.in email addresses are allowed'
      });
      mockOAuthManager.revokeTokens.mockResolvedValue();

      await authController.callback(req as Request, res as Response);

      expect(mockOAuthManager.revokeTokens).toHaveBeenCalledWith(mockTokens.accessToken);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized domain',
        message: 'Only @ashoka.edu.in email addresses are allowed'
      });
    });

    it('should validate state parameter for CSRF protection', async () => {
      req.body = { code: 'test-code', state: 'wrong-state' };

      await authController.callback(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid state parameter',
        message: 'Possible CSRF attack detected'
      });
    });

    it('should handle missing authorization code', async () => {
      req.body = { state: 'test-state' };

      await authController.callback(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing authorization code',
        message: 'Authorization code is required'
      });
    });

    it('should handle OAuth errors', async () => {
      req.body = { error: 'access_denied', state: 'test-state' };

      await authController.callback(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'OAuth error',
        message: 'access_denied'
      });
    });
  });

  describe('refresh', () => {
    beforeEach(() => {
      (req as any).user = { id: 'user-123', email: 'user@ashoka.edu.in' };
    });

    it('should refresh tokens successfully', async () => {
      const currentTokens = {
        accessToken: 'old-access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date()
      };

      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      // Insert user into database
      await db.run(`
        INSERT INTO users (id, email, created_at, last_login_at)
        VALUES (?, ?, ?, ?)
      `, ['user-123', 'user@ashoka.edu.in', new Date().toISOString(), new Date().toISOString()]);

      mockTokenStore.getTokens.mockResolvedValue(currentTokens);
      mockOAuthManager.refreshAccessToken.mockResolvedValue(newTokens);
      mockTokenStore.updateAccessToken.mockResolvedValue();
      mockJwt.sign.mockReturnValue('new-jwt-token' as any);

      await authController.refresh(req as any, res as Response);

      expect(mockTokenStore.getTokens).toHaveBeenCalledWith('user-123');
      expect(mockOAuthManager.refreshAccessToken).toHaveBeenCalledWith(currentTokens.refreshToken);
      expect(mockTokenStore.updateAccessToken).toHaveBeenCalledWith(
        'user-123',
        newTokens.accessToken,
        newTokens.expiresAt
      );
      expect(res.json).toHaveBeenCalledWith({
        token: 'new-jwt-token',
        expiresAt: newTokens.expiresAt,
        message: 'Tokens refreshed successfully'
      });
    });

    it('should require authentication', async () => {
      delete (req as any).user;

      await authController.refresh(req as any, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    });

    it('should handle missing tokens', async () => {
      mockTokenStore.getTokens.mockResolvedValue(null);

      await authController.refresh(req as any, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No tokens found',
        message: 'Please re-authenticate'
      });
    });
  });

  describe('status', () => {
    it('should return authentication status for authenticated user', async () => {
      (req as any).user = { id: 'user-123', email: 'user@ashoka.edu.in' };

      // Insert user into database
      await db.run(`
        INSERT INTO users (id, email, created_at, last_login_at)
        VALUES (?, ?, ?, ?)
      `, ['user-123', 'user@ashoka.edu.in', new Date().toISOString(), new Date().toISOString()]);

      mockTokenStore.hasValidTokens.mockResolvedValue(true);

      await authController.status(req as any, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        authenticated: true,
        user: {
          id: 'user-123',
          email: 'user@ashoka.edu.in',
          lastLoginAt: expect.any(Date)
        },
        hasValidTokens: true,
        message: 'Authentication status retrieved'
      });
    });

    it('should return unauthenticated status for non-authenticated user', async () => {
      await authController.status(req as any, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        authenticated: false,
        message: 'Not authenticated'
      });
    });
  });

  describe('logout', () => {
    it('should logout user and revoke tokens', async () => {
      (req as any).user = { id: 'user-123', email: 'user@ashoka.edu.in' };

      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date()
      };

      mockTokenStore.getTokens.mockResolvedValue(tokens);
      mockOAuthManager.revokeTokens.mockResolvedValue();
      mockTokenStore.deleteTokens.mockResolvedValue();

      await authController.logout(req as any, res as Response);

      expect(mockOAuthManager.revokeTokens).toHaveBeenCalledWith(tokens.accessToken);
      expect(mockTokenStore.deleteTokens).toHaveBeenCalledWith('user-123');
      expect(res.json).toHaveBeenCalledWith({
        message: 'Logged out successfully'
      });
    });

    it('should handle logout for already logged out user', async () => {
      await authController.logout(req as any, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        message: 'Already logged out'
      });
    });
  });
});