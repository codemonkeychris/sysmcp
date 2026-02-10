# Technical Implementation Plan: FileSearch MCP (Read-Only)

**Feature Number**: 003  
**Feature Title**: FileSearch MCP (Read-Only)  
**Document Version**: 1.0  
**Created**: 2026-02-10  
**Status**: Ready for Implementation  

---

## Executive Summary

This document provides the technical implementation plan for Feature 003: FileSearch MCP (Read-Only), which enables searching files through a GraphQL interface backed by the Windows Search Indexer service. Building on the MCP Host Bootstrap (Feature 001) and following the EventLog MCP (Feature 002) architectural patterns, this feature translates structured GraphQL parameters into Windows Search SQL queries executed via OLE DB/ADO using the `node-adodb` npm package.

The implementation provides full-text search (CONTAINS and FREETEXT modes), structured filtering (file type, size, dates, author, path scope), offset-based pagination with configurable page sizes (default 500), PII anonymization on file paths and author metadata using the shared AnonymizationStore, and configurable search scope restrictions.

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SysMCP MCP Host Service                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   GraphQL Layer                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Query: fileSearch(searchText, searchMode,           │  │  │
│  │  │         path, fileName, fileType, minSize, maxSize,  │  │  │
│  │  │         modifiedAfter/Before, createdAfter/Before,   │  │  │
│  │  │         author, limit, offset)                       │  │  │
│  │  │  Returns: FileSearchResults (files, pageInfo,        │  │  │
│  │  │           totalCount, metrics)                       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              FileSearch Query Provider                     │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ • Validate inputs & scope restrictions              │  │  │
│  │  │ • Build Windows Search SQL from parameters          │  │  │
│  │  │ • Execute via OLE DB (node-adodb)                   │  │  │
│  │  │ • Map OLE DB results to FileSearchEntry objects      │  │  │
│  │  │ • Apply PII anonymization                           │  │  │
│  │  │ • Track metrics                                     │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Windows Search SQL Builder                    │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ • SELECT columns from SystemIndex                   │  │  │
│  │  │ • SCOPE clause from path parameter                  │  │  │
│  │  │ • CONTAINS() / FREETEXT() for full-text search      │  │  │
│  │  │ • WHERE predicates for filters                      │  │  │
│  │  │ • ORDER BY + TOP for pagination                     │  │  │
│  │  │ • SQL injection prevention via parameterization     │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              OLE DB Executor (node-adodb)                  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ • Connection: Search.CollatorDSO provider           │  │  │
│  │  │ • Execute Windows Search SQL queries                │  │  │
│  │  │ • Parse recordset results                           │  │  │
│  │  │ • Error handling & retry logic                      │  │  │
│  │  │ • Connection lifecycle management                   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                            ↓                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │         Shared PII Anonymization Engine                    │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ • Reuse AnonymizationStore from EventLog            │  │  │
│  │  │ • Path anonymization: C:\Users\[ANON_USER_N]\...    │  │  │
│  │  │ • Author anonymization: [ANON_USER_N]               │  │  │
│  │  │ • Consistent mapping across EventLog + FileSearch   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                             ↓
          Windows Search Indexer Service (WSearch)
          via OLE DB Provider: Search.CollatorDSO
```

### Data Flow

**FileSearch Query Flow**:
```
1. GraphQL/MCP Request Received
   ├─ Validate input parameters (limit, offset, filters, dates, scope)
   ├─ Check service is enabled (ConfigManager)
   ├─ Validate path against allowed scopes
   │
2. Build Windows Search SQL
   ├─ Construct SELECT with required columns
   ├─ Add SCOPE clause (path restriction)
   ├─ Add CONTAINS/FREETEXT if searchText provided
   ├─ Add WHERE predicates for filters
   ├─ Add ORDER BY System.DateModified DESC
   ├─ Handle pagination via TOP (limit+1) for hasNextPage detection
   │
