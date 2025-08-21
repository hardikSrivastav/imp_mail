/**
 * EmailFetcher class for retrieving emails via Gmail API
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { OAuthTokens } from '../auth/TokenStore';
import { OAuthManager } from '../auth/OAuthManager';

export interface EmailFetchOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
}

export interface EmailFetchResult {
  messages: gmail_v1.Schema$Message[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface RawEmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: gmail_v1.Schema$MessagePart;
  internalDate: string;
  historyId: string;
  sizeEstimate: number;
}

export class EmailFetcher {
  private gmail: gmail_v1.Gmail;
  private rateLimiter: RateLimiter;

  constructor(
    private readonly oauthManager: OAuthManager,
    private readonly tokens: OAuthTokens
  ) {
    const authClient = this.oauthManager.createAuthenticatedClient(tokens);
    this.gmail = google.gmail({ version: 'v1', auth: authClient });
    this.rateLimiter = new RateLimiter();
  }

  /**
   * Fetches a list of email message IDs based on query criteria
   * @param options - Fetch options including query, pagination, etc.
   * @returns Promise resolving to email fetch result
   */
  async fetchEmailList(options: EmailFetchOptions = {}): Promise<EmailFetchResult> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: options.maxResults || 100,
        pageToken: options.pageToken,
        q: options.query,
        labelIds: options.labelIds,
        includeSpamTrash: options.includeSpamTrash || false
      });

      return {
        messages: response.data.messages || [],
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0
      };
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Fetches full email data for a specific message ID
   * @param messageId - Gmail message ID
   * @returns Promise resolving to raw email data
   */
  async fetchEmailById(messageId: string): Promise<RawEmailData> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const message = response.data;
      if (!message.id || !message.payload) {
        throw new Error(`Invalid message data for ID: ${messageId}`);
      }

      return {
        id: message.id,
        threadId: message.threadId || '',
        labelIds: message.labelIds || [],
        snippet: message.snippet || '',
        payload: message.payload,
        internalDate: message.internalDate || '0',
        historyId: message.historyId || '',
        sizeEstimate: message.sizeEstimate || 0
      };
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Fetches multiple emails in batch
   * @param messageIds - Array of Gmail message IDs
   * @returns Promise resolving to array of raw email data
   */
  async fetchEmailsBatch(messageIds: string[]): Promise<RawEmailData[]> {
    const emails: RawEmailData[] = [];
    const batchSize = 10; // Process in smaller batches to respect rate limits

    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const batchPromises = batch.map(id => this.fetchEmailById(id));
      
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        // Extract successful results and log failures
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            emails.push(result.value);
          } else {
            console.error('Failed to fetch email:', result.reason);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch batch starting at index ${i}:`, error);
        // Continue with next batch instead of failing completely
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < messageIds.length) {
        await this.delay(100);
      }
    }

    return emails;
  }

  /**
   * Fetches emails since a specific date
   * @param sinceDate - Date to fetch emails from
   * @param maxResults - Maximum number of emails to fetch
   * @returns Promise resolving to email fetch result
   */
  async fetchEmailsSince(sinceDate: Date, maxResults: number = 500): Promise<EmailFetchResult> {
    const query = `after:${Math.floor(sinceDate.getTime() / 1000)}`;
    
    return this.fetchEmailList({
      query,
      maxResults,
      includeSpamTrash: false
    });
  }

  /**
   * Fetches all emails for initial sync (paginated)
   * @param pageToken - Optional page token for pagination
   * @param maxResults - Maximum results per page
   * @returns Promise resolving to email fetch result
   */
  async fetchAllEmails(pageToken?: string, maxResults: number = 100): Promise<EmailFetchResult> {
    return this.fetchEmailList({
      pageToken,
      maxResults,
      includeSpamTrash: false,
      query: '-in:spam -in:trash' // Exclude spam and trash
    });
  }

  /**
   * Gets the user's Gmail profile information
   * @returns Promise resolving to Gmail profile
   */
  async getProfile(): Promise<gmail_v1.Schema$Profile> {
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.gmail.users.getProfile({
        userId: 'me'
      });

      return response.data;
    } catch (error) {
      await this.handleApiError(error);
      throw error;
    }
  }

  /**
   * Handles API errors with appropriate retry logic
   * @param error - Error from Gmail API
   */
  private async handleApiError(error: any): Promise<void> {
    if (error.code === 429) {
      // Rate limit exceeded - wait and retry
      console.warn('Gmail API rate limit exceeded, waiting before retry');
      await this.delay(1000);
    } else if (error.code === 401) {
      // Token expired - attempt refresh
      console.warn('Gmail API authentication failed, tokens may need refresh');
      throw new Error('Authentication failed - tokens may need refresh');
    } else if (error.code >= 500) {
      // Server error - wait before retry
      console.warn('Gmail API server error, waiting before retry');
      await this.delay(500);
    }
  }

  /**
   * Utility method to add delays
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Rate limiter to respect Gmail API quotas
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerSecond = 10; // Conservative limit
  private readonly windowMs = 1000;

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    
    // Remove requests older than the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);

    // If we're at the limit, wait
    if (this.requests.length >= this.maxRequestsPerSecond) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest) + 10; // Add small buffer
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot(); // Recursive call after waiting
      }
    }

    // Record this request
    this.requests.push(now);
  }
}