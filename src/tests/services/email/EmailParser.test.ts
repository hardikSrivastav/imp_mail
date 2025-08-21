/**
 * Tests for EmailParser with mock Gmail message formats
 */

import { EmailParser, ParsedEmailData } from '../../../services/email/EmailParser';
import { RawEmailData } from '../../../services/email/EmailFetcher';
import { gmail_v1 } from 'googleapis';

describe('EmailParser', () => {
  let emailParser: EmailParser;

  beforeEach(() => {
    emailParser = new EmailParser();
  });

  describe('parseEmail', () => {
    it('should parse a simple text email', () => {
      const rawEmail: RawEmailData = {
        id: 'msg123',
        threadId: 'thread123',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'This is a test email',
        payload: {
          headers: [
            { name: 'Subject', value: 'Test Subject' },
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'recipient@ashoka.edu.in' },
            { name: 'Date', value: 'Mon, 1 Jan 2024 12:00:00 +0000' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'VGhpcyBpcyBhIHRlc3QgZW1haWwgY29udGVudA==' // Base64: "This is a test email content"
          }
        },
        internalDate: '1704110400000', // Jan 1, 2024 12:00:00 UTC
        historyId: 'hist123',
        sizeEstimate: 1024
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result).toEqual({
        messageId: 'msg123',
        subject: 'Test Subject',
        sender: 'sender@example.com',
        recipients: ['recipient@ashoka.edu.in'],
        content: 'This is a test email content',
        htmlContent: undefined,
        receivedAt: new Date(1704110400000),
        metadata: {
          hasAttachments: false,
          threadId: 'thread123',
          labels: ['INBOX', 'UNREAD']
        }
      });
    });

    it('should parse an HTML email', () => {
      const rawEmail: RawEmailData = {
        id: 'msg124',
        threadId: 'thread124',
        labelIds: ['INBOX'],
        snippet: 'HTML email content',
        payload: {
          headers: [
            { name: 'Subject', value: 'HTML Test' },
            { name: 'From', value: 'HTML Sender <html@example.com>' },
            { name: 'To', value: 'recipient@ashoka.edu.in' }
          ],
          mimeType: 'text/html',
          body: {
            data: 'PGgxPkhlbGxvPC9oMT48cD5UaGlzIGlzIDxzdHJvbmc+SFRNTDwvc3Ryb25nPiBjb250ZW50LjwvcD4=' // Base64: "<h1>Hello</h1><p>This is <strong>HTML</strong> content.</p>"
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist124',
        sizeEstimate: 2048
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('HTML Test');
      expect(result.sender).toBe('html@example.com');
      expect(result.htmlContent).toBe('<h1>Hello</h1><p>This is <strong>HTML</strong> content.</p>');
      expect(result.content).toBe('Hello This is HTML content.');
    });

    it('should parse a multipart email with text and HTML', () => {
      const rawEmail: RawEmailData = {
        id: 'msg125',
        threadId: 'thread125',
        labelIds: ['INBOX'],
        snippet: 'Multipart email',
        payload: {
          headers: [
            { name: 'Subject', value: 'Multipart Test' },
            { name: 'From', value: 'multipart@example.com' },
            { name: 'To', value: 'recipient1@ashoka.edu.in, recipient2@ashoka.edu.in' },
            { name: 'Cc', value: 'cc@ashoka.edu.in' }
          ],
          mimeType: 'multipart/alternative',
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: 'UGxhaW4gdGV4dCB2ZXJzaW9u' // Base64: "Plain text version"
              }
            },
            {
              mimeType: 'text/html',
              body: {
                data: 'PHA+SFRNTCB2ZXJzaW9uPC9wPg==' // Base64: "<p>HTML version</p>"
              }
            }
          ]
        },
        internalDate: '1704110400000',
        historyId: 'hist125',
        sizeEstimate: 3072
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('Multipart Test');
      expect(result.sender).toBe('multipart@example.com');
      expect(result.recipients).toEqual([
        'recipient1@ashoka.edu.in',
        'recipient2@ashoka.edu.in',
        'cc@ashoka.edu.in'
      ]);
      expect(result.content).toBe('Plain text version');
      expect(result.htmlContent).toBe('<p>HTML version</p>');
    });

    it('should parse email with attachments', () => {
      const rawEmail: RawEmailData = {
        id: 'msg126',
        threadId: 'thread126',
        labelIds: ['INBOX'],
        snippet: 'Email with attachment',
        payload: {
          headers: [
            { name: 'Subject', value: 'Attachment Test' },
            { name: 'From', value: 'attach@example.com' },
            { name: 'To', value: 'recipient@ashoka.edu.in' }
          ],
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'text/plain',
              body: {
                data: 'UGxlYXNlIGZpbmQgYXR0YWNobWVudA==' // Base64: "Please find attachment"
              }
            },
            {
              mimeType: 'application/pdf',
              filename: 'document.pdf',
              body: {
                attachmentId: 'att123',
                size: 102400
              }
            }
          ]
        },
        internalDate: '1704110400000',
        historyId: 'hist126',
        sizeEstimate: 104448
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('Attachment Test');
      expect(result.content).toBe('Please find attachment');
      expect(result.metadata.hasAttachments).toBe(true);
    });

    it('should handle missing or empty headers gracefully', () => {
      const rawEmail: RawEmailData = {
        id: 'msg127',
        threadId: 'thread127',
        labelIds: [],
        snippet: '',
        payload: {
          headers: [
            { name: 'From', value: 'minimal@example.com' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'TWluaW1hbCBlbWFpbA==' // Base64: "Minimal email"
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist127',
        sizeEstimate: 512
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('(No Subject)');
      expect(result.sender).toBe('minimal@example.com');
      expect(result.recipients).toEqual([]);
      expect(result.content).toBe('Minimal email');
    });

    it('should handle complex email addresses with names', () => {
      const rawEmail: RawEmailData = {
        id: 'msg128',
        threadId: 'thread128',
        labelIds: ['INBOX'],
        snippet: 'Complex addresses',
        payload: {
          headers: [
            { name: 'Subject', value: 'Address Test' },
            { name: 'From', value: '"John Doe" <john.doe@example.com>' },
            { name: 'To', value: '"Jane Smith" <jane@ashoka.edu.in>, "Bob Wilson" <bob@ashoka.edu.in>' },
            { name: 'Cc', value: 'Simple User <simple@ashoka.edu.in>' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'VGVzdCBjb250ZW50' // Base64: "Test content"
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist128',
        sizeEstimate: 1024
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.sender).toBe('john.doe@example.com');
      expect(result.recipients).toEqual([
        'jane@ashoka.edu.in',
        'bob@ashoka.edu.in',
        'simple@ashoka.edu.in'
      ]);
    });
  });

  describe('toEmailModel', () => {
    it('should convert parsed email to Email model format', () => {
      const parsedEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Test Subject',
        sender: 'sender@example.com',
        recipients: ['recipient@ashoka.edu.in'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-01T12:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread123',
          labels: ['INBOX']
        }
      };

      const userId = 'user123';
      const result = emailParser.toEmailModel(parsedEmail, userId);

      expect(result).toEqual({
        userId: 'user123',
        messageId: 'msg123',
        subject: 'Test Subject',
        sender: 'sender@example.com',
        recipients: ['recipient@ashoka.edu.in'],
        content: 'Test content',
        htmlContent: '<p>Test content</p>',
        receivedAt: new Date('2024-01-01T12:00:00Z'),
        metadata: {
          hasAttachments: false,
          threadId: 'thread123',
          labels: ['INBOX']
        }
      });
    });
  });

  describe('validateParsedEmail', () => {
    it('should validate complete email data', () => {
      const validEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Test',
        sender: 'sender@example.com',
        recipients: ['recipient@ashoka.edu.in'],
        content: 'Content',
        receivedAt: new Date(),
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      expect(emailParser.validateParsedEmail(validEmail)).toBe(true);
    });

    it('should reject email with missing messageId', () => {
      const invalidEmail: ParsedEmailData = {
        messageId: '',
        subject: 'Test',
        sender: 'sender@example.com',
        recipients: [],
        content: 'Content',
        receivedAt: new Date(),
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      expect(emailParser.validateParsedEmail(invalidEmail)).toBe(false);
    });

    it('should reject email with invalid sender', () => {
      const invalidEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Test',
        sender: 'invalid-email',
        recipients: [],
        content: 'Content',
        receivedAt: new Date(),
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      expect(emailParser.validateParsedEmail(invalidEmail)).toBe(false);
    });

    it('should reject email with invalid date', () => {
      const invalidEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Test',
        sender: 'sender@example.com',
        recipients: [],
        content: 'Content',
        receivedAt: new Date('invalid-date'),
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      expect(emailParser.validateParsedEmail(invalidEmail)).toBe(false);
    });
  });

  describe('extractFeatures', () => {
    it('should extract ML features from parsed email', () => {
      const parsedEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Important Meeting Tomorrow',
        sender: 'boss@company.com',
        recipients: ['user@ashoka.edu.in', 'colleague@ashoka.edu.in'],
        content: 'This is a very important email about the meeting tomorrow. Please make sure to attend as we will discuss critical project updates and deadlines.',
        receivedAt: new Date(),
        metadata: {
          hasAttachments: true,
          threadId: 'thread123',
          labels: ['INBOX', 'IMPORTANT']
        }
      };

      const features = emailParser.extractFeatures(parsedEmail);

      expect(features.subject).toBe('Important Meeting Tomorrow');
      expect(features.sender).toBe('boss@company.com');
      expect(features.content).toBe('This is a very important email about the meeting tomorrow. Please make sure to attend as we will discuss critical project updates and deadlines.');
      expect(features.hasAttachments).toBe(true);
      expect(features.recipientCount).toBe(2);
      expect(features.contentLength).toBe(parsedEmail.content.length);
      expect(features.subjectLength).toBe(parsedEmail.subject.length);
    });

    it('should limit content length for features', () => {
      const longContent = 'A'.repeat(2000);
      const parsedEmail: ParsedEmailData = {
        messageId: 'msg123',
        subject: 'Test',
        sender: 'sender@example.com',
        recipients: ['recipient@ashoka.edu.in'],
        content: longContent,
        receivedAt: new Date(),
        metadata: {
          hasAttachments: false,
          labels: []
        }
      };

      const features = emailParser.extractFeatures(parsedEmail);

      expect(features.content).toHaveLength(1000);
      expect(features.contentLength).toBe(2000); // Original length
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed base64 data gracefully', () => {
      const rawEmail: RawEmailData = {
        id: 'msg129',
        threadId: 'thread129',
        labelIds: ['INBOX'],
        snippet: 'Malformed data',
        payload: {
          headers: [
            { name: 'Subject', value: 'Malformed Test' },
            { name: 'From', value: 'test@example.com' }
          ],
          mimeType: 'text/plain',
          body: {
            data: 'invalid-base64-data!!!' // Invalid base64
          }
        },
        internalDate: '1704110400000',
        historyId: 'hist129',
        sizeEstimate: 512
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('Malformed Test');
      expect(result.content).toBe(''); // Should handle gracefully
    });

    it('should handle nested multipart structures', () => {
      const rawEmail: RawEmailData = {
        id: 'msg130',
        threadId: 'thread130',
        labelIds: ['INBOX'],
        snippet: 'Nested multipart',
        payload: {
          headers: [
            { name: 'Subject', value: 'Nested Test' },
            { name: 'From', value: 'nested@example.com' }
          ],
          mimeType: 'multipart/mixed',
          parts: [
            {
              mimeType: 'multipart/alternative',
              parts: [
                {
                  mimeType: 'text/plain',
                  body: {
                    data: 'TmVzdGVkIHRleHQ=' // Base64: "Nested text"
                  }
                },
                {
                  mimeType: 'text/html',
                  body: {
                    data: 'PHA+TmVzdGVkIEhUTUw8L3A+' // Base64: "<p>Nested HTML</p>"
                  }
                }
              ]
            }
          ]
        },
        internalDate: '1704110400000',
        historyId: 'hist130',
        sizeEstimate: 1024
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.content).toBe('Nested text');
      expect(result.htmlContent).toBe('<p>Nested HTML</p>');
    });

    it('should handle emails with no body content', () => {
      const rawEmail: RawEmailData = {
        id: 'msg131',
        threadId: 'thread131',
        labelIds: ['INBOX'],
        snippet: '',
        payload: {
          headers: [
            { name: 'Subject', value: 'Empty Body' },
            { name: 'From', value: 'empty@example.com' }
          ],
          mimeType: 'text/plain'
          // No body property
        },
        internalDate: '1704110400000',
        historyId: 'hist131',
        sizeEstimate: 256
      };

      const result = emailParser.parseEmail(rawEmail);

      expect(result.subject).toBe('Empty Body');
      expect(result.content).toBe('');
      expect(result.htmlContent).toBeUndefined();
    });
  });
});