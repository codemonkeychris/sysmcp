/**
 * GraphQL Schema Definition Language
 */

export const typeDefs = `#graphql
  enum ServiceState {
    DISABLED
    STARTING
    READY
    ERROR
    STOPPING
  }

  type Service {
    name: String!
    type: String!
    state: ServiceState!
    errorMessage: String
    startedAt: String
    requiredPermissions: [String!]
  }

  type HealthStatus {
    status: String!
    uptime: Int!
    services: Int!
    timestamp: String!
  }

  type ServiceRegistrationResult {
    success: Boolean!
    service: Service
    error: String
  }

  type ServiceOperationResult {
    success: Boolean!
    service: Service
    error: String
  }

  input RegisterServiceInput {
    name: String!
    type: String!
    requiredPermissions: [String!]
    config: String
  }

  """Event log severity level"""
  enum EventLevel {
    """Critical error condition"""
    ERROR

    """Warning condition"""
    WARNING

    """Informational message"""
    INFO

    """Verbose diagnostic information"""
    VERBOSE

    """Debug-level information"""
    DEBUG
  }

  """A single Windows event log entry"""
  type EventLogEntry {
    """Unique identifier for the event"""
    id: Int!

    """Timestamp when the event occurred (ISO 8601 format)"""
    timestamp: String!

    """Severity level of the event"""
    level: EventLevel!

    """Source or provider of the event"""
    source: String!

    """Event ID number"""
    eventId: Int!

    """Username associated with the event (may be anonymized)"""
    username: String

    """Computer name where the event occurred (may be anonymized)"""
    computername: String

    """Event message content (may contain anonymized PII)"""
    message: String!
  }

  """Pagination metadata for query results"""
  type PageInfo {
    """Whether there are more results available after this page"""
    hasNextPage: Boolean!

    """Whether there are results available before this page"""
    hasPreviousPage: Boolean!

    """Cursor/offset for the first result on this page"""
    startCursor: Int!

    """Cursor/offset for the last result on this page"""
    endCursor: Int!
  }

  """Metrics collected during query execution"""
  type EventLogQueryMetrics {
    """Total number of queries executed by this provider"""
    queryCount: Int!

    """Time taken to execute the query in milliseconds"""
    responseDurationMs: Int!

    """Number of results returned in this query"""
    resultsReturned: Int!
  }

  """Complete result of an event log query"""
  type EventLogResult {
    """List of event log entries matching the query"""
    entries: [EventLogEntry!]!

    """Pagination metadata for navigating results"""
    pageInfo: PageInfo!

    """Total number of results across all pages"""
    totalCount: Int!

    """Performance and usage metrics for this query"""
    metrics: EventLogQueryMetrics!
  }

  type Query {
    services: [Service!]!
    service(name: String!): Service
    health: HealthStatus!

    """
    Query Windows event logs with filtering and pagination.

    Parameters:
    - limit: Maximum number of results to return (default: 1000, max: 10000)
    - offset: Number of results to skip for pagination (default: 0)
    - logName: Name of the event log to query (e.g., 'System', 'Application') (required)
    - minLevel: Minimum event level to include in results (optional)
    - source: Specific event source/provider to filter by (optional)
    - startTime: Start of time range in ISO 8601 format, returns events >= startTime (optional)
    - endTime: End of time range in ISO 8601 format, returns events <= endTime (optional)
    - messageContains: Search for text in event message (optional)
    """
    eventLogs(
      limit: Int = 1000
      offset: Int = 0
      logName: String!
      minLevel: EventLevel
      source: String
      startTime: String
      endTime: String
      messageContains: String
    ): EventLogResult!
  }

  type Mutation {
    registerService(input: RegisterServiceInput!): ServiceRegistrationResult!
    startService(name: String!): ServiceOperationResult!
    stopService(name: String!): ServiceOperationResult!
    restartService(name: String!): ServiceOperationResult!
  }
`;
