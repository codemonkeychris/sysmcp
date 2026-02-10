/**
 * FileSearch Provider
 *
 * Main provider that orchestrates query building, execution, result mapping,
 * anonymization, and metrics. Follows the EventLogProvider pattern.
 */

import { Logger } from '../../logger';
import { FileSearchQueryParams, FileSearchEntry } from './types';
import { buildSearchQuery } from './query-builder';
import { OleDbExecutor } from './oledb-executor';
import { mapOleDbRows } from './result-mapper';
import { ScopeValidator } from './scope-validator';
import { FileSearchMetricsCollector } from './metrics';

/**
 * Configuration for the FileSearch provider
 */
export interface FileSearchProviderConfig {
  enabled?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  anonymize?: boolean;
  allowedPaths?: string[];
}

/**
 * Exception for permission denied errors
 */
export class PermissionDeniedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionDeniedException';
  }
}

/**
 * Exception for validation errors
 */
export class ValidationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationException';
  }
}

/**
 * Exception for operation failures
 */
export class OperationFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationFailedException';
  }
}

/**
 * Exception for scope violations
 */
export class ScopeViolationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeViolationException';
  }
}

/**
 * Result from the FileSearch provider
 */
export interface FileSearchProviderResult {
  files: FileSearchEntry[];
  totalCount: number;
  hasMore: boolean;
  executionTimeMs: number;
}

/**
 * FileSearch Provider
 *
 * Bridges the FileSearch service with the Windows Search Indexer.
 */
export class FileSearchProvider {
  private logger: Logger;
  private config: FileSearchProviderConfig;
  private executor: OleDbExecutor;
  private scopeValidator: ScopeValidator;
  private metrics: FileSearchMetricsCollector;
  private started = false;
  private healthy = false;

  constructor(logger: Logger, config?: FileSearchProviderConfig) {
    this.logger = logger;
    this.config = config || { enabled: true, maxResults: 10000, timeoutMs: 30000, anonymize: true };
    this.executor = new OleDbExecutor({ timeoutMs: this.config.timeoutMs });
    this.scopeValidator = new ScopeValidator(this.config.allowedPaths || []);
    this.metrics = new FileSearchMetricsCollector();
  }

  /**
   * Start the provider and check Windows Search availability
   */
  async start(): Promise<void> {
    this.logger.info('Starting FileSearch provider');

    const availability = await this.executor.checkAvailability();
    if (availability.available) {
      this.healthy = true;
      this.logger.info('FileSearch provider started - Windows Search available');
    } else {
      this.healthy = false;
      this.logger.warn('FileSearch provider started with degraded status', {
        reason: availability.message
      });
    }

    this.started = true;
  }

  /**
   * Stop the provider
   */
  async stop(): Promise<void> {
    this.started = false;
    this.healthy = false;
    this.logger.info('FileSearch provider stopped');
  }

  /**
   * Check if Windows Search is available
   */
  async healthcheck(): Promise<boolean> {
    if (!this.started) return false;
    const availability = await this.executor.checkAvailability();
    this.healthy = availability.available;
    return this.healthy;
  }

  /**
   * Execute a file search query
   *
   * @param params - Search query parameters
   * @returns Search results with pagination and timing
   * @throws PermissionDeniedException if service is disabled
   * @throws ValidationException if parameters are invalid
   * @throws ScopeViolationException if path is outside allowed scope
   * @throws OperationFailedException if query execution fails
   */
  async search(params: FileSearchQueryParams): Promise<FileSearchProviderResult> {
    const startTime = Date.now();

    // Check service state
    if (this.config.enabled === false) {
      throw new PermissionDeniedException('FileSearch service is disabled');
    }
    if (!this.started) {
      throw new OperationFailedException('FileSearch service is not started');
    }

    // Validate parameters
    this.validateParams(params);

    // Validate path scope
    if (params.path) {
      const scopeResult = this.scopeValidator.validateAndNormalize(params.path);
      if (!scopeResult.valid) {
        throw new ScopeViolationException(scopeResult.error || 'Path outside allowed scope');
      }
    }

    try {
      // Build SQL query
      const built = buildSearchQuery(params);

      this.logger.debug('Executing FileSearch query', {
        hasSearchText: !!params.searchText,
        hasPath: !!params.path,
        limit: params.limit,
        offset: params.offset
      });

      // Execute main query
      const result = await this.executor.execute(built.sql);

      if (!result.success) {
        const executionTimeMs = Date.now() - startTime;
        this.metrics.recordQuery(executionTimeMs, 0, true);
        throw new OperationFailedException(result.errorMessage || 'Search query failed');
      }

      // Execute count query
      let totalCount = 0;
      const countResult = await this.executor.execute(built.countSql);
      if (countResult.success && countResult.rows.length > 0) {
        const firstRow = countResult.rows[0];
        const countValue = Object.values(firstRow)[0];
        totalCount = typeof countValue === 'number' ? countValue : Number(countValue) || 0;
      }

      // Map results
      const allMapped = mapOleDbRows(result.rows);

      // Apply client-side pagination (skip offset rows)
      const afterOffset = allMapped.slice(built.offset);

      // Detect hasNextPage (we fetched limit+1 extra)
      const hasMore = afterOffset.length > built.limit;
      const files = afterOffset.slice(0, built.limit);

      const executionTimeMs = Date.now() - startTime;
      this.metrics.recordQuery(executionTimeMs, files.length, false);

      return {
        files,
        totalCount,
        hasMore,
        executionTimeMs
      };
    } catch (error) {
      if (error instanceof PermissionDeniedException ||
          error instanceof ValidationException ||
          error instanceof ScopeViolationException ||
          error instanceof OperationFailedException) {
        throw error;
      }

      const executionTimeMs = Date.now() - startTime;
      this.metrics.recordQuery(executionTimeMs, 0, true);

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('FileSearch query failed', { error: message });
      throw new OperationFailedException('Search query failed');
    }
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Get current provider state
   */
  getState() {
    return {
      started: this.started,
      healthy: this.healthy,
      enabled: this.config.enabled !== false,
      metrics: this.metrics.getMetrics()
    };
  }

  /**
   * Validate search parameters
   */
  private validateParams(params: FileSearchQueryParams): void {
    if (params.limit < 1 || params.limit > 1000) {
      throw new ValidationException('limit must be between 1 and 1000');
    }
    if (params.offset < 0) {
      throw new ValidationException('offset must be >= 0');
    }
    if (params.minSize !== undefined && params.minSize < 0) {
      throw new ValidationException('minSize must be >= 0');
    }
    if (params.maxSize !== undefined && params.minSize !== undefined && params.maxSize < params.minSize) {
      throw new ValidationException('maxSize must be >= minSize');
    }
    if (params.modifiedAfter && params.modifiedBefore && params.modifiedAfter > params.modifiedBefore) {
      throw new ValidationException('modifiedAfter must be <= modifiedBefore');
    }
    if (params.createdAfter && params.createdBefore && params.createdAfter > params.createdBefore) {
      throw new ValidationException('createdAfter must be <= createdBefore');
    }
  }
}
