# Implementation Tasks: EventLog MCP (Feature 002)

**Feature**: 002-eventlog-mcp  
**Status**: Ready for Implementation  
**Created**: 2026-02-03  
**Git Branch**: feature/002-eventlog-mcp

---

## Overview

This document breaks down the EventLog MCP implementation into executable, ordered tasks across 5 implementation phases. Each task is designed to be completable in 1-2 days with clear acceptance criteria and test requirements.

**Total Tasks**: 28 tasks across 5 phases  
**Estimated Total Effort**: 5-6 weeks (with parallel work on Phases 1-3)  
**Critical Path**: Phase 0 → Phase 1 → Phase 2/3 (parallel) → Phase 4 → Phase 5

---

## Phase 0: Windows EventLog Library (Weeks 1-2) - NEW

The library is built first as a reusable, independent component. Can be tested without SysMCP integration.

### Setup & Research (3 tasks)

#### Task 0.0: EventLog API Research & POC
- **Description**: Research Windows EventLog API options and create working proof-of-concept
- **Acceptance Criteria**:
  - [ ] Evaluate 3+ API options: Windows Event Log API (wevtapi.dll), PowerShell Get-EventLog, EventLogSession
  - [ ] Create POC that queries System event log using selected approach
  - [ ] Document findings in `/src/services/eventlog/README.md`: API choice, trade-offs, limitations
  - [ ] POC returns at least 10 events with correct fields (timestamp, level, source, message)
- **Test Requirements**:
  - [ ] Manual testing on Windows System with various event logs
  - [ ] Verify API works with elevated and non-elevated permissions
  - [ ] Document permission requirements
- **Effort**: M (3 days)
- **Dependencies**: None
- **Notes**: Critical decision point - API choice affects architecture. Consider performance, flexibility, error handling

#### Task 0.1: Set up Windows EventLog Library Project Structure
- **Description**: Create project skeleton and npm package.json for the reusable library
- **Acceptance Criteria**:
  - [ ] Create directory: `/src/services/eventlog/lib/`
  - [ ] Create TypeScript config for library: `tsconfig.json`
  - [ ] Create `package.json` with dependencies (node-ffi if using FFI, TypeScript, testing framework)
  - [ ] Create `src/index.ts` exporting main library class
  - [ ] Create `README.md` documenting library purpose and usage
  - [ ] `npm install` succeeds without warnings
  - [ ] `npm run build` creates `/lib` output directory
- **Test Requirements**:
  - [ ] Build succeeds with no TypeScript errors
  - [ ] Generated `.d.ts` files are correct
- **Effort**: S (1 day)
- **Dependencies**: Task 0.0 (API choice known)

#### Task 0.2: Implement FFI Bindings to wevtapi.dll
- **Description**: Create low-level FFI wrapper around Windows EventLog API
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/lib/wevtapi-bindings.ts`
  - [ ] Implement `WevtApiBindings` class with methods:
    - `evtOpenLog(channelPath: string): Pointer` - opens event log
    - `evtQuery(logHandle: Pointer, query: string): Pointer` - executes XPath query
    - `evtNext(resultSet: Pointer, maxResults: number): Pointer[]` - fetches result batch
    - `evtGetEventInfo(eventHandle: Pointer, infoType: number): any` - extracts event field
    - `evtClose(handle: Pointer): boolean` - closes handles
    - `getErrorMessage(code: number): string` - converts error codes to messages
  - [ ] All functions have JSDoc with parameter and return types
  - [ ] Handle memory management (close handles, free buffers)
  - [ ] Error handling: convert Windows error codes to meaningful exceptions
  - [ ] Support at least 5 event info types: timestamp, level, source, eventId, message
- **Test Requirements**:
  - [ ] Unit tests for each FFI function with mocked wevtapi.dll
  - [ ] Manual test against real System event log (at least 1 event retrieved)
  - [ ] Test error handling (invalid log name, permission denied)
  - [ ] Memory leak test: repeated open/close doesn't leak handles
- **Effort**: M (3 days)
- **Dependencies**: Task 0.1 (project structure)
- **Critical**: Memory safety and error handling are critical; extensive testing required

---

### Query Engine Implementation (3 tasks)

#### Task 0.3: Implement EventLog Query Engine
- **Description**: Build high-level query API on top of FFI bindings
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/lib/eventlog-query-engine.ts`
  - [ ] Implement `EventLogQueryEngine` class:
    - Constructor accepts `WevtApiBindings` instance
    - `async query(options: EventLogQueryOptions): Promise<QueryResult>` - main query method
    - `private buildFilterExpression(filters: any): string` - builds XPath from filters
    - `private extractEventProperties(eventHandle: Pointer): RawEventLogEntry` - extracts fields
    - `close(): void` - cleanup
  - [ ] Support filtering:
    - Time range (startTime, endTime) - handled by XPath
    - Event level (minLevel >= specified) - XPath filtering
    - Event source - XPath filtering
    - Message contains - post-processing filter
    - Event ID - XPath filtering
  - [ ] Support pagination: offset/limit with hasMore flag
  - [ ] All fields correctly mapped to event data:
    - id (unique identifier)
    - timestamp (Date object, UTC)
    - level (ERROR/WARNING/INFO/VERBOSE/DEBUG enum)
    - source
    - eventId
    - username
    - computername
    - message
  - [ ] Timeout handling: query fails after 5000ms
  - [ ] Complete JSDoc for all public methods
