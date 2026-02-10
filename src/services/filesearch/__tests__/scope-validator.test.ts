/**
 * Scope Restriction Validator Tests
 */

import { ScopeValidator } from '../scope-validator';

describe('ScopeValidator', () => {
  describe('with no allowed paths (MVP behavior)', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator([]);
    });

    it('should allow any local path', () => {
      expect(validator.isPathAllowed('C:\\Users\\john\\Documents')).toBe(true);
    });

    it('should allow root paths', () => {
      expect(validator.isPathAllowed('C:\\')).toBe(true);
    });

    it('should allow different drive letters', () => {
      expect(validator.isPathAllowed('D:\\Data\\files')).toBe(true);
    });

    it('should reject empty path', () => {
      expect(validator.isPathAllowed('')).toBe(false);
    });

    it('should reject UNC paths', () => {
      expect(validator.isPathAllowed('\\\\server\\share')).toBe(false);
    });

    it('should reject UNC paths with forward slashes', () => {
      expect(validator.isPathAllowed('//server/share')).toBe(false);
    });

    it('should reject path traversal', () => {
      expect(validator.isPathAllowed('C:\\Users\\..\\Windows\\System32')).toBe(false);
    });
  });

  describe('with configured allowed paths', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator(['C:\\Users\\chris\\Documents', 'D:\\Projects']);
    });

    it('should allow path exactly matching allowed path', () => {
      expect(validator.isPathAllowed('C:\\Users\\chris\\Documents')).toBe(true);
    });

    it('should allow path under allowed path', () => {
      expect(validator.isPathAllowed('C:\\Users\\chris\\Documents\\reports')).toBe(true);
    });

    it('should allow second allowed path', () => {
      expect(validator.isPathAllowed('D:\\Projects\\myapp')).toBe(true);
    });

    it('should reject path outside all allowed paths', () => {
      expect(validator.isPathAllowed('C:\\Windows\\System32')).toBe(false);
    });

    it('should reject path that is parent of allowed path', () => {
      expect(validator.isPathAllowed('C:\\Users\\chris')).toBe(false);
    });

    it('should reject path similar but not under allowed path', () => {
      expect(validator.isPathAllowed('C:\\Users\\chris\\DocumentsExtra')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator(['C:\\Users\\Chris\\Documents']);
    });

    it('should match case-insensitively', () => {
      expect(validator.isPathAllowed('c:\\users\\chris\\documents\\file.txt')).toBe(true);
    });

    it('should match UPPERCASE', () => {
      expect(validator.isPathAllowed('C:\\USERS\\CHRIS\\DOCUMENTS\\file.txt')).toBe(true);
    });
  });

  describe('path normalization', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator([]);
    });

    it('should normalize forward slashes to backslashes', () => {
      const normalized = validator.normalizePath('C:/Users/chris/Documents');
      expect(normalized).toContain('\\');
      expect(normalized).not.toContain('/');
    });

    it('should lowercase the path', () => {
      const normalized = validator.normalizePath('C:\\Users\\CHRIS\\Documents');
      expect(normalized).toBe(normalized.toLowerCase());
    });

    it('should resolve relative segments', () => {
      const normalized = validator.normalizePath('C:\\Users\\chris\\Documents\\.\\file.txt');
      expect(normalized).not.toContain('\\.');
    });
  });

  describe('validateAndNormalize', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator(['C:\\Allowed']);
    });

    it('should return valid result for allowed path', () => {
      const result = validator.validateAndNormalize('C:\\Allowed\\file.txt');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for path outside scope', () => {
      const result = validator.validateAndNormalize('C:\\NotAllowed\\file.txt');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Path is outside allowed search scope');
    });

    it('should return invalid for empty path', () => {
      const result = validator.validateAndNormalize('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Path cannot be empty');
    });

    it('should return invalid for UNC path', () => {
      const result = validator.validateAndNormalize('\\\\server\\share');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('UNC paths are not supported');
    });

    it('should return invalid for path traversal', () => {
      const result = validator.validateAndNormalize('C:\\Allowed\\..\\Windows');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Path traversal (..) is not allowed');
    });

    it('should return normalized path even on failure', () => {
      const result = validator.validateAndNormalize('C:\\NotAllowed\\file.txt');
      expect(result.normalizedPath).toBeTruthy();
    });
  });

  describe('security edge cases', () => {
    let validator: ScopeValidator;

    beforeEach(() => {
      validator = new ScopeValidator(['C:\\Allowed']);
    });

    it('should reject double-dot traversal', () => {
      expect(validator.isPathAllowed('C:\\Allowed\\..\\..\\Windows')).toBe(false);
    });

    it('should handle mixed separators', () => {
      const result = validator.validateAndNormalize('C:\\Allowed/subdir/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle whitespace-only path', () => {
      expect(validator.isPathAllowed('   ')).toBe(false);
    });

    it('should reject UNC with backslashes', () => {
      expect(validator.isPathAllowed('\\\\server\\share\\path')).toBe(false);
    });

    it('should handle multiple allowed paths with different drives', () => {
      const multi = new ScopeValidator(['C:\\Data', 'D:\\Data', 'E:\\Projects']);
      expect(multi.isPathAllowed('C:\\Data\\file.txt')).toBe(true);
      expect(multi.isPathAllowed('D:\\Data\\file.txt')).toBe(true);
      expect(multi.isPathAllowed('E:\\Projects\\src')).toBe(true);
      expect(multi.isPathAllowed('F:\\Other')).toBe(false);
    });
  });
});