3. Execute Query via OLE DB
   ├─ Open ADODB connection to Search.CollatorDSO
   ├─ Execute generated SQL
   ├─ Skip first `offset` rows (client-side offset)
   ├─ Collect up to `limit+1` result rows
   ├─ Close connection
   │
4. Process Results
   ├─ Map OLE DB recordset to FileSearchEntry objects
   ├─ Handle null/missing metadata gracefully
   ├─ Apply PII anonymization (paths, author)
   ├─ Calculate pagination (hasNextPage from limit+1 trick)
   │
5. Return Response
   ├─ FileSearchResults with files, pageInfo, totalCount, metrics
   └─ Log query audit trail (without PII)
```

---

## Components to Create

### New Files

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/services/filesearch/types.ts` | TypeScript interfaces/enums (FileSearchEntry, FileSearchQueryParams, etc.) | ~120 |
| `src/services/filesearch/query-builder.ts` | Translates GraphQL params → Windows Search SQL | ~250 |
| `src/services/filesearch/oledb-executor.ts` | Executes SQL via node-adodb, maps results | ~200 |
| `src/services/filesearch/provider.ts` | FileSearch provider (lifecycle, validation, metrics) | ~280 |
| `src/services/filesearch/config.ts` | FileSearchConfigManager (mirrors EventLog pattern) | ~200 |
| `src/services/filesearch/metrics.ts` | FileSearchMetricsCollector (reuse/adapt EventLog pattern) | ~150 |
| `src/services/filesearch/path-anonymizer.ts` | Path-specific PII anonymization logic | ~100 |
| `src/services/filesearch/mcp-service.ts` | IService implementation for MCP integration | ~150 |
| `src/graphql/filesearch.resolver.ts` | GraphQL resolver for fileSearch query | ~280 |
| `src/mcp/filesearch-service.ts` | MCP service wrapper (like eventlog-service.ts) | ~200 |

### Files to Modify

| File | Change | Scope |
|------|--------|-------|
| `src/graphql/schema.ts` | Add FileSearch types, SearchMode enum, fileSearch query | ~50 lines added |
| `src/graphql/resolvers.ts` | Import and spread filesearchResolver | ~5 lines |
| `src/server.ts` | Initialize FileSearchProvider alongside EventLogProvider | ~15 lines |
| `src/mcp/index.ts` | Register FileSearchMcpService alongside EventLog | ~5 lines |
| `package.json` | Add `node-adodb` dependency | 1 line |

### Test Files to Create

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/services/filesearch/__tests__/query-builder.test.ts` | SQL generation tests, injection prevention | ~400 |
| `src/services/filesearch/__tests__/oledb-executor.test.ts` | OLE DB execution with mocked ADODB | ~250 |
| `src/services/filesearch/__tests__/provider.test.ts` | Provider lifecycle, validation, error handling | ~300 |
| `src/services/filesearch/__tests__/config.test.ts` | Config manager tests | ~150 |
| `src/services/filesearch/__tests__/metrics.test.ts` | Metrics collection tests | ~120 |
| `src/services/filesearch/__tests__/path-anonymizer.test.ts` | Path PII anonymization tests | ~200 |
| `src/services/filesearch/__tests__/mcp-service.test.ts` | IService interface compliance | ~150 |
| `src/graphql/__tests__/filesearch.resolver.test.ts` | GraphQL resolver tests | ~350 |
| `src/mcp/__tests__/filesearch-service.test.ts` | MCP service tests | ~200 |

---

## Detailed Component Design

### 1. Types (`types.ts`)

```typescript
// Core enums
export enum SearchMode {
  CONTAINS = 'CONTAINS',
  FREETEXT = 'FREETEXT'
}

// Query parameters (from GraphQL args)
export interface FileSearchQueryParams {
  searchText?: string;
  searchMode?: SearchMode;
  path?: string;
  fileName?: string;
  fileType?: string;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
  author?: string;
  limit: number;   // default 500, max 1000
  offset: number;  // default 0
}