- **Test Requirements**:
  - [ ] Unit tests with mocked FFI bindings (8+ test cases)
  - [ ] Integration test: real query against System event log
  - [ ] Test each filter type individually
  - [ ] Test pagination with hasMore flag
  - [ ] Test XPath filter building with 5+ filter combinations
  - [ ] Test error handling: timeout, invalid parameters
  - [ ] Test large result sets (pagination through 10,000+ events)
- **Effort**: M (3 days)
- **Dependencies**: Task 0.2 (FFI bindings)
- **Notes**: Complex filtering logic requires careful testing

#### Task 0.4: Implement PII Anonymization Engine (Core Logic)
- **Description**: Build consistent PII anonymization using hash-based token generation
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/lib/anonymizer.ts`
  - [ ] Implement `PiiAnonymizer` class:
    - Constructor accepts optional persisted mapping
    - `anonymizeEntry(entry: RawEventLogEntry): AnonymizedEventLogEntry`
    - `getMapping(): AnonymizationMapping`
    - `persistMapping(): Promise<void>`
  - [ ] Support anonymization patterns:
    - Username: `DOMAIN\username` → `DOMAIN\[ANON_USER_<hash>]`
    - Computer name: `hostname` → `[ANON_COMPUTER_<hash>]`
    - IPv4: `192.168.1.1` → `[ANON_IP_<hash>]`
    - IPv6: `::1` → `[ANON_IP_<hash>]`
    - Email: `user@domain.com` → `[ANON_EMAIL_<hash>]`
    - Paths: `C:\Users\username\file` → `C:\Users\[ANON_USER_<hash>]\file`
  - [ ] Hash-based consistency: same input always produces same anonymization ID
  - [ ] Support loading persisted mappings from JSON
  - [ ] Mapping stored in-memory as Maps for O(1) lookup
  - [ ] Complete JSDoc for all public methods
- **Test Requirements**:
  - [ ] Unit tests with mock entries (10+ cases covering all PII types)
  - [ ] Consistency test: same input produces same anonymization ID
  - [ ] Test each PII pattern with realistic data samples
  - [ ] Test message content scanning (multiple PII types in one message)
  - [ ] Test edge cases (null values, empty strings, malformed data)
  - [ ] Performance test: anonymize 1,000 entries in <100ms
  - [ ] Persistence test: write mapping, reload, verify consistency
- **Effort**: M (3 days)
- **Dependencies**: Task 0.1 (project structure)
- **Critical Path**: Consistency is critical; anonymization must survive service restarts

#### Task 0.5: Create Public Library API
- **Description**: Bundle query engine and anonymizer into clean, reusable library
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/lib/windows-eventlog-lib.ts`
  - [ ] Implement `WindowsEventLogLibrary` class:
    - Constructor accepts options (maxResults, timeoutMs, allowedLogNames)
    - `async query(query: EventLogQuery): Promise<QueryResult>`
    - `async getAvailableLogNames(): Promise<string[]>`
    - `async getLogMetadata(logName: string): Promise<LogMetadata>`
    - `close(): void`
  - [ ] Export clean interfaces:
    - `WindowsEventLogLibraryOptions`
    - `EventLogQuery` (with filters and pagination)
    - `QueryResult` (entries, totalCount, hasMore)
    - `RawEventLogEntry` (all event fields)
  - [ ] Comprehensive JSDoc with usage examples
  - [ ] Export from `/src/services/eventlog/lib/index.ts`
- **Test Requirements**:
  - [ ] Library can be imported and instantiated
  - [ ] Query method returns properly typed results
  - [ ] End-to-end test: real System log query returns anonymizable events
- **Effort**: S (1 day)
- **Dependencies**: Task 0.3, Task 0.4 (both components)

---

### Library Testing & Polish (2 tasks)

#### Task 0.6: Library Unit Tests (80% Coverage)
- **Description**: Comprehensive unit tests for all library components
- **Acceptance Criteria**:
  - [ ] Test files created in `/src/services/eventlog/lib/__tests__/`
  - [ ] Coverage >80% for all library files
  - [ ] Test suites for:
    - `wevtapi-bindings.test.ts` (FFI functions with mocks)
    - `eventlog-query-engine.test.ts` (filtering, pagination, extraction)
    - `anonymizer.test.ts` (all PII types, consistency, persistence)
    - `windows-eventlog-lib.test.ts` (integration of all components)
  - [ ] All tests passing
  - [ ] Coverage report generated (HTML report in `/coverage`)
- **Test Requirements**:
  - [ ] Unit test structure: describe/test/expect pattern
  - [ ] Mocking: Mock WevtApiBindings for query engine tests
  - [ ] Edge cases: null inputs, empty results, malformed data
  - [ ] Performance baseline: document typical query times
- **Effort**: M (3 days)
- **Dependencies**: Task 0.2, 0.3, 0.4, 0.5 (all library code)

#### Task 0.7: Library Documentation
- **Description**: Complete documentation for the EventLog library
- **Acceptance Criteria**:
  - [ ] Update `/src/services/eventlog/lib/README.md`:
    - Purpose and use cases
    - Installation and initialization
    - API reference (all public classes/methods)
    - Usage examples (basic query, filtering, pagination)
    - Error handling guide
    - Performance characteristics
  - [ ] Create `/src/services/eventlog/lib/ARCHITECTURE.md`:
    - Design decisions (FFI vs PowerShell, hash-based anonymization)
    - Component interaction diagram
    - Data flow through anonymization
    - Memory management strategy
  - [ ] Create `/src/services/eventlog/lib/TESTING.md`:
    - How to run tests
    - Coverage report location
    - Manual testing procedures
  - [ ] JSDoc complete for all public API
