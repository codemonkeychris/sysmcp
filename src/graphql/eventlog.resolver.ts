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

/**
 * Custom GraphQL error codes for EventLog operations
 */
export enum EventLogErrorCode {
  InvalidLimit = 'INVALID_LIMIT',
  InvalidOffset = 'INVALID_OFFSET',
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

  return undefined;
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

  // Validate limit (must be 1-1000 per task requirements)
  const limit = args.limit ?? 1000;
  if (limit < 1 || limit > 1000) {
    throw new EventLogGraphQLError(
      'limit must be between 1 and 1000',
      EventLogErrorCode.InvalidLimit
    );
  }

  // Validate offset
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
    const offset = args.offset ?? 0;

    logger.debug('Processing eventLogs query', {
      logName: args.logName,
      limit,
      offset,
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

    // Initialize anonymizer if needed
    let anonymizer = context.eventlogAnonymizer;
    if (!anonymizer) {
      // Try to load persisted mapping if path provided
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
        anonymizer = new PiiAnonymizer();
      }
    }

    // Apply anonymization to all entries
    const anonymizedEntries = result.entries.map((entry: any) => {
      const anonEntry = anonymizer!.anonymizeEntry(entry);
      return {
        id: anonEntry.id ?? 0,
        timestamp: anonEntry.timeCreated || anonEntry.timestamp || new Date(),
        level: (anonEntry.levelDisplayName || anonEntry.level || 'INFO').toUpperCase() as EventLevel,
        source: anonEntry.providerName || anonEntry.source || 'Unknown',
        eventId: anonEntry.eventId ?? 0,
        username: anonEntry.userId || anonEntry.username,
        computername: anonEntry.computerName || anonEntry.computername,
        message: anonEntry.message || ''
      } as EventLogResult['entries'][number];
    });

    // Persist anonymization mapping if path provided
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

    // Convert library result to GraphQL result
    const gqlResult: EventLogResult = {
      entries: anonymizedEntries,
      pageInfo: {
        hasNextPage: result.hasMore ?? false,
        hasPreviousPage: offset > 0,
        startCursor: offset,
        endCursor: offset + (result.entries?.length ?? 0) - 1
      },
      totalCount: result.totalCount ?? 0,
      metrics: {
        queryCount: 1,
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
 * Exported error types and codes for use in clients and tests
 */
export { EventLogGraphQLError, EventLogErrorCode };
