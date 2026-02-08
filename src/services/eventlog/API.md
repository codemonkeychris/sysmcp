# EventLog Service API Documentation

## Overview

The EventLog Service provides secure, PII-aware access to Windows Event Logs through the SysMCP system. It supports querying system logs with comprehensive anonymization, permission control, and metrics tracking.

## Quick Start

### Installation

The EventLog service is built into SysMCP. No separate installation required.

### Basic Usage

```graphql
query {
  eventLogs(
    logName: "System"
    limit: 100
  ) {
    success
    entries {
      id
      timestamp
      level
      source
      message
      computerName
      userId
    }
    totalCount
    hasNextPage
    metrics {
      queryCount
      responseDurationMs
      resultsReturned
    }
  }
}
```

## Supported Event Logs

The EventLog service can query the following Windows event logs:

- **System** - Windows system events (startup, shutdown, device drivers, hardware changes)
- **Application** - Application events from installed software
- **Security** - Security-related events (logon, access changes, policy changes) - Requires elevated permissions
- **Microsoft-Windows-PowerShell/Operational** - PowerShell execution events
- **Microsoft-Windows-Sysmon/Operational** - System monitoring events (if Sysmon installed)
- Custom event logs registered on the system

## GraphQL API Reference

### Query: eventLogs

Main endpoint for querying event logs.

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `logName` | String | Yes | - | Name of the event log to query |
| `filters` | EventLogFilters | No | - | Optional filters to narrow results |
| `limit` | Int | No | 1000 | Maximum results to return (max: 10000) |
| `offset` | Int | No | 0 | Results to skip for pagination |
| `sortBy` | String | No | "timestamp" | Field to sort by |
| `sortOrder` | "asc" \| "desc" | No | "desc" | Sort order |

#### EventLogFilters Object

```graphql
input EventLogFilters {
  level: String        # Event level: VERBOSE, INFORMATION, WARNING, ERROR, CRITICAL
  eventId: Int         # Specific event ID to filter by
  providerId: String   # Provider/source to filter by
  startTime: DateTime  # Include events >= this time
  endTime: DateTime    # Include events <= this time
  messageContains: String # Filter by text in message
}
```

#### Response

```graphql
type EventLogQueryResult {
  success: Boolean!           # Whether query succeeded
  entries: [EventLogEntry!]   # Returned events
  totalCount: Int!            # Total matching events (without pagination)
  hasNextPage: Boolean!       # Whether more results available
  nextOffset: Int             # Next offset for pagination if hasNextPage=true
  errorMessage: String        # Error details if success=false
  metrics: QueryMetrics!      # Query performance metrics
}

type EventLogEntry {
  id: Int!                    # Event record ID
  timestamp: DateTime!        # When event occurred
  level: String!              # Event level/severity
  source: String!             # Event source/provider name
  message: String!            # Event details (PII anonymized if enabled)
  computerName: String!       # Computer where event occurred (anonymized if needed)
  userId: String              # User associated with event (anonymized if needed)
  eventId: Int                # Windows event ID
  providerName: String        # Provider name
  logName: String             # Log name
}

type QueryMetrics {
  queryCount: Int!            # Total queries executed so far
  responseDurationMs: Int!    # Time this query took (ms)
  resultsReturned: Int!       # Events in this response
}
```

## TypeScript API Reference

### EventLogProvider Class

High-level provider for EventLog service integration.

```typescript
class EventLogProvider {
  constructor(logger: Logger, config?: EventLogProviderConfig);

  // Lifecycle
  async start(): Promise<void>;
  async stop(): Promise<void>;

  // Query
  async query(options: EventLogQueryOptions): Promise<EventLogProviderResult>;

  // Metrics
  getMetrics(): ProviderMetrics;
  
  // Health check
  async healthcheck(): Promise<boolean>;
}
```

#### Configuration

```typescript
interface EventLogProviderConfig {
  enabled?: boolean;           // Service enabled (default: true)
  maxResults?: number;         // Max results per query (default: 1000, max: 10000)
  timeoutMs?: number;          // Query timeout (default: 30000)
  allowedLogNames?: string[];  // Restrict to these logs (empty = all)
  anonymize?: boolean;         // Enable PII anonymization (default: false)
  mappingFilePath?: string;    // Path to persist anonymization mapping
}
```

#### Query Options

```typescript
interface EventLogQueryOptions {
  logName: string;                    // Log to query
  maxResults?: number;                // Override default max
  level?: string;                     // Filter by level
  eventId?: number;                   // Filter by event ID
  providerId?: string;                // Filter by provider
  startTime?: Date;                   // Filter by time range
  endTime?: Date;
  messageContains?: string;           // Text search
  offset?: number;                    // Pagination offset
}
```

