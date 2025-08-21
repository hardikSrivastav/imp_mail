/**
 * Integration tests for EmailFetcher and EmailParser working together
 */

import { EmailFetcher } from '../../../services/email/EmailFetcher';
import { EmailParser } from '../../../services/email/EmailParser';
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

describe('EmailFetcher and EmailParser Integration', () => {
  let emailFetcher: EmailFetcher;
  let emailParser: EmailParser;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockGmail: any;
  let mockAuthClient: any;

  const mockTokens: OAuthTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 3600000)
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthClient = {
      setCredentials: jest.fn(),
      generateAuthUrl: jest.fn(),
      getToken: jest.fn(),
      refreshAccessToken: jest.fn()
    };

    mockGmail = {
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn()
        },
        getProfile: jest.fn()
      }
    };

    (mockGoogle.gmail as jest.Mock).mockReturnValue(mockGmail);
    (mockGoogle.auth.OAuth2 as unknown as jest.Mock).mockReturnValue(mockAuthClient);

    mockOAuthManager = {
      createAuthenticatedClient: jest.fn().mockReturnValue(mockAuthClient)
    } as any;

    emailFetcher = new EmailFetcher(mockOAuthManager, mockTokens);
    emailParser = new EmailParser();
  });

  it('should fetch and parse emails end-to-end', async () => {
    // Mock email list response
    const mockEmailList = {
      data: {
        messages: [
          { id: 'msg1', threadId: 'thread1' },
          { id: 'msg2', threadId: 'thread2' }
        ],
        nextPageToken: undefined,
        resultSizeEstimate: 2
      }
    };

    // Mock individual email responses
    const mockEmail1 = {
      data: {
        id: 'msg1',
        threadId: 'thread1',
        labelIds: ['INBOX', 'IMPORTANT'],
        snippet: 'Important meeting tomorrow',
        payload: {
          headers: [
            { name: 'Subject', value: 'Important Meeting Tomorrow' },
            { name: 'From', value: 'boss@company.com' },
            { name: 'To', value: 'user@ashoka.edu.in' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 12:00:00 +0000' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'UGxlYXNlIGF0dGVuZCB0aGUgaW1wb3J0YW50IG1lZXRpbmcgdG9tb3Jyb3cu' // Base64: "Please attend the important meeting tomorrow."
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist1',
        sizeEstimate: 1024
      }
    };

    const mockEmail2 = {
      data: {
        id: 'msg2',
        threadId: 'thread2',
        labelIds: ['INBOX'],
        snippet: 'Newsletter update',
        payload: {
          headers: [
            { name: 'Subject', value: 'Weekly Newsletter' },
            { name: 'From', value: 'newsletter@example.com' },
            { name: 'To', value: 'user@ashoka.edu.in' }
          ],
          mimeType: 'text/html',
          body: {
            data: 'PGgxPldlZWtseSBOZXdzbGV0dGVyPC9oMT48cD5UaGlzIHdlZWsncyB1cGRhdGVzLi4uPC9wPg==' // Base64: "<h1>Weekly Newsletter</h1><p>This week's updates...</p>"
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist2',
        sizeEstimate: 2048
      }
    };

    // Set up mocks
    mockGmail.users.messages.list.mockResolvedValue(mockEmailList);
    mockGmail.users.messages.get
      .mockResolvedValueOnce(mockEmail1)
      .mockResolvedValueOnce(mockEmail2);

    // Fetch email list
    const emailList = await emailFetcher.fetchEmailList({ maxResults: 10 });
    expect(emailList.messages).toHaveLength(2);

    // Fetch and parse individual emails
    const rawEmails = await emailFetcher.fetchEmailsBatch(
      emailList.messages.map(msg => msg.id!)
    );
    expect(rawEmails).toHaveLength(2);

    // Parse the emails
    const parsedEmails = rawEmails.map(rawEmail => emailParser.parseEmail(rawEmail));

    // Verify first email (important meeting)
    expect(parsedEmails[0]).toEqual({
      messageId: 'msg1',
      subject: 'Important Meeting Tomorrow',
      sender: 'boss@company.com',
      recipients: ['user@ashoka.edu.in'],
      content: 'Please attend the important meeting tomorrow.',
      htmlContent: undefined,
      receivedAt: new Date(1704110400000),
      metadata: {
        hasAttachments: false,
        threadId: 'thread1',
        labels: ['INBOX', 'IMPORTANT']
      }
    });

    // Verify second email (newsletter)
    expect(parsedEmails[1]).toEqual({
      messageId: 'msg2',
      subject: 'Weekly Newsletter',
      sender: 'newsletter@example.com',
      recipients: ['user@ashoka.edu.in'],
      content: 'Weekly Newsletter This week\'s updates...',
      htmlContent: '<h1>Weekly Newsletter</h1><p>This week\'s updates...</p>',
      receivedAt: new Date(1704110400000),
      metadata: {
        hasAttachments: false,
        threadId: 'thread2',
        labels: ['INBOX']
      }
    });

    // Convert to Email model format
    const emailModels = parsedEmails.map(parsed => 
      emailParser.toEmailModel(parsed, 'user123')
    );

    expect(emailModels[0].userId).toBe('user123');
    expect(emailModels[0].messageId).toBe('msg1');
    expect(emailModels[1].userId).toBe('user123');
    expect(emailModels[1].messageId).toBe('msg2');

    // Validate parsed emails
    expect(emailParser.validateParsedEmail(parsedEmails[0])).toBe(true);
    expect(emailParser.validateParsedEmail(parsedEmails[1])).toBe(true);

    // Extract features for ML training
    const features1 = emailParser.extractFeatures(parsedEmails[0]);
    expect(features1.subject).toBe('Important Meeting Tomorrow');
    expect(features1.sender).toBe('boss@company.com');
    expect(features1.hasAttachments).toBe(false);
    expect(features1.recipientCount).toBe(1);

    const features2 = emailParser.extractFeatures(parsedEmails[1]);
    expect(features2.subject).toBe('Weekly Newsletter');
    expect(features2.sender).toBe('newsletter@example.com');
    expect(features2.hasAttachments).toBe(false);
    expect(features2.recipientCount).toBe(1);
  });

  it('should handle incremental sync workflow', async () => {
    const sinceDate = new Date('2024-01-01T00:00:00Z');
    
    // Mock response for emails since date
    const mockRecentEmails = {
      data: {
        messages: [{ id: 'new-msg', threadId: 'new-thread' }],
        resultSizeEstimate: 1
      }
    };

    const mockNewEmail = {
      data: {
        id: 'new-msg',
        threadId: 'new-thread',
        labelIds: ['INBOX'],
        snippet: 'New email content',
        payload: {
          headers: [
            { name: 'Subject', value: 'New Email' },
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'user@ashoka.edu.in' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'TmV3IGVtYWlsIGNvbnRlbnQ=' // Base64: "New email content"
          }
        },
        internalDate: '1704196800000', // Jan 2, 2024
        historyId: 'hist-new',
        sizeEstimate: 512
      }
    };

    mockGmail.users.messages.list.mockResolvedValue(mockRecentEmails);
    mockGmail.users.messages.get.mockResolvedValue(mockNewEmail);

    // Fetch emails since date (incremental sync)
    const recentEmails = await emailFetcher.fetchEmailsSince(sinceDate, 100);
    expect(recentEmails.messages).toHaveLength(1);

    // Fetch and parse the new email
    const rawEmail = await emailFetcher.fetchEmailById('new-msg');
    const parsedEmail = emailParser.parseEmail(rawEmail);

    expect(parsedEmail.messageId).toBe('new-msg');
    expect(parsedEmail.subject).toBe('New Email');
    expect(parsedEmail.content).toBe('New email content');
    expect(parsedEmail.receivedAt).toEqual(new Date(1704196800000));
  });

  it('should handle Gmail profile retrieval', async () => {
    const mockProfile = {
      emailAddress: 'user@ashoka.edu.in',
      messagesTotal: 1500,
      threadsTotal: 750,
      historyId: 'current-hist-id'
    };

    mockGmail.users.getProfile.mockResolvedValue({ data: mockProfile });

    const profile = await emailFetcher.getProfile();
    
    expect(profile.emailAddress).toBe('user@ashoka.edu.in');
    expect(profile.messagesTotal).toBe(1500);
    expect(profile.threadsTotal).toBe(750);
  });
});