/**
 * Domain validation service for enforcing @ashoka.edu.in email restriction
 */

export class DomainValidator {
  private readonly allowedDomain: string;

  constructor(allowedDomain: string = '@ashoka.edu.in') {
    this.allowedDomain = allowedDomain;
  }

  /**
   * Validates if an email address belongs to the allowed domain
   * @param email - Email address to validate
   * @returns true if email is from allowed domain, false otherwise
   */
  isValidDomain(email: string): boolean {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Basic email format validation first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return false;
    }
    
    return normalizedEmail.endsWith(this.allowedDomain);
  }

  /**
   * Extracts the domain from an email address
   * @param email - Email address
   * @returns domain part of the email (including @)
   */
  extractDomain(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) {
      return '';
    }

    return email.substring(atIndex).toLowerCase();
  }

  /**
   * Gets the allowed domain
   * @returns the allowed domain string
   */
  getAllowedDomain(): string {
    return this.allowedDomain;
  }

  /**
   * Validates email format and domain
   * @param email - Email address to validate
   * @returns validation result with error message if invalid
   */
  validateEmail(email: string): { isValid: boolean; error?: string } {
    if (!email || typeof email !== 'string') {
      return {
        isValid: false,
        error: 'Email address is required'
      };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return {
        isValid: false,
        error: 'Invalid email format'
      };
    }

    // Domain validation
    if (!this.isValidDomain(normalizedEmail)) {
      return {
        isValid: false,
        error: `Only ${this.allowedDomain} email addresses are allowed`
      };
    }

    return { isValid: true };
  }
}