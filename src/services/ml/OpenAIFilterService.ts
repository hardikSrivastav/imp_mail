import OpenAI from 'openai';
import { Email, UserExpectations } from '../../types/models';

/**
 * Service for integrating with OpenAI API to filter emails based on user expectations
 */
export class OpenAIFilterService {
  private openai: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: apiKey
    });

    this.model = process.env.OPENAI_MODEL || 'gpt-4';
  }

  /**
   * Check if OpenAI service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.openai.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI service unavailable:', error);
      return false;
    }
  }

  /**
   * Classify email importance based on user expectations
   */
  async classifyEmail(
    email: Email,
    expectations: UserExpectations
  ): Promise<{
    importance: 'important' | 'not_important';
    confidence: number;
    reasoning: string;
  }> {
    try {
      const prompt = this.buildClassificationPrompt(email, expectations);
      
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert email classifier. Analyze emails and determine their importance based on user-defined criteria. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent results
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });

      const result = this.parseClassificationResponse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('OpenAI classification error:', error);
      throw new Error(`Failed to classify email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Classify multiple emails in batch
   */
  async classifyEmailsBatch(
    emails: Email[],
    expectations: UserExpectations,
    batchSize: number = 5
  ): Promise<Array<{
    emailId: string;
    importance: 'important' | 'not_important';
    confidence: number;
    reasoning: string;
  }>> {
    const results: Array<{
      emailId: string;
      importance: 'important' | 'not_important';
      confidence: number;
      reasoning: string;
    }> = [];

    // Process emails in batches to avoid rate limits
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (email) => {
        try {
          const classification = await this.classifyEmail(email, expectations);
          return {
            emailId: email.id,
            ...classification
          };
        } catch (error) {
          console.error(`Failed to classify email ${email.id}:`, error);
          return {
            emailId: email.id,
            importance: 'not_important' as const,
            confidence: 0,
            reasoning: 'Classification failed due to error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to respect rate limits
      if (i + batchSize < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Build the classification prompt for OpenAI
   */
  private buildClassificationPrompt(email: Email, expectations: UserExpectations): string {
    const emailContent = this.sanitizeEmailContent(email);
    
    let prompt = `Please analyze the following email and determine if it's important based on the user's expectations.

USER EXPECTATIONS:
Title: ${expectations.title}
Description: ${expectations.description}`;

    if (expectations.examples?.important && expectations.examples.important.length > 0) {
      prompt += `\n\nExamples of IMPORTANT emails:\n${expectations.examples.important.map(ex => `- ${ex}`).join('\n')}`;
    }

    if (expectations.examples?.notImportant && expectations.examples.notImportant.length > 0) {
      prompt += `\n\nExamples of NOT IMPORTANT emails:\n${expectations.examples.notImportant.map(ex => `- ${ex}`).join('\n')}`;
    }

    prompt += `\n\nEMAIL TO CLASSIFY:
Subject: ${emailContent.subject}
From: ${emailContent.sender}
Content: ${emailContent.content}
Has Attachments: ${emailContent.hasAttachments}
Received: ${emailContent.receivedAt}

Please respond with a JSON object containing:
{
  "importance": "important" or "not_important",
  "confidence": number between 0 and 1 (how confident you are in this classification),
  "reasoning": "brief explanation of why this email is or isn't important based on the user's expectations"
}`;

    return prompt;
  }

  /**
   * Sanitize email content for OpenAI processing
   */
  private sanitizeEmailContent(email: Email): {
    subject: string;
    sender: string;
    content: string;
    hasAttachments: boolean;
    receivedAt: string;
  } {
    // Truncate content if too long (OpenAI has token limits)
    const maxContentLength = 2000;
    let content = email.content || '';
    
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '... [truncated]';
    }

    // Remove potentially sensitive information patterns
    content = content
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_NUMBER]') // Credit card numbers
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]') // Social security numbers
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]') // Email addresses (except sender)
      .replace(/\b\d{10,}\b/g, '[PHONE]'); // Phone numbers

    return {
      subject: email.subject || '[No Subject]',
      sender: email.sender || '[Unknown Sender]',
      content: content,
      hasAttachments: email.metadata?.hasAttachments || false,
      receivedAt: email.receivedAt.toISOString()
    };
  }

  /**
   * Parse OpenAI classification response
   */
  private parseClassificationResponse(content: string | null): {
    importance: 'important' | 'not_important';
    confidence: number;
    reasoning: string;
  } {
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    try {
      const parsed = JSON.parse(content);
      
      // Validate response structure
      if (!parsed.importance || !['important', 'not_important'].includes(parsed.importance)) {
        throw new Error('Invalid importance value in response');
      }

      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error('Invalid confidence value in response');
      }

      if (!parsed.reasoning || typeof parsed.reasoning !== 'string') {
        throw new Error('Invalid reasoning in response');
      }

      return {
        importance: parsed.importance,
        confidence: Math.round(parsed.confidence * 100) / 100, // Round to 2 decimal places
        reasoning: parsed.reasoning.substring(0, 500) // Limit reasoning length
      };
    } catch (error) {
      console.error('Failed to parse OpenAI response:', content, error);
      throw new Error('Invalid JSON response from OpenAI');
    }
  }

  /**
   * Get usage statistics (for monitoring)
   */
  async getUsageStats(): Promise<{
    model: string;
    isAvailable: boolean;
    lastChecked: Date;
  }> {
    const isAvailable = await this.isAvailable();
    
    return {
      model: this.model,
      isAvailable,
      lastChecked: new Date()
    };
  }
}