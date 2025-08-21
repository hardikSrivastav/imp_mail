/**
 * Unit tests for DomainValidator class
 */

import { DomainValidator } from '../../../services/auth/DomainValidator';

describe('DomainValidator', () => {
  let validator: DomainValidator;

  beforeEach(() => {
    validator = new DomainValidator('@ashoka.edu.in');
  });

  describe('isValidDomain', () => {
    it('should return true for valid @ashoka.edu.in emails', () => {
      expect(validator.isValidDomain('student@ashoka.edu.in')).toBe(true);
      expect(validator.isValidDomain('faculty@ashoka.edu.in')).toBe(true);
      expect(validator.isValidDomain('admin@ashoka.edu.in')).toBe(true);
    });

    it('should return true for valid emails with different cases', () => {
      expect(validator.isValidDomain('Student@Ashoka.Edu.In')).toBe(true);
      expect(validator.isValidDomain('FACULTY@ASHOKA.EDU.IN')).toBe(true);
    });

    it('should return false for invalid domains', () => {
      expect(validator.isValidDomain('user@gmail.com')).toBe(false);
      expect(validator.isValidDomain('student@other.edu')).toBe(false);
      expect(validator.isValidDomain('admin@ashoka.edu')).toBe(false);
    });

    it('should return false for invalid email formats', () => {
      expect(validator.isValidDomain('')).toBe(false);
      expect(validator.isValidDomain('invalid-email')).toBe(false);
      expect(validator.isValidDomain('@ashoka.edu.in')).toBe(false);
      expect(validator.isValidDomain('user@')).toBe(false);
    });

    it('should return false for null or undefined inputs', () => {
      expect(validator.isValidDomain(null as any)).toBe(false);
      expect(validator.isValidDomain(undefined as any)).toBe(false);
    });

    it('should handle emails with whitespace', () => {
      expect(validator.isValidDomain('  student@ashoka.edu.in  ')).toBe(true);
      expect(validator.isValidDomain('\tstudent@ashoka.edu.in\n')).toBe(true);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain correctly', () => {
      expect(validator.extractDomain('student@ashoka.edu.in')).toBe('@ashoka.edu.in');
      expect(validator.extractDomain('user@gmail.com')).toBe('@gmail.com');
    });

    it('should handle case insensitive extraction', () => {
      expect(validator.extractDomain('Student@Ashoka.Edu.In')).toBe('@ashoka.edu.in');
    });

    it('should return empty string for invalid emails', () => {
      expect(validator.extractDomain('invalid-email')).toBe('');
      expect(validator.extractDomain('')).toBe('');
      expect(validator.extractDomain('user@')).toBe('@');
    });

    it('should handle multiple @ symbols', () => {
      expect(validator.extractDomain('user@domain@ashoka.edu.in')).toBe('@ashoka.edu.in');
    });
  });

  describe('getAllowedDomain', () => {
    it('should return the configured allowed domain', () => {
      expect(validator.getAllowedDomain()).toBe('@ashoka.edu.in');
    });

    it('should work with custom domains', () => {
      const customValidator = new DomainValidator('@custom.edu');
      expect(customValidator.getAllowedDomain()).toBe('@custom.edu');
    });
  });

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      const result = validator.validateEmail('student@ashoka.edu.in');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject emails with wrong domain', () => {
      const result = validator.validateEmail('user@gmail.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Only @ashoka.edu.in email addresses are allowed');
    });

    it('should reject invalid email formats', () => {
      const result = validator.validateEmail('invalid-email');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid email format');
    });

    it('should reject empty emails', () => {
      const result = validator.validateEmail('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Email address is required');
    });

    it('should reject null/undefined emails', () => {
      const result1 = validator.validateEmail(null as any);
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Email address is required');

      const result2 = validator.validateEmail(undefined as any);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Email address is required');
    });

    it('should handle whitespace in emails', () => {
      const result = validator.validateEmail('  student@ashoka.edu.in  ');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('custom domain configuration', () => {
    it('should work with different allowed domains', () => {
      const customValidator = new DomainValidator('@university.edu');
      
      expect(customValidator.isValidDomain('user@university.edu')).toBe(true);
      expect(customValidator.isValidDomain('user@ashoka.edu.in')).toBe(false);
      
      const result = customValidator.validateEmail('user@other.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Only @university.edu email addresses are allowed');
    });
  });
});