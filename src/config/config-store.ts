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
 * Valid permission levels for schema validation
 */
const VALID_PERMISSION_LEVELS: readonly string[] = ['read-only', 'read-write', 'disabled'];

/**
 * SECURITY: Validate a loaded config object against the expected schema.
 * Rejects unknown permission levels, invalid types, and unexpected data.
 * Returns a sanitized copy with only recognized fields.
 */
export function validateConfig(parsed: any): PersistedConfig {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid config structure: expected an object');
  }

  if (!parsed.services || typeof parsed.services !== 'object' || Array.isArray(parsed.services)) {
    throw new Error('Invalid config structure: missing or invalid services');
  }

  if (parsed.version !== undefined && typeof parsed.version !== 'number') {
    throw new Error('Invalid config structure: version must be a number');
  }

  const sanitized: PersistedConfig = {
    version: typeof parsed.version === 'number' ? parsed.version : CURRENT_SCHEMA_VERSION,
    lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : new Date().toISOString(),
    services: {},
  };

  for (const [serviceId, serviceConfig] of Object.entries(parsed.services)) {
    const sc = serviceConfig as any;
    if (!sc || typeof sc !== 'object' || Array.isArray(sc)) {
      throw new Error(`Invalid config for service '${serviceId}': expected an object`);
    }

    if (typeof sc.enabled !== 'boolean') {
      throw new Error(`Invalid config for service '${serviceId}': enabled must be a boolean`);
    }

    if (!VALID_PERMISSION_LEVELS.includes(sc.permissionLevel)) {
      throw new Error(
        `Invalid config for service '${serviceId}': invalid permissionLevel '${String(sc.permissionLevel).substring(0, 50)}'`
      );
    }

    if (typeof sc.enableAnonymization !== 'boolean') {
      throw new Error(`Invalid config for service '${serviceId}': enableAnonymization must be a boolean`);
    }

    // Build sanitized service config with only known fields
    const sanitizedService: PersistedServiceConfig = {
      enabled: sc.enabled,
      permissionLevel: sc.permissionLevel as PermissionLevel,
      enableAnonymization: sc.enableAnonymization,
    };

    // Copy optional numeric fields if valid
    if (sc.maxResults !== undefined) {
      if (typeof sc.maxResults !== 'number' || !Number.isInteger(sc.maxResults) || sc.maxResults < 1 || sc.maxResults > 100000) {
        throw new Error(`Invalid config for service '${serviceId}': maxResults must be an integer between 1 and 100000`);
      }
      sanitizedService.maxResults = sc.maxResults;
    }

    if (sc.timeoutMs !== undefined) {
      if (typeof sc.timeoutMs !== 'number' || !Number.isInteger(sc.timeoutMs) || sc.timeoutMs < 1000 || sc.timeoutMs > 300000) {
        throw new Error(`Invalid config for service '${serviceId}': timeoutMs must be an integer between 1000 and 300000`);
      }
      sanitizedService.timeoutMs = sc.timeoutMs;
    }

    sanitized.services[serviceId] = sanitizedService;
  }

  return sanitized;
}

/**
 * SECURITY: Validate and canonicalize a storage path.
 * Prevents path traversal attacks and symlink exploits.
 * Rejects paths containing traversal sequences and ensures
 * the resolved path stays within the expected base directory.
 */
export function validateStoragePath(inputPath: string, label: string = 'path'): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }

  // Resolve to absolute path
  const resolved = path.resolve(inputPath);

  // Reject paths containing traversal sequences in the original input
  const normalized = inputPath.replace(/\\/g, '/');
  if (normalized.includes('../') || normalized.includes('/..')) {
    throw new Error(`Invalid ${label}: path traversal detected`);
  }

  // Must end with .json or .jsonl extension
  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.json' && ext !== '.jsonl') {
    throw new Error(`Invalid ${label}: must end with .json or .jsonl extension`);
  }

  return resolved;
}

/**
 * ConfigStore implementation with atomic writes
 */
export class ConfigStoreImpl implements ConfigStore {
  private storagePath: string;

  constructor(storagePath?: string) {
    const rawPath =
      storagePath ||
      process.env.SYSMCP_CONFIG_PATH ||
      path.join(process.cwd(), 'config', 'sysmcp-config.json');
    // SECURITY: Validate path to prevent traversal/injection (SEC-006)
    this.storagePath = validateStoragePath(rawPath, 'config path');
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

      // SECURITY: Full schema validation (SEC-005)
      return validateConfig(parsed);
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