// Single result entry
export interface FileSearchEntry {
  path: string;
  fileName: string;
  fileType: string;
  size: number;
  dateModified: Date;
  dateCreated: Date;
  author?: string;
  title?: string;
  tags: string[];
}

// Pagination info (reuse PageInfo from EventLog)
export interface FileSearchPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: number;
  endCursor: number;
}

// Query metrics
export interface FileSearchQueryMetrics {
  searchCount: number;
  responseDurationMs: number;
  resultsReturned: number;
}

// Complete result
export interface FileSearchResult {
  files: FileSearchEntry[];
  pageInfo: FileSearchPageInfo;
  totalCount: number;
  metrics: FileSearchQueryMetrics;
}
```

### 2. Query Builder (`query-builder.ts`)

This is the most critical and security-sensitive component. It translates GraphQL parameters into Windows Search SQL.

**Key Design Decisions**:

- **SQL Injection Prevention**: Windows Search SQL via OLE DB does NOT support parameterized queries. We must sanitize all user input manually:
  - String values: escape single quotes by doubling them (`'` → `''`)
  - Numeric values: validate as numbers before embedding
  - Date values: validate as ISO 8601 and format consistently
  - Wildcards in fileName: only allow `*` and `?`, escape other SQL special chars
  - CONTAINS/FREETEXT search text: escape double quotes, strip SQL keywords

- **Pagination Strategy**: Windows Search SQL supports `TOP N` but not `OFFSET`. Strategy:
  - Use `TOP (offset + limit + 1)` to fetch enough rows
  - Client-side: skip first `offset` rows from the result set
  - Fetch `limit + 1` rows to detect `hasNextPage` (then trim to `limit`)
  - For totalCount: execute a separate `SELECT COUNT(*)` query

- **Column Selection**: Use Windows Search property system names:
  ```
  System.ItemPathDisplay    → path
  System.FileName           → fileName
  System.FileExtension      → fileType
  System.Size               → size
  System.DateModified       → dateModified
  System.DateCreated        → dateCreated
  System.Author             → author (multi-valued)
  System.Title              → title
  System.Keywords           → tags (multi-valued)
  ```

**Query Builder Interface**:
```typescript
export interface BuiltQuery {
  sql: string;
  countSql: string;
  offset: number;
  limit: number;
}

export function buildSearchQuery(params: FileSearchQueryParams): BuiltQuery;
export function sanitizeSearchText(text: string): string;
export function sanitizeStringValue(value: string): string;
export function buildScopeClause(path: string): string;
export function buildFilterPredicates(params: FileSearchQueryParams): string[];
```

**Example Generated SQL**:
```sql
-- Main query
SELECT TOP 501
  System.ItemPathDisplay, System.FileName, System.FileExtension,
  System.Size, System.DateModified, System.DateCreated,
  System.Author, System.Title, System.Keywords
FROM SystemIndex
WHERE SCOPE='file:C:/Users/chris/Documents'
  AND CONTAINS(*, '"quarterly report"')
  AND System.FileExtension = '.pdf'
  AND System.Size > 1048576
ORDER BY System.DateModified DESC

-- Count query
SELECT COUNT(*)
FROM SystemIndex
WHERE SCOPE='file:C:/Users/chris/Documents'
  AND CONTAINS(*, '"quarterly report"')
  AND System.FileExtension = '.pdf'
  AND System.Size > 1048576
```

### 3. OLE DB Executor (`oledb-executor.ts`)

Wraps `node-adodb` for executing Windows Search SQL queries.

**Connection String**: `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`

**Key Design Decisions**:
- **Connection per query**: `node-adodb` creates a new COM process per connection. Creating connections is lightweight (<10ms) and avoids threading/state issues.
- **Timeout**: Default 30 seconds per query, configurable.
- **Error Classification**: Map OLE DB errors to meaningful error codes:
  - `0x80040E14` → SQL syntax error
  - `0x80040E37` → Provider not available (WSearch not running)
  - `0x80070005` → Access denied
  - Connection refused → Service not running

