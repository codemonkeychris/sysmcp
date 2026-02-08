/**
 * Windows EventLog Library - Public API
 * 
 * Complete, batteries-included library for querying and anonymizing Windows Event Logs.
 * Bundles the EventLogLibrary query engine with PII anonymization for secure data handling.
 * 
 * Usage:
 * ```typescript
 * import { WindowsEventLogLibrary } from '@sysmcp/eventlog-lib';
 * 
 * const lib = new WindowsEventLogLibrary({ maxResults: 1000, anonymize: true });
 * 
 * const result = await lib.query({
 *   logName: 'System',
 *   filters: { level: 'ERROR', startTime: new Date(Date.now() - 24*60*60*1000) },
 *   pagination: { limit: 100 }
 * });
 * 
 * if (result.success) {
 *   console.log(`Found ${result.entries.length} events`);
 *   result.entries.forEach(entry => {
 *     console.log(entry.message); // Message has PII anonymized
 *   });
 * }
 * ```
 */

import { 
  EventLogLibrary, 
  EventLogQueryOptions, 
  EventLogResult, 
  EventLogEntry 
} from './index';
import { 
  PiiAnonymizer, 
  AnonymizationMapping,
  AnonymizedEventLogEntry 
} from './anonymizer';

/**
 * Configuration options for WindowsEventLogLibrary
 */
export interface WindowsEventLogLibraryOptions {
  /** Maximum number of results to return per query (default: 1000, max: 10000) */
  maxResults?: number;
  
  /** Query timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  
  /** List of allowed log names to query (if empty, all logs allowed) */
  allowedLogNames?: string[];
  
  /** Whether to anonymize PII in results (default: false) */
  anonymize?: boolean;
  
  /** Path to persist anonymization mapping for consistency across restarts */
  mappingFilePath?: string;
}

/**
 * Represents filters for event log queries
 */
export interface EventLogFilters {
  /** Event severity level: VERBOSE, INFORMATION, WARNING, ERROR, CRITICAL */
  level?: string;
  
  /** Specific event ID to filter by */
  eventId?: number;
  
  /** Provider/source to filter by */
  providerId?: string;
  
  /** Start of time range (returns events >= startTime) */
  startTime?: Date;
  
  /** End of time range (returns events <= endTime) */
  endTime?: Date;
  
  /** Search for text in message content */
  messageContains?: string;
  
  /** Filter by specific user */
  userId?: string;
}

/**
 * Pagination options for queries
 */
export interface PaginationOptions {
  /** Maximum number of results to return (overrides library default if specified) */
  limit?: number;
  
  /** Offset for pagination (results to skip) */
  offset?: number;
}

/**
 * A complete event log query request
 */
export interface EventLogQuery {
  /** Name of the event log to query (e.g., 'System', 'Application', 'Security') */
  logName: string;
  
  /** Filters to apply to results */
  filters?: EventLogFilters;
  
  /** Pagination options */
  pagination?: PaginationOptions;
}

/**
 * Metadata about an event log
 */
export interface LogMetadata {
  /** Name of the log */
  logName: string;
  
  /** Number of entries in the log */
  recordCount?: number;
  
  /** Maximum size of log in bytes */
  maxSize?: number;
  
  /** Whether log exists */
  exists: boolean;
  
  /** Whether the current user has access to read this log */
  isReadable: boolean;
}

/**
 * Result of an event log query
 */
export interface QueryResult {
  /** Whether the query succeeded */
  success: boolean;
  
  /** Event log entries (may be anonymized if enabled) */
  entries: (EventLogEntry | AnonymizedEventLogEntry)[];
  
  /** Total number of results (without pagination limits) */
  totalCount: number;
  
  /** Whether there are more results available beyond current pagination */
  hasMore: boolean;
  
  /** Next offset for pagination if hasMore is true */
  nextOffset?: number;
  
  /** Error message if query failed */
  errorMessage?: string;
  
  /** Query execution time in milliseconds */
  executionTimeMs?: number;
}

