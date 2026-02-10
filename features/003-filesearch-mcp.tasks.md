# Implementation Tasks: FileSearch MCP (Feature 003)

**Feature**: 003-filesearch-mcp  
**Status**: 100% Complete (24/24 tasks)  
**Created**: 2026-02-10  
**Git Branch**: feature/003-filesearch-mcp  
**Last Updated**: 2026-02-10  
**Progress**: Phase 0 (3/3) ✅ | Phase 1 (5/5) ✅ | Phase 2 (5/5) ✅ | Phase 3 (5/5) ✅ | Phase 4 (3/3) ✅ | Phase 5 (3/3) ✅

---

## Overview

This document breaks down the FileSearch MCP implementation into executable, ordered tasks across 6 phases. Each task has clear acceptance criteria and test requirements. The implementation follows the same architectural patterns established in Feature 002 (EventLog MCP).

**Total Tasks**: 24 tasks across 6 phases  
**Critical Path**: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5  
**Parallel Opportunities**: Phase 2 tasks 2.3-2.4 can run in parallel; Phase 3 tasks 3.3-3.4 can run in parallel

---

## Phase 0: Proof of Concept & Setup (Foundation)

Validate that `node-adodb` works with the Windows Search OLE DB provider and establish the project structure. This phase de-risks the most uncertain technical dependency before investing in the full implementation.

---

### Task 0.1: Windows Search OLE DB Proof of Concept
- **Description**: Install `node-adodb` and validate connectivity to Windows Search Indexer via OLE DB. Execute a simple query and parse results. This is the most critical de-risking task.
- **Acceptance Criteria**:
  - [ ] `npm install node-adodb` succeeds
  - [ ] POC script connects using `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`
  - [ ] POC executes `SELECT TOP 10 System.ItemPathDisplay, System.FileName, System.Size, System.DateModified FROM SystemIndex` and returns results
  - [ ] Result rows can be parsed: path (string), filename (string), size (number), date (Date)
  - [ ] Document multi-valued property behavior (System.Author, System.Keywords): how node-adodb returns arrays vs delimited strings
  - [ ] Document error behavior when WSearch service is stopped
  - [ ] CONTAINS and FREETEXT queries work: `WHERE CONTAINS(*, '"test"')` and `WHERE FREETEXT(*, 'test document')`
  - [ ] SCOPE clause works: `WHERE SCOPE='file:C:/Users'`
  - [ ] Results documented in `src/services/filesearch/README.md`
- **Test Requirements**:
  - [ ] Manual testing on Windows with active Search Indexer
  - [ ] Document data types returned by node-adodb for each column
  - [ ] Verify behavior with non-indexed paths
- **Effort**: M (2-3 days)
- **Dependencies**: None
- **Risk**: HIGH — If node-adodb doesn't work with Search.CollatorDSO, fallback to PowerShell `Get-CimInstance` or `edge-js`

---

