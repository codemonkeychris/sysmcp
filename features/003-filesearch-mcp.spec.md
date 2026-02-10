# Feature 003: FileSearch MCP (Read-Only) - Specification

**Feature ID**: 003-filesearch-mcp  
**Status**: Specification Complete  
**Created**: 2026-02-10  
**Owner**: Development Team

---

## Overview

Feature 003 enables searching the Windows file system through a read-only GraphQL interface backed by the Windows Search Indexer service. It leverages OLE DB / ADO with Windows Search SQL syntax to execute efficient indexed queries, translating structured GraphQL parameters into native search SQL behind the scenes. The feature returns file metadata (path, name, size, dates, type, author, title, tags) with PII anonymization on file paths and author fields, full-text search via CONTAINS/FREETEXT, configurable pagination (default 500 per page), and configurable path scope restrictions for security.

---

## Goals

- Expose Windows Search Indexer results as queryable GraphQL resources
- Leverage the Windows Search OLE DB provider for efficient indexed queries
- Translate structured GraphQL filter parameters into Windows Search SQL behind the scenes
- Support both exact match (CONTAINS) and natural language (FREETEXT) full-text search
- Return file metadata including document properties (author, title, tags) from the index
- Provide configurable pagination with 500 results per page default
- Apply PII anonymization on file paths (user profile segments) and author/owner metadata
- Enforce configurable path scope restrictions as a security boundary
- Design for conditional enable/disable via future Config UI (hardcode enabled for MVP)
- Reuse the shared PII AnonymizationStore from EventLog for cross-service consistency
- Track usage metrics (search count, response time) for monitoring
- Maintain >80% test coverage with unit, integration, security, and performance tests

---

## User Stories

### Story 1: Search Files by Name
**As a** user looking for a specific file  
**I want to** search for files matching a filename pattern  
**So that** I can quickly locate files without manually browsing directories

### Story 2: Search Files by Content Keywords
**As a** developer or knowledge worker  
**I want to** search for files containing specific text or keywords using natural language  
**So that** I can find documents related to a topic even if I don't remember the filename

### Story 3: Filter Files by Type and Size
**As a** system administrator investigating disk usage  
**I want to** filter search results by file extension, minimum/maximum size, and date ranges  
**So that** I can identify large or old files consuming storage

### Story 4: Paginate Large Search Results
**As a** developer building a file management tool  
**I want to** retrieve search results in configurable page sizes with cursor-based pagination  
**So that** I can efficiently process large result sets without overwhelming memory

### Story 5: Browse Document Metadata
**As a** user organizing files  
**I want to** see document metadata (author, title, tags) in search results  
**So that** I can understand file provenance without opening each file

### Story 6: Protect PII in File Paths
**As a** privacy-conscious user  
**I want to** have user profile path segments and author names anonymized in search results  
**So that** I can share results with LLMs or others without exposing personal directory structures

### Story 7: Restrict Searchable Paths
**As a** security-aware administrator  
**I want to** configure which directories are searchable  
**So that** sensitive directories are excluded from search results

### Story 8: Handle Search Service Unavailability
**As a** user on a system where Windows Search is disabled  
**I want to** receive a clear error message explaining why file search is unavailable  
**So that** I can take corrective action (enable Windows Search) rather than seeing cryptic errors

---

## Functional Requirements

### FR-1: GraphQL Query Interface

Implement a GraphQL query type `fileSearch` that accepts the following arguments:

- `searchText` (String, optional): Full-text search query applied to filenames and indexed content
- `searchMode` (SearchMode enum, optional, default CONTAINS): `CONTAINS` for exact match, `FREETEXT` for natural language/fuzzy search
- `path` (String, optional): Restrict search to files under this directory path (scope)
- `fileName` (String, optional): Filter by filename pattern (supports wildcards: `*`, `?`)
- `fileType` (String, optional): Filter by file extension (e.g., `.docx`, `.pdf`, `.ts`)
- `minSize` (Int, optional): Minimum file size in bytes
- `maxSize` (Int, optional): Maximum file size in bytes
- `modifiedAfter` (DateTime, optional): Files modified after this timestamp
- `modifiedBefore` (DateTime, optional): Files modified before this timestamp
- `createdAfter` (DateTime, optional): Files created after this timestamp
- `createdBefore` (DateTime, optional): Files created before this timestamp
- `author` (String, optional): Filter by document author metadata
- `limit` (Int, default 500, max 1000): Maximum number of results per page
- `offset` (Int, default 0): Pagination offset

