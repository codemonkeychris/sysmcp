/**
 * EventLog Service Configuration
 *
 * Manages configuration for the EventLog MCP service.
 * Current implementation uses hardcoded MVP values.
 * Future versions will support persistent storage and Config UI.
 */

/**
 * Permission levels for EventLog service
 *
 * - 'read-only': Users can query event logs but cannot modify them
 * - 'read-write': Users can query and modify event logs
 * - 'disabled': Service is disabled and cannot be used
 */
export type PermissionLevel = 'read-only' | 'read-write' | 'disabled';

/**
 * EventLog service configuration
 *
 * Represents the configuration state of the EventLog service.
 * Can be persisted to storage for persistence across restarts.
 */
export interface EventLogConfig {
  /** Whether the EventLog service is enabled */
  enabled: boolean;

  /** Permission level for the service */
  permissionLevel: PermissionLevel;

  /** Maximum number of results to return per query */
  maxResults?: number;

  /** Query timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to enable PII anonymization */
  enableAnonymization?: boolean;

  /** Log level for service diagnostics */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * EventLog Configuration Manager
 *
 * Manages configuration state for the EventLog service.
 * MVP implementation stores configuration in memory with hardcoded values.
 *
 * Future Implementation (Feature 5):
 * - Persistent storage backend (file, database, etc.)
 * - Configuration change listeners
 * - Config file support
 * - Integration with System Tray UI for real-time updates
 *
 * Example usage:
 * ```typescript
 * const configManager = new EventLogConfigManager();
 *
 * // Check if service is enabled
 * if (configManager.isEnabled()) {
 *   // Use EventLog service
 * }
 *
 * // Check permission level
 * const level = configManager.getPermissionLevel();
 * if (level === 'read-write') {
 *   // Allow write operations
 * }
 *
 * // For MVP: values are hardcoded
 * // Future: config manager will load from persistent storage
 * // Future: System Tray UI will call setters to update config
 * ```
 */
export class EventLogConfigManager {
  /** Current configuration state */
  private config: EventLogConfig;

  /**
   * Initialize the configuration manager
   *
   * MVP: Hardcoded values are used
   * - Service is disabled (secure default)
   * - Permission level is disabled
   * - Max results: 10000
   * - Timeout: 30000ms (30s)
   * - Anonymization: enabled
   * - Log level: info
   *
   * Future Feature 5 will:
   * - Load config from file or database
   * - Support config changes from System Tray UI
   * - Implement persistence backend
   */
  constructor(initialConfig?: EventLogConfig) {
    this.config = initialConfig || {
      enabled: false,
      permissionLevel: 'disabled',
      maxResults: 10000,
      timeoutMs: 30000,
      enableAnonymization: true,
      logLevel: 'info'
    };
  }

  /**
   * Check if the EventLog service is enabled
   *
   * @returns true if service is enabled, false otherwise
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the current permission level
   *
   * @returns Current permission level ('read-only', 'read-write', or 'disabled')
   */
  public getPermissionLevel(): PermissionLevel {
    return this.config.permissionLevel;
  }

  /**
   * Get maximum results per query
   *
   * @returns Max results limit (MVP default: 10000)
   */
  public getMaxResults(): number {
    return this.config.maxResults ?? 10000;
  }

  /**
   * Get query timeout in milliseconds
   *
   * @returns Timeout value in ms (MVP default: 30000)
   */
  public getTimeoutMs(): number {
    return this.config.timeoutMs ?? 30000;
  }

  /**
   * Check if PII anonymization is enabled
   *
   * @returns true if anonymization is enabled, false otherwise
   */
  public isAnonymizationEnabled(): boolean {
    return this.config.enableAnonymization ?? true;
  }

  /**
   * Get the current log level
   *
   * @returns Current log level (MVP default: 'info')
   */
  public getLogLevel(): string {
    return this.config.logLevel ?? 'info';
  }

