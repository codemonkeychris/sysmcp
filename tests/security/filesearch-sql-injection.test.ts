/**
 * SQL Injection Security Test Suite (Task 3.1)
 *
 * Comprehensive tests verifying that SQL injection attacks are prevented
 * at every input vector in the query builder.
 */

import {
  sanitizeSearchText,
  sanitizeStringValue,
  sanitizeFileType,
  buildSearchQuery
} from '../../src/services/filesearch/query-builder';
import { FileSearchQueryParams } from '../../src/services/filesearch/types';

function makeParams(overrides: Partial<FileSearchQueryParams> = {}): FileSearchQueryParams {
  return { searchText: '', limit: 25, offset: 0, ...overrides };
}

describe('SQL Injection Security Tests', () => {
  describe('Classic SQL Injection Vectors', () => {
    const injectionPayloads = [
      "'; DROP TABLE SystemIndex; --",
      "1' OR '1'='1",
      "1'; EXEC xp_cmdshell('dir'); --",
      "' UNION SELECT * FROM sys.tables --",
      "'; INSERT INTO SystemIndex VALUES('hack'); --",
      "'; UPDATE SystemIndex SET path='hacked'; --",
      "'; DELETE FROM SystemIndex; --",
      "' OR 1=1 --",
      "admin'--",
      "1'; SHUTDOWN; --",
    ];

    it.each(injectionPayloads)(
      'should neutralize injection in searchText: %s',
      (payload) => {
        const sanitized = sanitizeSearchText(payload);
        // Must not contain semicolons or SQL comments
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('--');
      }
    );

    it.each(injectionPayloads)(
      'should escape quotes in string values: %s',
      (payload) => {
        const sanitized = sanitizeStringValue(payload);
        // Unescaped single quotes should not exist
        const unescaped = sanitized.replace(/''/g, '');
        expect(unescaped).not.toContain("'");
      }
    );
  });

  describe('Encoded/Obfuscated Injection', () => {
    it('should handle null byte injection', () => {
      const result = sanitizeSearchText('test\0; DROP TABLE');
      expect(result).not.toContain('\0');
      expect(result).not.toContain('DROP');
    });

    it('should handle tab/newline injection', () => {
      const result = sanitizeSearchText("test\t\n; DROP TABLE");
      expect(result).not.toContain('DROP');
    });

    it('should strip SQL comment markers', () => {
      expect(sanitizeSearchText('test -- comment')).not.toContain('--');
      expect(sanitizeSearchText('test /* block */')).not.toContain('/*');
      expect(sanitizeSearchText('test */ end')).not.toContain('*/');
    });
  });

  describe('File Type Injection Prevention', () => {
    const badFileTypes = [
      "'; DROP TABLE --",
      ".pdf'; DELETE FROM --",
      ".exe; EXEC xp_cmdshell",
      ".doc.exe",
      "..\\..\\secret",
    ];

    it.each(badFileTypes)(
      'should reject malicious file type: %s',
      (payload) => {
        expect(() => sanitizeFileType(payload)).toThrow();
      }
    );
  });

  describe('End-to-End Query Safety', () => {
    it('should produce safe query from malicious searchText', () => {
      const params = makeParams({ searchText: "'; DROP TABLE SystemIndex; --" });
      const result = buildSearchQuery(params);
      expect(result.sql).not.toContain(';');
    });

    it('should produce safe query from malicious author', () => {
      const params = makeParams({ author: "'; DELETE FROM users; --" });
      const result = buildSearchQuery(params);
      expect(result.sql).toContain("''");
    });

    it('should not allow UNION-based injection via searchText', () => {
      const params = makeParams({
        searchText: "test' UNION SELECT password FROM users --"
      });
      const result = buildSearchQuery(params);
      expect(result.sql).not.toContain('UNION');
    });

    it('should limit search text length', () => {
      const result = sanitizeSearchText('A'.repeat(10000));
      expect(result.length).toBeLessThanOrEqual(500);
    });

    it('should produce valid SQL structure even with injection', () => {
      const params = makeParams({
        searchText: "report' OR '1'='1",
        fileName: "*.txt'; DROP TABLE --",
        author: "admin'; EXEC --",
        path: "C:\\'; DELETE FROM x; --"
      });
      const result = buildSearchQuery(params);
      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('FROM SystemIndex');
    });
  });
});