### FR-2: File Search Result Data Model

Return `FileSearchEntry` objects with the following fields:

- `path` (String!): Full file path (PII-anonymized if configured)
- `fileName` (String!): File name with extension
- `fileType` (String!): File extension / MIME type
- `size` (Int!): File size in bytes
- `dateModified` (DateTime!): Last modified timestamp
- `dateCreated` (DateTime!): Creation timestamp
- `author` (String): Document author (PII-anonymized if configured, null if not available)
- `title` (String): Document title (null if not available)
- `tags` ([String]): Document tags/keywords (empty array if not available)

### FR-3: Pagination Support

Implement pagination consistent with EventLog pattern:

- `pageInfo` object containing:
  - `hasNextPage` (Boolean!): Whether more results exist
  - `hasPreviousPage` (Boolean!): Whether previous results exist
  - `startCursor` (String): Cursor for start of current page
  - `endCursor` (String): Cursor for end of current page
- `totalCount` (Int!): Total number of results matching query
- Support offset-based pagination via limit/offset parameters

### FR-4: Windows Search SQL Translation

Translate GraphQL parameters into Windows Search SQL queries via OLE DB/ADO:

- Map `searchText` + `searchMode` to `CONTAINS()` or `FREETEXT()` predicates on `System.FileName` and content columns
- Map `path` to `SCOPE` clause in Windows Search SQL (e.g., `SELECT ... FROM SystemIndex WHERE SCOPE='file:C:/Users'`)
- Map `fileName` to `System.FileName LIKE '...'` with wildcard translation
- Map `fileType` to `System.ItemType` or `System.FileExtension` filter
- Map `minSize`/`maxSize` to `System.Size` range predicates
- Map date filters to `System.DateModified` / `System.DateCreated` range predicates
- Map `author` to `System.Author` filter
- Map `limit`/`offset` to appropriate SQL `TOP` and row-skipping constructs
- Properly escape all user input to prevent SQL injection in the generated Windows Search SQL

### FR-5: Search Scope Restrictions

- Maintain a configurable list of allowed search scope paths
- Default: empty list (all indexed paths allowed) for MVP
- When configured, restrict all queries to only search within allowed paths
- Reject queries with `path` parameter outside allowed scopes
- Enforce scope restrictions at the SQL query level (SCOPE clause)

### FR-6: PII Anonymization

Apply PII anonymization consistent with EventLog approach:

- **File paths**: Replace user profile path segments (e.g., `C:\Users\john.doe\...` → `C:\Users\[ANON_USER_1]\...`)
- **Author metadata**: Anonymize author/owner fields (e.g., `John Doe` → `[ANON_USER_1]`)
- Use the shared AnonymizationStore from Feature 004 so the same user identity maps to the same anonymous ID across EventLog and FileSearch
- Evaluate during planning if any FileSearch-specific PII patterns are needed beyond user paths and author names

### FR-7: Configuration State

Support configuration state to enable/disable the FileSearch service:

- **Hardcoded for MVP**: Service is always enabled
- **Design for Future**: Architecture should support future Config UI disabling via configuration
- Follow the same `ConfigManager` pattern as EventLog (Feature 002)
- Store configuration state in persistent configuration storage (Future Feature 5)

### FR-8: Metrics Tracking

Track and report the following metrics:

- Search count: Total number of file search queries executed
- Response time: Measured execution time for each search (start to finish)
- Results returned: Number of results returned for each search
- Include metric data in response metadata
- Follow the same metrics pattern as EventLog

### FR-9: Error Handling & Validation

- Validate all input parameters:
  - `limit` must be between 1 and 1000
  - `offset` must be >= 0
  - `minSize` must be >= 0 if provided
  - `maxSize` must be >= `minSize` if both provided
  - `modifiedAfter` must be <= `modifiedBefore` if both provided
  - `createdAfter` must be <= `createdBefore` if both provided
  - `path` must be within allowed scope paths (if configured)
  - Return clear GraphQL errors for invalid inputs