**Interface**:
```typescript
export interface OleDbExecutorOptions {
  timeoutMs?: number;  // default 30000
}

export interface OleDbResult {
  rows: Record<string, unknown>[];
  success: boolean;
  errorMessage?: string;
  executionTimeMs: number;
}

export class OleDbExecutor {
  constructor(options?: OleDbExecutorOptions);
  async execute(sql: string): Promise<OleDbResult>;
  async checkAvailability(): Promise<{ available: boolean; message: string }>;
}
```

### 4. FileSearch Provider (`provider.ts`)

Follows the same pattern as `EventLogProvider`:
- Lifecycle management (start/stop/healthcheck)
- Input validation
- Metrics tracking
- Error handling with proper exception types
- Coordinates query builder → OLE DB executor → result mapping → anonymization

### 5. Path Anonymizer (`path-anonymizer.ts`)

FileSearch-specific PII anonymization logic that works with the shared `PiiAnonymizer`:

```typescript
export class PathAnonymizer {
  constructor(private anonymizer: PiiAnonymizer);

  // C:\Users\john.doe\Documents\report.docx → C:\Users\[ANON_USER_1]\Documents\report.docx
  anonymizePath(path: string): string;

  // "John Doe" → "[ANON_USER_1]"
  anonymizeAuthor(author: string): string;

  // Apply anonymization to a FileSearchEntry
  anonymizeEntry(entry: FileSearchEntry): FileSearchEntry;
}
```

**Path Anonymization Rules**:
1. Detect user profile path pattern: `C:\Users\<username>\...`
2. Extract username from path
3. Look up / create anonymized ID via shared PiiAnonymizer
4. Replace username segment in path
5. Also check for `%USERPROFILE%` expanded paths

### 6. Config Manager (`config.ts`)

Mirrors `EventLogConfigManager` pattern exactly:

```typescript
export interface FileSearchConfig {
  enabled: boolean;
  permissionLevel: PermissionLevel;
  maxResults?: number;
  timeoutMs?: number;
  enableAnonymization?: boolean;
  allowedPaths?: string[];     // search scope restrictions
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class FileSearchConfigManager {
  constructor(initialConfig?: FileSearchConfig);
  // MVP defaults: enabled=true, read-only, maxResults=10000,
  //   timeout=30s, anonymization=true, allowedPaths=[] (all)
  isEnabled(): boolean;
  getPermissionLevel(): PermissionLevel;
  getAllowedPaths(): string[];
  // ... setters matching EventLog pattern
}
```

### 7. MCP Service (`mcp-service.ts` and `src/mcp/filesearch-service.ts`)

Two MCP integration files following the EventLog pattern:

**`src/services/filesearch/mcp-service.ts`** — IService implementation used by ServiceManager:
```typescript
export class FileSearchMcpService implements IService {
  readonly id = 'filesearch';
  readonly name = 'FileSearch MCP Service';
  readonly version = '1.0.0';
  
  getTools(): ToolDefinition[] {
    return [
      { name: 'filesearch_query', ... },
      { name: 'filesearch_status', ... }
    ];
  }
  
  async callTool(toolName, args): Promise<ToolExecutionResult> { ... }
}
```

**`src/mcp/filesearch-service.ts`** — MCP wrapper that calls GraphQL backend:
```typescript
export class FileSearchMcpService implements IService {
  constructor(private graphqlUrl: string);
  // Sends GraphQL queries to the fileSearch resolver
  // Same pattern as src/mcp/eventlog-service.ts
}
```

### 8. GraphQL Schema Changes (`schema.ts`)

Add to existing schema:

