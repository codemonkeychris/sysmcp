/**
 * EventLog GraphQL Resolver
 *
 * Implements the eventLogs query resolver for querying Windows Event Logs via GraphQL.
 * Handles input validation, service availability checks, error handling, metrics collection,
 * and PII anonymization.
 */

import { GraphQLError } from 'graphql';
import { Logger } from '../logger/types';
import { EventLogProvider } from '../services/eventlog/provider';
import {
  EventLogResult,
  EventLevel
} from '../services/eventlog/types';
import { PiiAnonymizer } from '../services/eventlog/lib/src/anonymizer';
import { EventLogMetricsCollector } from '../services/eventlog/metrics';
import { encodeCursor, decodeCursor, isValidCursor, CursorPosition } from './cursor';
import { PermissionChecker } from '../security/permission-checker';

/**
 * Custom GraphQL error codes for EventLog operations
 */
export enum EventLogErrorCode {
  InvalidLimit = 'INVALID_LIMIT',
  InvalidOffset = 'INVALID_OFFSET',
  InvalidCursor = 'INVALID_CURSOR',
  InvalidDateRange = 'INVALID_DATE_RANGE',
  InvalidStartTime = 'INVALID_START_TIME',
  InvalidEndTime = 'INVALID_END_TIME',
  InvalidEventLevel = 'INVALID_EVENT_LEVEL',
  MissingLogName = 'MISSING_LOG_NAME',
  ServiceDisabled = 'SERVICE_DISABLED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  PermissionDenied = 'PERMISSION_DENIED',
  WindowsApiError = 'WINDOWS_API_ERROR',
  AnonymizationFailure = 'ANONYMIZATION_FAILURE',
  UnknownError = 'UNKNOWN_ERROR'
}

/**
 * Represents a GraphQL error with code and timestamp
 */
export class EventLogGraphQLError extends GraphQLError {
  code: EventLogErrorCode;
  timestamp: Date;
  internalDetails?: string;

  constructor(
    message: string,
    code: EventLogErrorCode,
    internalDetails?: string
  ) {
    super(message, {
      extensions: {
        code,
        timestamp: new Date().toISOString()
      }
    });
    this.code = code;
    this.timestamp = new Date();
    this.internalDetails = internalDetails;
  }
}

/**
 * Arguments for the eventLogs GraphQL query
 */
interface EventLogsArgs {
  limit?: number;
  offset?: number;
  cursor?: string; // Base64-encoded cursor for cursor-based pagination
  logName: string;
  minLevel?: string;
  source?: string;
  startTime?: string;
  endTime?: string;
  messageContains?: string;
}

/**
 * GraphQL context for resolvers
 */
interface ResolverContext {
  logger: Logger;
  eventlogProvider?: EventLogProvider;
  eventlogAnonymizer?: PiiAnonymizer;
  eventlogMappingPath?: string;
  eventlogMetricsCollector?: EventLogMetricsCollector;
  permissionChecker?: PermissionChecker;
}

/**
 * Extract a string value from a field that may be a plain string or a
 * Windows object (e.g. SID: { BinaryLength, AccountDomainSid, Value }).
 */
function extractStringValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'Value' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).Value);
  }
  return String(value);
}

/**
 * Map Windows Event Log level display names to GraphQL EventLevel enum values.
 * Windows uses "Information", "Warning", "Error", "Critical", "Verbose"
 * while the schema uses INFO, WARNING, ERROR, VERBOSE, DEBUG.
 */
const LEVEL_MAP: Record<string, EventLevel> = {
  'INFORMATION': EventLevel.INFO,
  'INFO': EventLevel.INFO,
  'WARNING': EventLevel.WARNING,
  'WARN': EventLevel.WARNING,
  'ERROR': EventLevel.ERROR,
  'CRITICAL': EventLevel.ERROR,
  'VERBOSE': EventLevel.VERBOSE,
  'DEBUG': EventLevel.DEBUG,
};

/**
 * Convert a raw level string to the EventLevel enum
 */
function normalizeEventLevel(level?: string): EventLevel {
  if (!level) return EventLevel.INFO;
  const upper = level.toUpperCase();
  return LEVEL_MAP[upper] ?? EventLevel.INFO;
}

