/**
 * EventLog Service Provider for SysMCP
 * 
 * Integrates the @sysmcp/eventlog-lib library with the SysMCP service architecture.
 * Provides lifecycle management, logging, metrics, and error handling.
 */

import { Logger } from '../../logger/types';
import { 
  WindowsEventLogLibrary,
  WindowsEventLogLibraryOptions,
  EventLogQuery,
  QueryResult
} from './lib/src/windows-eventlog-lib';

/**
 * Service provider exception types
 */
export class PermissionDeniedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedException';
  }
}

export class OperationFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationFailedException';
  }
}

export class ValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationException';
  }
}

/**
 * EventLog provider result with metrics
 */
export interface EventLogProviderResult extends QueryResult {
  executionTimeMs: number;
  queriedAt: Date;
}

/**
 * EventLog provider configuration
 */
export interface EventLogProviderConfig {
  enabled?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  allowedLogNames?: string[];
  anonymize?: boolean;
  mappingFilePath?: string;
}

/**
 * EventLog Service Provider
 * 
 * Manages Windows EventLog access within SysMCP framework.
 * Provides lifecycle management, error handling, logging, and metrics.
 * 
 * Usage:
 * ```typescript
 * const provider = new EventLogProvider(logger, config);
 * await provider.start();
 * 
 * const result = await provider.query({
 *   logName: 'System',
 *   filters: { level: 'ERROR' }
 * });
 * 
 * await provider.stop();
 * ```
 */
export class EventLogProvider {
  private logger: Logger;
  private config: EventLogProviderConfig;
  private library: WindowsEventLogLibrary | null = null;
  private started = false;
  private metrics = {
    queriesExecuted: 0,
    queriesFailed: 0,
    totalResultsReturned: 0,
    totalExecutionTimeMs: 0,
    averageExecutionTimeMs: 0
  };

  /**
   * Initialize the EventLog provider
   * 
   * @param logger - Logger instance from SysMCP
   * @param config - Provider configuration
   */
  constructor(logger: Logger, config?: EventLogProviderConfig) {
    this.logger = logger.child('eventlog');
    this.config = {
      enabled: config?.enabled ?? true,
      maxResults: config?.maxResults ?? 1000,
      timeoutMs: config?.timeoutMs ?? 30000,
      allowedLogNames: config?.allowedLogNames ?? [],
      anonymize: config?.anonymize ?? false,
      mappingFilePath: config?.mappingFilePath ?? ''
    };

    this.logger.debug('EventLogProvider initialized', { config: this.config });
  }

  /**
   * Start the provider and initialize the library
   * 
   * @throws OperationFailedException if initialization fails
   * 
   * @example
   * ```typescript
   * await provider.start();
   * ```
   */
  async start(): Promise<void> {
    try {
      if (this.started) {
        this.logger.warn('EventLogProvider already started');
        return;
      }

      if (!this.config.enabled) {
        this.logger.info('EventLog service is disabled');
        this.started = false;
        return;
      }

      this.logger.debug('Starting EventLogProvider');

      // Initialize library with configuration
      const libConfig: WindowsEventLogLibraryOptions = {
        maxResults: this.config.maxResults,
        timeoutMs: this.config.timeoutMs,
        allowedLogNames: this.config.allowedLogNames,
        anonymize: this.config.anonymize,
        mappingFilePath: this.config.mappingFilePath
      };

      this.library = new WindowsEventLogLibrary(libConfig);

      // Perform healthcheck
      const healthy = await this.healthcheck();
      if (!healthy) {
        throw new Error('EventLog service healthcheck failed');
      }

      this.started = true;
      this.logger.info('EventLogProvider started successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to start EventLogProvider', { error: message });
      this.started = false;
      throw new OperationFailedException(`Failed to start EventLog service: ${message}`);
    }
  }

  /**
   * Stop the provider and cleanup resources
   * 
   * @throws OperationFailedException if cleanup fails
   */
  async stop(): Promise<void> {
    try {
      if (!this.started || !this.library) {
        this.logger.debug('EventLogProvider not running, skip stop');
        return;
      }

      this.logger.debug('Stopping EventLogProvider');

      // Cleanup library
      await this.library.close();
      this.library = null;
      this.started = false;

      this.logger.info('EventLogProvider stopped successfully', { metrics: this.metrics });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error stopping EventLogProvider', { error: message });
      throw new OperationFailedException(`Failed to stop EventLog service: ${message}`);
    }
  }

