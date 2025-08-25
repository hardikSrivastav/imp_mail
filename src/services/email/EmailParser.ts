/**
 * EmailParser to extract metadata from Gmail message format
 */

import { gmail_v1 } from 'googleapis';
import { Email } from '../../types/models';
import { RawEmailData } from './EmailFetcher';

export interface ParsedEmailData {
  messageId: string;
  subject: string;
  sender: string;
  recipients: string[];
  content: string;
  htmlContent?: string;
  receivedAt: Date;
  metadata: {
    hasAttachments: boolean;
    threadId?: string;
    labels: string[];
  };
}

export class EmailParser {
  /**
   * Parses raw Gmail message data into structured email data
   * @param rawEmail - Raw email data from Gmail API
   * @returns Parsed email data
   */
  parseEmail(rawEmail: RawEmailData): ParsedEmailData {
    const headers = this.extractHeaders(rawEmail.payload);
    const body = this.extractBody(rawEmail.payload);
    
    return {
      messageId: rawEmail.id,
      subject: this.getHeader(headers, 'Subject') || '(No Subject)',
      sender: this.parseEmailAddress(this.getHeader(headers, 'From') || ''),
      recipients: this.parseRecipients(headers),
      content: body.text,
      htmlContent: body.html,
      receivedAt: new Date(parseInt(rawEmail.internalDate)),
      metadata: {
        hasAttachments: this.hasAttachments(rawEmail.payload),
        threadId: rawEmail.threadId || undefined,
        labels: rawEmail.labelIds || []
      }
    };
  }

  /**
   * Converts parsed email data to Email model format
   * @param parsedEmail - Parsed email data
   * @param userId - User ID who owns the email
   * @returns Email model object
   */
  toEmailModel(parsedEmail: ParsedEmailData, userId: string): Omit<Email, 'id' | 'indexedAt' | 'importance' | 'importanceConfidence' | 'userLabeled' | 'vectorId'> {
    return {
      userId,
      messageId: parsedEmail.messageId,
      subject: parsedEmail.subject,
      sender: parsedEmail.sender,
      recipients: parsedEmail.recipients,
      content: parsedEmail.content,
      htmlContent: parsedEmail.htmlContent,
      receivedAt: parsedEmail.receivedAt,
      metadata: parsedEmail.metadata
    };
  }

  /**
   * Extracts headers from Gmail message payload
   * @param payload - Gmail message payload
   * @returns Map of header names to values
   */
  private extractHeaders(payload: gmail_v1.Schema$MessagePart): Map<string, string> {
    const headers = new Map<string, string>();
    
    if (payload.headers) {
      for (const header of payload.headers) {
        if (header.name && header.value) {
          headers.set(header.name.toLowerCase(), header.value);
        }
      }
    }

    return headers;
  }

  /**
   * Gets header value by name (case-insensitive)
   * @param headers - Headers map
   * @param name - Header name
   * @returns Header value or undefined
   */
  private getHeader(headers: Map<string, string>, name: string): string | undefined {
    return headers.get(name.toLowerCase());
  }

  /**
   * Extracts email body content from Gmail message payload
   * @param payload - Gmail message payload
   * @returns Object with text and HTML content
   */
  private extractBody(payload: gmail_v1.Schema$MessagePart): { text: string; html?: string } {
    const result = { text: '', html: undefined as string | undefined };

    // Handle single part message
    if (payload.body?.data) {
      const content = this.decodeBase64Url(payload.body.data);
      if (payload.mimeType === 'text/html') {
        result.html = content;
        result.text = this.stripHtml(content);
      } else {
        result.text = content;
      }
      return result;
    }

    // Handle multipart message
    if (payload.parts) {
      this.extractBodyFromParts(payload.parts, result);
    }

    return result;
  }