```graphql
"""Search mode for full-text queries"""
enum SearchMode {
  """Exact match search using CONTAINS"""
  CONTAINS
  """Natural language search using FREETEXT"""
  FREETEXT
}

"""A single file search result entry"""
type FileSearchEntry {
  """Full file path (may be PII-anonymized)"""
  path: String!
  """File name with extension"""
  fileName: String!
  """File extension"""
  fileType: String!
  """File size in bytes"""
  size: Int!
  """Last modified timestamp (ISO 8601)"""
  dateModified: String!
  """Creation timestamp (ISO 8601)"""
  dateCreated: String!
  """Document author (may be PII-anonymized)"""
  author: String
  """Document title"""
  title: String
  """Document tags/keywords"""
  tags: [String!]!
}

"""Metrics for file search query execution"""
type FileSearchQueryMetrics {
  """Total number of searches executed"""
  searchCount: Int!
  """Query execution time in milliseconds"""
  responseDurationMs: Int!
  """Number of results returned"""
  resultsReturned: Int!
}

"""Complete file search result"""
type FileSearchResults {
  """File entries matching the search"""
  files: [FileSearchEntry!]!
  """Pagination metadata"""
  pageInfo: PageInfo!
  """Total matching files across all pages"""
  totalCount: Int!
  """Query performance metrics"""
  metrics: FileSearchQueryMetrics!
}

# Add to Query type:
fileSearch(
  searchText: String
  searchMode: SearchMode = CONTAINS
  path: String
  fileName: String
  fileType: String
  minSize: Int
  maxSize: Int
  modifiedAfter: String
  modifiedBefore: String
  createdAfter: String
  createdBefore: String
  author: String
  limit: Int = 500
  offset: Int = 0
): FileSearchResults!
```

### 9. GraphQL Resolver (`filesearch.resolver.ts`)

Follows the `eventlog.resolver.ts` pattern:
- Custom error codes (`FileSearchErrorCode` enum)
- Input validation with clear error messages
- Service availability checks
- PII anonymization integration
- Metrics collection
- Audit logging

```typescript
export enum FileSearchErrorCode {
  InvalidLimit = 'INVALID_LIMIT',
  InvalidOffset = 'INVALID_OFFSET',
  InvalidDateRange = 'INVALID_DATE_RANGE',
  InvalidSizeRange = 'INVALID_SIZE_RANGE',
  InvalidPath = 'INVALID_PATH',
  PathOutsideScope = 'PATH_OUTSIDE_SCOPE',
  ServiceDisabled = 'SERVICE_DISABLED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  SearchServiceNotRunning = 'SEARCH_SERVICE_NOT_RUNNING',
  OleDbError = 'OLEDB_ERROR',
  AnonymizationFailure = 'ANONYMIZATION_FAILURE',
  UnknownError = 'UNKNOWN_ERROR'
}
```

---

## Dependencies

### New npm Dependencies

| Package | Version | Purpose | Risk |
|---------|---------|---------|------|
| `node-adodb` | ^5.0.3 | OLE DB/ADO access from Node.js for Windows Search SQL | Windows-only, uses COM, actively maintained |

### Existing Dependencies Leveraged

| Package | Used For |
|---------|----------|
| `apollo-server-express` | GraphQL server integration |
| `graphql` | Schema & type system |
| `pino` | Logging |
| `express` | HTTP server |

### Shared Internal Dependencies

| Module | Used For |
|--------|----------|
| `src/services/shared/service-interface.ts` | IService interface |
| `src/services/eventlog/lib/src/anonymizer.ts` | PiiAnonymizer (shared store) |
| `src/services/eventlog/anonymization-store.ts` | AnonymizationStore persistence |
| `src/graphql/cursor.ts` | Cursor utilities (may extend for FileSearch) |
| `src/mcp/message-types.ts` | ToolDefinition, etc. |
| `src/mcp/service-manager.ts` | Service registration |

---

## Security Considerations

### SQL Injection Prevention

Windows Search SQL via OLE DB does NOT support parameterized queries. Manual sanitization is critical:

