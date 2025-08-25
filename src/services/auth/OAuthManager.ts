/**
 * OAuth manager for handling email provider OAuth flows
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { OAuthTokens } from './TokenStore';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

export class OAuthManager {
  private readonly oauth2Client: OAuth2Client;
  private readonly scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.readonly'
  ];

  constructor(private readonly config: OAuthConfig) {
    this.oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  /**
   * Generates OAuth authorization URL
   * @param state - Optional state parameter for CSRF protection
   * @returns authorization URL
   */
  getAuthorizationUrl(state?: string): string {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      prompt: 'consent', // Force consent to get refresh token
      state: state || this.generateState()
    });

    return authUrl;
  }

  /**
   * Exchanges authorization code for tokens
   * @param code - Authorization code from OAuth callback
   * @returns OAuth tokens
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Missing required tokens in OAuth response');
      }

      const expiresAt = tokens.expiry_date 
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt
      };
    } catch (error) {
      console.error('Failed to exchange code for tokens:', error);
      throw new Error('Failed to complete OAuth authentication');
    }
  }

  /**
   * Refreshes access token using refresh token
   * @param refreshToken - Refresh token
   * @returns new OAuth tokens
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token) {
        throw new Error('No access token in refresh response');
      }

      const expiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken, // Keep existing if not provided
        expiresAt
      };
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw new Error('Failed to refresh authentication tokens');
    }
  }

  /**
   * Gets user information from OAuth provider
   * @param accessToken - Access token
   * @returns user information
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken
      });

      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const { data } = await oauth2.userinfo.get();

      if (!data.email || !data.id) {
        throw new Error('Missing required user information');
      }

      return {
        id: data.id,
        email: data.email,
        name: data.name || data.email,
        picture: data.picture || undefined
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw new Error('Failed to retrieve user information');
    }
  }

  /**
   * Validates access token by making a test API call
   * @param accessToken - Access token to validate
   * @returns true if token is valid
   */
  async validateAccessToken(accessToken: string): Promise<boolean> {
    try {
      await this.getUserInfo(accessToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Revokes OAuth tokens
   * @param accessToken - Access token to revoke
   */
  async revokeTokens(accessToken: string): Promise<void> {
    try {
      this.oauth2Client.setCredentials({
        access_token: accessToken
      });

      await this.oauth2Client.revokeCredentials();
    } catch (error) {
      console.error('Failed to revoke tokens:', error);
      // Don't throw error as revocation might fail for already expired tokens
    }
  }

  /**
   * Generates a random state parameter for CSRF protection
   * @returns random state string
   */
  private generateState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * Creates an authenticated OAuth2 client for API calls
   * @param tokens - OAuth tokens
   * @returns configured OAuth2 client
   */
  createAuthenticatedClient(tokens: OAuthTokens): OAuth2Client {
    const client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );

    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt.getTime()
    });

    return client;
  }
}