- Handle Windows Search service errors gracefully:
  - **Service not running**: Return clear error with diagnostic info ("Windows Search service is not running. Start the 'WSearch' service to enable file search.")
  - **Service not installed**: Return clear error with instructions
  - **Index not ready**: Return appropriate message about index status
  - **Permission denied**: Return error without leaking system details
  - Never throw unhandled exceptions; always return valid GraphQL response
- Handle OLE DB connection errors gracefully with retry logic

### FR-10: Windows Search Service Health Check

- On service startup, verify Windows Search service is available
- Check for OLE DB provider availability
- If unavailable, log warning and mark service as degraded (not failed)
- Support healthcheck endpoint consistent with EventLog pattern

---

## Non-Functional Requirements

### NFR-1: Performance

- File search queries should complete in <200ms for typical indexed searches
- Leverage Windows Search Index for all queries (never fall back to filesystem enumeration)
- Pagination should not require re-querying from the beginning (use offset-based approach in SQL)
- OLE DB connection pooling for efficient resource usage

### NFR-2: Scalability

- Handle search indexes with millions of files
- Memory usage should not exceed 500MB for typical queries
- Pagination prevents loading entire result sets into memory
- Configurable page size allows tuning for different use cases

### NFR-3: Reliability

- Handle Windows Search service unavailability gracefully
- Handle OLE DB connection failures with appropriate retry/error reporting
- Never crash or cause unhandled exceptions to propagate to GraphQL clients
- Log all errors for debugging and audit purposes

### NFR-4: Security

- All user inputs validated and SQL-injection-safe when building Windows Search SQL
- Scope restrictions enforced at query level
- PII anonymization applied consistently before returning results to client
- No shell command execution; all queries via OLE DB/ADO
- Audit trail of all search queries (timestamp, parameters, result count)

### NFR-5: Testability

- Minimum 80% code coverage (line and branch)
- All components mockable for unit testing (mock OLE DB responses)
- Integration tests for GraphQL queries
- Security-focused tests for PII anonymization and SQL injection prevention
- Performance tests for large result sets
- Mock/stub approach for Windows Search service in CI environments

### NFR-6: Maintainability

- Code organized into logical modules:
  - Windows Search query builder (GraphQL → SQL translation)
  - OLE DB/ADO execution layer
  - Result mapping and normalization
  - PII anonymization integration
  - GraphQL schema and resolvers
  - Configuration manager
  - Error handling and validation
- Each module <300 lines
- Clear separation of concerns
- Follow the same architectural patterns as EventLog service

---

## Constraints & Limitations

### C-1: Windows Search Service Dependency

- Requires the Windows Search / Indexer service (`WSearch`) to be running
- Search results limited to what Windows Search has indexed
- Indexing scope and content depends on user/system configuration
- Index may not include all file types or all directories

### C-2: OLE DB Provider Dependency

- Requires the Windows Search OLE DB provider to be available
- Connection string: `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`
- May not be available on all Windows editions (e.g., Windows Server Core)

### C-3: Metadata Availability

- Document metadata (author, title, tags) depends on file format support in the indexer
- Many file types won't have author/title/tag metadata
- Results should handle null/missing metadata gracefully

### C-4: PII Anonymization Consistency

- Must share AnonymizationStore with EventLog to maintain cross-service consistent mapping
- Same user appearing in both EventLog entries and file paths should get the same anonymous ID

### C-5: MVP Scope

- Configuration state hardcoded to "enabled" for MVP
- Search scope restrictions configurable but default to empty (all indexed paths)
- Future Config UI integration will allow users to disable the service and configure scopes
- Write operations (creating, modifying, deleting files) explicitly out of scope

---

## Out of Scope

The following items are explicitly out of scope for Feature 003:

