/**
 * Error Handling & Edge Cases Tests (Task 3.4)
 *
 * Verifies graceful error handling and correct behavior on edge cases.
 */

import {
  sanitizeSearchText,
  sanitizeFileName,
  sanitizeFileType,
  validateNumeric,
  formatDateForSql,
  buildSearchQuery
} from '../../src/services/filesearch/query-builder';
import { mapOleDbRow, mapOleDbRows } from '../../src/services/filesearch/result-mapper';
import { FileSearchQueryParams } from '../../src/services/filesearch/types';

function makeParams(overrides: Partial<FileSearchQueryParams> = {}): FileSearchQueryParams {
  return { searchText: '', limit: 25, offset: 0, ...overrides };
}

describe('Error Handling & Edge Cases', () => {
  describe('Query Builder Edge Cases', () => {
    it('should handle empty search text', () => {
      const result = buildSearchQuery(makeParams({ searchText: '' }));
      expect(result.sql).toContain('SELECT');
      expect(result.sql).not.toContain('CONTAINS');
      expect(result.sql).not.toContain('FREETEXT');
    });

    it('should handle search text that becomes empty after sanitization', () => {
      // Only dangerous keywords
      const result = sanitizeSearchText('DROP DELETE INSERT');
      // After removing all keywords, should be empty or whitespace
      expect(result.trim().length).toBe(0);
    });

    it('should handle limit of 1', () => {
      const result = buildSearchQuery(makeParams({ limit: 1 }));
      expect(result.sql).toContain('TOP 2'); // 0 + 1 + 1
    });

    it('should handle large offset', () => {
      const result = buildSearchQuery(makeParams({ limit: 10, offset: 10000 }));
      expect(result.sql).toContain('TOP 10011');
    });

    it('should handle minSize of 0', () => {
      const result = buildSearchQuery(makeParams({ minSize: 0 }));
      expect(result.sql).toContain('System.Size >= 0');
    });

    it('should handle same minSize and maxSize', () => {
      const result = buildSearchQuery(makeParams({ minSize: 1024, maxSize: 1024 }));
      expect(result.sql).toContain('System.Size >= 1024');
      expect(result.sql).toContain('System.Size <= 1024');
    });

    it('should handle date at epoch', () => {
      const epoch = new Date(0);
      const formatted = formatDateForSql(epoch);
      expect(formatted).toBe('1970-01-01 00:00:00.000');
    });

    it('should handle date far in future', () => {
      const future = new Date('2099-12-31T23:59:59Z');
      const formatted = formatDateForSql(future);
      expect(formatted).toContain('2099');
    });
  });

  describe('Result Mapper Edge Cases', () => {
    it('should handle completely empty row', () => {
      const entry = mapOleDbRow({});
      expect(entry.path).toBe('');
      expect(entry.fileName).toBe('');
      expect(entry.size).toBe(0);
    });

    it('should handle row with all null values', () => {
      const entry = mapOleDbRow({
        'System.ItemPathDisplay': null,
        'System.FileName': null,
        'System.FileExtension': null,
        'System.Size': null,
        'System.DateModified': null,
        'System.DateCreated': null,
        'System.Author': null,
        'System.Title': null,
        'System.Keywords': null
      });
      expect(entry.path).toBe('');
      expect(entry.size).toBe(0);
      expect(entry.dateModified).toEqual(new Date(0));
    });

    it('should handle row with unexpected property types', () => {
      const entry = mapOleDbRow({
        'System.Size': 'not a number',
        'System.DateModified': 'not a date',
        'System.Keywords': 42
      } as any);
      expect(typeof entry.size).toBe('number');
      expect(entry.dateModified).toBeInstanceOf(Date);
    });

    it('should handle very large size values', () => {
      const entry = mapOleDbRow({ 'System.Size': Number.MAX_SAFE_INTEGER } as any);
      expect(entry.size).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle empty array of rows', () => {
      const entries = mapOleDbRows([]);
      expect(entries).toEqual([]);
    });

    it('should handle single row', () => {
      const entries = mapOleDbRows([{
        'System.ItemPathDisplay': 'C:\\test.txt',
        'System.FileName': 'test.txt'
      }]);
      expect(entries).toHaveLength(1);
    });
  });

  describe('Sanitization Edge Cases', () => {
    it('should handle string of only special chars', () => {
      const result = sanitizeSearchText("';--/**/");
      // After sanitization: ' becomes '', ; -- /* */ are removed, leaving ''
      expect(result).not.toContain(';');
      expect(result).not.toContain('--');
      expect(result).not.toContain('/*');
    });

    it('should handle string of only whitespace', () => {
      expect(sanitizeSearchText('   ')).toBe('');
    });

    it('should handle filename with spaces', () => {
      expect(sanitizeFileName('my file.txt')).toBe('my file.txt');
    });

    it('should handle filename with dots', () => {
      expect(sanitizeFileName('file.backup.txt')).toBe('file.backup.txt');
    });

    it('should reject file type with multiple dots', () => {
      expect(() => sanitizeFileType('.tar.gz')).toThrow();
    });

    it('should handle numeric validation edge cases', () => {
      expect(validateNumeric(0)).toBe(0);
      expect(validateNumeric(-0)).toBe(-0);
      expect(validateNumeric(Number.MIN_VALUE)).toBe(Number.MIN_VALUE);
      expect(() => validateNumeric(NaN)).toThrow();
      expect(() => validateNumeric(Infinity)).toThrow();
    });
  });
});