- **Effort**: S (1 day)
- **Dependencies**: Task 0.6 (testing complete)

---

## Phase 1: SysMCP Integration (Weeks 2-3)

Integrating the library with SysMCP and implementing GraphQL types.

### Service Provider & Types (2 tasks)

#### Task 1.0: Implement EventLog Service Provider
- **Description**: Integrate Windows EventLog library into SysMCP service architecture
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/provider.ts`
  - [ ] Implement `EventLogProvider` class:
    - Constructor accepts `Logger`, `Config` from SysMCP
    - `async start(): Promise<void>` - initialize library
    - `async stop(): Promise<void>` - cleanup
    - `async healthcheck(): Promise<boolean>` - verify accessibility
    - `async query(params: EventLogQuery): Promise<EventLogProviderResult>` - execute query
  - [ ] Configuration support:
    - Check if EventLog service is enabled (hardcoded true for MVP)
    - Support permission levels (designed for future Config UI)
  - [ ] Logging integration:
    - Log all queries (parameters, result count)
    - Log errors with full details internally
    - Audit trail: timestamp, parameters, results count
  - [ ] Error handling:
    - Service disabled → throw PermissionDeniedException
    - Windows API error → log, throw OperationFailedException
    - Invalid parameters → throw ValidationException
  - [ ] Performance metrics:
    - Measure query execution time
    - Track result count
    - Collect per-query metrics
- **Test Requirements**:
  - [ ] Unit tests with mocked logger and config
  - [ ] Test start/stop lifecycle
  - [ ] Test healthcheck (enabled/disabled)
  - [ ] Test query method (success and error paths)
  - [ ] Test logging output (queries logged correctly)
  - [ ] Performance baseline: typical query <100ms
- **Effort**: M (3 days)
- **Dependencies**: Task 0.5, 0.6 (library complete)

#### Task 1.1: Create EventLog Type Definitions
- **Description**: Define TypeScript interfaces for EventLog service
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/types.ts`
  - [ ] Export enums and interfaces:
    - `enum EventLevel { ERROR, WARNING, INFO, VERBOSE, DEBUG }`
    - `interface EventLogEntry` (id, timestamp, level, source, eventId, username, computername, message)
    - `interface EventLogQueryParams` (logName, minLevel, source, startTime, endTime, messageContains, offset, limit)
    - `interface PageInfo` (hasNextPage, hasPreviousPage, startCursor, endCursor)
    - `interface EventLogQueryMetrics` (queryCount, responseDurationMs, resultsReturned)
    - `interface EventLogResult` (entries, pageInfo, totalCount, metrics)
  - [ ] All interfaces have JSDoc with field descriptions
  - [ ] TypeScript strict mode compatible (no any types)
- **Test Requirements**:
  - [ ] TypeScript compilation succeeds
  - [ ] No unused exports
  - [ ] Enums are correctly defined
- **Effort**: S (1 day)
- **Dependencies**: Task 1.0 (service provider)

---

### GraphQL Integration (2 tasks)

#### Task 1.2: Extend GraphQL Schema for EventLog
- **Description**: Add EventLog types and query to GraphQL schema
- **Acceptance Criteria**:
  - [ ] File modified: `/src/graphql/schema.ts` (or new `/src/graphql/eventlog.schema.ts` if modular)
  - [ ] Add GraphQL type definitions:
    - `enum EventLevel { ERROR WARNING INFO VERBOSE DEBUG }`
    - `type EventLogEntry` (id, timestamp, level, source, eventId, username, computername, message)
    - `type PageInfo` (hasNextPage, hasPreviousPage, startCursor, endCursor)
    - `type EventLogQueryMetrics` (queryCount, responseDurationMs, resultsReturned)
    - `type EventLogResult` (entries, pageInfo, totalCount, metrics)
  - [ ] Add to Query type:
    - `eventLogs(limit, offset, logName, minLevel, source, startTime, endTime, messageContains): EventLogResult!`
    - All parameters have descriptions
    - Defaults documented (limit=1000, offset=0)
  - [ ] Schema validates with Apollo GraphQL tools
  - [ ] Schema can be published to GraphQL playground
- **Test Requirements**:
  - [ ] Schema compilation succeeds
  - [ ] GraphQL schema introspection returns correct types
  - [ ] Test GraphQL schema validation
- **Effort**: S (1 day)
- **Dependencies**: Task 1.1 (type definitions)

#### Task 1.3: Implement eventLogs GraphQL Resolver
- **Description**: Implement resolver for eventLogs query
- **Acceptance Criteria**:
  - [ ] File created: `/src/graphql/resolvers/eventlog.resolver.ts`
  - [ ] Implement resolver:
    ```typescript
    Query: {
      eventLogs: async (parent, args, context) => {
        // 1. Validate input (limit, offset, date ranges)
        // 2. Check service enabled
        // 3. Call EventLogProvider.query()
        // 4. Apply PII anonymization
        // 5. Calculate pagination metadata
        // 6. Collect metrics
        // 7. Return EventLogResult
      }
    }
    ```
  - [ ] Input validation:
    - limit: 1-1000 (default 1000)
    - offset: >=0 (default 0)
    - startTime <= endTime (if both provided)
    - Return GraphQL errors for invalid inputs
  - [ ] Service availability check:
    - Return error if service not enabled
    - Return error with message "EventLog service unavailable"
  - [ ] Error handling:
    - Windows API errors → generic GraphQL error (log details)
    - Permission errors → specific error message
    - Never throw unhandled exceptions
  - [ ] Metrics collection:
    - Start timer at resolver entry
    - Stop timer at response
    - Include metrics in EventLogResult
  - [ ] Audit logging:
    - Log query parameters
    - Log result count
    - Log execution time