### Task 0.2: FileSearch Project Structure & Types
- **Description**: Create the directory structure, TypeScript types, and configuration for the FileSearch service
- **Acceptance Criteria**:
  - [ ] Directory created: `src/services/filesearch/`
  - [ ] Directory created: `src/services/filesearch/__tests__/`
  - [ ] File created: `src/services/filesearch/types.ts` with all interfaces:
    - `SearchMode` enum (CONTAINS, FREETEXT)
    - `FileSearchQueryParams` interface
    - `FileSearchEntry` interface
    - `FileSearchPageInfo` interface
    - `FileSearchQueryMetrics` interface
    - `FileSearchResult` interface
  - [ ] File created: `src/services/filesearch/config.ts`:
    - `FileSearchConfig` interface
    - `FileSearchConfigManager` class (mirrors EventLog pattern)
    - MVP defaults: enabled=true, read-only, maxResults=10000, timeout=30s, anonymization=true, allowedPaths=[]
    - Setters with validation
    - `getConfigManager()` / `setConfigManager()` / `resetConfigManager()` globals
  - [ ] File created: `src/services/filesearch/metrics.ts`:
    - `FileSearchMetricsCollector` class (mirrors EventLog pattern)
    - recordQuery(), getMetrics(), reset(), export()
  - [ ] TypeScript compiles with zero errors
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/config.test.ts`: 15+ tests
    - Default config values
    - Setter validation (invalid values throw)
    - AllowedPaths management
    - Reset to defaults
    - Global config manager get/set/reset
  - [ ] `src/services/filesearch/__tests__/metrics.test.ts`: 10+ tests
    - Record queries, check averages
    - Reset behavior
    - Edge cases (zero queries, negative duration rejected)
  - [ ] All tests pass, >80% coverage on new files
- **Effort**: S (1 day)
- **Dependencies**: None (can run in parallel with Task 0.1)

---

### Task 0.3: Scope Restriction Validator
- **Description**: Implement path scope validation logic that enforces allowed search paths as a security boundary
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/scope-validator.ts`
  - [ ] `ScopeValidator` class with methods:
    - `constructor(allowedPaths: string[])` — empty array means all paths allowed
    - `isPathAllowed(path: string): boolean` — check if a path is within allowed scope
    - `normalizePath(path: string): string` — resolve `..`, normalize separators, lowercase on Windows
    - `validateAndNormalize(path: string): { valid: boolean; normalizedPath: string; error?: string }`
  - [ ] Security rules enforced:
    - Reject paths containing `..` after normalization
    - Reject UNC paths (`\\server\share`) for MVP
    - Case-insensitive matching on Windows
    - Path must be under at least one allowed path (if allowed paths configured)
    - Forward/backward slash normalization
  - [ ] When allowedPaths is empty, all local paths are allowed (MVP behavior)
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/scope-validator.test.ts`: 20+ tests
    - Path within scope → allowed
    - Path outside scope → rejected
    - Path traversal attempts (`..\..`) → rejected
    - UNC paths → rejected
    - Empty allowed paths → everything allowed
    - Case-insensitive matching
    - Mixed separators (`/` vs `\`)
    - Multiple allowed paths
    - Normalization of relative paths
  - [ ] All tests pass, >80% coverage
- **Effort**: S (1 day)
- **Dependencies**: None (can run in parallel with Tasks 0.1 and 0.2)

---

## Phase 1: Core Query Engine (Critical Path)

Build the SQL query builder and OLE DB executor — the core engine that translates GraphQL parameters into Windows Search results.

---

### Task 1.1: Windows Search SQL Query Builder
- **Description**: Implement the query builder that translates structured parameters into Windows Search SQL. This is the most security-critical component due to SQL injection risks.
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/query-builder.ts`
  - [ ] `buildSearchQuery(params: FileSearchQueryParams): BuiltQuery` function:
    - Returns `{ sql: string; countSql: string; offset: number; limit: number }`
    - SELECT clause with all required columns (System.ItemPathDisplay, System.FileName, System.FileExtension, System.Size, System.DateModified, System.DateCreated, System.Author, System.Title, System.Keywords)
    - SCOPE clause from `path` parameter: `SCOPE='file:<path>'`
    - CONTAINS/FREETEXT clause from `searchText` + `searchMode`
    - System.FileName LIKE clause from `fileName` with wildcard translation (`*` → `%`, `?` → `_`)
    - System.FileExtension filter from `fileType`
    - System.Size range from `minSize`/`maxSize`
    - System.DateModified range from `modifiedAfter`/`modifiedBefore`
    - System.DateCreated range from `createdAfter`/`createdBefore`
    - System.Author filter from `author`
    - ORDER BY System.DateModified DESC
    - TOP (offset + limit + 1) for pagination
  - [ ] `countSql` generates matching SELECT COUNT(*) query
  - [ ] SQL injection prevention functions:
    - `sanitizeStringValue(value: string): string` — escapes single quotes
    - `sanitizeSearchText(text: string): string` — escapes double quotes, strips dangerous SQL keywords
    - `sanitizeFileName(pattern: string): string` — only allows `*` and `?` wildcards
    - `sanitizeFileType(ext: string): string` — validates `.ext` format, alphanumeric only
    - `validateNumeric(value: number): number` — ensures valid number
    - `formatDateForSql(date: Date): string` — safe ISO 8601 format
  - [ ] All parameters combined with AND logic
  - [ ] Generates valid SQL when no filters provided (returns recent files)
  - [ ] Generates valid SQL with any single parameter
  - [ ] Generates valid SQL with all parameters combined
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/query-builder.test.ts`: 50+ tests
    - SQL generation for each individual parameter
    - SQL generation for parameter combinations
    - CONTAINS vs FREETEXT mode differences
    - SCOPE clause generation
    - Wildcard translation for fileName
    - ORDER BY and TOP clauses
    - COUNT(*) query generation
    - SQL injection prevention:
      - Single quote injection: `'; DROP TABLE --`
      - Double quote injection in CONTAINS
      - SQL keyword injection
      - Path traversal in SCOPE
      - Oversized input handling
      - Unicode bypass attempts
    - Edge cases: empty params, null values, zero offset, max limit
    - Date formatting consistency
  - [ ] All tests pass, 100% coverage on sanitization functions
- **Effort**: L (3-4 days)
- **Dependencies**: Task 0.1 (confirmed SQL syntax works with Windows Search)
- **Risk**: SQL injection is the #1 security concern — this task must have exhaustive tests

