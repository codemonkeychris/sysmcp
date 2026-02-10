/**
 * ConfigStore — Persistent Configuration Storage
 *
 * Persists all service configurations to a JSON file.
 * Loads on startup, saves on every change.
 * Uses atomic write pattern (temp file + rename) for crash safety.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PermissionLevel } from '../services/eventlog/config';

/**
 * Per-service persisted configuration
 */
export interface PersistedServiceConfig {
  enabled: boolean;
  permissionLevel: PermissionLevel;
  enableAnonymization: boolean;
  [key: string]: unknown;
}

/**
 * Root configuration document
 */
export interface PersistedConfig {
  /** Schema version for future migration */
  version: number;
  /** Last modification timestamp (ISO 8601) */
  lastModified: string;
  /** Per-service configuration map */
  services: Record<string, PersistedServiceConfig>;
}

/**
 * ConfigStore interface
 */
export interface ConfigStore {
  load(): Promise<PersistedConfig | null>;
  save(config: PersistedConfig): Promise<void>;
  exists(): boolean;
}

const CURRENT_SCHEMA_VERSION = 1;

/**
 * ConfigStore implementation with atomic writes
 */
export class ConfigStoreImpl implements ConfigStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath =
      storagePath ||
      process.env.SYSMCP_CONFIG_PATH ||
      path.join(process.cwd(), 'config', 'sysmcp-config.json');
  }

  /**
   * Load persisted configuration from disk
   *
   * @returns Parsed config or null if file doesn't exist or is corrupt
   */
  async load(): Promise<PersistedConfig | null> {
    if (!this.exists()) {
      return null;
    }

    try {
      const content = await fs.promises.readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(content);

      // Basic validation
      if (!parsed || typeof parsed !== 'object' || !parsed.services) {
        throw new Error('Invalid config structure');
      }

      return parsed as PersistedConfig;
    } catch (error) {
      // Corrupt file: rename to .corrupt.{timestamp} and return null
      const timestamp = Date.now();
      const corruptPath = `${this.storagePath}.corrupt.${timestamp}`;
      try {
        await fs.promises.rename(this.storagePath, corruptPath);
      } catch {
        // If we can't even rename, just return null
      }
      return null;
    }
  }

  /**
   * Save configuration to disk using atomic write pattern
   */
  async save(config: PersistedConfig): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.storagePath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Update last modified
    config.lastModified = new Date().toISOString();
    config.version = CURRENT_SCHEMA_VERSION;

    // Serialize with human-readable formatting
    const content = JSON.stringify(config, null, 2);

    // Atomic write: temp file + rename
    const tmpPath = `${this.storagePath}.${process.pid}.${Date.now()}.tmp`;

    try {
      await fs.promises.writeFile(tmpPath, content, 'utf-8');

      // Set file permissions (Unix only, noop on Windows)
      try {
        await fs.promises.chmod(tmpPath, 0o600);
      } catch {
        // chmod may fail on Windows, that's expected
      }

      // Atomic rename
      await fs.promises.rename(tmpPath, this.storagePath);
    } catch (error) {
      // Clean up temp file on failure
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // Temp file may not exist
      }
      throw error;
    }
  }

  /**
   * Check if a config file exists
   */
  exists(): boolean {
    return fs.existsSync(this.storagePath);
  }

  /**
   * Get the storage path (for testing/debugging)
   */
  getStoragePath(): string {
    return this.storagePath;
  }
}

/**
 * Create a default empty config with secure defaults (all services disabled)
 */
export function createDefaultConfig(): PersistedConfig {
  return {
    version: CURRENT_SCHEMA_VERSION,
    lastModified: new Date().toISOString(),
    services: {},
  };
}
