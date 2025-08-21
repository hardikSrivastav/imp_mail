/**
 * Unit tests for TokenStore class
 */

import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { TokenStore, OAuthTokens } from '../../../services/auth/TokenStore';

describe('TokenStore', () => {
  let db: Database;
  let tokenStore: TokenStore;
  const encryptionKey = 'test-encryption-key-32-characters';
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Create in-memory database for testing
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    // Create oauth_tokens table
    await db.exec(`
      CREATE TABLE oauth_tokens (
        user_id TEXT PRIMARY KEY,
        encrypted_access_token TEXT NOT NULL,
        encrypted_refresh_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    tokenStore = new TokenStore(db, encryptionKey);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('storeTokens', () => {
    it('should store OAuth tokens successfully', async () => {
      const tokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      };

      await tokenStore.storeTokens(testUserId, tokens);

      // Verify tokens were stored
      const row = await db.get(
        'SELECT * FROM oauth_tokens WHERE user_id = ?',
        [testUserId]
      );

      expect(row).toBeDefined();
      expect(row.user_id).toBe(testUserId);
      expect(row.encrypted_access_token).toBeDefined();
      expect(row.encrypted_refresh_token).toBeDefined();
      expect(row.expires_at).toBe(tokens.expiresAt.toISOString());
    });

    it('should replace existing tokens for the same user', async () => {
      const tokens1: OAuthTokens = {
        accessToken: 'first-access-token',
        refreshToken: 'first-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      const tokens2: OAuthTokens = {
        accessToken: 'second-access-token',
        refreshToken: 'second-refresh-token',
        expiresAt: new Date(Date.now() + 7200000)
      };

      await tokenStore.storeTokens(testUserId, tokens1);
      await tokenStore.storeTokens(testUserId, tokens2);

      // Should only have one record
      const rows = await db.all(
        'SELECT * FROM oauth_tokens WHERE user_id = ?',
        [testUserId]
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].expires_at).toBe(tokens2.expiresAt.toISOString());
    });
  });

  describe('getTokens', () => {
    it('should retrieve and decrypt stored tokens', async () => {
      const originalTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await tokenStore.storeTokens(testUserId, originalTokens);
      const retrievedTokens = await tokenStore.getTokens(testUserId);

      expect(retrievedTokens).toBeDefined();
      expect(retrievedTokens!.accessToken).toBe(originalTokens.accessToken);
      expect(retrievedTokens!.refreshToken).toBe(originalTokens.refreshToken);
      expect(retrievedTokens!.expiresAt.getTime()).toBe(originalTokens.expiresAt.getTime());
    });

    it('should return null for non-existent user', async () => {
      const tokens = await tokenStore.getTokens('non-existent-user');
      expect(tokens).toBeNull();
    });

    it('should handle corrupted tokens gracefully', async () => {
      // Insert corrupted token data directly
      await db.run(`
        INSERT INTO oauth_tokens (
          user_id, encrypted_access_token, encrypted_refresh_token, 
          expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        testUserId,
        'corrupted-data',
        'corrupted-data',
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString()
      ]);

      const tokens = await tokenStore.getTokens(testUserId);
      expect(tokens).toBeNull();

      // Verify corrupted tokens were deleted
      const row = await db.get(
        'SELECT * FROM oauth_tokens WHERE user_id = ?',
        [testUserId]
      );
      expect(row).toBeUndefined();
    });
  });

  describe('updateAccessToken', () => {
    it('should update only the access token and expiration', async () => {
      const originalTokens: OAuthTokens = {
        accessToken: 'original-access-token',
        refreshToken: 'original-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await tokenStore.storeTokens(testUserId, originalTokens);

      const newAccessToken = 'new-access-token';
      const newExpiresAt = new Date(Date.now() + 7200000);

      await tokenStore.updateAccessToken(testUserId, newAccessToken, newExpiresAt);

      const updatedTokens = await tokenStore.getTokens(testUserId);
      expect(updatedTokens).toBeDefined();
      expect(updatedTokens!.accessToken).toBe(newAccessToken);
      expect(updatedTokens!.refreshToken).toBe(originalTokens.refreshToken);
      expect(updatedTokens!.expiresAt.getTime()).toBe(newExpiresAt.getTime());
    });
  });

  describe('hasValidTokens', () => {
    it('should return true for valid non-expired tokens', async () => {
      const tokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      };

      await tokenStore.storeTokens(testUserId, tokens);
      const hasValid = await tokenStore.hasValidTokens(testUserId);
      expect(hasValid).toBe(true);
    });

    it('should return false for expired tokens', async () => {
      const tokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      };

      await tokenStore.storeTokens(testUserId, tokens);
      const hasValid = await tokenStore.hasValidTokens(testUserId);
      expect(hasValid).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      const hasValid = await tokenStore.hasValidTokens('non-existent-user');
      expect(hasValid).toBe(false);
    });
  });

  describe('deleteTokens', () => {
    it('should delete tokens for a user', async () => {
      const tokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await tokenStore.storeTokens(testUserId, tokens);
      await tokenStore.deleteTokens(testUserId);

      const retrievedTokens = await tokenStore.getTokens(testUserId);
      expect(retrievedTokens).toBeNull();
    });

    it('should not throw error for non-existent user', async () => {
      await expect(tokenStore.deleteTokens('non-existent-user')).resolves.not.toThrow();
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should remove expired tokens', async () => {
      const expiredTokens: OAuthTokens = {
        accessToken: 'expired-access-token',
        refreshToken: 'expired-refresh-token',
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      };

      const validTokens: OAuthTokens = {
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
      };

      await tokenStore.storeTokens('expired-user', expiredTokens);
      await tokenStore.storeTokens('valid-user', validTokens);

      await tokenStore.cleanupExpiredTokens();

      const expiredResult = await tokenStore.getTokens('expired-user');
      const validResult = await tokenStore.getTokens('valid-user');

      expect(expiredResult).toBeNull();
      expect(validResult).toBeDefined();
    });
  });

  describe('encryption/decryption', () => {
    it('should encrypt tokens differently each time', async () => {
      const tokens: OAuthTokens = {
        accessToken: 'same-access-token',
        refreshToken: 'same-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await tokenStore.storeTokens('user1', tokens);
      await tokenStore.storeTokens('user2', tokens);

      const row1 = await db.get('SELECT * FROM oauth_tokens WHERE user_id = ?', ['user1']);
      const row2 = await db.get('SELECT * FROM oauth_tokens WHERE user_id = ?', ['user2']);

      // Encrypted tokens should be different due to random IV
      expect(row1.encrypted_access_token).not.toBe(row2.encrypted_access_token);
      expect(row1.encrypted_refresh_token).not.toBe(row2.encrypted_refresh_token);

      // But decrypted tokens should be the same
      const decrypted1 = await tokenStore.getTokens('user1');
      const decrypted2 = await tokenStore.getTokens('user2');

      expect(decrypted1!.accessToken).toBe(decrypted2!.accessToken);
      expect(decrypted1!.refreshToken).toBe(decrypted2!.refreshToken);
    });
  });
});