### PiiAnonymizer Class

Handles PII anonymization for EventLog entries.

```typescript
class PiiAnonymizer {
  constructor(persistedMapping?: AnonymizationMapping);

  // Anonymize entry
  anonymizeEntry(entry: RawEventLogEntry): AnonymizedEventLogEntry;

  // Bulk operations
  anonymizeEntries(entries: RawEventLogEntry[]): AnonymizedEventLogEntry[];

  // Mapping persistence
  async persistMapping(filePath: string): Promise<void>;
  static async loadMapping(filePath: string): Promise<AnonymizationMapping>;

  // Access mapping
  getMapping(): AnonymizationMapping;
}
```

### EventLogMetricsCollector Class

Collects and reports query metrics.

```typescript
class EventLogMetricsCollector {
  // Record query
  recordQuery(durationMs: number, resultCount: number, failed?: boolean): void;

  // Retrieve metrics
  getMetrics(): MetricsSnapshot;
  async export(): Promise<MetricsReport>;

  // Reset
  reset(): void;
}
```

#### Metrics Report

```typescript
interface MetricsReport {
  queryCount: number;
  successfulQueries: number;
  failedQueries: number;
  totalExecutionTimeMs: number;
  averageExecutionTimeMs: number;
  minExecutionTimeMs: number;
  maxExecutionTimeMs: number;
  queriesPerSecond: number;
  averageResultsPerQuery: number;
  uptimeMs: number;
  timestamp: string;
}
```

## Configuration Options

### Service-Level Configuration

Access via EventLogConfigManager:

```typescript
interface EventLogConfig {
  enabled: boolean;                   // Service enabled/disabled
  permissionLevel: PermissionLevel;   // read-only | read-write | disabled
  maxResults?: number;                // Query limit
  timeoutMs?: number;                 // Query timeout
  enableAnonymization?: boolean;      // PII anonymization
  logLevel?: LogLevel;                // Logging level
}
```

## Error Codes

### GraphQL Errors

| Code | Message | Cause |
|------|---------|-------|
| `PERMISSION_DENIED` | Operation not allowed | User lacks required permission |
| `SERVICE_DISABLED` | Service is disabled | EventLog service is disabled |
| `INVALID_LOG_NAME` | Invalid or inaccessible log | Log doesn't exist or no access |
| `INVALID_FILTER` | Invalid query filter | Filter syntax or values invalid |
| `QUERY_TIMEOUT` | Query exceeded timeout | Query too slow or system overloaded |
| `QUERY_FAILED` | Query execution failed | System error during query |

### TypeScript Exceptions

| Exception | Cause |
|-----------|-------|
| `PermissionDeniedException` | Operation not allowed at current permission level |
| `ValidationException` | Invalid input parameters |
| `OperationFailedException` | System operation failed |

## Usage Examples

### Example 1: Query System Events for Errors in Last 24 Hours

**GraphQL:**
```graphql
query {
  eventLogs(
    logName: "System"
    filters: {
      level: "ERROR"
      startTime: "2024-01-14T12:00:00Z"
      endTime: "2024-01-15T12:00:00Z"
    }
    limit: 100
  ) {
    entries {
      timestamp
      source
      message
    }
    totalCount
  }
}
```

**TypeScript:**
```typescript
const provider = new EventLogProvider(logger);
await provider.start();

const result = await provider.query({
  logName: 'System',
  level: 'ERROR',
  startTime: new Date(Date.now() - 24*60*60*1000),
  maxResults: 100
});

console.log(`Found ${result.entries.length} errors`);
```

### Example 2: Paginate Through Large Result Set

**GraphQL:**
```graphql
query {
  # First page
  eventLogs(
    logName: "Application"
    limit: 50
    offset: 0
  ) {
    entries { id source message }
    totalCount
    hasNextPage
    nextOffset
  }
}
```

**TypeScript:**
```typescript
let offset = 0;
const pageSize = 50;
let hasMore = true;

while (hasMore) {
  const result = await provider.query({
    logName: 'Application',
    offset,
    maxResults: pageSize
  });

  result.entries.forEach(entry => {
    console.log(entry.message);
  });

  hasMore = result.hasMore;
  offset = result.nextOffset || offset + pageSize;
}
```

### Example 3: Query with PII Anonymization

**Configuration:**
```typescript
const provider = new EventLogProvider(logger, {
  anonymize: true,  // Enable anonymization
  mappingFilePath: '/etc/sysmcp/eventlog-mapping.json'
});
```