---

### Task 1.2: OLE DB Executor
- **Description**: Implement the execution layer that runs Windows Search SQL via node-adodb and maps results
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/oledb-executor.ts`
  - [ ] `OleDbExecutor` class:
    - `constructor(options?: { timeoutMs?: number })` — default timeout 30s
    - `async execute(sql: string): Promise<OleDbResult>` — execute query, return rows
    - `async checkAvailability(): Promise<{ available: boolean; message: string }>` — probe WSearch service
  - [ ] `OleDbResult` interface: `{ rows: Record<string, unknown>[]; success: boolean; errorMessage?: string; executionTimeMs: number }`
  - [ ] Error classification:
    - WSearch service not running → clear error message with remediation steps
    - OLE DB provider not available → clear error message
    - Access denied → permission error without details
    - SQL syntax error → logged internally, generic error to caller
    - Timeout → timeout error with duration
  - [ ] Connection string: `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`
  - [ ] Connection per query (no pooling for MVP)
  - [ ] Proper cleanup on errors (connection closed in finally block)
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/oledb-executor.test.ts`: 20+ tests
    - Mock `node-adodb` module entirely for CI
    - Test result parsing with realistic mock data
    - Test error handling for each error class
    - Test timeout behavior
    - Test checkAvailability with mock responses
    - Test that connection cleanup happens on error
  - [ ] All tests pass with mocked node-adodb
- **Effort**: M (2-3 days)
- **Dependencies**: Task 0.1 (node-adodb proven to work)

---

### Task 1.3: Result Mapper
- **Description**: Implement mapping from raw OLE DB recordset rows to typed FileSearchEntry objects
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/result-mapper.ts`
  - [ ] `mapOleDbRow(row: Record<string, unknown>): FileSearchEntry` function:
    - Maps System.ItemPathDisplay → path (string)
    - Maps System.FileName → fileName (string)
    - Maps System.FileExtension → fileType (string, normalized: lowercase, with dot)
    - Maps System.Size → size (number, default 0)
    - Maps System.DateModified → dateModified (Date)
    - Maps System.DateCreated → dateCreated (Date)
    - Maps System.Author → author (string | undefined) — handle multi-valued
    - Maps System.Title → title (string | undefined)
    - Maps System.Keywords → tags (string[]) — handle multi-valued, semicolons
  - [ ] `mapOleDbRows(rows: Record<string, unknown>[]): FileSearchEntry[]` — batch mapper
  - [ ] Graceful handling of null/undefined/missing fields for all columns
  - [ ] Multi-valued property handling:
    - If value is array: take first for author, all for tags
    - If value is semicolon-delimited string: split
    - If value is null/undefined: return undefined/[]
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/result-mapper.test.ts`: 25+ tests
    - Full row mapping with all fields present
    - Missing optional fields (author, title, tags)
    - All fields missing (returns safe defaults)
    - Multi-valued author (array, semicolon-delimited, single)
    - Multi-valued keywords (array, semicolon-delimited, empty)
    - Date parsing from various OLE DB date formats
    - Size as number, string, null
    - File extension normalization
  - [ ] All tests pass, >80% coverage
- **Effort**: S (1 day)
- **Dependencies**: Task 0.1 (know what data types node-adodb returns)

---

### Task 1.4: Path Anonymizer
- **Description**: Implement file-path-specific PII anonymization that integrates with the shared PiiAnonymizer
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/path-anonymizer.ts`
  - [ ] `PathAnonymizer` class:
    - `constructor(anonymizer: PiiAnonymizer)` — uses shared anonymizer instance
    - `anonymizePath(path: string): string` — replaces user profile segments
    - `anonymizeAuthor(author: string): string` — anonymizes author name
    - `anonymizeEntry(entry: FileSearchEntry): FileSearchEntry` — applies all anonymization
    - `anonymizeEntries(entries: FileSearchEntry[]): FileSearchEntry[]` — batch
  - [ ] Path anonymization rules:
    - Detect `C:\Users\<username>\...` pattern → `C:\Users\[ANON_USER_N]\...`
    - Detect `D:\Users\<username>\...` (any drive letter)
    - Detect `/home/<username>/...` (cross-platform future-proofing)
    - Preserve the rest of the path after the username segment
  - [ ] Author anonymization: full name → `[ANON_USER_N]`
  - [ ] Consistency: same username in path and same author name map to same anon ID (via shared PiiAnonymizer)
  - [ ] Non-user paths (e.g., `C:\Program Files\...`) pass through unchanged
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/path-anonymizer.test.ts`: 25+ tests
    - User profile path anonymization (C:\Users\john\Documents\report.docx)
    - Different drive letters (D:\Users\jane\...)
    - Non-user paths pass through (C:\Windows\System32\...)
    - Author anonymization
    - Consistency: same username → same anon ID across calls
    - Shared store: same user in EventLog and FileSearch → same ID
    - Entry-level anonymization (all fields processed)
    - Null/undefined author handled
    - Batch anonymization
    - Path with no user segment
  - [ ] All tests pass, >80% coverage
