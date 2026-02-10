/**
 * Tests for Path Anonymizer
 *
 * Verifies PII anonymization of file paths and author metadata.
 */

import { PathAnonymizer } from '../path-anonymizer';
import { PiiAnonymizer } from '../../eventlog/lib/src/anonymizer';
import { FileSearchEntry } from '../types';

describe('PathAnonymizer', () => {
  let piiAnonymizer: PiiAnonymizer;
  let pathAnonymizer: PathAnonymizer;

  beforeEach(() => {
    piiAnonymizer = new PiiAnonymizer();
    pathAnonymizer = new PathAnonymizer(piiAnonymizer);
  });

  describe('anonymizePath', () => {
    it('should anonymize Windows user profile paths', () => {
      const path = 'C:\\Users\\john.doe\\Documents\\report.pdf';
      const result = pathAnonymizer.anonymizePath(path);

      expect(result).not.toContain('john.doe');
      expect(result).toMatch(/^C:\\Users\\\[ANON_USER_[A-F0-9]+\]\\Documents\\report\.pdf$/);
    });

    it('should produce consistent tokens for the same user', () => {
      const path1 = 'C:\\Users\\john.doe\\Documents\\file1.txt';
      const path2 = 'C:\\Users\\john.doe\\Desktop\\file2.txt';

      const result1 = pathAnonymizer.anonymizePath(path1);
      const result2 = pathAnonymizer.anonymizePath(path2);

      // Extract the anonymized username portion
      const match1 = result1.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/);
      const match2 = result2.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/);

      expect(match1).toBeTruthy();
      expect(match2).toBeTruthy();
      expect(match1![1]).toBe(match2![1]);
    });

    it('should produce different tokens for different users', () => {
      const path1 = 'C:\\Users\\alice\\Documents\\file.txt';
      const path2 = 'C:\\Users\\bob\\Documents\\file.txt';

      const result1 = pathAnonymizer.anonymizePath(path1);
      const result2 = pathAnonymizer.anonymizePath(path2);

      const match1 = result1.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/);
      const match2 = result2.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/);

      expect(match1![1]).not.toBe(match2![1]);
    });

    it('should skip system accounts', () => {
      expect(pathAnonymizer.anonymizePath('C:\\Users\\Public\\file.txt')).toBe('C:\\Users\\Public\\file.txt');
      expect(pathAnonymizer.anonymizePath('C:\\Users\\Default\\file.txt')).toBe('C:\\Users\\Default\\file.txt');
      expect(pathAnonymizer.anonymizePath('C:\\Users\\Default User\\file.txt')).toBe('C:\\Users\\Default User\\file.txt');
      expect(pathAnonymizer.anonymizePath('C:\\Users\\All Users\\file.txt')).toBe('C:\\Users\\All Users\\file.txt');
    });

    it('should handle paths on different drives', () => {
      const path = 'D:\\Users\\john.doe\\Documents\\file.txt';
      const result = pathAnonymizer.anonymizePath(path);

      expect(result).not.toContain('john.doe');
      expect(result).toMatch(/^D:\\Users\\\[ANON_USER_[A-F0-9]+\]/);
    });

    it('should handle user-only paths without subdirectories', () => {
      const path = 'C:\\Users\\john.doe';
      const result = pathAnonymizer.anonymizePath(path);

      expect(result).not.toContain('john.doe');
      expect(result).toMatch(/^C:\\Users\\\[ANON_USER_[A-F0-9]+\]$/);
    });

    it('should not modify non-user paths', () => {
      expect(pathAnonymizer.anonymizePath('C:\\Windows\\System32\\config.sys')).toBe('C:\\Windows\\System32\\config.sys');
      expect(pathAnonymizer.anonymizePath('C:\\Program Files\\app\\file.exe')).toBe('C:\\Program Files\\app\\file.exe');
    });

    it('should handle empty/null/undefined', () => {
      expect(pathAnonymizer.anonymizePath('')).toBe('');
      expect(pathAnonymizer.anonymizePath(null as any)).toBe(null);
      expect(pathAnonymizer.anonymizePath(undefined as any)).toBe(undefined);
    });

    it('should handle case-insensitive Users match', () => {
      const path = 'c:\\users\\john.doe\\file.txt';
      const result = pathAnonymizer.anonymizePath(path);
      expect(result).not.toContain('john.doe');
    });
  });

  describe('anonymizeAuthor', () => {
    it('should anonymize author names', () => {
      const result = pathAnonymizer.anonymizeAuthor('John Doe');
      expect(result).not.toContain('John');
      expect(result).not.toContain('Doe');
      expect(result).toMatch(/\[ANON_USER_[A-F0-9]+\]/);
    });

    it('should produce consistent tokens for same author', () => {
      const result1 = pathAnonymizer.anonymizeAuthor('Jane Smith');
      const result2 = pathAnonymizer.anonymizeAuthor('Jane Smith');
      expect(result1).toBe(result2);
    });

    it('should produce different tokens for different authors', () => {
      const result1 = pathAnonymizer.anonymizeAuthor('Alice');
      const result2 = pathAnonymizer.anonymizeAuthor('Bob');
      expect(result1).not.toBe(result2);
    });

    it('should handle empty/null/undefined', () => {
      expect(pathAnonymizer.anonymizeAuthor('')).toBe('');
      expect(pathAnonymizer.anonymizeAuthor(null as any)).toBe(null);
      expect(pathAnonymizer.anonymizeAuthor(undefined as any)).toBe(undefined);
    });
  });

  describe('anonymizeEntry', () => {
    const makeEntry = (overrides: Partial<FileSearchEntry> = {}): FileSearchEntry => ({
      path: 'C:\\Users\\john.doe\\Documents\\report.pdf',
      fileName: 'report.pdf',
      fileType: '.pdf',
      size: 2048,
      dateModified: new Date('2024-01-15'),
      dateCreated: new Date('2024-01-01'),
      author: 'John Doe',
      title: 'Annual Report',
      tags: ['finance'],
      ...overrides
    });

    it('should anonymize path and author', () => {
      const entry = makeEntry();
      const result = pathAnonymizer.anonymizeEntry(entry);

      expect(result.path).not.toContain('john.doe');
      expect(result.author).not.toContain('John');
    });

    it('should preserve non-PII fields', () => {
      const entry = makeEntry();
      const result = pathAnonymizer.anonymizeEntry(entry);

      expect(result.fileName).toBe('report.pdf');
      expect(result.fileType).toBe('.pdf');
      expect(result.size).toBe(2048);
      expect(result.title).toBe('Annual Report');
      expect(result.tags).toEqual(['finance']);
    });

    it('should handle entry without author', () => {
      const entry = makeEntry({ author: undefined });
      const result = pathAnonymizer.anonymizeEntry(entry);

      expect(result.author).toBeUndefined();
    });

    it('should return a new object (not mutate original)', () => {
      const entry = makeEntry();
      const result = pathAnonymizer.anonymizeEntry(entry);

      expect(result).not.toBe(entry);
      expect(entry.path).toBe('C:\\Users\\john.doe\\Documents\\report.pdf');
      expect(entry.author).toBe('John Doe');
    });
  });

  describe('anonymizeEntries', () => {
    it('should anonymize an array of entries', () => {
      const entries: FileSearchEntry[] = [
        {
          path: 'C:\\Users\\alice\\file1.txt',
          fileName: 'file1.txt',
          fileType: '.txt',
          size: 100,
          dateModified: new Date(),
          dateCreated: new Date(),
          author: 'Alice',
          tags: []
        },
        {
          path: 'C:\\Users\\bob\\file2.txt',
          fileName: 'file2.txt',
          fileType: '.txt',
          size: 200,
          dateModified: new Date(),
          dateCreated: new Date(),
          author: 'Bob',
          tags: []
        }
      ];

      const results = pathAnonymizer.anonymizeEntries(entries);

      expect(results).toHaveLength(2);
      expect(results[0].path).not.toContain('alice');
      expect(results[1].path).not.toContain('bob');
      expect(results[0].author).not.toContain('Alice');
      expect(results[1].author).not.toContain('Bob');
    });

    it('should handle empty array', () => {
      expect(pathAnonymizer.anonymizeEntries([])).toEqual([]);
    });
  });
});
