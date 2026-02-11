/**
 * FileSearch Service Configuration
 *
 * Manages configuration for the FileSearch MCP service.
 * Current implementation uses hardcoded MVP values.
 * Future versions will support persistent storage and Config UI.
 */

import { PermissionLevel } from '../eventlog/config';

/**
 * FileSearch service configuration
 */
export interface FileSearchConfig {
  /** Whether the FileSearch service is enabled */
  enabled: boolean;

  /** Permission level for the service */
  permissionLevel: PermissionLevel;

  /** Maximum number of results to return per query */
  maxResults?: number;

  /** Query timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to enable PII anonymization */
  enableAnonymization?: boolean;

  /** Allowed search scope paths (empty = all indexed paths allowed) */
  allowedPaths?: string[];

  /** Log level for service diagnostics */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * FileSearch Configuration Manager
 *
 * Manages configuration state for the FileSearch service.
 * MVP implementation stores configuration in memory with hardcoded values.
 *
 * Future Implementation (Feature 5):
 * - Persistent storage backend
 * - Configuration change listeners
 * - Integration with System Tray UI
 */
export class FileSearchConfigManager {
  private config: FileSearchConfig;

  /**
   * Initialize the configuration manager
   *
   * MVP defaults:
   * - Service is disabled (secure default)
   * - Permission level is disabled
   * - Max results: 10000
   * - Timeout: 30000ms (30s)
   * - Anonymization: enabled
   * - Allowed paths: [] (all indexed paths)
   * - Log level: info
   */
  constructor(initialConfig?: FileSearchConfig) {
    this.config = initialConfig || {
      enabled: true,
      permissionLevel: 'read-only',
      maxResults: 10000,
      timeoutMs: 30000,
      enableAnonymization: true,
      allowedPaths: [],
      logLevel: 'info'
    };
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getPermissionLevel(): PermissionLevel {
    return this.config.permissionLevel;
  }

  public getMaxResults(): number {
    return this.config.maxResults ?? 10000;
  }

  public getTimeoutMs(): number {
    return this.config.timeoutMs ?? 30000;
  }

  public isAnonymizationEnabled(): boolean {
    return this.config.enableAnonymization ?? true;
  }

  public getAllowedPaths(): string[] {
    return this.config.allowedPaths ?? [];
  }

  public getLogLevel(): string {
    return this.config.logLevel ?? 'info';
  }

  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  public setPermissionLevel(level: PermissionLevel): void {
    const validLevels: PermissionLevel[] = ['read-only', 'read-write', 'disabled'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid permission level: ${level}`);
    }
    this.config.permissionLevel = level;
  }

  public setMaxResults(maxResults: number): void {
    if (!Number.isInteger(maxResults) || maxResults < 1) {
      throw new Error('maxResults must be a positive integer');
    }
    this.config.maxResults = maxResults;
  }

  public setTimeoutMs(timeoutMs: number): void {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
      throw new Error('timeoutMs must be >= 1000');
    }
    this.config.timeoutMs = timeoutMs;
  }

  public setAnonymizationEnabled(enabled: boolean): void {
    this.config.enableAnonymization = enabled;
  }

  public setAllowedPaths(paths: string[]): void {
    if (!Array.isArray(paths)) {
      throw new Error('allowedPaths must be an array');
    }
    this.config.allowedPaths = [...paths];
  }

  public setLogLevel(level: string): void {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.config.logLevel = level as 'debug' | 'info' | 'warn' | 'error';
  }

  public getConfig(): FileSearchConfig {
    return { ...this.config };
  }

  public resetToDefaults(): void {
    this.config = {
      enabled: true,
      permissionLevel: 'read-only',
      maxResults: 10000,
      timeoutMs: 30000,
      enableAnonymization: true,
      allowedPaths: [],
      logLevel: 'info'
    };
  }
}

/**
 * Global configuration manager instance
 */
let globalConfigManager: FileSearchConfigManager | null = null;
let configManagerFrozen = false;

export function getConfigManager(): FileSearchConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new FileSearchConfigManager();
  }
  return globalConfigManager;
}

/**
 * SECURITY: Rejected if manager has been frozen (SEC-014).
 */
export function setConfigManager(manager: FileSearchConfigManager): void {
  if (configManagerFrozen && process.env.NODE_ENV !== 'test') {
    throw new Error('Config manager is frozen and cannot be replaced');
  }
  globalConfigManager = manager;
}

/**
 * SECURITY: Freeze the global config manager to prevent replacement (SEC-014).
 */
export function freezeConfigManager(): void {
  configManagerFrozen = true;
}

export function resetConfigManager(): void {
  globalConfigManager = null;
  configManagerFrozen = false;
}
