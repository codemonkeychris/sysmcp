# Technical Implementation Plan: EventLog MCP (Read-Only)

**Feature Number**: 002  
**Feature Title**: EventLog MCP (Read-Only)  
**Document Version**: 1.0  
**Created**: 2026-02-02  
**Status**: Ready for Implementation  

---

## Executive Summary

This document provides the technical implementation plan for Feature 002: EventLog MCP (Read-Only), which enables querying Windows Event Logs through a GraphQL interface with privacy-preserving PII anonymization. Building on the MCP Host Bootstrap infrastructure (Feature 001), this feature provides end users and system administrators programmatic access to system events through flexible filtering, cursor-based pagination, and consistent PII anonymization.

The implementation focuses on Windows EventLog API integration via node-ffi or PowerShell, a modular architecture for reusable components (query provider, PII engine, metrics collector), and comprehensive test coverage (>80%) including security-focused anonymization tests.

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SysMCP MCP Host Service                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  GraphQL Layer                           │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Query: eventLogs(limit, offset, filters, ...)     │  │  │
│  │  │  Returns: EventLogResult with pagination & metrics │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              EventLog Query Provider                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ • Query Windows EventLog API                       │  │  │
│  │  │ • Apply filters (time, level, source, message)    │  │  │
│  │  │ • Handle pagination (offset/limit)                │  │  │
│  │  │ • Graceful error handling                         │  │  │
│  │  │ • Per-query metrics collection                    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PII Anonymization Engine                    │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ • Username masking (domain\[ANON_USER_N])         │  │  │
│  │  │ • Computer name masking ([ANON_COMPUTER_N])       │  │  │
│  │  │ • IP address masking ([ANON_IP_N])                │  │  │
│  │  │ • Message content scanning & anonymization       │  │  │
│  │  │ • Consistent hashing (same PII → same anon ID)   │  │  │
│  │  │ • Anonymization mapping persistence               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↓                                     │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │         EventLog Data Models & Type System               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ • EventLogEntry (id, timestamp, level, source, .. │  │  │
│  │  │ • EventLogResult (entries, pageInfo, totalCount)  │  │  │
│  │  │ • PageInfo (hasNext, hasPrev, cursors)            │  │  │
│  │  │ • QueryMetrics (count, responseTime, returned)    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           ↓
        Windows EventLog API (via node-ffi or PowerShell)
```

### Data Flow

**EventLog Query Flow**:
```
1. GraphQL Query Received
   ├─ Validate input parameters (limit, offset, filters, date ranges)
   ├─ Check service is enabled
   └─ Measure start time
           ↓
2. Query Windows EventLog API
   ├─ Select event log (System, Application, Security, etc.)
   ├─ Build filter expression (time range, severity, source, message)
   ├─ Execute query with pagination offset/limit
   └─ Handle permission denied gracefully
           ↓
3. Process Results
   ├─ Collect raw events
   ├─ Apply PII anonymization to each event
   ├─ Calculate pagination metadata (hasNext, cursors)
   └─ Calculate metrics (count, response time)
           ↓
4. Return GraphQL Response
   ├─ EventLogResult with anonymized entries
   ├─ PageInfo with pagination controls
   ├─ TotalCount (if available)
   └─ QueryMetrics in response metadata
           ↓
5. Persist State
   ├─ Store anonymization mapping (for consistency)
   ├─ Append metrics to metrics buffer
   └─ Log query for audit trail
```

---

## Components to Create/Modify

### 1. EventLog Query Provider (`/src/services/eventlog/provider.ts`)

**Responsibility**: Query Windows EventLog API and return raw event data

**Key Features**:
- Query Windows EventLog using node-ffi or PowerShell (TBD in research phase)
- Support multiple event logs (System, Application, Security, custom)
- Apply API-level filtering (time range, severity, source) for efficiency
- Pagination support via offset/limit
- Graceful error handling (permission denied, log not found, service unavailable)
- Per-query metrics collection (start time, end time, result count)

**Interface**:
```typescript
interface EventLogQuery {
  logName?: string;        // Default: "System"
  minLevel?: EventLevel;   // Default: INFO
  source?: string;         // Exact match on event source
  startTime?: Date;        // Inclusive time range
  endTime?: Date;
  messageContains?: string;// Case-insensitive substring
  offset: number;          // Default: 0
  limit: number;           // Default: 1000, max: 1000
}

interface RawEventLogEntry {
  id: string;
  timestamp: Date;
  level: EventLevel;
  source: string;
  eventId: number;
  username: string;        // Raw, before anonymization
  computername: string;    // Raw, before anonymization
  message: string;         // Raw, before anonymization
}

interface EventLogProviderResult {
  entries: RawEventLogEntry[];
  totalCount: number;       // Total matching events (if available)
  hasMore: boolean;         // Whether more results exist beyond this page
  metrics: {
    queryStartTime: number;
    queryEndTime: number;
    responseDurationMs: number;
    entriesReturned: number;
  };
}

class EventLogProvider {
  query(params: EventLogQuery): Promise<EventLogProviderResult>;
}
```

**Windows API Integration Research**:
- **Option A: PowerShell CLI**: Run `Get-EventLog` or `Get-WinEvent` via child process
  - Pros: No native bindings, easy to test, Windows-native
  - Cons: Slower (process spawn overhead), harder to paginate efficiently
- **Option B: node-ffi**: Call Windows EventLog C API directly
  - Pros: Fast, fine-grained control, better pagination
  - Cons: Requires native bindings, platform-specific, harder to test
- **Option C: win32-eventlog npm package** (if available)
  - Pros: Pre-built, maintained, easy to use
  - Cons: Dependency on third-party package
- **Recommendation for MVP**: Start with PowerShell (simpler, testable), migrate to node-ffi if performance issues

**Error Handling Strategy**:
- Permission denied on specific log → Log warning, return partial results or empty array
- Log not found → Return empty results
- Windows API service unavailable → Return GraphQL error with generic message
- Filter syntax error → Validate parameters before API call, return GraphQL error

### 2. PII Anonymization Engine (`/src/services/eventlog/anonymizer.ts`)

**Responsibility**: Consistently anonymize PII in event log data

**Key Features**:
- Consistent hashing: same PII token always maps to same anonymization ID
- Support for username, computer name, IP addresses (IPv4/IPv6), message content
- Anonymization mapping persistence (store token→ID mapping)
- Optional anonymization (configurable via service permission level)
- Support for different masking strategies (full redaction, partial mask, anonymization)

**Interface**:
```typescript
interface AnonymizedEventLogEntry {
  id: string;
  timestamp: Date;
  level: EventLevel;
  source: string;
  eventId: number;
  username: string;        // "domain\[ANON_USER_123]" or "DOMAIN\[ANON_USER_123]"
  computername: string;    // "[ANON_COMPUTER_42]"
  message: string;         // "[ANON_USER_123] performed action on [ANON_IP_99]"
}

interface AnonymizationMapping {
  // Map of original_value -> anonymized_value for consistency
  usernames: Map<string, string>;
  computers: Map<string, string>;
  ipAddresses: Map<string, string>;
}

class PiiAnonymizer {
  // Initialize with optional persisted mapping
  constructor(persistedMapping?: AnonymizationMapping);

  // Anonymize a single entry
  anonymizeEntry(entry: RawEventLogEntry): AnonymizedEventLogEntry;

  // Get current mapping (for persistence)
  getMapping(): AnonymizationMapping;

  // Persist mapping to storage
  persistMapping(): Promise<void>;
}
```

**PII Patterns**:
1. **Usernames**: `DOMAIN\username`, `username@domain`, `username` → `domain\[ANON_USER_N]`
2. **Computer Names**: Hostname patterns → `[ANON_COMPUTER_N]`
3. **IPv4 Addresses**: `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` → `[ANON_IP_N]`
4. **IPv6 Addresses**: IPv6 patterns → `[ANON_IP_N]`
5. **Email Addresses** (in message): `\w+@\w+\.\w+` → `[ANON_EMAIL_N]`
6. **URLs/Paths** (user profile): `C:\Users\[name]` → `C:\Users\[ANON_USER_N]`

**Anonymization Mapping Persistence**:
- Store mapping in-memory during service lifetime
- Optionally persist to JSON file or SQLite on shutdown/periodically
- Load persisted mapping on startup for consistency across restarts
- Design: "consistent hashing" approach - hash of original PII value determines anon ID
  - Example: hash("DOMAIN\jdoe") % 10000 = 1234 → [ANON_USER_1234]
  - Allows service to be stateless if needed (recreate same mappings from seed)

### 3. GraphQL Schema Extensions (`/src/graphql/schema.ts`)

**Add to existing schema**:
```typescript
const typeDefs = `#graphql
  enum EventLevel {
    ERROR
    WARNING
    INFO
    VERBOSE
    DEBUG
  }

  type EventLogEntry {
    id: String!
    timestamp: String!        # ISO 8601 datetime
    level: EventLevel!
    source: String!
    eventId: Int!
    username: String!         # Anonymized
    computername: String!     # Anonymized
    message: String!          # Anonymized
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type EventLogQueryMetrics {
    queryCount: Int!           # Total queries in this session
    responseDurationMs: Int!   # Time to execute this query
    resultsReturned: Int!      # Number of results in this page
  }

  type EventLogResult {
    entries: [EventLogEntry!]!
    pageInfo: PageInfo!
    totalCount: Int
    metrics: EventLogQueryMetrics!
  }

  type Query {
    eventLogs(
      limit: Int = 1000          # Max 1000
      offset: Int = 0            # For offset-based pagination
      logName: String            # e.g., "System", "Application", "Security"
      minLevel: EventLevel       # Minimum severity level
      source: String             # Event source (exact match)
      startTime: String          # ISO 8601 datetime (inclusive)
      endTime: String            # ISO 8601 datetime (inclusive)
      messageContains: String    # Case-insensitive substring search
    ): EventLogResult!
  }
`;
```

### 4. GraphQL Resolvers (`/src/graphql/resolvers.ts`)

**Add eventLogs resolver**:

```typescript
const resolvers = {
  Query: {
    eventLogs: async (
      _parent,
      args: {
        limit?: number;
        offset?: number;
        logName?: string;
        minLevel?: string;
        source?: string;
        startTime?: string;
        endTime?: string;
        messageContains?: string;
      },
      context: ResolverContext
    ): Promise<EventLogResult> => {
      // 1. Validate input
      // 2. Check if EventLog service is enabled
      // 3. Call EventLogProvider.query()
      // 4. Apply PII anonymization
      // 5. Calculate pagination metadata
      // 6. Collect metrics
      // 7. Return EventLogResult
      // 8. Log to audit trail
    }
  }
};
```

**Error Handling in Resolver**:
- Invalid limit/offset → GraphQL error with clear message
- Invalid date range → GraphQL error
- Service disabled → GraphQL error (permission denied)
- Windows API error → Log internally, return generic GraphQL error
- PII anonymization error → Log and return error (critical path)

### 5. Data Models (`/src/services/eventlog/types.ts`)

**New file**: Centralized type definitions for EventLog service

```typescript
export enum EventLevel {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO',
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG',
}

export interface EventLogEntry {
  id: string;
  timestamp: Date;
  level: EventLevel;
  source: string;
  eventId: number;
  username: string;
  computername: string;
  message: string;
}

export interface EventLogQueryParams {
  logName?: string;
  minLevel?: EventLevel;
  source?: string;
  startTime?: Date;
  endTime?: Date;
  messageContains?: string;
  offset: number;
  limit: number;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface EventLogQueryMetrics {
  queryCount: number;
  responseDurationMs: number;
  resultsReturned: number;
}

export interface EventLogResult {
  entries: EventLogEntry[];
  pageInfo: PageInfo;
  totalCount?: number;
  metrics: EventLogQueryMetrics;
}
```

### 6. Metrics Collector (`/src/services/eventlog/metrics.ts`)

**Responsibility**: Track and persist query metrics

**Features**:
- Per-query metrics: start time, duration, result count
- Batch metrics: accumulate metrics in-memory, persist periodically
- Expose metrics via GraphQL query (for monitoring)

**Interface**:
```typescript
interface QueryMetric {
  timestamp: Date;
  queryDurationMs: number;
  resultsReturned: number;
  logName: string;
  hasError: boolean;
  errorType?: string;
}

class MetricsCollector {
  recordQuery(metric: QueryMetric): void;
  getMetricsSummary(timeWindowMs?: number): MetricsSummary;
  persistMetrics(): Promise<void>;
}

interface MetricsSummary {
  totalQueries: number;
  averageResponseTimeMs: number;
  totalResultsReturned: number;
  errorCount: number;
  errorRate: number; // 0.0-1.0
}
```

### 7. Configuration & Service Registry Integration

**Extend existing service registry** to track EventLog service state:

```typescript
interface ServiceState {
  name: 'eventlog';
  enabled: boolean;        // Hardcoded true for MVP
  permissionLevel: 'read-only-pii-locked' | 'read-only-pii-exposed';
  errorCount: number;
  lastError?: string;
  lastErrorTime?: Date;
}
```

**Update `/src/index.ts`** to initialize EventLog service on startup:
```typescript
// In initializeApp()
const eventlogService = new EventLogService(logger, config);
registry.register('eventlog', eventlogService);
```

---

## Data Flow Diagrams

### Query Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. GraphQL Query Received                                   │
│    eventLogs(limit: 100, offset: 0, minLevel: ERROR)       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Resolver Validation                                      │
│    ✓ limit between 1-1000                                  │
│    ✓ offset >= 0                                           │
│    ✓ startTime <= endTime                                  │
│    ✓ service is enabled                                    │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. EventLog Provider                                        │
│    - Query Windows EventLog API                            │
│    - Apply API-level filters                               │
│    - Handle pagination (offset=0, limit=100)               │
│    - Return 100 raw events + totalCount + hasMore          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. PII Anonymization                                        │
│    for each entry:                                          │
│    - Anonymize username field                              │
│    - Anonymize computername field                          │
│    - Scan and anonymize message field                      │
│    - Update anonymization mapping                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Pagination Metadata                                      │
│    - Calculate hasNextPage (100 < totalCount?)              │
│    - Calculate hasPreviousPage (offset > 0?)                │
│    - Generate cursors (base64 encoded offset?)              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Metrics Collection                                       │
│    - Record query count                                     │
│    - Calculate response duration                            │
│    - Record results returned                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Return EventLogResult                                    │
│    {                                                        │
│      entries: [100 anonymized entries],                     │
│      pageInfo: {                                            │
│        hasNextPage: true,                                   │
│        hasPreviousPage: false,                              │
│        startCursor: "MA==",  # base64(0)                    │
│        endCursor: "OTk="     # base64(99)                   │
│      },                                                     │
│      totalCount: 50000,                                     │
│      metrics: { queryCount: 1, responseDurationMs: 42, ... }│
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
```

### PII Anonymization Flow (Per-Entry)

```
┌──────────────────────────────────────────────────────────────────┐
│ Input: RawEventLogEntry                                          │
│ {                                                                │
│   username: "CONTOSO\jdoe",                                      │
│   computername: "WORKSTATION-123",                               │
│   message: "User jdoe logged in from IP 192.168.1.100"           │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 1: Anonymize Username Field                                 │
│ - Check if "CONTOSO\jdoe" in mapping                             │
│   - No → hash("CONTOSO\jdoe") % 10000 = 1234 → store mapping    │
│ - Replace: "CONTOSO\jdoe" → "CONTOSO\[ANON_USER_1234]"          │
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 2: Anonymize Computer Name Field                            │
│ - Check if "WORKSTATION-123" in mapping                          │
│   - No → hash("WORKSTATION-123") % 10000 = 5678 → store mapping │
│ - Replace: "WORKSTATION-123" → "[ANON_COMPUTER_5678]"           │
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ Step 3: Anonymize Message Content                                │
│ - Scan for patterns: username, IP, email, etc.                   │
│ - Find "jdoe" in message → lookup in mapping → "ANON_USER_1234" │
│ - Find "192.168.1.100" → check mapping → "ANON_IP_9999"         │
│ - Replace: "User [ANON_USER_1234] logged in from [ANON_IP_9999]"│
└──────────────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ Output: AnonymizedEventLogEntry                                  │
│ {                                                                │
│   username: "CONTOSO\[ANON_USER_1234]",                          │
│   computername: "[ANON_COMPUTER_5678]",                          │
│   message: "User [ANON_USER_1234] logged in from [ANON_IP_9999]"│
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Sequence & Critical Path

### Phase 1: Foundation (Weeks 1-2)

**Tasks**:
1. Research Windows EventLog API options (PowerShell vs node-ffi)
   - Create proof-of-concept with each approach
   - Measure performance: query time, pagination efficiency
   - Test permission denied gracefully
   - **Milestone**: Decide on API approach, document trade-offs

2. Create EventLog service scaffolding
   - `/src/services/eventlog/provider.ts` (skeleton)
   - `/src/services/eventlog/types.ts` (all interfaces)
   - `/src/services/eventlog/anonymizer.ts` (skeleton)
   - `/src/services/eventlog/metrics.ts` (skeleton)
   - `/__tests__/services/eventlog/` (test directory)
   - **Milestone**: All files exist with proper imports

3. Implement EventLog Provider (raw query)
   - Query System event log
   - Apply filters (time range, severity, source)
   - Handle pagination (offset/limit)
   - Graceful error handling
   - **Milestone**: Can query EventLog and return raw events, unit tests pass

### Phase 2: PII Anonymization (Weeks 2-3)

**Tasks**:
1. Implement PII Anonymization Engine
   - Username pattern matching and masking
   - Computer name masking
   - IP address (IPv4/IPv6) masking
   - Message content scanning
   - Consistent hashing for anonymization IDs
   - Anonymization mapping persistence
   - **Milestone**: Can anonymize events with consistent hashing, security tests pass

2. Integration testing
   - Raw query → anonymization → result verification
   - Consistency: same PII → same anon ID across queries
   - **Milestone**: Integration tests pass

### Phase 3: GraphQL Integration (Weeks 3-4)

**Tasks**:
1. Extend GraphQL schema
   - Add EventLogEntry, EventLogResult, PageInfo types
   - Add eventLogs query with all parameters
   - Add EventLogQueryMetrics type

2. Implement resolver
   - Parse and validate query parameters
   - Call EventLogProvider
   - Apply anonymization
   - Calculate pagination metadata
   - Collect metrics
   - Return GraphQL result

3. Error handling in resolver
   - Input validation errors
   - Service disabled errors
   - API errors (permission denied, etc.)
   - **Milestone**: GraphQL queries work end-to-end

### Phase 4: Metrics & Configuration (Weeks 4)

**Tasks**:
1. Implement metrics collector
   - Per-query metrics collection
   - Metrics summary calculation
   - Optional persistence to file

2. Service registration & configuration
   - Register EventLog service with registry
   - Configuration: hardcoded enabled for MVP
   - **Milestone**: Service properly integrated with registry

### Phase 5: Testing & Documentation (Weeks 4-5)

**Tasks**:
1. Unit tests (>80% coverage)
   - EventLogProvider: query, filtering, pagination, error handling
   - PiiAnonymizer: all PII pattern types, consistency
   - Resolver: parameter validation, error cases, metrics

2. Integration tests
   - GraphQL query → database → result
   - Multiple queries with anonymization consistency
   - Permission denied graceful handling

3. Security tests
   - PII anonymization completeness (no PII leaks)
   - Consistency verification (same PII → same anon ID)
   - Message content scanning edge cases

4. Performance tests
   - Large result sets (10K+ events)
   - Response time < 100ms
   - Memory usage acceptable

5. Documentation
   - Code documentation (inline comments, docstrings)
   - GraphQL schema documentation
   - Configuration guide
   - Known limitations and trade-offs

---

## Windows EventLog API Research & Decision

### Option A: PowerShell Get-EventLog / Get-WinEvent

**Approach**: Spawn PowerShell process, execute cmdlet, parse JSON output

```typescript
// Example
const result = await execSync(
  `powershell -Command "Get-EventLog -LogName System -Newest 1000 | ConvertTo-Json"`
);
const entries = JSON.parse(result);
```

**Pros**:
- No native dependencies required
- Integrates with Windows security (runs as current user)
- Easy to test (can mock PowerShell output)
- Well-documented cmdlets

**Cons**:
- Overhead: process spawn (~100-200ms per query)
- Harder to implement pagination efficiently (fetch all, then slice)
- Less control over query optimization

**Recommended for MVP**: ✅ Yes

---

### Option B: node-ffi (Direct Windows API)

**Approach**: Call Windows EventLog C API directly via FFI

```typescript
// Example pseudocode
const lib = ffi.Library('wevtapi.dll', {
  EvtOpenLog: ['pointer', ['pointer', 'string', 'uint']],
  EvtQuery: ['pointer', ['pointer', 'string', 'string', 'uint']],
  // ... more API functions
});
```

**Pros**:
- Fast: no process overhead
- Fine-grained control over queries
- Better pagination support (get results lazily)
- Can filter at API level

**Cons**:
- Requires native bindings (build complexity)
- Platform-specific (Windows only)
- Harder to test
- More error-prone

**Recommended for MVP**: ❌ No (post-MVP optimization)

---

### Option C: Third-Party npm Package

**Search**: Look for packages like `win32-eventlog` or similar

**Decision**: Evaluate at research phase; if good package exists, may be better than PowerShell

---

## API Design & Backward Compatibility

### GraphQL Query Examples

**Example 1: Recent errors**
```graphql
query {
  eventLogs(
    logName: "System"
    minLevel: ERROR
    limit: 100
  ) {
    entries { id timestamp level source message }
    pageInfo { hasNextPage endCursor }
    totalCount
    metrics { responseDurationMs resultsReturned }
  }
}
```

**Example 2: Time range with pagination**
```graphql
query {
  eventLogs(
    logName: "Application"
    startTime: "2026-02-01T00:00:00Z"
    endTime: "2026-02-02T00:00:00Z"
    limit: 50
    offset: 100
  ) {
    entries { ... }
    pageInfo { ... }
    totalCount
  }
}
```

**Example 3: Message search**
```graphql
query {
  eventLogs(
    messageContains: "error code 0x80070005"
    minLevel: WARNING
    limit: 1000
  ) {
    entries { ... }
    pageInfo { ... }
  }
}
```

### Backward Compatibility

- Feature 001 (MCP Host Bootstrap) provides GraphQL schema foundation
- EventLog feature adds to existing schema (no breaking changes)
- Future features (FileSearch, Registry) will follow similar patterns

---

## Security Considerations

### 1. Input Validation

**Requirements**:
- Validate `limit`: 1 ≤ limit ≤ 1000
- Validate `offset`: offset ≥ 0
- Validate `startTime` ≤ `endTime`
- Validate `logName`: whitelist of known logs
- Validate `minLevel`: valid EventLevel enum
- Escape/sanitize `messageContains` if used in API filter

**Implementation**:
```typescript
// In resolver
if (!isValidLimit(limit)) throw new GraphQLError('Invalid limit');
if (startTime && endTime && startTime > endTime) {
  throw new GraphQLError('startTime must be <= endTime');
}
```

### 2. PII Protection

**Requirements**:
- No raw usernames/computer names/IPs in responses
- All PII anonymized before returning to client
- Anonymization mapping stored securely (encrypted at rest)
- Audit trail of PII access (logged separately)

**Implementation**:
- Mandatory anonymization in all code paths
- PII patterns: regex patterns for username, IP, email, file path
- Consistency testing: same PII → same anon ID
- Mapping storage: encrypted JSON or database

### 3. Access Control

**Requirements**:
- Read-only: no modifications
- Permission level check: enabled/disabled state
- Future: per-user permissions (out of scope for MVP)

**Implementation**:
```typescript
// In resolver
if (!context.services.eventlog.enabled) {
  throw new GraphQLError('EventLog service is disabled');
}
```

### 4. Error Messages

**Requirements**:
- Never expose Windows API error details to client
- Log full errors internally for debugging
- Return generic error messages to GraphQL caller

**Implementation**:
```typescript
try {
  // Query Windows API
} catch (error) {
  logger.error('Windows API error', { error: error.message });
  throw new GraphQLError('Failed to query event logs'); // Generic
}
```

### 5. Privilege Issues

**Requirement**: Gracefully handle permission denied on specific logs

**Implementation**:
- Try to open each log
- If permission denied: log warning, continue with other logs
- Return partial results (accessible logs) or empty results
- Don't crash the entire query

---

## Testing Strategy

### Unit Tests (>80% coverage)

**EventLogProvider Tests** (`/tests/unit/services/eventlog/provider.test.ts`):
- ✅ Query System log successfully
- ✅ Apply time range filter
- ✅ Apply severity filter (minLevel)
- ✅ Apply source filter
- ✅ Apply message content filter
- ✅ Pagination: offset and limit work correctly
- ✅ Permission denied on specific log (graceful)
- ✅ Event log not found (graceful)
- ✅ Windows API service unavailable
- ✅ Metrics collected per query

**PiiAnonymizer Tests** (`/tests/unit/services/eventlog/anonymizer.test.ts`):
- ✅ Username masking: domain\username → domain\[ANON_USER_N]
- ✅ Computer name masking: hostname → [ANON_COMPUTER_N]
- ✅ IPv4 address masking: 192.168.1.1 → [ANON_IP_N]
- ✅ IPv6 address masking: ::1 → [ANON_IP_N]
- ✅ Email masking in message content
- ✅ URL/file path masking
- ✅ Consistency: same PII → same anon ID
- ✅ Mapping persistence and reload
- ✅ Edge cases: null values, empty strings, already-anonymized content
- ✅ Performance: anonymize 10K entries in <100ms

**Resolver Tests** (`/tests/unit/graphql/resolvers.eventlog.test.ts`):
- ✅ Valid query parameters accepted
- ✅ Invalid limit rejected (0, 1001)
- ✅ Invalid offset rejected (-1)
- ✅ Invalid date range rejected (startTime > endTime)
- ✅ Service disabled returns error
- ✅ Metrics included in response

### Integration Tests (`/tests/integration/`)

**GraphQL Query Flow**:
- ✅ Full query: query → provider → anonymization → result
- ✅ Multiple queries: consistency across queries
- ✅ Large result sets: pagination works end-to-end
- ✅ Error scenarios: permission denied, log not found

### Security Tests (`/tests/security/`)

**PII Leakage Tests**:
- ✅ No unmasked usernames in response
- ✅ No unmasked computer names in response
- ✅ No unmasked IP addresses in response
- ✅ Message content PII completely anonymized
- ✅ Consistency: same user appears with same anon ID across results

### Performance Tests (`/tests/performance/`)

**Response Time**:
- ✅ Small query (100 events): <50ms
- ✅ Medium query (1000 events): <100ms
- ✅ Large query (10K events): <200ms

**Memory Usage**:
- ✅ 1000 event results: <50MB
- ✅ 10K event results: <100MB

### Test Structure

```
/tests
├── unit
│   ├── services
│   │   └── eventlog
│   │       ├── provider.test.ts
│   │       └── anonymizer.test.ts
│   └── graphql
│       └── resolvers.eventlog.test.ts
├── integration
│   └── eventlog-query-flow.test.ts
├── security
│   ├── pii-anonymization.test.ts
│   └── pii-consistency.test.ts
└── performance
    ├── query-response-time.test.ts
    └── memory-usage.test.ts
```

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Windows EventLog API slow or inefficient | Query response time > 100ms | High | Research PowerShell vs node-ffi performance; implement efficient filtering at API level |
| PII patterns incomplete (miss some PII) | Privacy breach | Medium | Comprehensive PII pattern testing; security audit before release |
| Anonymization inconsistent across restarts | Breaks analytics | Medium | Persist anonymization mapping to disk; test reload on startup |
| Permission denied crashes query | Service outage | Medium | Graceful error handling; return partial results |
| Memory usage unbounded for large result sets | Crash/DoS | Medium | Implement pagination; cap result size; test with 10K+ events |
| Large event log queries slow down system | Performance degradation | Low | Implement pagination; offload to background process if needed |

---

## Dependencies

### New npm Packages (to evaluate)

1. **Windows EventLog Access** (one of):
   - PowerShell (built-in, no package)
   - `node-ffi` (native bindings)
   - `win32-eventlog` (if available)

2. **Existing (from Feature 001)**:
   - `express`
   - `apollo-server-express` / `graphql`
   - `pino` (logging)
   - `typescript`

### No Breaking Changes to Feature 001

- GraphQL schema extended (backward compatible)
- Express server unchanged
- Logger integration existing
- Service registry integration (follow existing pattern)

---

## Open Questions & Decision Points

### Q1: Anonymization Mapping Persistence Strategy

**Decision Needed**: How to persist anonymization mapping?

**Options**:
- A. **JSON File** (simple, human-readable)
  - Store at `./data/anonymization-mapping.json`
  - Load on startup, save on shutdown
  - Size: ~1KB per 1K unique tokens (acceptable)
  
- B. **SQLite Database** (more robust)
  - Store in `./data/sysmcp.db` table `anonymization_tokens`
  - Load on startup, persist after each query
  - Size: negligible
  
- C. **In-Memory Only** (no persistence)
  - Reset mapping on restart (breaks consistency across restarts)
  - Not recommended

**Recommendation**: Option A (JSON file) for MVP, migrate to SQLite if needed

### Q2: Windows API Approach

**Decision Needed**: PowerShell vs node-ffi?

**Recommendation**: Start with PowerShell for MVP (simpler, testable), migrate to node-ffi if performance is issue

### Q3: Message Content Filtering

**Decision Needed**: Should `messageContains` be case-sensitive or case-insensitive?

**Recommendation**: Case-insensitive (more user-friendly)

### Q4: Permission Denied Handling

**Decision Needed**: For logs that are inaccessible (Security log without elevated privileges):
- A. Return empty results (silent)
- B. Return error (fail the query)
- C. Return partial results with warning

**Recommendation**: Option A (silent) for MVP - return empty results for inaccessible logs, continue with accessible logs

### Q5: Metric Storage

**Decision Needed**: Where to store query metrics?

**Options**:
- In-memory only (lost on restart)
- JSON file (appended, grows unbounded)
- SQLite table (queryable, manageable)

**Recommendation**: In-memory accumulation, optional SQLite persistence for future

---

## Success Metrics & Acceptance Criteria

### SC-1: GraphQL Interface Complete
- [ ] `eventLogs` query implemented with all parameters
- [ ] All parameters validated
- [ ] Query returns EventLogResult with entries, pageInfo, totalCount, metrics

### SC-2: EventLog Provider
- [ ] Can query System, Application, and Security logs
- [ ] Filtering works: time range, severity, source, message
- [ ] Pagination works: offset/limit
- [ ] Handles permission denied gracefully
- [ ] Performance: <100ms for typical queries

### SC-3: PII Anonymization
- [ ] Username field anonymized consistently
- [ ] Computer name field anonymized consistently
- [ ] IP addresses in message anonymized
- [ ] Email addresses in message anonymized
- [ ] Same PII → same anon ID across queries
- [ ] Mapping persists across restarts

### SC-4: Test Coverage >80%
- [ ] Unit tests: EventLogProvider, PiiAnonymizer, Resolver
- [ ] Integration tests: Full query flow
- [ ] Security tests: PII anonymization completeness
- [ ] Performance tests: Response time, memory usage
- [ ] All tests pass; coverage report > 80%

### SC-5: Error Handling
- [ ] Invalid input parameters rejected with clear errors
- [ ] Service disabled returns error
- [ ] Windows API errors handled gracefully
- [ ] No unhandled exceptions propagate to GraphQL client
- [ ] All errors logged internally

### SC-6: Documentation
- [ ] Code documented with comments on non-obvious logic
- [ ] GraphQL schema documented in schema.ts
- [ ] Configuration documented
- [ ] Known limitations documented

### SC-7: Integration with Feature 001
- [ ] Service registered in service registry
- [ ] Works with existing GraphQL server (Apollo)
- [ ] Follows existing code patterns and conventions
- [ ] Integrates with existing logger

---

## Rollout Strategy

### MVP Release
1. Implement feature following plan
2. Achieve >80% test coverage
3. Manual testing on Windows 10/11
4. Merge to main branch
5. Release as v0.2.0

### Post-MVP Optimizations
- Migrate to node-ffi if PowerShell performance insufficient
- Add more Windows event logs support
- Implement advanced filtering (regex patterns)
- Add metrics query endpoint
- Implement configuration UI integration

---

## Next Steps

1. **Approve technical plan** with stakeholder review
2. **Run feature-tasks skill** to break into implementation tasks
3. **Allocate resources** and assign developer
4. **Begin Phase 1** (Windows EventLog API research)
5. **Track progress** in `/features/002-eventlog-mcp/status.md`

---

## Document Metadata

- **Plan Version**: 1.0
- **Created**: 2026-02-02
- **Status**: Ready for Implementation
- **Owner**: Development Team
- **Related Documents**:
  - Specification: `/features/002-eventlog-mcp.spec.md`
  - Tasks: `/features/002-eventlog-mcp.tasks.md` (to be created)
  - Feature 001: `/features/001-mcp-host-bootstrap.plan.md`
  - Project Plan: `/features/plan.md`
- **Key Milestones**:
  - Week 2: Windows API research complete, EventLog provider functional
  - Week 3: PII anonymization complete and tested
  - Week 4: GraphQL integration complete
  - Week 5: >80% test coverage achieved, documentation complete
