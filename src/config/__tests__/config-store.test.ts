/**
 * ConfigStore Unit Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigStoreImpl, createDefaultConfig, PersistedConfig } from '../config-store';

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
      process.env.SYSMCP_CONFIG_PATH = '/custom/path/config.json';

      const envStore = new ConfigStoreImpl();
      expect(envStore.getStoragePath()).toBe('/custom/path/config.json');

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
});