- **Effort**: M (1-2 days)
- **Dependencies**: None (uses existing PiiAnonymizer API)

---

### Task 1.5: FileSearch Provider
- **Description**: Build the main provider that orchestrates query building, execution, result mapping, anonymization, and metrics — following the EventLogProvider pattern
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/provider.ts`
  - [ ] `FileSearchProvider` class:
    - `constructor(logger: Logger, config?: FileSearchProviderConfig)`
    - `async start(): Promise<void>` — initialize OLE DB executor, run healthcheck
    - `async stop(): Promise<void>` — cleanup resources
    - `async healthcheck(): Promise<boolean>` — check WSearch availability
    - `async search(params: FileSearchQueryParams): Promise<FileSearchProviderResult>` — main query method
    - `getMetrics()` — return current metrics
    - `getState()` — return current state (started, enabled, metrics)
  - [ ] Search flow:
    1. Validate service is enabled and started
    2. Validate input parameters
    3. Validate path against scope restrictions (via ScopeValidator)
    4. Build SQL query (via QueryBuilder)
    5. Execute main query + count query (via OleDbExecutor)
    6. Map results (via ResultMapper)
    7. Apply pagination (skip offset rows, detect hasNextPage)
    8. Update metrics
    9. Return result with timing
  - [ ] Exception types: `PermissionDeniedException`, `ValidationException`, `OperationFailedException`, `ScopeViolationException`
  - [ ] Metrics tracked: queries executed, queries failed, results returned, execution time
  - [ ] Graceful degradation when WSearch unavailable
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/provider.test.ts`: 30+ tests
    - Lifecycle: start, stop, healthcheck
    - Successful search with all parameters
    - Input validation (invalid limit, offset, size range, date range)
    - Scope validation (path outside allowed scope)
    - Service disabled → PermissionDeniedException
    - Service not started → OperationFailedException
    - OLE DB error → graceful error result
    - Metrics updated on success and failure
    - Pagination: hasNextPage, hasPreviousPage, totalCount
    - Timeout handling
  - [ ] All tests pass with mocked OLE DB executor, >80% coverage
- **Effort**: L (2-3 days)
- **Dependencies**: Tasks 1.1, 1.2, 1.3, 1.4, 0.2, 0.3

---

## Phase 2: GraphQL & MCP Integration

Wire the FileSearch provider into the GraphQL schema and MCP protocol layer.

---

### Task 2.1: GraphQL Schema Extension
- **Description**: Add FileSearch types and query to the existing GraphQL schema
- **Acceptance Criteria**:
  - [ ] `src/graphql/schema.ts` updated with:
    - `SearchMode` enum (CONTAINS, FREETEXT)
    - `FileSearchEntry` type (path, fileName, fileType, size, dateModified, dateCreated, author, title, tags)
    - `FileSearchQueryMetrics` type (searchCount, responseDurationMs, resultsReturned)
    - `FileSearchResults` type (files, pageInfo, totalCount, metrics)
    - `fileSearch` query added to Query type with all parameters
  - [ ] Reuses existing `PageInfo` type from EventLog
  - [ ] Schema compiles and Apollo Server starts without errors
  - [ ] Introspection shows new types and query
- **Test Requirements**:
  - [ ] Existing schema tests still pass
  - [ ] New schema types can be queried via introspection
  - [ ] `npm run build` succeeds with zero errors
- **Effort**: S (0.5 days)
- **Dependencies**: Task 0.2 (types defined)

---

### Task 2.2: GraphQL Resolver
- **Description**: Implement the fileSearch query resolver following the EventLog resolver pattern
- **Acceptance Criteria**:
  - [ ] File created: `src/graphql/filesearch.resolver.ts`
  - [ ] `FileSearchErrorCode` enum with all error codes:
    - InvalidLimit, InvalidOffset, InvalidDateRange, InvalidSizeRange, InvalidPath, PathOutsideScope, ServiceDisabled, ServiceUnavailable, SearchServiceNotRunning, OleDbError, AnonymizationFailure, UnknownError
  - [ ] `FileSearchGraphQLError` class (extends GraphQLError, includes code + timestamp)
  - [ ] `fileSearchResolver` function:
    - Input validation (limit 1-1000, offset ≥ 0, date ranges, size ranges, path)
    - Service availability check (provider exists and started)
    - Call provider.search() with mapped parameters
    - Apply PII anonymization via PathAnonymizer
    - Build PageInfo (hasNextPage, hasPreviousPage, startCursor, endCursor)
    - Include metrics in response
    - Comprehensive error classification and logging
  - [ ] `src/graphql/resolvers.ts` updated to spread `filesearchResolver.Query`
  - [ ] Resolver context extended with `filesearchProvider` and `filesearchAnonymizer`