/**
 * Convert EventLevel string to enum
 */
function parseEventLevel(level?: string): EventLevel | undefined {
  if (!level) return undefined;

  const validLevels = Object.values(EventLevel);
  const upper = level.toUpperCase();

  if (validLevels.includes(upper as EventLevel)) {
    return upper as EventLevel;
  }

  // Also check mapped values (e.g. "Information" → INFO)
  return LEVEL_MAP[upper];
}

/**
 * Validate query arguments
 *
 * @throws EventLogGraphQLError if validation fails
 */
function validateArgs(args: EventLogsArgs): void {
  // Validate required fields
  if (!args.logName || typeof args.logName !== 'string') {
    throw new EventLogGraphQLError(
      'logName is required and must be a string',
      EventLogErrorCode.MissingLogName
    );
  }

  // Validate cursor if provided
  if (args.cursor && !isValidCursor(args.cursor)) {
    throw new EventLogGraphQLError(
      'cursor must be a valid base64-encoded cursor',
      EventLogErrorCode.InvalidCursor
    );
  }

  // Validate limit (must be 1-1000 per task requirements)
  const limit = args.limit ?? 1000;
  if (limit < 1 || limit > 1000) {
    throw new EventLogGraphQLError(
      'limit must be between 1 and 1000',
      EventLogErrorCode.InvalidLimit
    );
  }

  // Validate offset (only if cursor not provided, offset takes precedence if both provided)
  const offset = args.offset ?? 0;
  if (offset < 0) {
    throw new EventLogGraphQLError(
      'offset must be >= 0',
      EventLogErrorCode.InvalidOffset
    );
  }

  // Validate individual dates before checking range
  if (args.startTime && isNaN(new Date(args.startTime).getTime())) {
    throw new EventLogGraphQLError(
      'startTime must be a valid ISO 8601 date string',
      EventLogErrorCode.InvalidStartTime
    );
  }

  if (args.endTime && isNaN(new Date(args.endTime).getTime())) {
    throw new EventLogGraphQLError(
      'endTime must be a valid ISO 8601 date string',
      EventLogErrorCode.InvalidEndTime
    );
  }

  // Validate date range if both provided
  if (args.startTime && args.endTime) {
    const start = new Date(args.startTime);
    const end = new Date(args.endTime);

    if (start > end) {
      throw new EventLogGraphQLError(
        'startTime must be <= endTime',
        EventLogErrorCode.InvalidDateRange
      );
    }
  }

  // Validate event level
  if (args.minLevel && !parseEventLevel(args.minLevel)) {
    throw new EventLogGraphQLError(
      `minLevel must be one of: ${Object.values(EventLevel).join(', ')}`,
      EventLogErrorCode.InvalidEventLevel
    );
  }
}

/**
 * EventLogs query resolver
 *
 * Queries Windows event logs with filtering, pagination, and PII anonymization.
 *
 * @param parent - Parent value (unused for Query root)
 * @param args - Query arguments (limit, offset, logName, filters)
 * @param context - GraphQL context with logger, provider, and anonymizer
 * @returns Promise resolving to EventLogResult
 * @throws GraphQL error if validation fails or service unavailable
 */