  /**
   * Recursively extracts body content from message parts
   * @param parts - Array of message parts
   * @param result - Result object to populate
   */
  private extractBodyFromParts(parts: gmail_v1.Schema$MessagePart[], result: { text: string; html?: string }): void {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        result.text += this.decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        const htmlContent = this.decodeBase64Url(part.body.data);
        result.html = (result.html || '') + htmlContent;
        if (!result.text) {
          result.text = this.stripHtml(htmlContent);
        }
      } else if (part.parts) {
        // Recursively process nested parts
        this.extractBodyFromParts(part.parts, result);
      }
    }
  }

  /**
   * Decodes base64url encoded data
   * @param data - Base64url encoded string
   * @returns Decoded string
   */
  private decodeBase64Url(data: string): string {
    try {
      // Convert base64url to base64
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      
      // Validate base64 format before decoding
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
        throw new Error('Invalid base64 format');
      }
      
      return Buffer.from(padded, 'base64').toString('utf-8');
    } catch (error) {
      console.error('Failed to decode base64url data:', error);
      return '';
    }
  }

  /**
   * Strips HTML tags from content to get plain text
   * @param html - HTML content
   * @returns Plain text content
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<\/?(h[1-6]|p|div|br)[^>]*>/gi, ' ') // Add space for block elements
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/&amp;/g, '&') // Replace HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Parses email address from header value
   * @param addressHeader - Email address header value
   * @returns Clean email address
   */
  private parseEmailAddress(addressHeader: string): string {
    // Handle formats like "Name <email@domain.com>" or just "email@domain.com"
    const emailMatch = addressHeader.match(/<([^>]+)>/);
    if (emailMatch) {
      return emailMatch[1].trim();
    }
    
    // If no angle brackets, assume the whole string is the email
    const cleanEmail = addressHeader.trim().replace(/^["']|["']$/g, '');
    return cleanEmail;
  }

  /**
   * Parses recipient email addresses from headers
   * @param headers - Headers map
   * @returns Array of recipient email addresses
   */
  private parseRecipients(headers: Map<string, string>): string[] {
    const recipients: string[] = [];
    
    // Parse To recipients
    const toHeader = this.getHeader(headers, 'To');
    if (toHeader) {
      recipients.push(...this.parseMultipleEmailAddresses(toHeader));
    }

    // Parse CC recipients
    const ccHeader = this.getHeader(headers, 'Cc');
    if (ccHeader) {
      recipients.push(...this.parseMultipleEmailAddresses(ccHeader));
    }

    // Parse BCC recipients (usually not available in received emails)
    const bccHeader = this.getHeader(headers, 'Bcc');
    if (bccHeader) {
      recipients.push(...this.parseMultipleEmailAddresses(bccHeader));
    }

    return [...new Set(recipients)]; // Remove duplicates
  }

  /**
   * Parses multiple email addresses from a comma-separated header value
   * @param addressesHeader - Header value with multiple email addresses
   * @returns Array of email addresses
   */
  private parseMultipleEmailAddresses(addressesHeader: string): string[] {
    // Split by comma, but be careful of commas within quoted names
    const addresses: string[] = [];
    let current = '';
    let inQuotes = false;
    let inAngleBrackets = false;

    for (let i = 0; i < addressesHeader.length; i++) {
      const char = addressesHeader[i];
      
      if (char === '"' && !inAngleBrackets) {
        inQuotes = !inQuotes;
      } else if (char === '<' && !inQuotes) {
        inAngleBrackets = true;
      } else if (char === '>' && !inQuotes) {
        inAngleBrackets = false;
      } else if (char === ',' && !inQuotes && !inAngleBrackets) {
        if (current.trim()) {
          addresses.push(this.parseEmailAddress(current.trim()));
        }
        current = '';
        continue;
      }
      
      current += char;
    }

    // Add the last address
    if (current.trim()) {
      addresses.push(this.parseEmailAddress(current.trim()));
    }

    return addresses.filter(addr => addr && addr.includes('@'));
  }

  /**
   * Checks if the message has attachments
   * @param payload - Gmail message payload
   * @returns True if message has attachments
   */
  private hasAttachments(payload: gmail_v1.Schema$MessagePart): boolean {
    if (payload.parts) {
      return payload.parts.some(part => 
        part.filename && part.filename.length > 0 && 
        part.body?.attachmentId
      );
    }
    return false;
  }

  /**
   * Validates that parsed email data is complete and valid
   * @param parsedEmail - Parsed email data
   * @returns True if valid
   */
  validateParsedEmail(parsedEmail: ParsedEmailData): boolean {
    return !!(
      parsedEmail.messageId &&
      parsedEmail.sender &&
      parsedEmail.sender.includes('@') &&
      parsedEmail.receivedAt &&
      !isNaN(parsedEmail.receivedAt.getTime()) &&
      parsedEmail.content !== undefined
    );
  }

  /**
   * Extracts key features from email for ML training
   * @param parsedEmail - Parsed email data
   * @returns Feature object for ML training
   */
  extractFeatures(parsedEmail: ParsedEmailData): {
    subject: string;
    sender: string;
    content: string;
    hasAttachments: boolean;
    recipientCount: number;
    contentLength: number;
    subjectLength: number;
  } {
    return {
      subject: parsedEmail.subject,
      sender: parsedEmail.sender,
      content: parsedEmail.content.substring(0, 1000), // Limit content for features
      hasAttachments: parsedEmail.metadata.hasAttachments,
      recipientCount: parsedEmail.recipients.length,
      contentLength: parsedEmail.content.length,
      subjectLength: parsedEmail.subject.length
    };
  }
}