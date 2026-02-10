/**
 * Tests for Windows Search SQL Query Builder
 *
 * SECURITY: These tests verify SQL injection prevention and correct query generation.
 */

import {
  sanitizeStringValue,
  sanitizeSearchText,
  sanitizeFileName,
  sanitizeFileType,
  validateNumeric,
  formatDateForSql,
  buildScopeClause,
  buildFilterPredicates,
  buildSearchQuery
} from '../query-builder';
import { FileSearchQueryParams, SearchMode } from '../types';

// Helper to build minimal valid params
function makeParams(overrides: Partial<FileSearchQueryParams> = {}): FileSearchQueryParams {
  return {
    searchText: '',
    limit: 25,
    offset: 0,
    ...overrides
  };
}

describe('sanitizeStringValue', () => {
  it('should escape single quotes', () => {
    expect(sanitizeStringValue("O'Reilly")).toBe("O''Reilly");
  });

  it('should handle multiple single quotes', () => {
    expect(sanitizeStringValue("it's a dog's life")).toBe("it''s a dog''s life");
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeStringValue(undefined as any)).toBe('');
    expect(sanitizeStringValue(null as any)).toBe('');
    expect(sanitizeStringValue(123 as any)).toBe('');
  });

  it('should preserve normal strings', () => {
    expect(sanitizeStringValue('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(sanitizeStringValue('')).toBe('');
  });
});

describe('sanitizeSearchText', () => {
  it('should remove double quotes', () => {
    expect(sanitizeSearchText('hello "world"')).toBe("hello world");
  });

  it('should strip dangerous SQL keywords', () => {
    expect(sanitizeSearchText('DROP TABLE users')).toBe('TABLE users');
    expect(sanitizeSearchText('DELETE FROM table')).toBe('FROM table');
    expect(sanitizeSearchText('INSERT INTO x')).toBe('INTO x');
    expect(sanitizeSearchText('UPDATE SET x')).toBe('SET x');
    expect(sanitizeSearchText('EXEC sp_whatever')).toBe('sp_whatever');
    expect(sanitizeSearchText('EXECUTE proc')).toBe('proc');
    expect(sanitizeSearchText('ALTER TABLE x')).toBe('TABLE x');
    expect(sanitizeSearchText('CREATE TABLE x')).toBe('TABLE x');
    expect(sanitizeSearchText('UNION SELECT')).toBe('SELECT');
    expect(sanitizeSearchText('TRUNCATE TABLE')).toBe('TABLE');
    expect(sanitizeSearchText('GRANT ALL')).toBe('ALL');
    expect(sanitizeSearchText('REVOKE ALL')).toBe('ALL');
  });

  it('should strip dangerous keywords case-insensitively', () => {
    expect(sanitizeSearchText('drop TABLE')).toBe('TABLE');
    expect(sanitizeSearchText('Drop Table')).toBe('Table');
  });

  it('should escape single quotes', () => {
    expect(sanitizeSearchText("it's")).toBe("it''s");
  });

  it('should remove semicolons', () => {
    // DROP is also removed as a dangerous keyword, so only 'text TABLE' remains
    expect(sanitizeSearchText('text; DROP TABLE')).toBe('text  TABLE');
  });

  it('should remove SQL comments', () => {
    expect(sanitizeSearchText('text -- comment')).toBe('text  comment');
    expect(sanitizeSearchText('text /* comment */ more')).toBe('text  comment  more');
  });

  it('should remove null bytes', () => {
    expect(sanitizeSearchText('hello\0world')).toBe('helloworld');
  });

  it('should truncate to 500 characters', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeSearchText(long).length).toBeLessThanOrEqual(500);
  });

  it('should handle empty string', () => {
    expect(sanitizeSearchText('')).toBe('');
  });

  it('should handle non-string input', () => {
    expect(sanitizeSearchText(undefined as any)).toBe('');
    expect(sanitizeSearchText(null as any)).toBe('');
  });

  it('should trim whitespace', () => {
    expect(sanitizeSearchText('  hello  ')).toBe('hello');
  });

  it('should handle combined injection attempts', () => {
    const injection = "'; DROP TABLE users; --";
    const result = sanitizeSearchText(injection);
    expect(result).not.toContain('DROP');
    expect(result).not.toContain(';');
    expect(result).not.toContain('--');
  });
});

describe('sanitizeFileName', () => {
  it('should translate * wildcard to %', () => {
    expect(sanitizeFileName('*.txt')).toBe('%.txt');
  });

  it('should translate ? wildcard to _', () => {
    expect(sanitizeFileName('file?.txt')).toBe('file_.txt');
  });

  it('should escape single quotes', () => {
    expect(sanitizeFileName("file's.txt")).toBe("file''s.txt");
  });

  it('should remove brackets', () => {
    expect(sanitizeFileName('file[1].txt')).toBe('file1.txt');
  });

  it('should remove null bytes', () => {
    expect(sanitizeFileName('file\0.txt')).toBe('file.txt');
  });

  it('should truncate to 260 characters', () => {
    const long = 'a'.repeat(300) + '.txt';
    expect(sanitizeFileName(long).length).toBeLessThanOrEqual(260);
  });

  it('should handle non-string input', () => {
    expect(sanitizeFileName(undefined as any)).toBe('');
  });

  it('should handle normal filenames', () => {
    expect(sanitizeFileName('report.pdf')).toBe('report.pdf');
  });
});