  /**
   * Health check - verify service is accessible
   * 
   * Tests ability to query available logs. Returns true if service is healthy.
   * 
   * @returns true if service is healthy, false otherwise
   */
  async healthcheck(): Promise<boolean> {
    try {
      if (!this.config.enabled) {
        this.logger.debug('Service disabled, healthcheck fails');
        return false;
      }

      if (!this.library) {
        this.logger.debug('Library not initialized, creating temporary instance');
        const tempLib = new WindowsEventLogLibrary();
        const logs = await tempLib.getAvailableLogNames();
        await tempLib.close();
        return logs.length > 0;
      }

      // Try to get available logs
      const logs = await this.library.getAvailableLogNames();
      const healthy = logs.length > 0;

      if (healthy) {
        this.logger.debug('Healthcheck passed', { availableLogs: logs.length });
      } else {
        this.logger.warn('Healthcheck failed: no event logs available');
      }

      return healthy;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Healthcheck failed', { error: message });
      return false;
    }
  }

  /**
   * Execute an event log query
   * 
   * Main method to query event logs. Handles all validation, logging, and metrics.
   * 
   * @param query - Query parameters
   * @returns Promise resolving to query result with metrics
   * @throws PermissionDeniedException if service is disabled
   * @throws ValidationException if query parameters are invalid
   * @throws OperationFailedException if query execution fails
   * 
   * @example
   * ```typescript
   * const result = await provider.query({
   *   logName: 'System',
   *   filters: { level: 'ERROR', startTime: new Date(Date.now() - 24*60*60*1000) },
   *   pagination: { limit: 100 }
   * });
   * 
   * console.log(`Found ${result.entries.length} events in ${result.executionTimeMs}ms`);
   * ```
   */
  async query(query: EventLogQuery): Promise<EventLogProviderResult> {
    const startTime = Date.now();

    try {
      // Check if service is enabled
      if (!this.config.enabled) {
        this.logger.warn('Query attempt on disabled service', { logName: query.logName });
        throw new PermissionDeniedException('EventLog service is disabled');
      }

      // Check if service is started
      if (!this.started || !this.library) {
        this.logger.warn('Query attempt on non-started service', { logName: query.logName });
        throw new OperationFailedException('EventLog service not initialized');
      }

      // Validate query
      if (!query.logName || query.logName.trim().length === 0) {
        this.logger.warn('Invalid query: missing logName');
        throw new ValidationException('logName is required');
      }

      // Log query initiation
      this.logger.debug('Executing EventLog query', {
        logName: query.logName,
        hasFilters: !!query.filters,
        hasPagination: !!query.pagination
      });

      // Execute query
      const result = await this.library.query(query);

      // Update metrics
      this.metrics.queriesExecuted++;
      this.metrics.totalResultsReturned += result.entries.length;
      this.metrics.totalExecutionTimeMs += result.executionTimeMs;
      this.metrics.averageExecutionTimeMs = 
        this.metrics.totalExecutionTimeMs / this.metrics.queriesExecuted;

      // Log query result
      if (result.success) {
        this.logger.info('EventLog query completed', {
          logName: query.logName,
          resultCount: result.entries.length,
          executionTimeMs: result.executionTimeMs,
          hasMore: result.hasMore
        });
      } else {
        this.logger.warn('EventLog query failed', {
          logName: query.logName,
          error: result.errorMessage,
          executionTimeMs: result.executionTimeMs
        });
        this.metrics.queriesFailed++;
      }

      // Return result with timing
      return {
        ...result,
        executionTimeMs: result.executionTimeMs,
        queriedAt: new Date()
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;

      // Update metrics for failure
      this.metrics.queriesExecuted++;
      this.metrics.queriesFailed++;
      this.metrics.totalExecutionTimeMs += executionTimeMs;
      this.metrics.averageExecutionTimeMs = 
        this.metrics.totalExecutionTimeMs / this.metrics.queriesExecuted;

      // Log error with context
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('EventLog query error', {
        logName: query.logName,
        error: errorMessage,
        executionTimeMs,
        errorType: error?.constructor?.name
      });

      // Re-throw with appropriate type
      if (error instanceof PermissionDeniedException || 
          error instanceof ValidationException) {
        throw error;
      }

      // Return error result for operational errors
      return {
        success: false,
        entries: [],
        totalCount: 0,
        hasMore: false,
        errorMessage: errorMessage,
        executionTimeMs,
        queriedAt: new Date()
      };
    }
  }

  /**
   * Get current metrics
   * 
   * Returns aggregated metrics about service usage.
   * 
   * @returns Metrics object with query statistics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.started ? Date.now() : 0
    };
  }

  /**
   * Get current service state
   * 
   * @returns Object describing current state
   */
  getState() {
    return {
      started: this.started,
      enabled: this.config.enabled,
      metrics: this.getMetrics()
    };
  }

  /**
   * Get inspection of anonymization mapping (if enabled)
   * 
   * Useful for debugging and auditing anonymization.
   * 
   * @returns Anonymization mapping or undefined if anonymization not enabled
   */
  getAnonymizationMapping() {
    if (!this.library || !this.config.anonymize) {
      return undefined;
    }
    return this.library.getAnonymizationMapping();
  }
}
