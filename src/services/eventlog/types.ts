/**
 * EventLog service type definitions
 *
 * Defines TypeScript interfaces and enums for the EventLog MCP service,
 * including queries, responses, pagination, and metrics.
 */

/**
 * Event log severity levels
 */
export enum EventLevel {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG'
}

/**
 * A single event log entry
 *
 * Represents a Windows event log entry with all relevant metadata.
 * The message field may contain anonymized PII depending on configuration.
 */
export interface EventLogEntry {
  /** Unique identifier for the event */
  id: number;

  /** Timestamp when the event occurred */
  timestamp: Date;

  /** Severity level of the event */
  level: EventLevel;

  /** Source/provider of the event */
  source: string;

  /** Event ID number */
  eventId: number;

  /** Username associated with the event (may be anonymized) */
  username?: string;

  /** Computer name where the event occurred (may be anonymized) */
  computername?: string;

  /** Event message content (may contain anonymized PII) */
  message: string;
}

/**
 * Query parameters for event log searches
 *
 * Defines all supported filtering and pagination options for querying event logs.
 */
export interface EventLogQueryParams {
  /** Name of the event log to query (e.g., 'System', 'Application') */
  logName: string;

  /** Minimum event level to include (filters to this level and above) */
  minLevel?: EventLevel;

  /** Specific event source/provider to filter by */
  source?: string;

  /** Start of time range (returns events >= startTime) */
  startTime?: Date;

  /** End of time range (returns events <= endTime) */
  endTime?: Date;

  /** Search for text in event message */
  messageContains?: string;

  /** Number of results to skip (0-based) */
  offset: number;

  /** Maximum number of results to return */
  limit: number;
}

/**
 * Pagination metadata for query results
 *
 * Provides information about the current result set and available pagination.
 */
export interface PageInfo {
  /** Whether there are more results available after this page */
  hasNextPage: boolean;

  /** Whether there are results available before this page */
  hasPreviousPage: boolean;

  /** Cursor/offset for retrieving the next page */
  startCursor: number;

  /** Cursor/offset for retrieving the previous page */
  endCursor: number;
}

/**
 * Metrics collected during query execution
 *
 * Tracks performance and usage information for monitoring and debugging.
 */
export interface EventLogQueryMetrics {
  /** Total number of queries executed by this provider */
  queryCount: number;

  /** Time taken to execute the query in milliseconds */
  responseDurationMs: number;

  /** Number of results returned in this query */
  resultsReturned: number;
}

/**
 * Complete result of an event log query
 *
 * Contains entries, pagination info, totals, and execution metrics.
 */
export interface EventLogResult {
  /** List of event log entries matching the query */
  entries: EventLogEntry[];

  /** Pagination metadata for navigating results */
  pageInfo: PageInfo;

  /** Total number of results across all pages */
  totalCount: number;

  /** Performance and usage metrics for this query */
  metrics: EventLogQueryMetrics;
}
