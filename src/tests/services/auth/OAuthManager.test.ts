/**
 * Unit tests for OAuthManager class
 */

import { OAuthManager, OAuthConfig } from '../../../services/auth/OAuthManager';
import { google } from 'googleapis';

// Mock googleapis
jest.mock('googleapis');
const mockGoogle = google as jest.Mocked<typeof google>;

describe('OAuthManager', () => {
  let oauthManager: OAuthManager;
  let mockOAuth2Client: any;
  let mockOAuth2Service: any;

  const config: OAuthConfig = {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback'
  };

  beforeEach(() => {
    // Mock OAuth2Client
    mockOAuth2Client = {
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      setCredentials: jest.fn(),
      refreshAccessToken: jest.fn(),
      revokeCredentials: jest.fn()
    };

    // Mock oauth2 service
    mockOAuth2Service = {
      userinfo: {
        get: jest.fn()
      }
    };

    (mockGoogle.auth.OAuth2 as any).mockImplementation(() => mockOAuth2Client);
    (mockGoogle.oauth2 as any).mockImplementation(() => mockOAuth2Service);

    oauthManager = new OAuthManager(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate authorization URL with correct parameters', () => {
      const expectedUrl = 'https://accounts.google.com/oauth/authorize?...';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(expectedUrl);

      const url = oauthManager.getAuthorizationUrl('test-state');

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/gmail.readonly'
        ],
        prompt: 'consent',
        state: 'test-state'
      });

      expect(url).toBe(expectedUrl);
    });

    it('should generate state parameter if not provided', () => {
      const expectedUrl = 'https://accounts.google.com/oauth/authorize?...';
      mockOAuth2Client.generateAuthUrl.mockReturnValue(expectedUrl);

      const url = oauthManager.getAuthorizationUrl();

      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.any(String)
        })
      );

      expect(url).toBe(expectedUrl);
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens successfully', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const result = await oauthManager.exchangeCodeForTokens('test-code');

      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('test-code');
      expect(result.accessToken).toBe(mockTokens.access_token);
      expect(result.refreshToken).toBe(mockTokens.refresh_token);
      expect(result.expiresAt.getTime()).toBe(mockTokens.expiry_date);
    });

    it('should throw error if access token is missing', async () => {
      const mockTokens = {
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      await expect(oauthManager.exchangeCodeForTokens('test-code'))
        .rejects.toThrow('Failed to complete OAuth authentication');
    });

    it('should throw error if refresh token is missing', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      await expect(oauthManager.exchangeCodeForTokens('test-code'))
        .rejects.toThrow('Failed to complete OAuth authentication');
    });

    it('should use default expiry if not provided', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      mockOAuth2Client.getToken.mockResolvedValue({ tokens: mockTokens });

      const result = await oauthManager.exchangeCodeForTokens('test-code');

      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.expiresAt.getTime()).toBeLessThan(Date.now() + 3700000); // Within 1 hour + buffer
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token successfully', async () => {
      const mockCredentials = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({ 
        credentials: mockCredentials 
      });

      const result = await oauthManager.refreshAccessToken('old-refresh-token');

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'old-refresh-token'
      });
      expect(mockOAuth2Client.refreshAccessToken).toHaveBeenCalled();
      expect(result.accessToken).toBe(mockCredentials.access_token);
      expect(result.refreshToken).toBe(mockCredentials.refresh_token);
    });

    it('should keep existing refresh token if not provided in response', async () => {
      const mockCredentials = {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({ 
        credentials: mockCredentials 
      });

      const result = await oauthManager.refreshAccessToken('old-refresh-token');

      expect(result.refreshToken).toBe('old-refresh-token');
    });

    it('should throw error if access token is missing in response', async () => {
      const mockCredentials = {
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 3600000
      };

      mockOAuth2Client.refreshAccessToken.mockResolvedValue({ 
        credentials: mockCredentials 
      });

      await expect(oauthManager.refreshAccessToken('old-refresh-token'))
        .rejects.toThrow('Failed to refresh authentication tokens');
    });
  });

  describe('getUserInfo', () => {
    it('should get user information successfully', async () => {
      const mockUserData = {
        id: 'user-123',
        email: 'user@ashoka.edu.in',
        name: 'Test User',
        picture: 'https://example.com/picture.jpg'
      };

      mockOAuth2Service.userinfo.get.mockResolvedValue({ data: mockUserData });

      const result = await oauthManager.getUserInfo('test-access-token');

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'test-access-token'
      });
      expect(mockOAuth2Service.userinfo.get).toHaveBeenCalled();
      expect(result).toEqual({
        id: mockUserData.id,
        email: mockUserData.email,
        name: mockUserData.name,
        picture: mockUserData.picture
      });
    });

    it('should use email as name if name is not provided', async () => {
      const mockUserData = {
        id: 'user-123',
        email: 'user@ashoka.edu.in'
      };

      mockOAuth2Service.userinfo.get.mockResolvedValue({ data: mockUserData });

      const result = await oauthManager.getUserInfo('test-access-token');

      expect(result.name).toBe(mockUserData.email);
    });

    it('should throw error if email is missing', async () => {
      const mockUserData = {
        id: 'user-123',
        name: 'Test User'
      };

      mockOAuth2Service.userinfo.get.mockResolvedValue({ data: mockUserData });

      await expect(oauthManager.getUserInfo('test-access-token'))
        .rejects.toThrow('Failed to retrieve user information');
    });

    it('should throw error if id is missing', async () => {
      const mockUserData = {
        email: 'user@ashoka.edu.in',
        name: 'Test User'
      };

      mockOAuth2Service.userinfo.get.mockResolvedValue({ data: mockUserData });

      await expect(oauthManager.getUserInfo('test-access-token'))
        .rejects.toThrow('Failed to retrieve user information');
    });
  });

  describe('validateAccessToken', () => {
    it('should return true for valid access token', async () => {
      const mockUserData = {
        id: 'user-123',
        email: 'user@ashoka.edu.in',
        name: 'Test User'
      };

      mockOAuth2Service.userinfo.get.mockResolvedValue({ data: mockUserData });

      const result = await oauthManager.validateAccessToken('valid-token');

      expect(result).toBe(true);
    });

    it('should return false for invalid access token', async () => {
      mockOAuth2Service.userinfo.get.mockRejectedValue(new Error('Invalid token'));

      const result = await oauthManager.validateAccessToken('invalid-token');

      expect(result).toBe(false);
    });
  });

  describe('revokeTokens', () => {
    it('should revoke tokens successfully', async () => {
      mockOAuth2Client.revokeCredentials.mockResolvedValue(undefined);

      await oauthManager.revokeTokens('test-access-token');

      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: 'test-access-token'
      });
      expect(mockOAuth2Client.revokeCredentials).toHaveBeenCalled();
    });

    it('should not throw error if revocation fails', async () => {
      mockOAuth2Client.revokeCredentials.mockRejectedValue(new Error('Revocation failed'));

      await expect(oauthManager.revokeTokens('test-access-token'))
        .resolves.not.toThrow();
    });
  });

  describe('createAuthenticatedClient', () => {
    it('should create authenticated OAuth2 client', () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      const client = oauthManager.createAuthenticatedClient(tokens);

      expect(mockGoogle.auth.OAuth2).toHaveBeenCalledWith(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expiry_date: tokens.expiresAt.getTime()
      });
    });
  });
});