- **Test Requirements**:
  - [ ] `src/graphql/__tests__/filesearch.resolver.test.ts`: 35+ tests
    - Successful query with all parameters
    - Each validation error (invalid limit, offset, date range, size range, path)
    - Service unavailable handling
    - PII anonymization applied in response
    - Pagination metadata correct
    - Metrics included in response
    - Error code classification for each error type
    - Service disabled → proper error
    - Audit logging (no PII in logs)
  - [ ] All tests pass with mocked provider, >80% coverage
- **Effort**: L (2-3 days)
- **Dependencies**: Tasks 2.1, 1.5

---

### Task 2.3: Server Integration
- **Description**: Wire FileSearchProvider into the Express/Apollo server alongside EventLogProvider
- **Acceptance Criteria**:
  - [ ] `src/server.ts` updated:
    - Initialize `FileSearchProvider` alongside EventLogProvider
    - Start FileSearchProvider in `setupRoutes()`
    - Pass provider to GraphQL context as `filesearchProvider`
    - Pass PiiAnonymizer to context as `filesearchAnonymizer`
    - Pass FileSearchMetricsCollector to context
    - Stop FileSearchProvider in `stop()` method
  - [ ] Health check includes FileSearch service status
  - [ ] Server starts without errors when WSearch is available
  - [ ] Server starts with warning when WSearch is unavailable (graceful degradation)
- **Test Requirements**:
  - [ ] Server starts and responds to health check
  - [ ] `npm run build` succeeds
  - [ ] Existing EventLog functionality unaffected
- **Effort**: S (0.5 days)
- **Dependencies**: Tasks 2.1, 2.2, 1.5

---

### Task 2.4: MCP Service (IService Implementation)
- **Description**: Create the FileSearch MCP service wrapper that exposes tools to Claude/LLM clients
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/mcp-service.ts`
    - Implements `IService` interface
    - `id = 'filesearch'`, `name = 'FileSearch MCP Service'`, `version = '1.0.0'`
    - `getTools()` returns `filesearch_query` and `filesearch_status` tool definitions
    - `callTool()` routes to appropriate handler
    - Tool input schemas match GraphQL parameter schemas
    - Enable/disable support
  - [ ] File created: `src/mcp/filesearch-service.ts`
    - MCP wrapper that calls GraphQL backend (same pattern as `src/mcp/eventlog-service.ts`)
    - Constructs GraphQL queries for fileSearch
    - Parses and returns results
  - [ ] `src/mcp/index.ts` updated to register FileSearchMcpService
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/mcp-service.test.ts`: 15+ tests
    - IService interface compliance (id, name, version, enabled)
    - getTools() returns correct tool definitions
    - callTool() routes correctly
    - Unknown tool returns error
    - Enable/disable works
  - [ ] `src/mcp/__tests__/filesearch-service.test.ts`: 15+ tests
    - GraphQL query construction
    - Result parsing
    - Error handling
    - Tool execution
  - [ ] All tests pass, >80% coverage
- **Effort**: M (1-2 days)
- **Dependencies**: Tasks 2.1, 2.2

---