- **Test Requirements**:
  - [ ] Unit tests with mocked EventLogProvider (10+ test cases)
  - [ ] Test validation: invalid limit, offset, dates
  - [ ] Test error paths: service disabled, API error
  - [ ] Test metrics: correct timing, result count
  - [ ] Test logging: queries logged
  - [ ] Integration test: real GraphQL query execution
- **Effort**: M (3 days)
- **Dependencies**: Task 1.2 (schema)

---

## Phase 2: PII Anonymization (Weeks 3-4)

Fully integrating anonymization into the resolver and testing thoroughly.

### Anonymization Integration (2 tasks)

#### Task 2.0: Integrate PII Anonymization into Resolver
- **Description**: Apply anonymization to all EventLog entries before returning to caller
- **Acceptance Criteria**:
  - [ ] Modify resolver `/src/graphql/resolvers/eventlog.resolver.ts`:
    - Initialize anonymizer (with persisted mapping if available)
    - For each entry from EventLogProvider:
      - Call `anonymizer.anonymizeEntry(entry)`
      - Verify all fields anonymized
  - [ ] Anonymization applied consistently:
    - Load persisted mapping on startup (if exists)
    - Map new PII tokens as encountered
    - Persist mapping on shutdown/periodically
  - [ ] Anonymization applied to all fields:
    - username (and in message if embedded)
    - computername (and in message)
    - message (scan for IPs, emails, paths)
  - [ ] Verify no PII leaks in GraphQL response
- **Test Requirements**:
  - [ ] Unit test: anonymizer applied to all entries
  - [ ] Integration test: real query returns anonymized fields
  - [ ] Consistency test: repeated queries with same data produce same anon IDs
  - [ ] Test with real event logs (System, Application)
  - [ ] Verify usernames/computers/IPs masked
  - [ ] Verify message content anonymized
- **Effort**: M (3 days)
- **Dependencies**: Task 1.3 (resolver), Task 0.4 (anonymizer)

#### Task 2.1: Implement Anonymization Persistence
- **Description**: Store and load anonymization mappings for consistency across restarts
- **Acceptance Criteria**:
  - [ ] Create file: `/src/services/eventlog/anonymization-store.ts`
  - [ ] Implement storage interface:
    - `async save(mapping: AnonymizationMapping): Promise<void>`
    - `async load(): Promise<AnonymizationMapping>`
  - [ ] Choose storage approach:
    - JSON file: `/data/eventlog-anonymization.json` (simple, human-readable)
    - Or SQLite database in `/data/` directory
  - [ ] Storage location: `/data/eventlog-anonymization.json`
  - [ ] File is not world-readable (permission 0600 on Unix, restricted ACL on Windows)
  - [ ] Atomic writes: use temp file + rename to prevent corruption
  - [ ] Handle missing file gracefully (start fresh)
  - [ ] Handle corrupted file gracefully (log warning, start fresh)
  - [ ] Integrate with service start/stop:
    - Load mapping on EventLogProvider start
    - Save mapping on EventLogProvider stop
    - Option: save periodically (every 100 anonymizations)
- **Test Requirements**:
  - [ ] Unit tests: save and load mapping
  - [ ] Test corrupted file handling
  - [ ] Test missing file handling
  - [ ] Integration test: stop/restart service, verify mapping consistency
  - [ ] Verify file permissions correct
  - [ ] Test atomic writes (no corruption on crash)
- **Effort**: M (3 days)
- **Dependencies**: Task 0.4 (anonymizer), Task 1.0 (provider)

---

### Anonymization Testing (2 tasks)

#### Task 2.2: Security Tests for PII Anonymization
- **Description**: Comprehensive security tests ensuring no PII leaks
- **Acceptance Criteria**:
  - [ ] Test file: `/src/services/eventlog/__tests__/anonymization.security.test.ts`
  - [ ] Test scenarios:
    - All usernames anonymized in response
    - All computer names anonymized in response
    - All IPs (IPv4/IPv6) anonymized in response
    - All emails anonymized in message
    - All paths with user info anonymized
    - Embedded PII in message anonymized
    - PII in structured event data anonymized
  - [ ] Test data includes realistic PII:
    - Usernames: `DOMAIN\username`, `username@domain.com`, `Administrator`
    - Computer names: `MYCOMPUTER`, `SERVER-01`
    - IPs: `192.168.1.1`, `::1`, `2001:db8::1`
    - Emails: `user@company.com`, `admin@domain.local`
    - Paths: `C:\Users\jdoe\file.txt`
  - [ ] Verify no unmasked PII in response (audit)
  - [ ] Test 20+ real-world event logs
- **Test Requirements**:
  - [ ] All tests passing
  - [ ] No false positives (legitimate data not masked)
  - [ ] No false negatives (all PII masked)
  - [ ] Consistency verified (same PII always same mask)