1. **String sanitization**: Replace `'` with `''` in all string values
2. **CONTAINS/FREETEXT text**: 
   - Strip or escape `"` (double quotes used for phrase matching)
   - Remove SQL keywords (`DROP`, `DELETE`, `INSERT`, `UPDATE`, `EXEC`)
   - Limit length to prevent abuse
3. **Numeric validation**: Parse and validate all numeric inputs before embedding
4. **Date validation**: Parse as Date objects, re-serialize in safe format
5. **Path validation**: Normalize paths, reject `..`, validate against allowed scopes
6. **fileName patterns**: Only allow `*` and `?` wildcards, escape `%`, `_`, `[`, `]`

### Scope Enforcement

- Scope paths validated at both the application level and SQL level (SCOPE clause)
- Path normalization prevents bypass via relative paths or case tricks
- Post-query validation ensures results are within allowed scope (defense in depth)

### PII Protection

- File paths containing user profiles anonymized before returning
- Author metadata anonymized using shared PiiAnonymizer
- Anonymization happens in the resolver before returning to GraphQL client
- No PII in log messages or audit trails

### Input Validation Summary

| Parameter | Validation |
|-----------|-----------|
| `limit` | 1 ≤ limit ≤ 1000 |
| `offset` | offset ≥ 0 |
| `minSize` | minSize ≥ 0 |
| `maxSize` | maxSize ≥ minSize (if both) |
| `modifiedAfter/Before` | Valid ISO 8601, after ≤ before |
| `createdAfter/Before` | Valid ISO 8601, after ≤ before |
| `path` | Normalized, no `..`, within allowed scopes |
| `searchText` | Sanitized for SQL injection, max 500 chars |
| `fileName` | Sanitized wildcards only `*` and `?` |
| `fileType` | Must start with `.`, alphanumeric only |
| `author` | String sanitized for SQL |

---

## Testing Strategy

### Unit Tests (Mocked, Fast)

1. **Query Builder Tests** (`query-builder.test.ts`) — Most critical
   - Generates correct SQL for each parameter
   - Generates correct SQL for parameter combinations
   - CONTAINS vs FREETEXT mode differences
   - SCOPE clause from path parameter
   - ORDER BY and TOP clauses
   - SQL injection prevention (single quotes, SQL keywords, special chars)
   - Edge cases: empty params, null values, extreme values
   - Wildcard translation for fileName

2. **OLE DB Executor Tests** (`oledb-executor.test.ts`)
   - Mock `node-adodb` to return fake recordsets
   - Test result parsing and type conversion
   - Test error handling (service unavailable, access denied, timeout)
   - Test connection string generation

3. **Provider Tests** (`provider.test.ts`)
   - Lifecycle management (start/stop/healthcheck)
   - Input validation
   - Error handling and exception types
   - Metrics tracking
   - Disabled service behavior

4. **Config Tests** (`config.test.ts`)
   - Default values
   - Setter validation
   - Allowed paths management
   - Reset to defaults

5. **Path Anonymizer Tests** (`path-anonymizer.test.ts`)
   - User profile path detection and anonymization
   - Author name anonymization
   - Consistency across multiple calls
   - Shared store integration (same user → same anon ID)
   - Edge cases: network paths, root paths, no user segment

6. **Metrics Tests** (`metrics.test.ts`)
   - Recording queries
   - Calculating averages
   - Reset behavior
   - Edge cases

### Integration Tests

7. **GraphQL Resolver Tests** (`filesearch.resolver.test.ts`)
   - End-to-end with mocked provider
   - Input validation error responses
   - Pagination behavior
   - PII anonymization in responses
   - Metrics in response
   - Service unavailable handling
   - Error code classification

### Security Tests

8. **SQL Injection Tests** (within `query-builder.test.ts`)
   - Single quote injection: `'; DROP TABLE --`
   - CONTAINS injection: `"test" OR 1=1`
   - Path traversal: `..\..\Windows\System32`
   - Unicode bypass attempts
   - Oversized input handling