### Task 2.5: Integration Testing
- **Description**: End-to-end integration tests for the complete GraphQL and MCP pipeline
- **Acceptance Criteria**:
  - [ ] Integration test: GraphQL query → resolver → provider → mocked OLE DB → response
  - [ ] Integration test: MCP tool call → service → GraphQL → resolver → mocked provider → response
  - [ ] Pagination integration: multiple pages with correct pageInfo
  - [ ] Filter combination integration: multiple filters applied correctly
  - [ ] Error propagation: OLE DB errors surface correctly through all layers
  - [ ] PII anonymization: verify no raw PII in GraphQL responses
  - [ ] Metrics: verify metrics update across multiple queries
  - [ ] All existing tests still pass (no regressions)
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/integration.test.ts`: 15+ tests
  - [ ] `npm test` — all tests pass including existing 313+ tests
- **Effort**: M (1-2 days)
- **Dependencies**: Tasks 2.1, 2.2, 2.3, 2.4

---

## Phase 3: Security & Hardening

Comprehensive security validation and edge case handling.

---

### Task 3.1: SQL Injection Security Test Suite
- **Description**: Dedicated security test suite for SQL injection prevention in the query builder
- **Acceptance Criteria**:
  - [ ] File created: `src/services/filesearch/__tests__/security.test.ts`
  - [ ] Tests cover all injection vectors:
    - Single quote injection in every string parameter
    - Double quote injection in CONTAINS/FREETEXT text
    - SQL keyword injection (DROP, DELETE, INSERT, UPDATE, EXEC, UNION)
    - Path traversal via SCOPE clause
    - Unicode/encoding bypass attempts
    - Null byte injection
    - Oversized input (>10000 chars)
    - Nested CONTAINS/FREETEXT expressions
    - Semicolon-separated statement injection
    - Comment injection (`--`, `/* */`)
  - [ ] All vectors confirmed to produce safe SQL (no injection possible)
  - [ ] Each test documents the attack vector and expected safe output
- **Test Requirements**:
  - [ ] 30+ security-focused tests
  - [ ] 100% pass rate
  - [ ] Document each attack vector in test comments
- **Effort**: M (1-2 days)
- **Dependencies**: Task 1.1

---

### Task 3.2: Scope Enforcement Security Tests
- **Description**: Verify that scope restrictions cannot be bypassed
- **Acceptance Criteria**:
  - [ ] Tests verify SCOPE clause is always applied when allowedPaths configured
  - [ ] Tests verify path parameter outside scope is rejected before query execution
  - [ ] Tests verify post-query result filtering removes any results outside scope (defense in depth)
  - [ ] Tests verify path normalization prevents bypass:
    - `C:\Users\..\Windows\System32` → rejected
    - Mixed slashes don't bypass
    - Case variations don't bypass
    - URL-encoded paths don't bypass
  - [ ] Tests verify UNC paths are rejected
- **Test Requirements**:
  - [ ] Add to `src/services/filesearch/__tests__/security.test.ts`: 15+ scope tests
  - [ ] All pass
- **Effort**: S (1 day)
- **Dependencies**: Tasks 0.3, 1.5

---

### Task 3.3: PII Leak Prevention Tests
- **Description**: Verify no PII leaks in responses or logs when anonymization is enabled
- **Acceptance Criteria**:
  - [ ] Tests verify all file paths containing user profiles are anonymized in responses
  - [ ] Tests verify all author fields are anonymized in responses
  - [ ] Tests verify PII does not appear in log messages (mock logger, inspect calls)
  - [ ] Tests verify PII does not appear in error messages returned to GraphQL clients
  - [ ] Tests verify PII does not appear in metrics or audit data
  - [ ] Tests verify consistency: same user gets same anon ID across multiple queries
  - [ ] Tests verify shared store: same user gets same anon ID across EventLog and FileSearch
- **Test Requirements**:
  - [ ] Add to `src/services/filesearch/__tests__/security.test.ts`: 15+ PII tests
  - [ ] All pass
- **Effort**: S (1 day)
- **Dependencies**: Task 1.4

---

### Task 3.4: Error Handling & Edge Cases
- **Description**: Harden error handling for all edge cases and failure modes
- **Acceptance Criteria**:
  - [ ] Windows Search service not running → clear diagnostic error
  - [ ] OLE DB provider not installed → clear error with instructions
  - [ ] Query timeout → timeout error with duration
  - [ ] Empty result set → valid empty response (not error)
  - [ ] Maximum offset reached (>10000) → validation error
  - [ ] All filter parameters at extreme values (max int, empty strings, very long strings)
  - [ ] Concurrent queries → no race conditions
  - [ ] Service disabled after query starts → graceful handling
  - [ ] Invalid date strings → clear validation error
  - [ ] node-adodb process crash → caught and wrapped
- **Test Requirements**:
  - [ ] `src/services/filesearch/__tests__/edge-cases.test.ts`: 20+ tests
  - [ ] All pass
- **Effort**: M (1-2 days)
- **Dependencies**: Tasks 1.2, 1.5

---

### Task 3.5: Input Validation Completeness
- **Description**: Verify all input validation rules are enforced at both GraphQL and provider levels
- **Acceptance Criteria**:
  - [ ] Validation matrix documented and tested:
    | Parameter | Rule | GraphQL Layer | Provider Layer |
    |-----------|------|--------------|----------------|
    | limit | 1-1000 | ✓ | ✓ |
    | offset | ≥ 0 | ✓ | ✓ |
    | minSize | ≥ 0 | ✓ | ✓ |
    | maxSize | ≥ minSize | ✓ | ✓ |
    | dates | after ≤ before | ✓ | ✓ |
    | path | normalized, in scope | ✓ | ✓ |
    | searchText | ≤ 500 chars | ✓ | ✓ |
    | fileName | safe wildcards only | ✓ | ✓ |
    | fileType | .ext format | ✓ | ✓ |
  - [ ] Both layers reject invalid input independently (defense in depth)
  - [ ] Error messages are clear and don't leak system information
- **Test Requirements**:
  - [ ] Validation tests added across resolver and provider test files
  - [ ] All pass
- **Effort**: S (0.5 days)
- **Dependencies**: Tasks 2.2, 1.5

---

## Phase 4: Documentation & Polish

---

### Task 4.1: API Documentation
- **Description**: Document the FileSearch GraphQL API and MCP tools
- **Acceptance Criteria**:
  - [ ] `src/services/filesearch/API.md` created:
    - GraphQL schema documentation with all types and parameters
    - Example queries for common use cases
    - Filter parameter descriptions with valid values
    - Pagination usage examples
    - Error code reference table
  - [ ] `docs/TOOLS.md` updated with FileSearch tool definitions:
    - `filesearch_query` parameters and examples
    - `filesearch_status` parameters and examples
  - [ ] `src/services/filesearch/README.md` updated with:
    - Architecture overview
    - Development guide
    - Testing instructions
    - Windows Search requirements
- **Effort**: S (1 day)
- **Dependencies**: Tasks 2.1-2.5

---

### Task 4.2: Code Documentation & Cleanup
- **Description**: Ensure all code has comprehensive JSDoc and follows project conventions
- **Acceptance Criteria**:
  - [ ] All public classes and methods have JSDoc with @param, @returns, @throws, @example
  - [ ] Security-critical code has `// SECURITY:` comments
  - [ ] All files have module-level documentation headers
  - [ ] No TODO or FIXME comments remain (except for documented future work)
  - [ ] All files < 300 lines
  - [ ] Code follows existing project conventions (naming, structure, patterns)
  - [ ] `npm run lint` passes with zero warnings
  - [ ] `npm run build` succeeds with zero warnings