- **Effort**: M (3 days)
- **Dependencies**: Task 2.0, Task 2.1 (anonymization integrated)

#### Task 2.3: Integration Tests for Complete Query Pipeline
- **Description**: End-to-end tests from GraphQL query to anonymized response
- **Acceptance Criteria**:
  - [ ] Test file: `/src/services/eventlog/__tests__/eventlog.integration.test.ts`
  - [ ] Test scenarios:
    - Query System log with no filters → anonymized entries returned
    - Query with time range filter → correct entries returned and anonymized
    - Query with level filter → correct severity events
    - Query with message filter → matching messages anonymized
    - Query with multiple filters → all filters applied
    - Pagination: offset/limit works correctly
    - hasMore flag correct
    - Consistency: same query twice produces same anon IDs
  - [ ] Test with real event logs (System, Application, Security if accessible)
  - [ ] Test error cases:
    - Query with invalid date range
    - Query with inaccessible log
    - Query with invalid parameters
- **Test Requirements**:
  - [ ] All tests passing
  - [ ] Coverage >80% for eventlog service
  - [ ] No unhandled exceptions
  - [ ] Metrics collected correctly
  - [ ] Audit logging working
- **Effort**: M (3 days)
- **Dependencies**: Task 2.0, Task 2.1, Task 2.2 (all security checks)

---

## Phase 3: GraphQL Integration (Weeks 3-4) [PARALLEL with Phase 2]

Schema extensions and resolver improvements.

### Error Handling (1 task)

#### Task 3.0: Enhanced Error Handling in Resolver
- **Description**: Implement comprehensive error handling with clear GraphQL errors
- **Acceptance Criteria**:
  - [ ] Modify resolver: `/src/graphql/resolvers/eventlog.resolver.ts`
  - [ ] Error types handled:
    - Invalid limit (not 1-1000) → GraphQL error: "limit must be between 1 and 1000"
    - Invalid offset (not >=0) → GraphQL error: "offset must be >= 0"
    - Invalid date range (start > end) → GraphQL error: "startTime must be <= endTime"
    - Service disabled → GraphQL error: "EventLog service not available"
    - Windows API error → GraphQL error: "Failed to query event logs" (generic)
    - Anonymization failure → GraphQL error: "Failed to process results" (critical error)
  - [ ] No unhandled exceptions propagate to client
  - [ ] Error logging:
    - Log full details internally (Windows error codes, stack traces)
    - Return generic messages to client (no system details)
  - [ ] Error response format:
    - Include error code (for client to identify issue)
    - Include user-friendly message
    - Include timestamp for debugging
- **Test Requirements**:
  - [ ] Unit tests: each error type produces correct GraphQL error
  - [ ] Test with invalid inputs (boundary cases)
  - [ ] Test error logging (verify details logged)
  - [ ] Integration test: GraphQL query with errors returns valid error response
- **Effort**: M (2 days)
- **Dependencies**: Task 1.3 (resolver)

---

### Pagination & Filtering (2 tasks)

#### Task 3.1: Implement Cursor-Based Pagination Support
- **Description**: Add cursor-based pagination (in addition to offset-based)
- **Acceptance Criteria**:
  - [ ] Update EventLogResult to support cursors:
    - startCursor (cursor at beginning of current page)
    - endCursor (cursor at end of current page)
  - [ ] Generate cursors:
    - Base64-encoded format: `base64(logName:eventId:timestamp)`
    - Allows stateless pagination (client can pass cursor to get next page)
  - [ ] Decode cursors in resolver:
    - Parse cursor to extract logName, eventId, timestamp
    - Use as starting point for next query
    - Return hasNextPage based on result count
  - [ ] Support both cursor and offset pagination:
    - If cursor provided: start from cursor position
    - If offset provided: start from offset
    - Offset takes precedence if both provided
  - [ ] Pagination metadata correct:
    - hasNextPage: true if more results exist
    - hasPreviousPage: true if earlier results exist (tracked for cursor pagination)
- **Test Requirements**:
  - [ ] Unit tests: cursor encoding/decoding
  - [ ] Integration tests: paginate through 1000+ events
  - [ ] Test hasNextPage/hasPreviousPage flags
  - [ ] Test cursor-based pagination (follow endCursor to next page)
  - [ ] Test offset-based pagination
  - [ ] Verify no off-by-one errors
- **Effort**: M (3 days)
- **Dependencies**: Task 1.3 (resolver)
- **Notes**: Cursor pagination complex; careful testing required

#### Task 3.2: Performance Testing & Optimization
- **Description**: Ensure queries meet <100ms performance target
- **Acceptance Criteria**:
  - [ ] Create performance test suite: `/src/services/eventlog/__tests__/eventlog.performance.test.ts`
  - [ ] Test scenarios:
    - Query returning 10 events: <50ms
    - Query returning 100 events: <100ms
    - Query returning 1000 events: <100ms
    - Pagination through 10,000 events: <100ms per page
    - Anonymization of 1000 entries: <50ms
  - [ ] Performance benchmarks:
    - Document baseline response times
    - Identify bottlenecks if any
    - Optimize if needed (caching, query tuning, etc.)
  - [ ] Memory profiling:
    - Verify memory usage <500MB for typical queries
    - No memory leaks during repeated queries
  - [ ] If targets not met:
    - Identify bottleneck (API query, filtering, anonymization)
    - Optimize (query tuning, batch processing, caching)
    - Document trade-offs
