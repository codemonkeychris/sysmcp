/**
 * EventLog GraphQL Resolver
 *
 * Implements the eventLogs query resolver for querying Windows Event Logs via GraphQL.
 * Handles input validation, service availability checks, error handling, metrics collection,
 * and PII anonymization.
 */

import { Logger } from '../logger/types';
import { EventLogProvider } from '../services/eventlog/provider';
import {
  EventLogResult,
  EventLevel
} from '../services/eventlog/types';
import { PiiAnonymizer } from '../services/eventlog/lib/src/anonymizer';

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
 * @throws Error if validation fails
 */
function validateArgs(args: EventLogsArgs): void {
  // Validate required fields
  if (!args.logName || typeof args.logName !== 'string') {
    throw new Error('logName is required and must be a string');
  }

  // Validate limit
  const limit = args.limit ?? 1000;
  if (limit < 1 || limit > 10000) {
    throw new Error('limit must be between 1 and 10000');
  }

  // Validate offset
  const offset = args.offset ?? 0;
  if (offset < 0) {
    throw new Error('offset must be >= 0');
  }

  // Validate date range if both provided
  if (args.startTime && args.endTime) {
    const start = new Date(args.startTime);
    const end = new Date(args.endTime);

    if (isNaN(start.getTime())) {
      throw new Error('startTime must be a valid ISO 8601 date string');
    }

    if (isNaN(end.getTime())) {
      throw new Error('endTime must be a valid ISO 8601 date string');
    }

    if (start > end) {
      throw new Error('startTime must be <= endTime');
    }
  }

  // Validate individual dates
  if (args.startTime && isNaN(new Date(args.startTime).getTime())) {
    throw new Error('startTime must be a valid ISO 8601 date string');
  }

  if (args.endTime && isNaN(new Date(args.endTime).getTime())) {
    throw new Error('endTime must be a valid ISO 8601 date string');
  }

  // Validate event level
  if (args.minLevel && !parseEventLevel(args.minLevel)) {
    throw new Error(`minLevel must be one of: ${Object.values(EventLevel).join(', ')}`);
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
      logger.warn('EventLog provider not available');
      throw new Error('EventLog service unavailable');
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
    const message = error instanceof Error ? error.message : String(error);

    // Log the error with full details
    logger.error('EventLog query failed', {
      error: message,
      logName: args.logName,
      durationMs,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return GraphQL error message (generic for security)
    if (message.includes('service unavailable') || message.includes('disabled')) {
      throw new Error('EventLog service unavailable');
    }

    if (message.includes('Permission')) {
      throw new Error('Permission denied: insufficient access to event logs');
    }

    // For validation errors, return the validation message
    if (
      message.includes('must be') ||
      message.includes('required') ||
      message.includes('valid')
    ) {
      throw new Error(message);
    }

    // For other errors, return generic message
    throw new Error('Failed to query event logs');
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