### Mock Strategy

For CI environments without Windows Search:
- Mock `node-adodb` at the module level in tests
- Return realistic but synthetic recordset data
- Test the full pipeline from GraphQL → SQL → mock results → response
- Separate integration tests marked for Windows-only execution

---

## Pagination Implementation Details

### Strategy: TOP + Client-Side Offset

Windows Search SQL does not support SQL `OFFSET`. The approach:

1. **Main Query**: `SELECT TOP (offset + limit + 1) ... ORDER BY System.DateModified DESC`
2. **Client-Side**: Skip first `offset` rows from the result
3. **hasNextPage**: If we got `limit + 1` rows (after skipping), there are more
4. **Return**: First `limit` rows after skipping

**Limitations**:
- For large offsets (e.g., offset=10000), we fetch 10000+limit+1 rows but discard most
- This is acceptable because:
  - Most queries use small offsets (typical browsing)
  - Windows Search is fast for indexed queries
  - We can add a max offset limit (e.g., 10000) to prevent abuse

**Total Count**:
- Separate `SELECT COUNT(*) FROM SystemIndex WHERE <same-filters>` query
- Runs in parallel with main query for efficiency
- Returns exact count for PageInfo

### Alternative Considered: Keyset Pagination

Using `WHERE System.DateModified < @lastTimestamp` would be more efficient for large datasets but:
- Requires consistent sort order
- More complex cursor encoding
- Doesn't support arbitrary page jumping
- Can be added as future optimization

---

## Metrics Implementation

Reuse the `EventLogMetricsCollector` pattern but rename for FileSearch:

```typescript
export class FileSearchMetricsCollector {
  // Same interface as EventLogMetricsCollector
  recordQuery(duration: number, resultCount: number, failed?: boolean): void;
  getMetrics(): MetricsSnapshot;
  reset(): void;
  export(): Promise<MetricsReport>;
}
```

Could potentially create a shared `MetricsCollector` base class and have both EventLog and FileSearch extend it, but for MVP, duplicate the pattern to minimize risk of breaking EventLog.

---

## Error Handling Strategy

### Error Classification

| Error Source | Detection | Response |
|-------------|-----------|----------|
| Windows Search not running | OLE DB connection error `0x80040E37` or service query | `SEARCH_SERVICE_NOT_RUNNING` with diagnostic message |
| OLE DB provider not available | Connection string failure | `SERVICE_UNAVAILABLE` with installation instructions |
| Access denied to path | OLE DB error `0x80070005` | `PERMISSION_DENIED` generic message |
| SQL syntax error | OLE DB error `0x80040E14` | `OLEDB_ERROR` (log details internally) |
| Invalid input | Validation checks | Specific error code per validation |
| Path outside scope | Scope check | `PATH_OUTSIDE_SCOPE` |
| Anonymization failure | PiiAnonymizer throws | `ANONYMIZATION_FAILURE` |
| Timeout | Operation exceeds timeoutMs | `SERVICE_UNAVAILABLE` |
| Unknown | catch-all | `UNKNOWN_ERROR` (log stack internally) |

### Health Check Implementation

```typescript
async healthcheck(): Promise<{ healthy: boolean; status: string; details?: any }> {
  // 1. Check if WSearch service is running (via service status query or OLE DB probe)
  // 2. Execute simple query: SELECT TOP 1 System.FileName FROM SystemIndex
  // 3. Return healthy=true if successful, with indexed file count if available
}
```

---

## Implementation Risks

### Risk 1: node-adodb Compatibility (Medium)
**Risk**: `node-adodb` may not work correctly with Windows Search OLE DB provider  
**Mitigation**: Early proof-of-concept (Task 1) to validate before building the full stack  
**Fallback**: Use PowerShell `Invoke-CimMethod` or direct COM interop via `edge-js`