- **Test Requirements**:
  - [ ] Performance tests passing
  - [ ] Benchmarks documented
  - [ ] All targets met or documented as limitations
- **Effort**: M (3 days)
- **Dependencies**: Task 2.3 (integration tests complete)

---

## Phase 4: Metrics & Configuration (Week 4)

Metrics collection and service configuration.

### Metrics Collection (2 tasks)

#### Task 4.0: Implement Metrics Collector
- **Description**: Track and report query metrics
- **Acceptance Criteria**:
  - [ ] File created: `/src/services/eventlog/metrics.ts`
  - [ ] Implement `EventLogMetricsCollector` class:
    - `recordQuery(duration: number, resultCount: number): void` - record one query
    - `getMetrics(): MetricsSnapshot` - get accumulated metrics
    - `reset(): void` - clear metrics
    - `async export(): Promise<MetricsReport>` - export for reporting
  - [ ] Metrics tracked:
    - Total query count
    - Total events returned (cumulative)
    - Average response time
    - Min/max response times
    - Errors count
  - [ ] Metrics stored in-memory (no persistence for MVP)
  - [ ] Thread-safe (can handle concurrent queries)
  - [ ] Minimal overhead (<1ms per query)
- **Test Requirements**:
  - [ ] Unit tests: record/retrieve metrics
  - [ ] Test concurrency (multiple queries at once)
  - [ ] Performance: metric recording <1ms
  - [ ] Test reset functionality
- **Effort**: M (2 days)
- **Dependencies**: Task 1.0 (provider)

#### Task 4.1: Expose Metrics in GraphQL Response
- **Description**: Include metrics in eventLogs query response
- **Acceptance Criteria**:
  - [ ] Modify resolver: `/src/graphql/resolvers/eventlog.resolver.ts`
  - [ ] Add metrics to EventLogResult:
    - queryCount: total queries since service start
    - responseDurationMs: time to execute this specific query
    - resultsReturned: number of entries in this response
  - [ ] Metrics calculated:
    - queryCount incremented on each resolver call
    - responseDurationMs measured from resolver entry to response
    - resultsReturned = length of entries array
  - [ ] Metrics included in GraphQL response schema
  - [ ] Verify metrics appear in GraphQL response
- **Test Requirements**:
  - [ ] Unit test: metrics included in response
  - [ ] Integration test: GraphQL query includes metrics
  - [ ] Verify metrics values are correct
  - [ ] Test with multiple queries (queryCount increments)
- **Effort**: S (1 day)
- **Dependencies**: Task 4.0 (metrics collector)

---

### Configuration Support (1 task)

#### Task 4.2: Design Configuration Support (Hardcoded MVP)
- **Description**: Design service configuration system for future Config UI
- **Acceptance Criteria**:
  - [ ] Create file: `/src/services/eventlog/config.ts`
  - [ ] Implement configuration interface:
    - `interface EventLogConfig { enabled: boolean; permissionLevel: 'read-only' | 'read-write'; }`
  - [ ] Implement `EventLogConfigManager`:
    - `isEnabled(): boolean`
    - `getPermissionLevel(): string`
    - `setEnabled(enabled: boolean): void` (for future UI)
    - `setPermissionLevel(level: string): void` (for future UI)
  - [ ] For MVP: hardcode enabled=true, permissionLevel='read-only'
  - [ ] Design persistent storage:
    - Interface for config persistence (will be implemented in Feature 5)
    - Document how Config UI will integrate
  - [ ] Document in comments how future Config UI will call setters
- **Test Requirements**:
  - [ ] Unit test: config getters/setters work
  - [ ] Test hardcoded values for MVP
- **Effort**: S (1 day)
- **Dependencies**: Task 1.0 (provider)

---

## Phase 5: Testing & Documentation (Weeks 4-5)

Comprehensive testing and documentation.

### Testing (4 tasks)

#### Task 5.0: Unit Test Coverage Audit
- **Description**: Ensure >80% coverage across all eventlog code
- **Acceptance Criteria**:
  - [ ] Run coverage for all eventlog files:
    - `/src/services/eventlog/lib/*.ts`
    - `/src/services/eventlog/*.ts`
    - `/src/graphql/resolvers/eventlog.resolver.ts`
  - [ ] Coverage >80% for:
    - Line coverage
    - Branch coverage
    - Function coverage
  - [ ] Low-coverage functions identified and tested:
    - Document why if coverage <80% for specific area
    - Add tests to bring coverage to >80%
  - [ ] Coverage report generated: `/coverage/index.html`
  - [ ] All tests passing
- **Test Requirements**:
  - [ ] Coverage report published
  - [ ] CI/CD configured to enforce 80% coverage
- **Effort**: M (3 days)
- **Dependencies**: All tasks (full implementation)

#### Task 5.1: Security Test Suite
- **Description**: Comprehensive security testing
- **Acceptance Criteria**:
  - [ ] Test file: `/src/services/eventlog/__tests__/security.test.ts`
  - [ ] Security scenarios:
    - No PII in GraphQL response ✓ (Task 2.2)
    - Input validation prevents injection attacks
    - Error messages don't leak system details
    - Service respects permission boundaries
    - No SQL injection (if using DB for future)
    - No path traversal (safe file operations)
    - Authentication/authorization enforced (when Auth added)
  - [ ] Verify against OWASP Top 10 (where applicable)
  - [ ] Penetration testing mindset (try to break it)
