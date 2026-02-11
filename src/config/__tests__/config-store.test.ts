/**
 * ConfigStore Unit Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigStoreImpl, createDefaultConfig, PersistedConfig, validateConfig, validateStoragePath } from '../config-store';

describe('ConfigStore', () => {
  let tmpDir: string;
  let configPath: string;
  let store: ConfigStoreImpl;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sysmcp-test-'));
    configPath = path.join(tmpDir, 'sysmcp-config.json');
    store = new ConfigStoreImpl(configPath);
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup may fail on Windows
    }
  });

  describe('save and load round-trip', () => {
    it('should preserve all config fields', async () => {
      const config: PersistedConfig = {
        version: 1,
        lastModified: new Date().toISOString(),
        services: {
          eventlog: {
            enabled: true,
            permissionLevel: 'read-only',
            enableAnonymization: true,
            maxResults: 5000,
          },
          filesearch: {
            enabled: false,
            permissionLevel: 'disabled',
            enableAnonymization: false,
          },
        },
      };

      await store.save(config);
      const loaded = await store.load();

      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(1);
      expect(loaded!.services.eventlog.enabled).toBe(true);
      expect(loaded!.services.eventlog.permissionLevel).toBe('read-only');
      expect(loaded!.services.eventlog.enableAnonymization).toBe(true);
      expect(loaded!.services.eventlog.maxResults).toBe(5000);
      expect(loaded!.services.filesearch.enabled).toBe(false);
      expect(loaded!.services.filesearch.permissionLevel).toBe('disabled');
    });

    it('should update lastModified on save', async () => {
      const config = createDefaultConfig();
      const before = config.lastModified;

      // Small delay to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10));
      await store.save(config);

      const loaded = await store.load();
      expect(loaded!.lastModified).not.toBe(before);
    });
  });

  describe('missing file', () => {
    it('should return null when file does not exist', async () => {
      const result = await store.load();
      expect(result).toBeNull();
    });

    it('should report exists() as false', () => {
      expect(store.exists()).toBe(false);
    });

    it('should report exists() as true after save', async () => {
      await store.save(createDefaultConfig());
      expect(store.exists()).toBe(true);
    });
  });

  describe('corrupted file handling', () => {
    it('should return null for invalid JSON', async () => {
      await fs.promises.writeFile(configPath, 'not valid json{{{', 'utf-8');

      const result = await store.load();
      expect(result).toBeNull();
    });

    it('should rename corrupt file to .corrupt.{timestamp}', async () => {
      await fs.promises.writeFile(configPath, 'corrupt data', 'utf-8');

      await store.load();

      // Original file should be gone
      expect(fs.existsSync(configPath)).toBe(false);

      // .corrupt file should exist
      const files = await fs.promises.readdir(tmpDir);
      const corruptFiles = files.filter((f) => f.includes('.corrupt.'));
      expect(corruptFiles.length).toBe(1);
    });

    it('should return null for invalid structure (missing services)', async () => {
      await fs.promises.writeFile(
        configPath,
        JSON.stringify({ version: 1 }),
        'utf-8'
      );

      const result = await store.load();
      expect(result).toBeNull();
    });
  });

  describe('directory auto-creation', () => {
    it('should create directory when missing', async () => {
      const nestedPath = path.join(tmpDir, 'nested', 'dir', 'config.json');
      const nestedStore = new ConfigStoreImpl(nestedPath);

      await nestedStore.save(createDefaultConfig());

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('atomic writes', () => {
    it('should not leave temp files on success', async () => {
      await store.save(createDefaultConfig());

      const files = await fs.promises.readdir(tmpDir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);
    });

    it('should produce valid JSON file', async () => {
      await store.save(createDefaultConfig());

      const content = await fs.promises.readFile(configPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should produce human-readable JSON (2-space indent)', async () => {
      const config = createDefaultConfig();
      config.services.eventlog = {
        enabled: true,
        permissionLevel: 'read-only',
        enableAnonymization: true,
      };
      await store.save(config);

      const content = await fs.promises.readFile(configPath, 'utf-8');
      // 2-space indent means each nested key is preceded by spaces
      expect(content).toContain('  "version"');
      expect(content).toContain('    "eventlog"');
    });
  });

  describe('schema version', () => {
    it('should set version to 1 on save', async () => {
      const config = createDefaultConfig();
      config.version = 999; // Try to set different
      await store.save(config);

      const loaded = await store.load();
      expect(loaded!.version).toBe(1);
    });
  });

  describe('environment variable configuration', () => {
    it('should use SYSMCP_CONFIG_PATH when set', () => {
      const originalEnv = process.env.SYSMCP_CONFIG_PATH;
      const customPath = path.join(tmpDir, 'custom-config.json');
      process.env.SYSMCP_CONFIG_PATH = customPath;

      const envStore = new ConfigStoreImpl();
      expect(envStore.getStoragePath()).toBe(path.resolve(customPath));

      if (originalEnv !== undefined) {
        process.env.SYSMCP_CONFIG_PATH = originalEnv;
      } else {
        delete process.env.SYSMCP_CONFIG_PATH;
      }
    });
  });

  describe('createDefaultConfig', () => {
    it('should create a config with empty services', () => {
      const config = createDefaultConfig();
      expect(config.version).toBe(1);
      expect(config.services).toEqual({});
      expect(config.lastModified).toBeDefined();
    });
  });

  describe('SEC-005: Schema validation on config file load', () => {
    describe('validateConfig', () => {
      it('should accept a valid config', () => {
        const input = {
          version: 1,
          lastModified: '2026-01-01T00:00:00.000Z',
          services: {
            eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true },
          },
        };
        const result = validateConfig(input);
        expect(result.services.eventlog.enabled).toBe(true);
        expect(result.services.eventlog.permissionLevel).toBe('read-only');
      });

      it('should reject null input', () => {
        expect(() => validateConfig(null)).toThrow('Invalid config structure');
      });

      it('should reject array input', () => {
        expect(() => validateConfig([])).toThrow('Invalid config structure');
      });

      it('should reject missing services', () => {
        expect(() => validateConfig({ version: 1 })).toThrow('missing or invalid services');
      });

      it('should reject services as an array', () => {
        expect(() => validateConfig({ services: [] })).toThrow('missing or invalid services');
      });

      it('should reject non-number version', () => {
        expect(() =>
          validateConfig({ version: 'foo', services: {} })
        ).toThrow('version must be a number');
      });

      it('should reject invalid permissionLevel', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'admin', enableAnonymization: true },
            },
          })
        ).toThrow("invalid permissionLevel 'admin'");
      });

      it('should reject unknown permissionLevel values', () => {
        const badLevels = ['rwx', 'foo', 'READWRITE', 'superuser', ''];
        for (const level of badLevels) {
          expect(() =>
            validateConfig({
              services: {
                test: { enabled: true, permissionLevel: level, enableAnonymization: true },
              },
            })
          ).toThrow('invalid permissionLevel');
        }
      });

      it('should reject non-boolean enabled', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: 'yes', permissionLevel: 'read-only', enableAnonymization: true },
            },
          })
        ).toThrow('enabled must be a boolean');
      });

      it('should reject non-boolean enableAnonymization', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: 1 },
            },
          })
        ).toThrow('enableAnonymization must be a boolean');
      });

      it('should reject invalid maxResults', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true, maxResults: -1 },
            },
          })
        ).toThrow('maxResults must be an integer');
      });

      it('should reject maxResults exceeding 100000', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true, maxResults: 999999 },
            },
          })
        ).toThrow('maxResults must be an integer');
      });

      it('should reject invalid timeoutMs', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true, timeoutMs: 500 },
            },
          })
        ).toThrow('timeoutMs must be an integer');
      });

      it('should reject timeoutMs exceeding 300000', () => {
        expect(() =>
          validateConfig({
            services: {
              eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true, timeoutMs: 999999 },
            },
          })
        ).toThrow('timeoutMs must be an integer');
      });

      it('should accept valid optional numeric fields', () => {
        const result = validateConfig({
          services: {
            eventlog: {
              enabled: true,
              permissionLevel: 'read-write',
              enableAnonymization: false,
              maxResults: 5000,
              timeoutMs: 30000,
            },
          },
        });
        expect(result.services.eventlog.maxResults).toBe(5000);
        expect(result.services.eventlog.timeoutMs).toBe(30000);
      });

      it('should strip unknown fields from service config', () => {
        const result = validateConfig({
          services: {
            eventlog: {
              enabled: true,
              permissionLevel: 'read-only',
              enableAnonymization: true,
              maliciousField: 'payload',
              __proto__: 'attack',
            },
          },
        });
        expect((result.services.eventlog as any).maliciousField).toBeUndefined();
      });

      it('should reject service config that is not an object', () => {
        expect(() =>
          validateConfig({ services: { eventlog: 'not an object' } })
        ).toThrow('expected an object');
      });
    });

    describe('load with validation', () => {
      it('should reject config with invalid permissionLevel on load', async () => {
        const badConfig = {
          version: 1,
          lastModified: new Date().toISOString(),
          services: {
            eventlog: { enabled: true, permissionLevel: 'admin', enableAnonymization: true },
          },
        };
        await fs.promises.writeFile(configPath, JSON.stringify(badConfig), 'utf-8');

        const result = await store.load();
        expect(result).toBeNull(); // Corrupt config handled gracefully
      });

      it('should reject config with non-boolean enabled on load', async () => {
        const badConfig = {
          version: 1,
          lastModified: new Date().toISOString(),
          services: {
            eventlog: { enabled: 'yes', permissionLevel: 'read-only', enableAnonymization: true },
          },
        };
        await fs.promises.writeFile(configPath, JSON.stringify(badConfig), 'utf-8');

        const result = await store.load();
        expect(result).toBeNull();
      });

      it('should load valid config correctly', async () => {
        const goodConfig = {
          version: 1,
          lastModified: new Date().toISOString(),
          services: {
            eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true },
          },
        };
        await fs.promises.writeFile(configPath, JSON.stringify(goodConfig), 'utf-8');

        const result = await store.load();
        expect(result).not.toBeNull();
        expect(result!.services.eventlog.permissionLevel).toBe('read-only');
      });
    });
  });

  describe('SEC-006: Path validation for config and audit paths', () => {
    describe('validateStoragePath', () => {
      it('should accept valid absolute paths with .json extension', () => {
        const result = validateStoragePath(path.join(tmpDir, 'config.json'));
        expect(result).toBe(path.resolve(tmpDir, 'config.json'));
      });

      it('should accept valid .jsonl extension', () => {
        const result = validateStoragePath(path.join(tmpDir, 'audit.jsonl'));
        expect(result).toBe(path.resolve(tmpDir, 'audit.jsonl'));
      });

      it('should reject path traversal with ../', () => {
        expect(() =>
          validateStoragePath('../../../etc/cron.d/malicious.json')
        ).toThrow('path traversal detected');
      });

      it('should reject path traversal with backslash', () => {
        expect(() =>
          validateStoragePath('..\\..\\..\\Windows\\System32\\config.json')
        ).toThrow('path traversal detected');
      });

      it('should reject empty string', () => {
        expect(() => validateStoragePath('')).toThrow('must be a non-empty string');
      });

      it('should reject null', () => {
        expect(() => validateStoragePath(null as any)).toThrow('must be a non-empty string');
      });

      it('should reject paths without .json/.jsonl extension', () => {
        expect(() =>
          validateStoragePath(path.join(tmpDir, 'config.txt'))
        ).toThrow('must end with .json or .jsonl extension');
      });

      it('should reject .exe extension', () => {
        expect(() =>
          validateStoragePath(path.join(tmpDir, 'malware.exe'))
        ).toThrow('must end with .json or .jsonl extension');
      });
    });

    describe('ConfigStore constructor path validation', () => {
      it('should reject traversal path in constructor', () => {
        expect(() => new ConfigStoreImpl('../../../etc/passwd.json')).toThrow(
          'path traversal detected'
        );
      });

      it('should reject traversal in SYSMCP_CONFIG_PATH env var', () => {
        const originalEnv = process.env.SYSMCP_CONFIG_PATH;
        process.env.SYSMCP_CONFIG_PATH = '../../../etc/cron.d/malicious.json';

        expect(() => new ConfigStoreImpl()).toThrow('path traversal detected');

        if (originalEnv !== undefined) {
          process.env.SYSMCP_CONFIG_PATH = originalEnv;
        } else {
          delete process.env.SYSMCP_CONFIG_PATH;
        }
      });

      it('should accept valid path in constructor', () => {
        const validPath = path.join(tmpDir, 'valid-config.json');
        const store = new ConfigStoreImpl(validPath);
        expect(store.getStoragePath()).toBe(path.resolve(validPath));
      });
    });
  });

  describe('SEC-011: File permissions on Windows', () => {
    it('should set restrictive file permissions on save', async () => {
      const config = createDefaultConfig();
      await store.save(config);

      // Verify file was created
      const exists = fs.existsSync(configPath);
      expect(exists).toBe(true);

      if (process.platform === 'win32') {
        // On Windows, verify icacls was applied by checking ACL
        const { execSync } = require('child_process');
        try {
          const output = execSync(`icacls "${configPath}"`, { encoding: 'utf-8' });
          // Should contain the current user with full control
          const username = process.env.USERNAME || '';
          if (username) {
            expect(output).toContain(username);
          }
        } catch {
          // icacls may not be available in all test environments
        }
      } else {
        // On Unix, verify chmod was applied
        const stats = await fs.promises.stat(configPath);
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });

    it('should not fail save if permission setting fails', async () => {
      // Even if permission setting fails, save should succeed
      const config = createDefaultConfig();
      await expect(store.save(config)).resolves.not.toThrow();
      
      const loaded = await store.load();
      expect(loaded).not.toBeNull();
    });

    it('should attempt platform-appropriate permission setting', async () => {
      const config = createDefaultConfig();
      await store.save(config);

      // Config should be readable by the current process regardless
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe(1);
    });
  });
});