- **Write Operations**: Creating, modifying, renaming, or deleting files
- **File Content Retrieval**: Reading or returning file contents (metadata only)
- **Real-Time File Watching**: Notifications when files change
- **Index Management**: Rebuilding, configuring, or managing the Windows Search index
- **Custom Index Scopes**: Modifying what Windows Search indexes
- **Content Preview/Snippets**: Showing search hit highlights or content excerpts
- **Advanced Analytics**: File type distribution, storage analysis, trending queries
- **Non-Indexed Search**: Fallback filesystem enumeration when index is unavailable
- **Network Share Search**: Searching UNC paths or network drives (local only for MVP)
- **Integration with Other Services**: Other MCPs are separate features

---

## GraphQL Schema (Draft)

```graphql
enum SearchMode {
  CONTAINS
  FREETEXT
}

type FileSearchEntry {
  path: String!
  fileName: String!
  fileType: String!
  size: Int!
  dateModified: DateTime!
  dateCreated: DateTime!
  author: String
  title: String
  tags: [String!]!
}

type FileSearchResults {
  files: [FileSearchEntry!]!
  pageInfo: PageInfo!
  totalCount: Int!
  metrics: FileSearchMetrics!
}

type FileSearchMetrics {
  searchCount: Int!
  responseDurationMs: Float!
  resultsReturned: Int!
}

type Query {
  fileSearch(
    searchText: String
    searchMode: SearchMode = CONTAINS
    path: String
    fileName: String
    fileType: String
    minSize: Int
    maxSize: Int
    modifiedAfter: DateTime
    modifiedBefore: DateTime
    createdAfter: DateTime
    createdBefore: DateTime
    author: String
    limit: Int = 500
    offset: Int = 0
  ): FileSearchResults!
}
```

---

## MCP Tool Definition (Draft)

Following the EventLog pattern, the FileSearch service will expose these MCP tools:

### Tool: `filesearch_query`
**Description**: Search for files using Windows Search Index with filters and pagination

**Parameters**:
- `searchText` (string, optional): Full-text search query
- `searchMode` (string, optional, enum: CONTAINS/FREETEXT): Search mode (default: CONTAINS)
- `path` (string, optional): Directory scope to search within
- `fileName` (string, optional): Filename pattern with wildcards
- `fileType` (string, optional): File extension filter
- `minSize` (integer, optional): Minimum file size in bytes
- `maxSize` (integer, optional): Maximum file size in bytes
- `modifiedAfter` (string, optional): ISO 8601 timestamp
- `modifiedBefore` (string, optional): ISO 8601 timestamp
- `createdAfter` (string, optional): ISO 8601 timestamp
- `createdBefore` (string, optional): ISO 8601 timestamp
- `author` (string, optional): Document author filter
- `limit` (integer, optional): Max results per page (1-1000, default 500)
- `offset` (integer, optional): Pagination offset (default 0)

### Tool: `filesearch_status`
**Description**: Check Windows Search service status and index information

**Parameters**: (none)

**Returns**: Service availability, index status, indexed scope paths

---

## Windows Search SQL Translation Examples

### Basic filename search
```sql
SELECT System.ItemPathDisplay, System.FileName, System.Size, 
       System.DateModified, System.DateCreated, System.ItemType,
       System.Author, System.Title, System.Keywords
FROM SystemIndex
WHERE System.FileName LIKE '%report%'
```

### Full-text CONTAINS search with scope
```sql
SELECT System.ItemPathDisplay, System.FileName, System.Size,
       System.DateModified, System.DateCreated, System.ItemType,
       System.Author, System.Title, System.Keywords
FROM SystemIndex
WHERE SCOPE='file:C:/Users/chris/Documents'
  AND CONTAINS(*, '"quarterly report"')
```

### FREETEXT natural language search
```sql
SELECT System.ItemPathDisplay, System.FileName, System.Size,
       System.DateModified, System.DateCreated, System.ItemType,
       System.Author, System.Title, System.Keywords
FROM SystemIndex
WHERE FREETEXT(*, 'budget planning spreadsheet')
```

### Filtered search with date and size
```sql
SELECT System.ItemPathDisplay, System.FileName, System.Size,
       System.DateModified, System.DateCreated, System.ItemType,
       System.Author, System.Title, System.Keywords
FROM SystemIndex
WHERE System.FileExtension = '.pdf'
  AND System.Size > 1048576
  AND System.DateModified > '2026-01-01'
ORDER BY System.DateModified DESC
```

---

## Success Criteria