- **Test Requirements**:
  - [ ] All security tests passing
  - [ ] No vulnerabilities identified
  - [ ] Document security testing approach
- **Effort**: M (3 days)
- **Dependencies**: Task 2.2 (anonymization security tests)

#### Task 5.2: Load Testing
- **Description**: Test system under high load
- **Acceptance Criteria**:
  - [ ] Create load test file: `/src/services/eventlog/__tests__/load.test.ts`
  - [ ] Load scenarios:
    - 10 concurrent queries: no errors
    - 100 concurrent queries: no crashes
    - 1-minute sustained load: memory stable
    - Rapid pagination (1000 queries): no leaks
  - [ ] Verify system doesn't crash or leak memory
  - [ ] Document performance under load
- **Test Requirements**:
  - [ ] Load tests pass
  - [ ] No memory leaks
  - [ ] Performance degradation acceptable
- **Effort**: M (2 days)
- **Dependencies**: Task 3.2 (performance baseline)

#### Task 5.3: Real-World Event Log Testing
- **Description**: Test against actual Windows Event Logs
- **Acceptance Criteria**:
  - [ ] Manual testing on real systems:
    - System event log (should be accessible)
    - Application event log (should be accessible)
    - Security event log (elevated access required)
  - [ ] Test queries:
    - Query all events (no filters)
    - Query last 24 hours
    - Query errors only
    - Query by source (Windows Update, etc.)
  - [ ] Verify results:
    - Correct events returned
    - All fields populated
    - PII anonymized
    - No crashes or errors
  - [ ] Document any access issues or limitations
  - [ ] Test on Windows 10, Windows 11, Windows Server
- **Test Requirements**:
  - [ ] Manual testing successful
  - [ ] Document results in test report
  - [ ] No crashes or unhandled exceptions
- **Effort**: S (2 days)
- **Dependencies**: All implementation tasks

---

### Documentation (3 tasks)

#### Task 5.4: API Documentation
- **Description**: Document GraphQL API and TypeScript API
- **Acceptance Criteria**:
  - [ ] Update `/src/services/eventlog/README.md`:
    - Overview
    - Supported event logs
    - API reference (all public functions)
    - Usage examples (query, filtering, pagination)
    - Error handling
    - Performance characteristics
    - Limitations
  - [ ] Create `/src/graphql/docs/eventlog-query.md`:
    - GraphQL query reference
    - All parameters with descriptions and examples
    - Response structure
    - Example GraphQL queries (copy-paste ready)
    - Error responses
  - [ ] Create `/src/services/eventlog/ARCHITECTURE.md`:
    - Component overview
    - Data flow diagrams
    - Design decisions
    - Future extensibility
  - [ ] All code comments complete (JSDoc, inline docs)
- **Effort**: M (2 days)
- **Dependencies**: All implementation tasks

#### Task 5.5: Deployment & Operations Guide
- **Description**: Document how to deploy and operate the EventLog service
- **Acceptance Criteria**:
  - [ ] Create `/docs/eventlog-deployment.md`:
    - System requirements
    - Installation steps
    - Configuration options
    - Health check procedures
    - Troubleshooting guide
    - Known limitations
  - [ ] Create `/docs/eventlog-operations.md`:
    - How to monitor the service
    - How to interpret metrics
    - How to handle errors
    - How to update/upgrade
    - Backup/restore procedures (if applicable)
  - [ ] Create `/docs/eventlog-privacy.md`:
    - PII anonymization details
    - What data is collected
    - What data is exposed
    - Compliance considerations
    - How to verify anonymization
- **Effort**: M (2 days)
- **Dependencies**: All implementation tasks

#### Task 5.6: Feature Documentation & Completion
- **Description**: Final documentation and feature completion
- **Acceptance Criteria**:
  - [ ] Update `/features/002-eventlog-mcp.spec.md`:
    - Mark success criteria as complete (checkboxes)
    - Add implementation notes
    - Document any deviations from spec
  - [ ] Update `/features/002-eventlog-mcp.plan.md`:
    - Mark phases as complete
    - Document actual implementation approach
    - Document any changes from plan
  - [ ] Create `/features/002-eventlog-mcp/COMPLETION_REPORT.md`:
    - What was built
    - What works well
    - Known limitations
    - Future improvements
    - Test coverage summary
    - Performance summary
  - [ ] Merge feature branch to main
  - [ ] Tag release (v002-eventlog-mcp)
- **Effort**: S (1 day)
- **Dependencies**: All other tasks

---

## Task Dependency Diagram