describe('sanitizeFileType', () => {
  it('should accept valid extensions with dot', () => {
    expect(sanitizeFileType('.pdf')).toBe('.pdf');
    expect(sanitizeFileType('.docx')).toBe('.docx');
    expect(sanitizeFileType('.txt')).toBe('.txt');
  });

  it('should add leading dot if missing', () => {
    expect(sanitizeFileType('pdf')).toBe('.pdf');
    expect(sanitizeFileType('docx')).toBe('.docx');
  });

  it('should lowercase the extension', () => {
    expect(sanitizeFileType('.PDF')).toBe('.pdf');
    expect(sanitizeFileType('DOCX')).toBe('.docx');
  });

  it('should reject non-alphanumeric extensions', () => {
    expect(() => sanitizeFileType('.doc.exe')).toThrow('Invalid file type');
    expect(() => sanitizeFileType('.exe;')).toThrow('Invalid file type');
    expect(() => sanitizeFileType("'; DROP")).toThrow('Invalid file type');
  });

  it('should handle non-string input', () => {
    expect(sanitizeFileType(undefined as any)).toBe('');
  });
});

describe('validateNumeric', () => {
  it('should accept valid numbers', () => {
    expect(validateNumeric(42)).toBe(42);
    expect(validateNumeric(0)).toBe(0);
    expect(validateNumeric(-1)).toBe(-1);
    expect(validateNumeric(3.14)).toBe(3.14);
  });

  it('should reject NaN', () => {
    expect(() => validateNumeric(NaN)).toThrow('Invalid numeric value');
  });

  it('should reject Infinity', () => {
    expect(() => validateNumeric(Infinity)).toThrow('Invalid numeric value');
    expect(() => validateNumeric(-Infinity)).toThrow('Invalid numeric value');
  });

  it('should reject non-numbers', () => {
    expect(() => validateNumeric('42' as any)).toThrow('Invalid numeric value');
    expect(() => validateNumeric(undefined as any)).toThrow('Invalid numeric value');
  });
});

describe('formatDateForSql', () => {
  it('should format a valid date', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(formatDateForSql(date)).toBe('2024-01-15 10:30:00.000');
  });

  it('should reject invalid dates', () => {
    expect(() => formatDateForSql(new Date('invalid'))).toThrow('Invalid date value');
    expect(() => formatDateForSql(undefined as any)).toThrow('Invalid date value');
    expect(() => formatDateForSql(null as any)).toThrow('Invalid date value');
  });
});

describe('buildScopeClause', () => {
  it('should build SCOPE with forward slashes', () => {
    expect(buildScopeClause('C:\\Users\\Documents')).toBe("SCOPE='file:C:/Users/Documents'");
  });

  it('should escape single quotes in path', () => {
    expect(buildScopeClause("C:\\O'Brien")).toBe("SCOPE='file:C:/O''Brien'");
  });

  it('should handle already-forward-slash paths', () => {
    expect(buildScopeClause('C:/Users/Docs')).toBe("SCOPE='file:C:/Users/Docs'");
  });
});

describe('buildFilterPredicates', () => {
  it('should build CONTAINS predicate for exact search mode', () => {
    const params = makeParams({ searchText: 'budget report', searchMode: SearchMode.CONTAINS });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain(`CONTAINS(*, '"budget report"')`);
  });

  it('should build FREETEXT predicate for freetext mode', () => {
    const params = makeParams({ searchText: 'budget report', searchMode: SearchMode.FREETEXT });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain("FREETEXT(*, 'budget report')");
  });

  it('should default to CONTAINS mode', () => {
    const params = makeParams({ searchText: 'test' });
    const predicates = buildFilterPredicates(params);
    expect(predicates[0]).toContain('CONTAINS');
  });

  it('should build filename LIKE predicate', () => {
    const params = makeParams({ fileName: '*.txt' });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain("System.FileName LIKE '%.txt'");
  });

  it('should build file type predicate', () => {
    const params = makeParams({ fileType: '.pdf' });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain("System.FileExtension = '.pdf'");
  });

  it('should build size range predicates', () => {
    const params = makeParams({ minSize: 1024, maxSize: 10240 });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain('System.Size >= 1024');
    expect(predicates).toContain('System.Size <= 10240');
  });

  it('should build date modified predicates', () => {
    const after = new Date('2024-01-01T00:00:00Z');
    const before = new Date('2024-12-31T23:59:59Z');
    const params = makeParams({ modifiedAfter: after, modifiedBefore: before });
    const predicates = buildFilterPredicates(params);
    expect(predicates.some(p => p.includes('System.DateModified >='))).toBe(true);
    expect(predicates.some(p => p.includes('System.DateModified <='))).toBe(true);
  });

  it('should build date created predicates', () => {
    const after = new Date('2024-01-01T00:00:00Z');
    const params = makeParams({ createdAfter: after });
    const predicates = buildFilterPredicates(params);
    expect(predicates.some(p => p.includes('System.DateCreated >='))).toBe(true);
  });

  it('should build author predicate', () => {
    const params = makeParams({ author: 'John Doe' });
    const predicates = buildFilterPredicates(params);
    expect(predicates).toContain("System.Author = 'John Doe'");
  });

  it('should skip empty search text', () => {
    const params = makeParams({ searchText: '' });
    const predicates = buildFilterPredicates(params);
    expect(predicates.length).toBe(0);
  });

  it('should combine multiple predicates', () => {
    const params = makeParams({
      searchText: 'report',
      fileType: '.pdf',
      minSize: 1024
    });
    const predicates = buildFilterPredicates(params);
    expect(predicates.length).toBe(3);
  });
});

