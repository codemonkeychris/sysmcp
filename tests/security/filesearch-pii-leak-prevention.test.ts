/**
 * PII Leak Prevention Tests (Task 3.3)
 *
 * Verifies that PII is properly anonymized and never leaked in any output.
 */

import { PathAnonymizer } from '../../src/services/filesearch/path-anonymizer';
import { PiiAnonymizer } from '../../src/services/eventlog/lib/src/anonymizer';
import { FileSearchEntry } from '../../src/services/filesearch/types';

describe('PII Leak Prevention Tests', () => {
  let anonymizer: PathAnonymizer;

  beforeEach(() => {
    anonymizer = new PathAnonymizer(new PiiAnonymizer());
  });

  describe('Path Anonymization Completeness', () => {
    const userPaths = [
      'C:\\Users\\john.doe\\Documents\\secret.docx',
      'C:\\Users\\jane_smith\\Desktop\\passwords.txt',
      'C:\\Users\\admin.user\\AppData\\Local\\config.json',
      'D:\\Users\\test.user\\Downloads\\report.pdf',
      'c:\\users\\Mixed.Case\\file.txt',
    ];

    it.each(userPaths)(
      'should anonymize user profile path: %s',
      (path) => {
        const result = anonymizer.anonymizePath(path);
        // Extract username from original path
        const match = path.match(/[Uu]sers\\([^\\]+)/);
        if (match) {
          const username = match[1];
          expect(result).not.toContain(username);
          expect(result).toMatch(/\[ANON_USER_[A-F0-9]+\]/);
        }
      }
    );

    it('should not leak username in any field of anonymized entry', () => {
      const entry: FileSearchEntry = {
        path: 'C:\\Users\\sensitive.user\\Documents\\file.txt',
        fileName: 'file.txt',
        fileType: '.txt',
        size: 100,
        dateModified: new Date(),
        dateCreated: new Date(),
        author: 'Sensitive User',
        title: 'Test Document',
        tags: ['test']
      };

      const result = anonymizer.anonymizeEntry(entry);

      // Check no PII in any field
      expect(result.path).not.toContain('sensitive.user');
      expect(result.author).not.toContain('Sensitive');
      expect(result.author).not.toContain('User');
      // Non-PII fields preserved
      expect(result.fileName).toBe('file.txt');
      expect(result.title).toBe('Test Document');
    });
  });

  describe('Consistency of Anonymization', () => {
    it('should produce same token for same username across entries', () => {
      const entries: FileSearchEntry[] = [
        {
          path: 'C:\\Users\\john\\file1.txt',
          fileName: 'file1.txt', fileType: '.txt', size: 100,
          dateModified: new Date(), dateCreated: new Date(),
          author: 'John', tags: []
        },
        {
          path: 'C:\\Users\\john\\file2.txt',
          fileName: 'file2.txt', fileType: '.txt', size: 200,
          dateModified: new Date(), dateCreated: new Date(),
          author: 'John', tags: []
        }
      ];

      const results = anonymizer.anonymizeEntries(entries);

      // Same user → same token
      const user1 = results[0].path.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/)?.[1];
      const user2 = results[1].path.match(/\\Users\\(\[ANON_USER_[A-F0-9]+\])/)?.[1];
      expect(user1).toBe(user2);

      // Author tokens should also match
      expect(results[0].author).toBe(results[1].author);
    });

    it('should produce different tokens for different usernames', () => {
      const entry1 = anonymizer.anonymizePath('C:\\Users\\alice\\file.txt');
      const entry2 = anonymizer.anonymizePath('C:\\Users\\bob\\file.txt');

      const token1 = entry1.match(/\[ANON_USER_[A-F0-9]+\]/)?.[0];
      const token2 = entry2.match(/\[ANON_USER_[A-F0-9]+\]/)?.[0];

      expect(token1).not.toBe(token2);
    });
  });

  describe('System Account Exclusion', () => {
    const systemAccounts = ['Public', 'Default', 'Default User', 'All Users'];

    it.each(systemAccounts)(
      'should NOT anonymize system account: %s',
      (account) => {
        const path = `C:\\Users\\${account}\\file.txt`;
        const result = anonymizer.anonymizePath(path);
        expect(result).toBe(path);
      }
    );
  });

  describe('Batch Anonymization', () => {
    it('should anonymize all entries in a batch', () => {
      const entries = Array.from({ length: 100 }, (_, i) => ({
        path: `C:\\Users\\user${i % 5}\\Documents\\file${i}.txt`,
        fileName: `file${i}.txt`,
        fileType: '.txt',
        size: 100 * i,
        dateModified: new Date(),
        dateCreated: new Date(),
        author: `User ${i % 5}`,
        tags: []
      }));

      const results = anonymizer.anonymizeEntries(entries);

      // Every path should be anonymized
      results.forEach(r => {
        expect(r.path).not.toMatch(/\\Users\\user\d\\/);
        expect(r.path).toMatch(/\[ANON_USER_[A-F0-9]+\]/);
      });

      // Every author should be anonymized
      results.forEach(r => {
        if (r.author) {
          expect(r.author).not.toMatch(/User \d/);
          expect(r.author).toMatch(/\[ANON_USER_[A-F0-9]+\]/);
        }
      });
    });
  });
});