```
Phase 0: Windows EventLog Library
  0.0 (Research)
  ├─→ 0.1 (Project Setup)
  │   └─→ 0.2 (FFI Bindings)
  │       └─→ 0.3 (Query Engine)
  │           └─→ 0.4 (Anonymizer) [parallel]
  │               └─→ 0.5 (Public API)
  │                   └─→ 0.6 (Unit Tests)
  │                       └─→ 0.7 (Documentation)

Phase 1: SysMCP Integration
  0.5 ─────────────→ 1.0 (Provider)
  0.6 ─────────────→ 1.1 (Types)
                        └─→ 1.2 (Schema)
                            └─→ 1.3 (Resolver)

Phase 2: Anonymization [Weeks 3-4, parallel with Phase 3]
  0.4 ──────────→ 2.0 (Anonymization Integration)
  2.0 ──────────→ 2.1 (Persistence)
                    ├─→ 2.2 (Security Tests)
                    └─→ 2.3 (Integration Tests)

Phase 3: GraphQL Integration [Weeks 3-4, parallel with Phase 2]
  1.3 ────────────→ 3.0 (Error Handling)
                    ├─→ 3.1 (Cursor Pagination)
                    └─→ 3.2 (Performance)

Phase 4: Metrics & Configuration [Week 4]
  1.0 ────────────→ 4.0 (Metrics Collector)
                    └─→ 4.1 (Metrics in Response)
  1.0 ────────────→ 4.2 (Configuration)

Phase 5: Testing & Documentation [Weeks 4-5]
  ALL ────────────→ 5.0 (Coverage Audit)
                    ├─→ 5.1 (Security Tests)
                    ├─→ 5.2 (Load Tests)
                    └─→ 5.3 (Real-World Testing)
  ALL ────────────→ 5.4 (API Documentation)
                    ├─→ 5.5 (Deployment Guide)
                    └─→ 5.6 (Completion)
```

---

## Critical Path

**Critical tasks** (must complete in order, determine project timeline):

1. **0.0** - EventLog API research (3 days)
2. **0.1** - Project setup (1 day)
3. **0.2** - FFI bindings (3 days)
4. **0.3** - Query engine (3 days)
5. **0.4** - Anonymizer (3 days)
6. **0.5** - Public API (1 day)
7. **0.6** - Unit tests (3 days) **← Critical: Can't integrate without tests**
8. **1.0** - Provider (3 days)
9. **1.1** - Types (1 day)
10. **1.2** - Schema (1 day)
11. **1.3** - Resolver (3 days)
12. **2.0** - Anonymization integration (3 days)
13. **2.1** - Persistence (3 days) **← Critical: Must persist before testing**
14. **2.2** - Security tests (3 days)
15. **5.0** - Coverage audit (3 days) **← Critical: Must meet 80%**
16. **5.6** - Completion (1 day)

**Critical Path Duration**: ~6 weeks (38 business days)

**Parallelizable Work**:
- Phase 2 (Anonymization) and Phase 3 (GraphQL) can run in parallel (Weeks 3-4)
- Task 0.4 (Anonymizer) can be developed alongside Task 0.3 (Query Engine)
- Tasks 4.0 (Metrics) and 4.2 (Config) can run in parallel with Phases 2-3

---

## Parallel Work Opportunities

To accelerate delivery, these tasks can be worked in parallel:

### During Weeks 3-4:
- **Stream A**: Task 2.0 → 2.1 → 2.2 → 2.3 (Anonymization integration)
- **Stream B**: Task 3.0 → 3.1 → 3.2 (GraphQL enhancements)

### During Week 4 (with Phase 2/3 overlap):
- **Stream C**: Task 4.0 → 4.1 (Metrics)
- **Stream D**: Task 4.2 (Configuration)

### During Weeks 4-5 (with implementation):
- **Stream E**: Task 5.0 → 5.1 → 5.2 (Testing)
- **Stream F**: Task 5.4 → 5.5 → 5.6 (Documentation)

With 3 developers on parallel streams, estimated timeline can be reduced to **4-5 weeks**.

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Windows API limitations | Medium | High | Extensive POC in Task 0.0; document limitations |
| PII anonymization bugs | Medium | Critical | Comprehensive security tests (Task 2.2, 5.1) |
| Performance targets not met | Medium | Medium | Benchmarking in Task 3.2; optimize if needed |
| Memory leaks in query engine | Low | High | Memory profiling in Task 5.2 |
| Permission issues on real logs | Medium | Low | Test on multiple systems (Task 5.3) |
| Test coverage falls short | Low | Medium | Continuous measurement in Task 5.0 |

---

## Success Criteria Mapping

This task list addresses all 12 success criteria from the specification:

- **SC-1**: Task 1.2, 1.3 → GraphQL interface complete
- **SC-2**: Task 1.1 → Data model complete
- **SC-3**: Task 0.3, 1.3, 3.1 → Filtering functional
- **SC-4**: Task 3.1 → Pagination working
- **SC-5**: Task 0.0, 5.3 → All logs accessible
- **SC-6**: Task 0.4, 2.0, 2.1 → PII anonymization working
- **SC-7**: Task 4.2 → Configuration support designed
- **SC-8**: Task 4.0, 4.1 → Metrics tracked
- **SC-9**: Task 3.0, 5.1 → Error handling
- **SC-10**: Task 5.0, 5.1, 5.2 → >80% test coverage
- **SC-11**: Task 5.4, 5.5, 5.6 → Documentation complete
- **SC-12**: Task 2.2, 5.1 → No PII in logs

---

## Getting Started

1. **Create feature directory**: `mkdir -p /features/002-eventlog-mcp`
2. **Check out feature branch**: `git checkout feature/002-eventlog-mcp`
3. **Start with Task 0.0**: Begin EventLog API research and POC
4. **Daily standup**: Update status in corresponding task
5. **Weekly review**: Check task completion, adjust timeline if needed

---

## Document Metadata

- **Tasks Version**: 1.0
- **Created**: 2026-02-03
- **Last Updated**: 2026-02-03
- **Total Tasks**: 28
- **Estimated Duration**: 5-6 weeks (4-5 with parallel work)
- **Status**: Ready for Implementation
- **Next Step**: Begin Task 0.0 (EventLog API Research)