- [ ] **SC-1: GraphQL Interface Complete**: `fileSearch` query fully implemented with all parameters
- [ ] **SC-2: Data Model Complete**: All FileSearchEntry fields populated from Windows Search index
- [ ] **SC-3: SQL Translation Working**: All GraphQL parameters correctly translated to Windows Search SQL
- [ ] **SC-4: CONTAINS Search Working**: Exact match full-text search returns correct results
- [ ] **SC-5: FREETEXT Search Working**: Natural language full-text search returns correct results
- [ ] **SC-6: Filtering Functional**: All filter types (type, size, date, author, path) work correctly
- [ ] **SC-7: Pagination Working**: Offset-based pagination supports large result sets with configurable page size
- [ ] **SC-8: PII Anonymization Working**: File paths and author metadata anonymized consistently using shared store
- [ ] **SC-9: Scope Restrictions Enforced**: Queries restricted to configured allowed paths
- [ ] **SC-10: Service Health Check**: Graceful error with diagnostic info when Windows Search unavailable
- [ ] **SC-11: Configuration Support**: Designed for future Config UI integration (hardcoded enabled for MVP)
- [ ] **SC-12: Metrics Tracked**: Search count, response time, and results count tracked per query
- [ ] **SC-13: Error Handling**: All errors handled gracefully without crashes, no info leakage
- [ ] **SC-14: MCP Integration**: FileSearch service implements IService and auto-registers with ServiceManager
- [ ] **SC-15: Test Coverage >80%**: Unit tests (SQL translation, filtering, PII), integration tests (GraphQL), security tests (injection, scope), performance tests
- [ ] **SC-16: Documentation Complete**: Code documented, GraphQL schema documented, tool definitions documented
- [ ] **SC-17: No PII in Logs**: Verify that sensitive information does not appear in service logs or audit trails

---

## Questions for Design Review

1. **OLE DB Execution from Node.js**: What npm package should we use to execute OLE DB queries from Node.js? Options include `node-adodb`, `msnodesqlv8`, or spawning a helper process. Need to investigate Windows Search OLE DB provider compatibility.

2. **Pagination Strategy**: Windows Search SQL doesn't natively support `OFFSET`. Should we use:
   - Row number windowing (ROW_NUMBER() if supported)
   - Client-side cursor tracking (skip N rows from result set)
   - Keyset pagination based on sort order

3. **Total Count Performance**: Getting exact `totalCount` may require a separate COUNT query against the index. Should we:
   - Always provide exact count (may be slower)
   - Provide estimated count with a flag
   - Omit count and only provide hasNextPage

4. **Search Scope Security**: How strict should scope restrictions be? Should they:
   - Prevent searching outside the scope entirely (SCOPE clause)
   - Also prevent file paths outside the scope from appearing in results (post-filter)
   - Both (belt and suspenders)

5. **Connection Pooling**: Should we maintain a persistent OLE DB connection or create connections per query? What are the threading implications?

6. **Index Completeness**: Should we inform the user when the Windows Search index is incomplete or still building? How do we detect this?

---

## Next Steps

1. **Specification Approval**: Review this specification with stakeholders and confirm no changes needed
2. **Feature Planning**: Run the `feature-plan` skill to create a detailed technical implementation plan
   - Research OLE DB/ADO access from Node.js (npm packages, compatibility)
   - Design the SQL query builder with injection prevention
   - Plan pagination strategy given Windows Search SQL limitations
   - Design shared AnonymizationStore integration
3. **Task Breakdown**: Run the `feature-tasks` skill to break the plan into ordered implementation tasks
4. **Implementation**: Begin implementation following EventLog architectural patterns

---

## Document Metadata

- **Specification Version**: 1.0
- **Created**: 2026-02-10
- **Last Updated**: 2026-02-10
- **Stakeholders**: Development Team, Project Lead
- **Related Documents**: 
  - `/features/plan.md` - Project overall plan
  - `/features/002-eventlog-mcp.spec.md` - EventLog MCP specification (architectural pattern reference)
  - `/docs/EXTENSION-GUIDE.md` - How to add new services
  - `/src/services/shared/service-interface.ts` - IService interface to implement
- **Approval Status**: Pending Review