- **Effort**: S (0.5 days)
- **Dependencies**: All Phase 1-3 tasks

---

### Task 4.3: Test Coverage & Quality Gate
- **Description**: Verify test coverage meets requirements and all quality gates pass
- **Acceptance Criteria**:
  - [ ] `npm run test:coverage` shows >80% line and branch coverage for all FileSearch files
  - [ ] All 313+ existing tests still pass (no regressions)
  - [ ] New FileSearch tests: 250+ tests total across all test files
  - [ ] Test categories covered:
    - Unit tests: query builder, executor, mapper, anonymizer, config, metrics, scope validator
    - Integration tests: GraphQL pipeline, MCP pipeline
    - Security tests: SQL injection, scope bypass, PII leaks
    - Edge case tests: error handling, boundary values
  - [ ] Zero flaky tests
  - [ ] Performance: all tests complete in < 30 seconds
- **Effort**: M (1 day)
- **Dependencies**: All Phase 1-3 tasks

---

## Phase 5: Real-World Validation

---

### Task 5.1: Windows Integration Testing
- **Description**: Test the complete FileSearch feature against a real Windows Search Index
- **Acceptance Criteria**:
  - [ ] Verify Windows Search service is running and indexing
  - [ ] Execute fileSearch GraphQL query and receive real results
  - [ ] Verify all metadata fields populated from real index (path, name, size, dates, author, title, tags)
  - [ ] Verify CONTAINS search returns relevant results
  - [ ] Verify FREETEXT search returns relevant results
  - [ ] Verify file type filtering works
  - [ ] Verify date range filtering works
  - [ ] Verify size range filtering works
  - [ ] Verify path scoping works
  - [ ] Verify pagination across real result sets
  - [ ] Verify PII anonymization on real file paths
  - [ ] Document any discrepancies between mock tests and real behavior
- **Effort**: M (1-2 days)
- **Dependencies**: All Phase 1-4 tasks
- **Requirements**: Windows 10/11 with active Search Indexer

---

### Task 5.2: MCP Integration Testing with Claude
- **Description**: Test FileSearch tools via MCP protocol with Claude or similar LLM client
- **Acceptance Criteria**:
  - [ ] Configure Claude with FileSearch MCP tools
  - [ ] `filesearch_query` tool discoverable in tools/list
  - [ ] `filesearch_status` tool discoverable
  - [ ] Claude can search for files by name
  - [ ] Claude can search by content keywords
  - [ ] Claude can filter by file type, size, dates
  - [ ] Claude can paginate through results
  - [ ] Results display correctly with anonymized paths
  - [ ] Error messages are helpful when service unavailable
