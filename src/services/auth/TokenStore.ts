/**
 * Secure token storage and retrieval service
 */

import * as crypto from 'crypto';
import { Database } from 'sqlite';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface StoredTokens {
  userId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class TokenStore {
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-cbc';

  constructor(
    private readonly db: Database,
    encryptionKey: string
  ) {
    // Ensure encryption key is 32 bytes for AES-256
    this.encryptionKey = Buffer.from(encryptionKey.padEnd(32, '0').substring(0, 32));
  }

  /**
   * Encrypts a token using AES-256-CBC
   * @param token - Token to encrypt
   * @returns encrypted token with IV
   */
  private encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine IV and encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypts a token using AES-256-CBC
   * @param encryptedToken - Encrypted token string
   * @returns decrypted token
   */
  private decryptToken(encryptedToken: string): string {
    const parts = encryptedToken.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted token format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Stores OAuth tokens for a user
   * @param userId - User ID
   * @param tokens - OAuth tokens to store
   */
  async storeTokens(userId: string, tokens: OAuthTokens): Promise<void> {
    const encryptedAccessToken = this.encryptToken(tokens.accessToken);
    const encryptedRefreshToken = this.encryptToken(tokens.refreshToken);
    const now = new Date();

    await this.db.run(`
      INSERT OR REPLACE INTO oauth_tokens (
        user_id, 
        encrypted_access_token, 
        encrypted_refresh_token, 
        expires_at, 
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      userId,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokens.expiresAt.toISOString(),
      now.toISOString(),
      now.toISOString()
    ]);
  }

  /**
   * Retrieves OAuth tokens for a user
   * @param userId - User ID
   * @returns OAuth tokens or null if not found
   */
  async getTokens(userId: string): Promise<OAuthTokens | null> {
    const row = await this.db.get(`
      SELECT encrypted_access_token, encrypted_refresh_token, expires_at
      FROM oauth_tokens 
      WHERE user_id = ?
    `, [userId]);

    if (!row) {
      return null;
    }

    try {
      const accessToken = this.decryptToken(row.encrypted_access_token);
      const refreshToken = this.decryptToken(row.encrypted_refresh_token);
      const expiresAt = new Date(row.expires_at);

      return {
        accessToken,
        refreshToken,
        expiresAt
      };
    } catch (error) {
      console.error('Failed to decrypt tokens for user:', userId, error);
      // Remove corrupted tokens
      await this.deleteTokens(userId);
      return null;
    }
  }

  /**
   * Updates access token after refresh
   * @param userId - User ID
   * @param accessToken - New access token
   * @param expiresAt - New expiration date
   */
  async updateAccessToken(userId: string, accessToken: string, expiresAt: Date): Promise<void> {
    const encryptedAccessToken = this.encryptToken(accessToken);
    const now = new Date();

    await this.db.run(`
      UPDATE oauth_tokens 
      SET encrypted_access_token = ?, expires_at = ?, updated_at = ?
      WHERE user_id = ?
    `, [
      encryptedAccessToken,
      expiresAt.toISOString(),
      now.toISOString(),
      userId
    ]);
  }

  /**
   * Checks if tokens exist and are not expired
   * @param userId - User ID
   * @returns true if valid tokens exist
   */
  async hasValidTokens(userId: string): Promise<boolean> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return false;
    }

    return tokens.expiresAt > new Date();
  }

  /**
   * Deletes tokens for a user
   * @param userId - User ID
   */
  async deleteTokens(userId: string): Promise<void> {
    await this.db.run('DELETE FROM oauth_tokens WHERE user_id = ?', [userId]);
  }

  /**
   * Cleans up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run('DELETE FROM oauth_tokens WHERE expires_at < ?', [now]);
  }
}