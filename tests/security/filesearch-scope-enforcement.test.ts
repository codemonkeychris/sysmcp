/**
 * Scope Enforcement Security Tests (Task 3.2)
 *
 * Verifies that file search scope restrictions cannot be bypassed.
 */

import { ScopeValidator } from '../../src/services/filesearch/scope-validator';

describe('Scope Enforcement Security Tests', () => {
  describe('Path Traversal Prevention', () => {
    const validator = new ScopeValidator([]);

    const traversalPayloads = [
      'C:\\Users\\..\\..\\Windows\\System32',
      'C:\\Users\\..\\..\\..\\',
      '..\\..\\Windows',
      'C:\\Users\\..\\..',
      'C:/Users/../../Windows',
      'C:\\Users\\test\\..\\..\\Windows',
    ];

    it.each(traversalPayloads)(
      'should reject path traversal: %s',
      (payload) => {
        const result = validator.validateAndNormalize(payload);
        expect(result.valid).toBe(false);
      }
    );
  });

  describe('UNC Path Prevention', () => {
    const validator = new ScopeValidator([]);

    const uncPaths = [
      '\\\\server\\share',
      '\\\\192.168.1.1\\C$',
      '\\\\server\\admin$',
      '//server/share',
      '\\\\?\\UNC\\server\\share',
    ];

    it.each(uncPaths)(
      'should reject UNC path: %s',
      (payload) => {
        const result = validator.validateAndNormalize(payload);
        expect(result.valid).toBe(false);
      }
    );
  });

  describe('Allowed Paths Enforcement', () => {
    const validator = new ScopeValidator(['C:\\Users\\Documents', 'D:\\Projects']);

    it('should allow path within allowed scope', () => {
      const result = validator.validateAndNormalize('C:\\Users\\Documents\\report.pdf');
      expect(result.valid).toBe(true);
    });

    it('should allow exact allowed path', () => {
      const result = validator.validateAndNormalize('C:\\Users\\Documents');
      expect(result.valid).toBe(true);
    });

    it('should reject path outside allowed scope', () => {
      const result = validator.validateAndNormalize('C:\\Windows\\System32');
      expect(result.valid).toBe(false);
    });

    it('should reject sibling of allowed path', () => {
      const result = validator.validateAndNormalize('C:\\Users\\Desktop');
      expect(result.valid).toBe(false);
    });

    it('should allow second allowed path', () => {
      const result = validator.validateAndNormalize('D:\\Projects\\myapp');
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    const validator = new ScopeValidator([]);

    it('should reject empty path', () => {
      const result = validator.validateAndNormalize('');
      expect(result.valid).toBe(false);
    });

    it('should handle path with only dots', () => {
      const result = validator.validateAndNormalize('..');
      expect(result.valid).toBe(false);
    });

    it('should handle null bytes in path', () => {
      const result = validator.validateAndNormalize('C:\\Users\0\\secret');
      expect(result.valid).toBe(false);
    });

    it('should handle very long paths', () => {
      const longPath = 'C:\\' + 'a'.repeat(300);
      const result = validator.validateAndNormalize(longPath);
      // Should either accept (valid local path) or reject, but not crash
      expect(typeof result.valid).toBe('boolean');
    });

    it('should handle case-insensitive matching for allowed paths', () => {
      const validator = new ScopeValidator(['C:\\Users\\Documents']);
      const result = validator.validateAndNormalize('c:\\users\\documents\\file.txt');
      expect(result.valid).toBe(true);
    });
  });
});