/**
 * WindowsEventLogLibrary - Main public API for Windows EventLog access
 * 
 * Complete library for querying Windows Event Logs with optional PII anonymization.
 * Provides high-level, type-safe interface with comprehensive error handling.
 * 
 * @example
 * ```typescript
 * // Create library instance
 * const lib = new WindowsEventLogLibrary({
 *   maxResults: 500,
 *   anonymize: true,
 *   mappingFilePath: '/var/lib/sysmcp/anon-mapping.json'
 * });
 * 
 * // Query System log for recent errors
 * const result = await lib.query({
 *   logName: 'System',
 *   filters: {
 *     level: 'ERROR',
 *     startTime: new Date(Date.now() - 24*60*60*1000) // Last 24 hours
 *   },
 *   pagination: { limit: 100 }
 * });
 * 
 * if (result.success) {
 *   console.log(`Found ${result.entries.length} errors in 24h`);
 * }
 * 
 * // List available logs
 * const logs = await lib.getAvailableLogNames();
 * 
 * // Get log metadata
 * const metadata = await lib.getLogMetadata('Security');
 * 
 * // Cleanup
 * await lib.close();
 * ```
 */
export class WindowsEventLogLibrary {
  private queryEngine: EventLogLibrary;
  private anonymizer: PiiAnonymizer | null = null;
  private options: Required<WindowsEventLogLibraryOptions>;

  /**
   * Initialize the library
   * 
   * @param options - Configuration options
   * @throws Error if options are invalid
   */
  constructor(options: WindowsEventLogLibraryOptions = {}) {
    // Store options with defaults
    this.options = {
      maxResults: options.maxResults ?? 1000,
      timeoutMs: options.timeoutMs ?? 30000,
      allowedLogNames: options.allowedLogNames ?? [],
      anonymize: options.anonymize ?? false,
      mappingFilePath: options.mappingFilePath ?? ''
    };

    // Validate options
    this.validateOptions();

    // Initialize query engine
    this.queryEngine = new EventLogLibrary();

    // Initialize anonymizer if requested
    if (this.options.anonymize) {
      this.anonymizer = new PiiAnonymizer();
    }
  }

  /**
   * Query event logs with filters and pagination
   * 
   * Executes a query against a specific event log with optional filtering
   * and pagination. Results may be anonymized if library was configured with
   * anonymize: true.
   * 
   * @param query - Query parameters including log name and filters
   * @returns Promise resolving to query result with entries and metadata
   * 
   * @throws Error only if query parameters are invalid; operational errors
   *         are returned as QueryResult with success=false
   * 
   * @example
   * ```typescript
   * // Simple query
   * const result = await lib.query({ logName: 'System' });
   * 
   * // Complex query with filters
   * const result = await lib.query({
   *   logName: 'Security',
   *   filters: {
   *     level: 'WARNING',
   *     startTime: new Date('2024-01-15'),
   *     messageContains: 'failed'
   *   },
   *   pagination: { limit: 500, offset: 0 }
   * });
   * 
   * if (result.success) {
   *   console.log(`${result.entries.length} of ${result.totalCount} events`);
   * }
   * ```
   */
  async query(query: EventLogQuery): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Validate query
      this.validateQuery(query);

      // Build query options for engine
      const engineOptions: EventLogQueryOptions = {
        logName: query.logName,
        maxResults: query.pagination?.limit ?? this.options.maxResults,
        offset: query.pagination?.offset ?? 0,
        level: query.filters?.level,
        eventId: query.filters?.eventId,
        providerId: query.filters?.providerId,
        startTime: query.filters?.startTime,
        endTime: query.filters?.endTime,
        messageContains: query.filters?.messageContains,
        userId: query.filters?.userId
      };

      // Execute query through engine
      const engineResult = await this.queryEngine.queryEventLog(engineOptions);

      // Anonymize if configured
      let entries = engineResult.entries;
      if (this.options.anonymize && this.anonymizer) {
        entries = entries.map(entry => 
          this.anonymizer!.anonymizeEntry(entry as any) as EventLogEntry
        );
      }