- **Effort**: S (0.5 days)
- **Dependencies**: Tasks 5.1

---

### Task 5.3: Performance Validation
- **Description**: Validate performance targets against real Windows Search Index
- **Acceptance Criteria**:
  - [ ] Simple query (filename search): <200ms
  - [ ] Complex query (text search + filters): <400ms
  - [ ] Pagination (offset 0-500): <200ms
  - [ ] Pagination (offset 5000): <500ms (acceptable degradation)
  - [ ] COUNT(*) query: <200ms
  - [ ] Memory usage during query: <500MB
  - [ ] 10 concurrent queries: all complete without errors
  - [ ] Document actual performance numbers
  - [ ] Identify and document any bottlenecks
- **Effort**: S (0.5 days)
- **Dependencies**: Task 5.1

---

## Task Dependencies

```
Phase 0 (Foundation):
  0.1 (POC) ─────────────────────┐
  0.2 (Types/Config/Metrics) ────┤──► Phase 1
  0.3 (Scope Validator) ─────────┘

Phase 1 (Core Engine):
  1.1 (Query Builder) ──────┐
  1.2 (OLE DB Executor) ────┤
  1.3 (Result Mapper) ──────┤──► 1.5 (Provider) ──► Phase 2
  1.4 (Path Anonymizer) ────┘

Phase 2 (Integration):
  2.1 (Schema) ──────────────┐
  2.2 (Resolver) ────────────┤──► 2.3 (Server) ──► 2.5 (Integration Tests)
  2.4 (MCP Service) ─────────┘

Phase 3 (Security) — can start after Phase 1:
  3.1 (SQL Injection) ──── after 1.1
  3.2 (Scope Security) ── after 0.3, 1.5
  3.3 (PII Leaks) ──────── after 1.4
  3.4 (Edge Cases) ─────── after 1.5
  3.5 (Validation) ──────── after 2.2, 1.5

Phase 4 (Docs/Polish) — after Phases 2 & 3
Phase 5 (Validation) — after Phase 4
```

---

## Critical Path

```
0.1 (POC) → 1.1 (Query Builder) → 1.5 (Provider) → 2.2 (Resolver) → 2.3 (Server) → 2.5 (Integration) → 4.3 (Coverage) → 5.1 (Windows Test)
```

This is the longest chain of dependent tasks. Any delay on these tasks directly delays the feature.

---

## Parallel Work Opportunities

| Parallel Group | Tasks | After |
|---------------|-------|-------|
| Phase 0 Setup | 0.1, 0.2, 0.3 | Can all start immediately |
| Phase 1 Components | 1.1, 1.2, 1.3, 1.4 | After 0.1 (but independent of each other) |
| Phase 2 MCP | 2.4 | Can run in parallel with 2.2, 2.3 |
| Phase 3 Security | 3.1, 3.3 | Can start as soon as 1.1, 1.4 complete |
| Phase 4 Docs | 4.1, 4.2 | Can run in parallel |

---

## Risk Mitigation

| Risk | Mitigation | Task |
|------|-----------|------|
| node-adodb doesn't work with Search.CollatorDSO | Task 0.1 is explicitly a POC — if it fails, pivot to PowerShell approach before investing further | 0.1 |
| SQL injection in query builder | 100% test coverage on sanitization, dedicated security test suite, code review | 1.1, 3.1 |
| Large offset pagination performance | Cap max offset at 10000, document limitation, plan keyset pagination as future optimization | 1.1, 5.3 |
| Multi-valued OLE DB properties | Document in POC, handle all formats (array, semicolons, null) in result mapper | 0.1, 1.3 |
| Shared PiiAnonymizer breaking EventLog | Don't modify PiiAnonymizer — PathAnonymizer wraps it; all existing tests must still pass | 1.4, 2.5 |

---

## Notes

- **Follow EventLog patterns exactly** where applicable (config, metrics, provider, resolver) to maintain consistency
- **Don't modify existing files unnecessarily** — use the same spread/import pattern the EventLog resolver uses
- **Mock node-adodb in all unit tests** — tests must run in CI without Windows Search
- **Tag Windows-only integration tests** so they can be skipped in CI
- **Commit after each completed task** with format: `✓ Task X.Y: [task name]`

---

## Document Metadata

- **Tasks Version**: 1.0
- **Created**: 2026-02-10
- **Last Updated**: 2026-02-10
- **Specification Reference**: `/features/003-filesearch-mcp.spec.md`
- **Plan Reference**: `/features/003-filesearch-mcp.plan.md`
- **Related Documents**:
  - `/features/002-eventlog-mcp.tasks.md` — EventLog task format reference
  - `/docs/EXTENSION-GUIDE.md` — Service implementation guide