describe('buildSearchQuery', () => {
  it('should build a basic query with defaults', () => {
    const params = makeParams({ searchText: 'test' });
    const result = buildSearchQuery(params);

    expect(result.sql).toContain('SELECT TOP');
    expect(result.sql).toContain('FROM SystemIndex');
    expect(result.sql).toContain('ORDER BY System.DateModified DESC');
    expect(result.sql).toContain('CONTAINS');
    expect(result.countSql).toContain('SELECT COUNT(*)');
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(25);
  });

  it('should calculate TOP as offset + limit + 1', () => {
    const params = makeParams({ limit: 10, offset: 20 });
    const result = buildSearchQuery(params);
    expect(result.sql).toContain('SELECT TOP 31');
  });

  it('should include SCOPE clause when path is provided', () => {
    const params = makeParams({ path: 'C:\\Users\\Documents' });
    const result = buildSearchQuery(params);
    expect(result.sql).toContain("SCOPE='file:C:/Users/Documents'");
  });

  it('should combine SCOPE with filter predicates using AND', () => {
    const params = makeParams({
      path: 'C:\\Users\\Documents',
      searchText: 'report',
      fileType: '.pdf'
    });
    const result = buildSearchQuery(params);
    expect(result.sql).toContain('AND');
    expect(result.sql).toContain('SCOPE');
    expect(result.sql).toContain('CONTAINS');
    expect(result.sql).toContain('System.FileExtension');
  });

  it('should build query without WHERE when no params', () => {
    const params = makeParams({ searchText: '' });
    const result = buildSearchQuery(params);
    expect(result.sql).not.toContain('WHERE');
  });

  it('should return matching countSql', () => {
    const params = makeParams({ searchText: 'test', path: 'C:\\Users' });
    const result = buildSearchQuery(params);
    expect(result.countSql).toContain('SELECT COUNT(*)');
    expect(result.countSql).toContain('FROM SystemIndex');
    expect(result.countSql).toContain('WHERE');
  });

  it('should select all required columns', () => {
    const params = makeParams();
    const result = buildSearchQuery(params);
    expect(result.sql).toContain('System.ItemPathDisplay');
    expect(result.sql).toContain('System.FileName');
    expect(result.sql).toContain('System.FileExtension');
    expect(result.sql).toContain('System.Size');
    expect(result.sql).toContain('System.DateModified');
    expect(result.sql).toContain('System.DateCreated');
    expect(result.sql).toContain('System.Author');
    expect(result.sql).toContain('System.Title');
    expect(result.sql).toContain('System.Keywords');
  });

  // SQL Injection tests
  describe('SQL Injection Prevention', () => {
    it('should neutralize SQL injection in search text', () => {
      const params = makeParams({ searchText: "'; DROP TABLE SystemIndex; --" });
      const result = buildSearchQuery(params);
      expect(result.sql).not.toContain('DROP');
      expect(result.sql).not.toContain(';');
    });

    it('should neutralize SQL injection in filename by escaping quotes', () => {
      const params = makeParams({ fileName: "'; DROP TABLE users --" });
      const result = buildSearchQuery(params);
      // The single quote is escaped, preventing SQL breakout
      expect(result.sql).toContain("''");
      // The text is contained within the LIKE value, not executable
      expect(result.sql).toContain("LIKE");
    });

    it('should neutralize SQL injection in file type', () => {
      expect(() => {
        const params = makeParams({ fileType: "'; DROP TABLE" });
        buildSearchQuery(params);
      }).toThrow('Invalid file type');
    });

    it('should neutralize SQL injection in path by escaping quotes', () => {
      const params = makeParams({ path: "C:\\'; DROP TABLE --" });
      const result = buildSearchQuery(params);
      // The single quote is escaped, preventing SQL breakout
      expect(result.sql).toContain("''");
      // The text is contained within the SCOPE value, not executable
      expect(result.sql).toContain("SCOPE=");
    });

    it('should neutralize SQL injection in author', () => {
      const params = makeParams({ author: "'; DROP TABLE users; --" });
      const result = buildSearchQuery(params);
      // Single quotes should be escaped
      expect(result.sql).toContain("''");
    });

    it('should neutralize UNION injection', () => {
      const params = makeParams({ searchText: "test UNION SELECT * FROM users" });
      const result = buildSearchQuery(params);
      expect(result.sql).not.toContain('UNION');
    });
  });
});