export async function eventLogsResolver(
  _parent: any,
  args: EventLogsArgs,
  context: ResolverContext
): Promise<EventLogResult> {
  const startTime = Date.now();
  const logger = context.logger.child('eventlog-resolver');

  try {
    // SECURITY: Defense-in-depth permission check (second layer after middleware)
    if (context.permissionChecker) {
      const permCheck = context.permissionChecker.check('eventlog', 'read');
      if (!permCheck.allowed) {
        throw new EventLogGraphQLError(
          'Permission denied',
          EventLogErrorCode.PermissionDenied,
          permCheck.reason
        );
      }
    }

    // Validate input
    validateArgs(args);

    // Check service availability
    if (!context.eventlogProvider) {
      logger.error('EventLog provider not available - service disabled', {
        logName: args.logName
      });
      throw new EventLogGraphQLError(
        'EventLog service not available',
        EventLogErrorCode.ServiceDisabled,
        'EventLog provider not initialized'
      );
    }

    const limit = args.limit ?? 1000;
    let offset = args.offset ?? 0;

    // Handle cursor-based pagination (takes precedence over offset)
    let cursorPosition: CursorPosition | undefined;
    if (args.cursor) {
      cursorPosition = decodeCursor(args.cursor);
      // For cursor-based pagination, we'd typically query from this position
      // In a real implementation, this would be handled by the provider
      // For now, we use it for tracking hasPreviousPage
      logger.debug('Using cursor-based pagination', {
        cursor: args.cursor,
        cursorPosition
      });
    }

    logger.debug('Processing eventLogs query', {
      logName: args.logName,
      limit,
      offset,
      hasCursor: !!args.cursor,
      hasFilters: !!(args.minLevel || args.source || args.startTime || args.endTime || args.messageContains)
    });

    // Call provider to query events
    const result = await context.eventlogProvider.query({
      logName: args.logName,
      filters: {
        level: args.minLevel,
        providerId: args.source,
        startTime: args.startTime ? new Date(args.startTime) : undefined,
        endTime: args.endTime ? new Date(args.endTime) : undefined,
        messageContains: args.messageContains
      },
      pagination: {
        limit,
        offset
      }
    });

    // Initialize anonymizer - always anonymize for security (defense in depth)
    let anonymizer = context.eventlogAnonymizer;
    if (!anonymizer) {
      if (context.eventlogMappingPath) {
        try {
          const mapping = await PiiAnonymizer.loadMapping(context.eventlogMappingPath);
          anonymizer = new PiiAnonymizer(mapping);
          logger.debug('Loaded persisted anonymization mapping');
        } catch (error) {
          // If mapping doesn't exist or is corrupt, start fresh
          logger.debug('Starting with fresh anonymization mapping');
          anonymizer = new PiiAnonymizer();
        }
      } else {
        // SECURITY: Always anonymize even without explicit mapping path
        anonymizer = new PiiAnonymizer();
      }
    }

    // Map entries, applying anonymization only if an anonymizer is configured
    const anonymizedEntries = result.entries.map((entry: any) => {
      const anonEntry = anonymizer ? anonymizer.anonymizeEntry(entry) : entry;
      return {
        id: anonEntry.id ?? 0,
        timestamp: anonEntry.timeCreated || anonEntry.timestamp || new Date(),
        level: normalizeEventLevel(anonEntry.levelDisplayName || anonEntry.level),
        source: anonEntry.providerName || anonEntry.source || 'Unknown',
        eventId: anonEntry.eventId ?? 0,
        username: extractStringValue(anonEntry.userId) || extractStringValue(anonEntry.username),
        computername: extractStringValue(anonEntry.computerName) || extractStringValue(anonEntry.computername),
        message: anonEntry.message || ''
      } as EventLogResult['entries'][number];
    });

    // Persist anonymization mapping if path provided and anonymizer active
    if (context.eventlogMappingPath && anonymizer) {
      try {
        await anonymizer.persistMapping(context.eventlogMappingPath);
        logger.debug('Persisted anonymization mapping');
      } catch (error) {
        // Log persistence error but don't fail the query
        logger.warn('Failed to persist anonymization mapping', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Calculate metrics
    const responseDurationMs = Date.now() - startTime;

    // Record in metrics collector if available
    if (context.eventlogMetricsCollector) {
      context.eventlogMetricsCollector.recordQuery(responseDurationMs, anonymizedEntries.length, false);
    }

    // Generate cursors for pagination if entries exist
    let nextPageCursor: string | undefined;
    let previousPageCursor: string | undefined;

    if (anonymizedEntries.length > 0) {
      // Next page cursor: use the last entry
      const lastEntry = anonymizedEntries[anonymizedEntries.length - 1];
      if (result.hasMore) {
        nextPageCursor = encodeCursor({
          logName: args.logName,
          eventId: lastEntry.eventId,
          timestamp: lastEntry.timestamp.toISOString()
        });
      }

      // Previous page cursor: use the first entry (if not at beginning)
      if (offset > 0 || cursorPosition) {
        const firstEntry = anonymizedEntries[0];
        previousPageCursor = encodeCursor({
          logName: args.logName,
          eventId: firstEntry.eventId,
          timestamp: firstEntry.timestamp.toISOString()
        });
      }
    }

    // Get current query count from metrics collector
    const totalQueryCount = context.eventlogMetricsCollector?.getTotalQueryCount() ?? 0;

    // Convert library result to GraphQL result
    const gqlResult: EventLogResult = {
      entries: anonymizedEntries,
      pageInfo: {
        hasNextPage: result.hasMore ?? false,
        hasPreviousPage: offset > 0 || !!cursorPosition,
        startCursor: offset,
        endCursor: offset + (result.entries?.length ?? 0) - 1,
        nextPageCursor,
        previousPageCursor
      },
      totalCount: result.totalCount ?? 0,
      metrics: {
        queryCount: totalQueryCount,
        responseDurationMs,
        resultsReturned: result.entries?.length ?? 0
      }
    };

    // Log successful query
    logger.info('EventLog query completed', {
      logName: args.logName,
      resultCount: gqlResult.entries.length,
      totalCount: gqlResult.totalCount,
      durationMs: responseDurationMs,
      anonymized: true
    });

    return gqlResult;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorDetails = error instanceof Error ? error : new Error(String(error));

    // Record failed query in metrics
    if (context.eventlogMetricsCollector) {
      context.eventlogMetricsCollector.recordQuery(durationMs, 0, true);
    }

    // Classify and handle specific error types
    if (error instanceof EventLogGraphQLError) {
      // Already properly formatted, just log and rethrow
      logger.warn('EventLog validation error', {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        durationMs,
        internalDetails: error.internalDetails
      });
      throw error;
    }

    // Check for service availability errors
    if (
      errorDetails.message.includes('service unavailable') ||
      errorDetails.message.includes('disabled') ||
      errorDetails.message.includes('Service unavailable')
    ) {
      logger.error('EventLog service unavailable', {
        error: errorDetails.message,
        logName: args.logName,
        durationMs,
        stack: errorDetails.stack
      });
      throw new EventLogGraphQLError(
        'EventLog service not available',
        EventLogErrorCode.ServiceUnavailable,
        errorDetails.message
      );
    }

    // Check for permission errors
    if (
      errorDetails.message.includes('Permission') ||
      errorDetails.message.includes('permission') ||
      errorDetails.message.includes('Access denied')
    ) {
      logger.error('Permission denied for EventLog query', {
        error: errorDetails.message,
        logName: args.logName,
        durationMs,
        stack: errorDetails.stack
      });
      throw new EventLogGraphQLError(
        'Permission denied: insufficient access to event logs',
        EventLogErrorCode.PermissionDenied,
        errorDetails.message
      );
    }

    // Check for anonymization failures (critical)
    if (errorDetails.message.includes('anonymiz') || errorDetails.message.includes('anonymi')) {
      logger.error('Anonymization failure - critical error', {
        error: errorDetails.message,
        logName: args.logName,
        durationMs,
        stack: errorDetails.stack
      });
      throw new EventLogGraphQLError(
        'Failed to process results',
        EventLogErrorCode.AnonymizationFailure,
        errorDetails.message
      );
    }

    // Windows API errors - log details but return generic message
    if (
      errorDetails.message.includes('Windows') ||
      errorDetails.message.includes('0x') ||
      errorDetails.message.includes('HRESULT')
    ) {
      logger.error('Windows API error occurred', {
        error: errorDetails.message,
        logName: args.logName,
        durationMs,
        stack: errorDetails.stack
      });
      throw new EventLogGraphQLError(
        'Failed to query event logs',
        EventLogErrorCode.WindowsApiError,
        errorDetails.message
      );
    }

    // Unknown error - log all details internally
    logger.error('Unknown error during EventLog query', {
      error: errorDetails.message,
      logName: args.logName,
      durationMs,
      stack: errorDetails.stack
    });
    throw new EventLogGraphQLError(
      'Failed to query event logs',
      EventLogErrorCode.UnknownError,
      errorDetails.message
    );
  }
}

/**
 * Export resolver compatible with Apollo Server
 */
export const eventlogResolver = {
  Query: {
    eventLogs: eventLogsResolver
  }
};

/**
 * Error codes for use in clients and tests
 */
