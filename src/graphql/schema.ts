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

  """File search mode"""
  enum FileSearchMode {
    """Exact phrase matching"""
    CONTAINS
    """Natural language search"""
    FREETEXT
  }

  """A single file search result entry"""
  type FileSearchEntry {
    """Full path to the file (may be anonymized)"""
    path: String!

    """File name"""
    fileName: String!

    """File extension (e.g., .pdf, .docx)"""
    fileType: String!

    """File size in bytes"""
    size: Int!

    """Last modified date (ISO 8601)"""
    dateModified: String!

    """Creation date (ISO 8601)"""
    dateCreated: String!

    """Document author (may be anonymized)"""
    author: String

    """Document title"""
    title: String

    """Tags/keywords associated with the file"""
    tags: [String!]!
  }

  """Metrics collected during file search query execution"""
  type FileSearchQueryMetrics {
    """Total number of queries executed by this provider"""
    queryCount: Int!

    """Time taken to execute the query in milliseconds"""
    responseDurationMs: Int!

    """Number of results returned in this query"""
    resultsReturned: Int!
  }

  """Complete result of a file search query"""
  type FileSearchResult {
    """List of file search entries matching the query"""
    files: [FileSearchEntry!]!

    """Pagination metadata for navigating results"""
    pageInfo: PageInfo!

    """Total number of results across all pages"""
    totalCount: Int!

    """Performance and usage metrics for this query"""
    metrics: FileSearchQueryMetrics!
  }

  """Permission level for service access control"""
  enum PermissionLevel {
    """Service is disabled and cannot be used"""
    DISABLED
    """Read-only access (queries allowed, mutations denied)"""
    READ_ONLY
    """Full read-write access"""
    READ_WRITE
  }

  """Configuration state of a service"""
  type ServiceConfig {
    """Service identifier"""
    serviceId: String!
    """Whether the service is enabled"""
    enabled: Boolean!
    """Current permission level"""
    permissionLevel: PermissionLevel!
    """Whether PII anonymization is enabled"""
    enableAnonymization: Boolean!
  }

  type Query {
    services: [Service!]!
    service(name: String!): Service
    health: HealthStatus!

    """Get configuration for a specific service"""
    serviceConfig(serviceId: String!): ServiceConfig!

    """Get configuration for all known services"""
    allServiceConfigs: [ServiceConfig!]!

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

    """
    Search files indexed by Windows Search with filtering and pagination.

    Parameters:
    - searchText: Full-text search query (optional)
    - searchMode: Search mode - CONTAINS (exact) or FREETEXT (natural language) (default: CONTAINS)
    - path: Restrict search to a directory path (optional)
    - fileName: File name pattern with wildcards (* and ?) (optional)
    - fileType: File extension filter (e.g., '.pdf', '.docx') (optional)
    - author: Filter by document author (optional)
    - minSize: Minimum file size in bytes (optional)
    - maxSize: Maximum file size in bytes (optional)
    - modifiedAfter: ISO 8601 date - files modified after this date (optional)
    - modifiedBefore: ISO 8601 date - files modified before this date (optional)
    - createdAfter: ISO 8601 date - files created after this date (optional)
    - createdBefore: ISO 8601 date - files created before this date (optional)
    - limit: Maximum number of results to return (default: 25, max: 1000)
    - offset: Number of results to skip for pagination (default: 0)
    """
    fileSearch(
      searchText: String
      searchMode: FileSearchMode = CONTAINS
      path: String
      fileName: String
      fileType: String
      author: String
      minSize: Int
      maxSize: Int
      modifiedAfter: String
      modifiedBefore: String
      createdAfter: String
      createdBefore: String
      limit: Int = 25
      offset: Int = 0
    ): FileSearchResult!
  }

  type Mutation {
    registerService(input: RegisterServiceInput!): ServiceRegistrationResult!
    startService(name: String!): ServiceOperationResult!
    stopService(name: String!): ServiceOperationResult!
    restartService(name: String!): ServiceOperationResult!

    """Enable a service (sets enabled=true, permissionLevel=READ_ONLY)"""
    enableService(serviceId: String!): ServiceConfig!

    """Disable a service (sets enabled=false, permissionLevel=DISABLED)"""
    disableService(serviceId: String!): ServiceConfig!

    """Set the permission level for a service"""
    setPermissionLevel(serviceId: String!, level: PermissionLevel!): ServiceConfig!

    """Set PII anonymization toggle for a service"""
    setPiiAnonymization(serviceId: String!, enabled: Boolean!): ServiceConfig!

    """Reset a service configuration to secure defaults"""
    resetServiceConfig(serviceId: String!): ServiceConfig!
  }
`;