      return {
        success: engineResult.success,
        entries,
        totalCount: engineResult.totalCount ?? entries.length,
        hasMore: engineResult.hasNextPage ?? false,
        nextOffset: engineResult.nextOffset,
        errorMessage: engineResult.errorMessage,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        entries: [],
        totalCount: 0,
        hasMore: false,
        errorMessage,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Get list of available event log names on the system
   * 
   * @returns Promise resolving to array of log names
   * 
   * @example
   * ```typescript
   * const logs = await lib.getAvailableLogNames();
   * console.log('Available logs:', logs);
   * // Output: ['Application', 'Security', 'System', 'PowerShell', ...]
   * ```
   */
  async getAvailableLogNames(): Promise<string[]> {
    try {
      const logs = await this.queryEngine.getAvailableLogs();
      
      // Filter by allowedLogNames if configured
      if (this.options.allowedLogNames.length > 0) {
        return logs.filter(log =>
          this.options.allowedLogNames.includes(log)
        );
      }

      return logs;
    } catch (error) {
      // Log error but return empty array gracefully
      console.error('Failed to get available logs:', error);
      return [];
    }
  }

  /**
   * Get metadata about a specific event log
   * 
   * Returns information about a log including whether it exists and is readable.
   * Note: Some metadata like record count may not be available on all systems.
   * 
   * @param logName - Name of the log to query
   * @returns Promise resolving to log metadata
   * 
   * @example
   * ```typescript
   * const metadata = await lib.getLogMetadata('Security');
   * if (metadata.isReadable) {
   *   console.log(`Log has ~${metadata.recordCount} entries`);
   * } else {
   *   console.log('No access to Security log');
   * }
   * ```
   */
  async getLogMetadata(logName: string): Promise<LogMetadata> {
    try {
      // Try to query one entry from the log to check if it exists and is readable
      const result = await this.queryEngine.queryEventLog({
        logName,
        maxResults: 1
      });

      return {
        logName,
        exists: result.success,
        isReadable: result.success,
        recordCount: result.totalCount,
        maxSize: undefined // Not easily accessible through PowerShell
      };
    } catch {
      return {
        logName,
        exists: false,
        isReadable: false
      };
    }
  }

  /**
   * Cleanup resources and close connections
   * 
   * Persists anonymization mapping if configured, then cleans up.
   * Should be called when done using the library.
   * 
   * @returns Promise that resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * try {
   *   // Use library
   *   const result = await lib.query({ logName: 'System' });
   * } finally {
   *   // Always cleanup
   *   await lib.close();
   * }
   * ```
   */
  async close(): Promise<void> {
    try {
      // Persist anonymization mapping if enabled
      if (this.options.anonymize && this.anonymizer && this.options.mappingFilePath) {
        await this.anonymizer.persistMapping(this.options.mappingFilePath);
      }
    } finally {
      // Cleanup query engine
      await this.queryEngine.dispose();
    }
  }

  /**
   * Validate library configuration options
   * 
   * @throws Error if options are invalid
   * @private
   */
  private validateOptions(): void {
    if (this.options.maxResults < 1 || this.options.maxResults > 10000) {
      throw new Error('maxResults must be between 1 and 10000');
    }

    if (this.options.timeoutMs < 1000) {
      throw new Error('timeoutMs must be at least 1000');
    }

    if (this.options.anonymize && !this.options.mappingFilePath) {
      // Mapping persistence is optional but recommended
      console.warn(
        'Warning: Anonymization enabled but no mappingFilePath configured. ' +
        'Anonymization mapping will not persist across restarts.'
      );
    }
  }

  /**
   * Validate query parameters
   * 
   * @param query - Query to validate
   * @throws Error if query is invalid
   * @private
   */
  private validateQuery(query: EventLogQuery): void {
    if (!query.logName || query.logName.trim().length === 0) {
      throw new Error('logName is required');
    }

    // Check if log is in allowed list (if configured)
    if (this.options.allowedLogNames.length > 0) {
      if (!this.options.allowedLogNames.includes(query.logName)) {
        throw new Error(`Log '${query.logName}' is not in the allowed list`);
      }
    }

    // Validate pagination
    if (query.pagination?.limit) {
      if (query.pagination.limit < 1 || query.pagination.limit > 10000) {
        throw new Error('pagination.limit must be between 1 and 10000');
      }
    }

    if (query.pagination?.offset && query.pagination.offset < 0) {
      throw new Error('pagination.offset must be >= 0');
    }

    // Validate filters
    if (query.filters?.startTime && query.filters?.endTime) {
      if (query.filters.startTime > query.filters.endTime) {
        throw new Error('startTime must be before endTime');
      }
    }
  }

  /**
   * Get current anonymization mapping (for inspection/debugging)
   * 
   * Only available if anonymization is enabled.
   * 
   * @returns Anonymization mapping or undefined if not enabled
   */
  getAnonymizationMapping(): AnonymizationMapping | undefined {
    return this.anonymizer?.getMapping();
  }
}
