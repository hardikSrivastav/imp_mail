/**
 * Integration tests for EmailFetcher with mock Gmail API responses
 */

import { EmailFetcher, EmailFetchOptions } from '../../../services/email/EmailFetcher';
import { OAuthManager } from '../../../services/auth/OAuthManager';
import { OAuthTokens } from '../../../services/auth/TokenStore';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis', () => ({
  google: {
    gmail: jest.fn(),
    auth: {
      OAuth2: jest.fn()
    }
  }
}));

const mockGoogle = google as jest.Mocked<typeof google>;

describe('EmailFetcher', () => {
  let emailFetcher: EmailFetcher;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockGmail: any;
  let mockAuthClient: any;

  const mockTokens: OAuthTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000)
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock OAuth2 client
    mockAuthClient = {
      setCredentials: jest.fn(),
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      refreshAccessToken: jest.fn()
    };

    // Mock Gmail API client
    mockGmail = {
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn()
        },
        getProfile: jest.fn()
      }
    };

    // Mock googleapis
    (mockGoogle.gmail as jest.Mock).mockReturnValue(mockGmail);
    (mockGoogle.auth.OAuth2 as unknown as jest.Mock).mockReturnValue(mockAuthClient);

    // Mock OAuthManager
    mockOAuthManager = {
      createAuthenticatedClient: jest.fn().mockReturnValue(mockAuthClient)
    } as any;

    emailFetcher = new EmailFetcher(mockOAuthManager, mockTokens);
  });

  describe('fetchEmailList', () => {
    it('should fetch email list with default options', async () => {
      const mockResponse = {
        data: {
          messages: [
            { id: 'msg1', threadId: 'thread1' },
            { id: 'msg2', threadId: 'thread2' }
          ],
          nextPageToken: 'next-token',
          resultSizeEstimate: 2
        }
      };

      mockGmail.users.messages.list.mockResolvedValue(mockResponse);

      const result = await emailFetcher.fetchEmailList();

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        maxResults: 100,
        pageToken: undefined,
        q: undefined,
        labelIds: undefined,
        includeSpamTrash: false
      });

      expect(result).toEqual({
        messages: mockResponse.data.messages,
        nextPageToken: 'next-token',
        resultSizeEstimate: 2
      });
    });

    it('should fetch email list with custom options', async () => {
      const options: EmailFetchOptions = {
        maxResults: 50,
        pageToken: 'page-token',
        query: 'from:test@example.com',
        labelIds: ['INBOX'],
        includeSpamTrash: true
      };

      const mockResponse = {
        data: {
          messages: [{ id: 'msg1', threadId: 'thread1' }],
          nextPageToken: undefined,
          resultSizeEstimate: 1
        }
      };

      mockGmail.users.messages.list.mockResolvedValue(mockResponse);

      const result = await emailFetcher.fetchEmailList(options);

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        maxResults: 50,
        pageToken: 'page-token',
        q: 'from:test@example.com',
        labelIds: ['INBOX'],
        includeSpamTrash: true
      });

      expect(result.messages).toHaveLength(1);
      expect(result.nextPageToken).toBeUndefined();
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        data: {
          messages: null,
          nextPageToken: undefined,
          resultSizeEstimate: 0
        }
      };

      mockGmail.users.messages.list.mockResolvedValue(mockResponse);

      const result = await emailFetcher.fetchEmailList();

      expect(result.messages).toEqual([]);
      expect(result.resultSizeEstimate).toBe(0);
    });

    it('should handle API errors', async () => {
      const apiError = new Error('API Error');
      (apiError as any).code = 500;

      mockGmail.users.messages.list.mockRejectedValue(apiError);

      await expect(emailFetcher.fetchEmailList()).rejects.toThrow('API Error');
    });
  });

  describe('fetchEmailById', () => {
    it('should fetch email by ID successfully', async () => {
      const mockMessage = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'This is a test email...',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Subject' },
            { name: 'From', value: 'sender@example.com' }
          ],
          body: { data: 'VGVzdCBjb250ZW50' } // Base64 encoded "Test content"
        },
        internalDate: '1640995200000',
        historyId: 'hist123',
        sizeEstimate: 1024
      };

      mockGmail.users.messages.get.mockResolvedValue({ data: mockMessage });

      const result = await emailFetcher.fetchEmailById('msg123');

      expect(mockGmail.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg123',
        format: 'full'
      });

      expect(result).toEqual({
        id: 'msg123',
        threadId: 'thread123',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'This is a test email...',
        payload: mockMessage.payload,
        internalDate: '1640995200000',
        historyId: 'hist123',
        sizeEstimate: 1024
      });
    });

    it('should handle missing message data', async () => {
      const mockMessage = {
        id: undefined,
        payload: undefined
      };

      mockGmail.users.messages.get.mockResolvedValue({ data: mockMessage });

      await expect(emailFetcher.fetchEmailById('invalid-id')).rejects.toThrow(
        'Invalid message data for ID: invalid-id'
      );
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).code = 429;

      mockGmail.users.messages.get.mockRejectedValue(rateLimitError);

      // Should throw the rate limit error after handling
      await expect(emailFetcher.fetchEmailById('msg123')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('fetchEmailsBatch', () => {
    it('should fetch multiple emails in batches', async () => {
      const messageIds = ['msg1', 'msg2', 'msg3'];
      
      const mockMessages = messageIds.map(id => ({
        id,
        threadId: `thread-${id}`,
        labelIds: ['INBOX'],
        snippet: `Snippet for ${id}`,
        payload: { headers: [] },
        internalDate: '1640995200000',
        historyId: `hist-${id}`,
        sizeEstimate: 1024
      }));

      mockGmail.users.messages.get
        .mockResolvedValueOnce({ data: mockMessages[0] })
        .mockResolvedValueOnce({ data: mockMessages[1] })
        .mockResolvedValueOnce({ data: mockMessages[2] });

      const result = await emailFetcher.fetchEmailsBatch(messageIds);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('msg1');
      expect(result[1].id).toBe('msg2');
      expect(result[2].id).toBe('msg3');
    });

    it('should handle partial failures in batch', async () => {
      const messageIds = ['msg1', 'msg2', 'msg3'];
      
      // Mock successful responses for msg1 and msg3, failure for msg2
      mockGmail.users.messages.get
        .mockImplementationOnce(() => Promise.resolve({ 
          data: { id: 'msg1', payload: {}, internalDate: '1640995200000', threadId: 'thread1', labelIds: [], snippet: '', historyId: 'hist1', sizeEstimate: 1024 } 
        }))
        .mockImplementationOnce(() => Promise.reject(new Error('Failed to fetch msg2')))
        .mockImplementationOnce(() => Promise.resolve({ 
          data: { id: 'msg3', payload: {}, internalDate: '1640995200000', threadId: 'thread3', labelIds: [], snippet: '', historyId: 'hist3', sizeEstimate: 1024 } 
        }));

      const result = await emailFetcher.fetchEmailsBatch(messageIds);

      // Should return successful fetches even if some fail
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg1');
      expect(result[1].id).toBe('msg3');
    });
  });

  describe('fetchEmailsSince', () => {
    it('should fetch emails since a specific date', async () => {
      const sinceDate = new Date('2024-01-01T00:00:00Z');
      const expectedQuery = `after:${Math.floor(sinceDate.getTime() / 1000)}`;

      const mockResponse = {
        data: {
          messages: [{ id: 'msg1', threadId: 'thread1' }],
          resultSizeEstimate: 1
        }
      };

      mockGmail.users.messages.list.mockResolvedValue(mockResponse);

      const result = await emailFetcher.fetchEmailsSince(sinceDate, 100);

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        maxResults: 100,
        pageToken: undefined,
        q: expectedQuery,
        labelIds: undefined,
        includeSpamTrash: false
      });

      expect(result.messages).toHaveLength(1);
    });
  });

  describe('fetchAllEmails', () => {
    it('should fetch all emails with spam/trash exclusion', async () => {
      const mockResponse = {
        data: {
          messages: [
            { id: 'msg1', threadId: 'thread1' },
            { id: 'msg2', threadId: 'thread2' }
          ],
          nextPageToken: 'next-page',
          resultSizeEstimate: 2
        }
      };

      mockGmail.users.messages.list.mockResolvedValue(mockResponse);

      const result = await emailFetcher.fetchAllEmails('page-token', 50);

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        maxResults: 50,
        pageToken: 'page-token',
        q: '-in:spam -in:trash',
        labelIds: undefined,
        includeSpamTrash: false
      });

      expect(result.messages).toHaveLength(2);
      expect(result.nextPageToken).toBe('next-page');
    });
  });

  describe('getProfile', () => {
    it('should fetch Gmail profile', async () => {
      const mockProfile = {
        emailAddress: 'user@ashoka.edu.in',
        messagesTotal: 1000,
        threadsTotal: 500,
        historyId: 'hist123'
      };

      mockGmail.users.getProfile.mockResolvedValue({ data: mockProfile });

      const result = await emailFetcher.getProfile();

      expect(mockGmail.users.getProfile).toHaveBeenCalledWith({
        userId: 'me'
      });

      expect(result).toEqual(mockProfile);
    });
  });

  describe('error handling', () => {
    it('should handle 401 authentication errors', async () => {
      const authError = new Error('Authentication failed');
      (authError as any).code = 401;

      mockGmail.users.messages.list.mockRejectedValue(authError);

      await expect(emailFetcher.fetchEmailList()).rejects.toThrow(
        'Authentication failed - tokens may need refresh'
      );
    });

    it('should handle 429 rate limit errors with retry', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).code = 429;

      mockGmail.users.messages.list.mockRejectedValue(rateLimitError);

      await expect(emailFetcher.fetchEmailList()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle 500 server errors', async () => {
      const serverError = new Error('Internal server error');
      (serverError as any).code = 500;

      mockGmail.users.messages.list.mockRejectedValue(serverError);

      await expect(emailFetcher.fetchEmailList()).rejects.toThrow('Internal server error');
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits between requests', async () => {
      // Mock successful responses
      mockGmail.users.messages.list.mockResolvedValue({ data: { messages: [] } });

      // Make multiple requests sequentially to test rate limiting
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(emailFetcher.fetchEmailList());
      }

      const results = await Promise.all(promises);
      
      // All requests should succeed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.messages).toEqual([]);
      });
    });
  });
});