**Result:**
```json
{
  "id": 1000,
  "timestamp": "2024-01-15T10:30:00Z",
  "userId": "[ANON_USER_A1B2C3]",
  "computerName": "[ANON_COMPUTER_D4E5F6]",
  "message": "User [ANON_USER_A1B2C3] logged in from [ANON_IP_G7H8I9]"
}
```

The same userId always maps to the same token for correlation across queries.

## Performance Characteristics

### Query Performance

- **Small queries** (<1000 results): 50-150ms typical
- **Medium queries** (1000-5000 results): 200-500ms typical
- **Large queries** (5000-10000 results): 500-2000ms typical
- **Timeout**: Configurable (default 30s)

### Memory Usage

- **Anonymizer** with typical mapping: 5-20MB
- **Provider instance**: 10-30MB
- **Per query**: +1MB per 10,000 results

## Limitations

### System Limitations

- Maximum 10,000 results per query
- Cannot access Security log without admin privileges
- Some logs require specific Windows versions
- PowerShell must be available (for EventLog queries)

### Current MVP Limitations

- Configuration stored in memory (not persisted to disk)
- Anonymization mapping not persisted by default
- No real-time query streaming
- No wildcard searches in event messages
- No custom event properties queryable

### Future Enhancement Areas (Feature 003+)

- Database-backed configuration persistence
- Distributed query across multiple systems
- Real-time event streaming
- Advanced search with operators
- Event log archival and retention

## Security Considerations

### PII Protection

When anonymization is enabled, the following data is masked:
- Usernames and domains
- Email addresses
- IP addresses (IPv4 and IPv6)
- File paths containing user profiles
- Phone numbers
- Social Security numbers
- URLs

### Permission Model

- **read-only**: Users can query logs but not modify
- **read-write**: Users can query and archive logs (future)
- **disabled**: Service not accessible

### Network Security

- Service accessible only from localhost (127.0.0.1)
- All queries require authentication to SysMCP
- Metrics data doesn't contain sensitive information

## Integration Guide

### With GraphQL Server

```typescript
import { eventLogsResolver } from '@/graphql/resolvers';
import { EventLogProvider } from '@/services/eventlog';

// In your GraphQL setup
const provider = new EventLogProvider(logger);
await provider.start();

const context = {
  eventLogProvider: provider,
  eventlogMetricsCollector: metricsCollector
};

// Pass resolver to schema
schema.addResolvers({
  Query: {
    eventLogs: eventLogsResolver
  }
});
```

### With REST API

Create a wrapper endpoint:

```typescript
app.get('/api/eventlogs', async (req, res) => {
  const result = await provider.query({
    logName: req.query.logName,
    maxResults: parseInt(req.query.limit || '1000'),
    offset: parseInt(req.query.offset || '0')
  });
  res.json(result);
});
```

## Troubleshooting

### Query Returns No Results

1. Verify log name is correct: `Get-EventLog -List` in PowerShell
2. Check if you have permission to access the log
3. Verify time filters aren't too restrictive
4. Check if events exist: Open Event Viewer manually

### Service Won't Start

1. Verify PowerShell is available: `where powershell`
2. Check EventLog health: Review system logs in Event Viewer
3. Verify configuration: Check maxResults and timeoutMs values
4. Review logs for detailed error message

### Anonymized Data Inconsistent

1. Ensure mappingFilePath is configured and writable
2. Check mapping file permissions
3. Verify file isn't being modified externally
4. For fresh start, delete mapping file and restart

### Performance Issues

1. Increase timeout if queries are timing out
2. Reduce maxResults for faster queries
3. Add more specific filters to narrow results
4. Consider adding time range filters

## Testing

### Unit Test Execution

```bash
npm test -- src/services/eventlog/__tests__
```

### Coverage Report

```bash
npm test -- src/services/eventlog --coverage
```

Target: >80% coverage for all eventlog code

## Support and Reporting Issues

For bugs or feature requests related to the EventLog service:

1. Check existing [GitHub issues](https://github.com/sysmcp/sysmcp/issues)
2. Include:
   - Windows version
   - Event log name you're querying
   - Specific error message or unexpected behavior
   - Query parameters used
3. Test with simplified query to isolate issue

## Changelog

### Version 0.1.0 (Current)

- Initial MVP release
- Basic event log querying
- PII anonymization support
- GraphQL integration
- Metrics collection
- Configuration management

### Planned Features

- Feature 003: Persistence and configuration UI
- Event log archival and retention management
- Advanced filtering and search operators
- Event log validation and integrity checks
- Integration with security monitoring systems