  /**
   * Set whether the service is enabled
   *
   * FUTURE (Feature 5):
   * This method will be called by the System Tray UI when user toggles
   * the EventLog service on/off. Changes will be persisted.
   *
   * Current behavior:
   * - Updates in-memory state only
   * - No persistence (changes lost on restart)
   *
   * @param enabled - Whether to enable the service
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    // FUTURE: Persist to storage
    // FUTURE: Notify listeners of change
  }

  /**
   * Set the permission level
   *
   * FUTURE (Feature 5):
   * This method will be called by the System Tray UI when user changes
   * the permission level. Changes will be persisted.
   *
   * Current behavior:
   * - Updates in-memory state only
   * - No persistence (changes lost on restart)
   *
   * @param level - Permission level to set
   * @throws Error if level is invalid
   */
  public setPermissionLevel(level: PermissionLevel): void {
    const validLevels: PermissionLevel[] = ['read-only', 'read-write', 'disabled'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid permission level: ${level}`);
    }
    this.config.permissionLevel = level;
    // FUTURE: Persist to storage
    // FUTURE: Notify listeners of change
  }

  /**
   * Set maximum results per query
   *
   * @param maxResults - Maximum results limit
   * @throws Error if maxResults is invalid
   */
  public setMaxResults(maxResults: number): void {
    if (!Number.isInteger(maxResults) || maxResults < 1) {
      throw new Error('maxResults must be a positive integer');
    }
    this.config.maxResults = maxResults;
    // FUTURE: Persist to storage
  }

  /**
   * Set query timeout
   *
   * @param timeoutMs - Timeout in milliseconds
   * @throws Error if timeoutMs is invalid
   */
  public setTimeoutMs(timeoutMs: number): void {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
      throw new Error('timeoutMs must be >= 1000');
    }
    this.config.timeoutMs = timeoutMs;
    // FUTURE: Persist to storage
  }

  /**
   * Set whether PII anonymization is enabled
   *
   * @param enabled - Whether to enable anonymization
   */
  public setAnonymizationEnabled(enabled: boolean): void {
    this.config.enableAnonymization = enabled;
    // FUTURE: Persist to storage
  }

  /**
   * Set the log level
   *
   * @param level - Log level (debug, info, warn, error)
   * @throws Error if level is invalid
   */
  public setLogLevel(level: string): void {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.config.logLevel = level as 'debug' | 'info' | 'warn' | 'error';
    // FUTURE: Persist to storage
  }

  /**
   * Get the complete configuration object
   *
   * @returns Current configuration
   */
  public getConfig(): EventLogConfig {
    return { ...this.config };
  }

  /**
   * Reset configuration to default values
   *
   * Useful for testing and debugging.
   */
  public resetToDefaults(): void {
    this.config = {
      enabled: false,
      permissionLevel: 'disabled',
      maxResults: 10000,
      timeoutMs: 30000,
      enableAnonymization: true,
      logLevel: 'info'
    };
    // FUTURE: Persist to storage
  }
}

/**
 * Global configuration manager instance
 *
 * In a full implementation, this would be created by the application
 * during initialization. For now, it's exported for use in tests and
 * resolver contexts.
 *
 * FUTURE (Feature 5):
 * - Initialize from config file or database
 * - Support hot reloading when System Tray UI makes changes
 * - Trigger service re-initialization when config changes
 */
let globalConfigManager: EventLogConfigManager | null = null;
let configManagerFrozen = false;

/**
 * Get or create the global configuration manager
 *
 * @returns The global configuration manager instance
 */
export function getConfigManager(): EventLogConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new EventLogConfigManager();
  }
  return globalConfigManager;
}

/**
 * Set the global configuration manager
 *
 * Primarily used in testing to inject a mock/test configuration.
 * SECURITY: Rejected if manager has been frozen (SEC-014).
 *
 * @param manager - Configuration manager to set as global
 */
export function setConfigManager(manager: EventLogConfigManager): void {
  if (configManagerFrozen && process.env.NODE_ENV !== 'test') {
    throw new Error('Config manager is frozen and cannot be replaced');
  }
  globalConfigManager = manager;
}

/**
 * SECURITY: Freeze the global config manager to prevent replacement (SEC-014).
 * Once frozen, setConfigManager() will throw unless NODE_ENV=test.
 */
export function freezeConfigManager(): void {
  configManagerFrozen = true;
}

/**
 * Reset the global configuration manager
 *
 * Primarily used in testing to clean up after tests.
 */
export function resetConfigManager(): void {
  globalConfigManager = null;
  configManagerFrozen = false;
}
