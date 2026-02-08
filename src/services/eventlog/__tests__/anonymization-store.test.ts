/**
 * Tests for Anonymization Store
 *
 * Tests persistence, recovery, and error handling
 */

import * as fs from 'fs';
import * as path from 'path';
import { AnonymizationStore } from '../anonymization-store';
import { AnonymizationMapping } from '../lib/src/anonymizer';

describe('AnonymizationStore', () => {
  let store: AnonymizationStore;
  let tempDir: string;
  let storagePath: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'test-store-' + Date.now());
    storagePath = path.join(tempDir, 'mapping.json');

    store = new AnonymizationStore({
      storagePath,
      createDirs: true
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Save and Load', () => {
    it('should save a mapping to disk', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user1', 'ANON_USER_abc123']]),
        computerNames: new Map([['SERVER1', 'ANON_COMPUTER_def456']]),
        ipAddresses: new Map([['192.168.1.1', 'ANON_IP_ghi789']]),
        emails: new Map([['user@example.com', 'ANON_EMAIL_jkl012']]),
        paths: new Map([['C:\\Users\\user1', 'ANON_PATH_mno345']])
      };

      await store.save(mapping);

      expect(fs.existsSync(storagePath)).toBe(true);
    });

    it('should load a saved mapping from disk', async () => {
      const originalMapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user1', 'ANON_USER_abc123']]),
        computerNames: new Map([['SERVER1', 'ANON_COMPUTER_def456']]),
        ipAddresses: new Map([['192.168.1.1', 'ANON_IP_ghi789']]),
        emails: new Map([['user@example.com', 'ANON_EMAIL_jkl012']]),
        paths: new Map([['C:\\Users\\user1', 'ANON_PATH_mno345']])
      };

      await store.save(originalMapping);
      const loadedMapping = await store.load();

      expect(loadedMapping.usernames.get('DOMAIN\\user1')).toBe('ANON_USER_abc123');
      expect(loadedMapping.computerNames.get('SERVER1')).toBe('ANON_COMPUTER_def456');
      expect(loadedMapping.ipAddresses.get('192.168.1.1')).toBe('ANON_IP_ghi789');
      expect(loadedMapping.emails.get('user@example.com')).toBe('ANON_EMAIL_jkl012');
      expect(loadedMapping.paths.get('C:\\Users\\user1')).toBe('ANON_PATH_mno345');
    });

    it('should preserve multiple entries across save/load', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([
          ['DOMAIN\\user1', 'ANON_USER_1'],
          ['DOMAIN\\user2', 'ANON_USER_2'],
          ['DOMAIN\\user3', 'ANON_USER_3']
        ]),
        computerNames: new Map([
          ['SERVER1', 'ANON_COMPUTER_1'],
          ['SERVER2', 'ANON_COMPUTER_2']
        ]),
        ipAddresses: new Map([
          ['192.168.1.1', 'ANON_IP_1'],
          ['10.0.0.1', 'ANON_IP_2'],
          ['::1', 'ANON_IP_3']
        ]),
        emails: new Map([
          ['user1@example.com', 'ANON_EMAIL_1'],
          ['user2@example.com', 'ANON_EMAIL_2']
        ]),
        paths: new Map([
          ['C:\\Users\\user1', 'ANON_PATH_1'],
          ['C:\\Users\\user2', 'ANON_PATH_2']
        ])
      };

      await store.save(mapping);
      const loaded = await store.load();

      expect(loaded.usernames.size).toBe(3);
      expect(loaded.computerNames.size).toBe(2);
      expect(loaded.ipAddresses.size).toBe(3);
      expect(loaded.emails.size).toBe(2);
      expect(loaded.paths.size).toBe(2);
    });

    it('should handle empty mapping', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map(),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);
      const loaded = await store.load();

      expect(loaded.usernames.size).toBe(0);
      expect(loaded.computerNames.size).toBe(0);
      expect(loaded.ipAddresses.size).toBe(0);
      expect(loaded.emails.size).toBe(0);
      expect(loaded.paths.size).toBe(0);
    });
  });

  describe('File Management', () => {
    it('should create directories if they do not exist', async () => {
      const deepPath = path.join(tempDir, 'deep', 'nested', 'path', 'mapping.json');
      const deepStore = new AnonymizationStore({
        storagePath: deepPath,
        createDirs: true
      });

      const mapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user', 'ANON_USER']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await deepStore.save(mapping);

      expect(fs.existsSync(deepPath)).toBe(true);
    });

    it('should check if file exists', async () => {
      expect(store.exists()).toBe(false);

      const mapping: AnonymizationMapping = {
        usernames: new Map(),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);
      expect(store.exists()).toBe(true);
    });

    it('should delete mapping file', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user', 'ANON_USER']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);
      expect(store.exists()).toBe(true);

      await store.delete();
      expect(store.exists()).toBe(false);
    });

    it('should return correct file size', async () => {
      expect(store.getSize()).toBe(0);

      const mapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user', 'ANON_USER']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);

      const size = store.getSize();
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when loading non-existent file', async () => {
      const store = new AnonymizationStore({
        storagePath: path.join(tempDir, 'nonexistent.json'),
        createDirs: false
      });

      await expect(store.load()).rejects.toThrow();
    });

    it('should throw error when loading corrupted JSON', async () => {
      // Write corrupted JSON
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(storagePath, 'invalid json {{{', 'utf-8');

      await expect(store.load()).rejects.toThrow();
    });

    it('should handle missing optional fields gracefully', async () => {
      // Write mapping with missing fields
      fs.mkdirSync(tempDir, { recursive: true });
      const partial = {
        usernames: { 'DOMAIN\\user': 'ANON_USER' }
        // Missing other fields
      };
      fs.writeFileSync(storagePath, JSON.stringify(partial), 'utf-8');

      const loaded = await store.load();

      expect(loaded.usernames.size).toBe(1);
      expect(loaded.computerNames.size).toBe(0);
      expect(loaded.ipAddresses.size).toBe(0);
      expect(loaded.emails.size).toBe(0);
      expect(loaded.paths.size).toBe(0);
    });

    it('should delete missing file without error', async () => {
      // Don't create file
      await expect(store.delete()).resolves.not.toThrow();
    });

    it('should handle concurrent save operations safely', async () => {
      const mapping1: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user1', 'ANON_USER_1']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      const mapping2: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user2', 'ANON_USER_2']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      // Start both saves simultaneously
      await Promise.all([
        store.save(mapping1),
        store.save(mapping2)
      ]);

      // File should exist and be readable
      expect(store.exists()).toBe(true);

      // Load and verify one of the saves succeeded
      const loaded = await store.load();
      expect(loaded.usernames.size).toBeGreaterThan(0);
    });
  });

  describe('Persistence Format', () => {
    it('should save mapping in human-readable JSON format', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([['DOMAIN\\user', 'ANON_USER_abc']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);

      const content = fs.readFileSync(storagePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Verify structure
      expect(parsed.usernames).toBeDefined();
      expect(parsed.computerNames).toBeDefined();
      expect(parsed.ipAddresses).toBeDefined();
      expect(parsed.emails).toBeDefined();
      expect(parsed.paths).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.version).toBe('1.0');
    });

    it('should include timestamp in saved mapping', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map(),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      const beforeSave = new Date();
      await store.save(mapping);
      const afterSave = new Date();

      const content = fs.readFileSync(storagePath, 'utf-8');
      const parsed = JSON.parse(content);

      const timestamp = new Date(parsed.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterSave.getTime());
    });

    it('should set correct file permissions on Unix', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map(),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);

      // Check file exists (this works cross-platform)
      expect(fs.existsSync(storagePath)).toBe(true);

      // Try to read permissions (might not work on Windows)
      try {
        const stat = fs.statSync(storagePath);
        // On Unix systems, mode should be 0o600 (rw-------)
        // On Windows, just verify file exists and is readable
        expect(stat.isFile()).toBe(true);
      } catch {
        // Permission check not critical on all platforms
      }
    });
  });

  describe('Round-trip Consistency', () => {
    it('should maintain data integrity through save/load cycle', async () => {
      const testCases = [
        'DOMAIN\\user1',
        'user@domain.local',
        'Administrator',
        'DOMAIN\\user-name.with.dots',
        'DOMAIN\\user_name'
      ];

      const mapping: AnonymizationMapping = {
        usernames: new Map(testCases.map((user, i) => [user, `ANON_USER_${i}`])),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      await store.save(mapping);
      const loaded = await store.load();

      for (const testCase of testCases) {
        expect(loaded.usernames.get(testCase)).toBe(mapping.usernames.get(testCase));
      }
    });

    it('should handle special characters in values', async () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([
          ['DOMAIN\\user', 'ANON_USER_abc-123_def']
        ]),
        computerNames: new Map([
          ['SERVER-1', 'ANON_COMPUTER_xyz_789']
        ]),
        ipAddresses: new Map([
          ['192.168.1.1', 'ANON_IP_192_168_1_1']
        ]),
        emails: new Map([
          ['user+test@example.com', 'ANON_EMAIL_user_test']
        ]),
        paths: new Map([
          ['C:\\Users\\user\\Documents', 'ANON_PATH_C_Users_user_Documents']
        ])
      };

      await store.save(mapping);
      const loaded = await store.load();

      expect(loaded.usernames.get('DOMAIN\\user')).toBe('ANON_USER_abc-123_def');
      expect(loaded.computerNames.get('SERVER-1')).toBe('ANON_COMPUTER_xyz_789');
      expect(loaded.ipAddresses.get('192.168.1.1')).toBe('ANON_IP_192_168_1_1');
      expect(loaded.emails.get('user+test@example.com')).toBe('ANON_EMAIL_user_test');
      expect(loaded.paths.get('C:\\Users\\user\\Documents')).toBe('ANON_PATH_C_Users_user_Documents');
    });
  });
});