### Risk 2: Pagination Performance for Large Offsets (Low)
**Risk**: Fetching `offset + limit` rows for large offsets may be slow  
**Mitigation**: Set maximum offset limit (10000), optimize with keyset pagination later  
**Impact**: Only affects deep pagination, not typical use cases

### Risk 3: totalCount Performance (Low)
**Risk**: COUNT(*) query may be slow for broad searches  
**Mitigation**: Execute count query in parallel; consider caching or estimating for very large counts  
**Fallback**: Return -1 for totalCount and only provide hasNextPage

### Risk 4: Windows Search Index Completeness (Low)
**Risk**: Index may not cover all files or may be stale  
**Mitigation**: Document limitation; surface index status in `filesearch_status` tool  
**Impact**: User expectation management, not a code issue

### Risk 5: Multi-valued Properties (Low)
**Risk**: `System.Author` and `System.Keywords` are multi-valued properties that may return arrays or semicolon-delimited strings  
**Mitigation**: Handle both formats in result mapping; normalize to string arrays  

---

## Rollout Strategy

### Phase 1: Proof of Concept
- Install `node-adodb`, validate Windows Search OLE DB connectivity
- Execute a simple query and parse results
- Validate column availability and data types

### Phase 2: Core Implementation
- Types, query builder, OLE DB executor
- Unit tests for all core components
- SQL injection test suite

### Phase 3: Integration
- Provider with lifecycle management
- GraphQL schema and resolver
- MCP service wrapper
- Integration tests

### Phase 4: PII & Security
- Path anonymizer with shared store
- Scope restriction enforcement
- Security test suite

### Phase 5: Polish
- Config manager
- Metrics integration
- Error handling refinement
- Documentation
- Final test coverage validation

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Test coverage | >80% line and branch |
| Query latency (indexed) | <200ms typical |
| Query latency (with totalCount) | <400ms typical |
| Memory usage | <500MB for typical queries |
| SQL injection tests | 100% of known vectors blocked |
| PII leak tests | 0 PII in responses when anonymization enabled |

---

## Open Questions Resolved

### Q1: OLE DB Execution from Node.js
**Answer**: Use `node-adodb` v5.0.3. It spawns a JScript-based COM bridge process to execute ADODB queries. Windows-only (which is our target). Connection string: `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`.

### Q2: Pagination Strategy
**Answer**: Use `TOP (offset + limit + 1)` with client-side offset skipping. The +1 trick detects hasNextPage. Separate COUNT(*) query for totalCount. Set max offset at 10000 to prevent abuse.

### Q3: Total Count Performance
**Answer**: Always provide exact count via parallel COUNT(*) query. Monitor performance and add estimation fallback if needed later.

### Q4: Search Scope Security
**Answer**: Both (belt and suspenders). SCOPE clause in SQL AND post-query path validation to ensure no results leak outside allowed scope.

### Q5: Connection Pooling
**Answer**: Connection per query. `node-adodb` creates lightweight COM processes. No threading issues. Connection lifecycle managed by the executor.

### Q6: Index Completeness
**Answer**: Surface index status via `filesearch_status` tool. Don't try to detect completeness — document it as a known limitation of the Windows Search service.

---

## Next Steps

1. **Plan Approval**: Review this plan with stakeholders
2. **Task Breakdown**: Run the `feature-tasks` skill to create ordered implementation tasks
3. **Implementation**: Begin with Phase 1 proof of concept (node-adodb + Windows Search validation)

---

## Document Metadata

- **Plan Version**: 1.0
- **Created**: 2026-02-10
- **Last Updated**: 2026-02-10
- **Specification Reference**: `/features/003-filesearch-mcp.spec.md`
- **Related Documents**:
  - `/features/plan.md` - Project overall plan
  - `/features/002-eventlog-mcp.plan.md` - EventLog plan (architectural pattern reference)
  - `/docs/EXTENSION-GUIDE.md` - How to add new services
  - `/src/services/shared/service-interface.ts` - IService interface
- **Approval Status**: Pending Review
