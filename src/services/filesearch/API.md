# FileSearch API Reference

## GraphQL API

### Query: `fileSearch`

Search files indexed by Windows Search with full-text search, metadata filters, and pagination.

#### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `searchText` | String | ❌ No | — | Full-text search query |
| `searchMode` | FileSearchMode | ❌ No | CONTAINS | Search mode: CONTAINS (exact) or FREETEXT (natural language) |
| `path` | String | ❌ No | — | Restrict search to a directory path |
| `fileName` | String | ❌ No | — | File name pattern with wildcards (`*` and `?`) |
| `fileType` | String | ❌ No | — | File extension filter (e.g., `.pdf`, `.docx`) |
| `author` | String | ❌ No | — | Filter by document author |
| `minSize` | Int | ❌ No | — | Minimum file size in bytes |
| `maxSize` | Int | ❌ No | — | Maximum file size in bytes |
| `modifiedAfter` | String | ❌ No | — | ISO 8601 date - files modified after this date |
| `modifiedBefore` | String | ❌ No | — | ISO 8601 date - files modified before this date |
| `createdAfter` | String | ❌ No | — | ISO 8601 date - files created after this date |
| `createdBefore` | String | ❌ No | — | ISO 8601 date - files created before this date |
| `limit` | Int | ❌ No | 25 | Maximum results to return (1-1000) |
| `offset` | Int | ❌ No | 0 | Skip first N results for pagination |

#### Search Modes

| Mode | SQL Function | Use Case |
|------|-------------|----------|
| `CONTAINS` | `CONTAINS()` | Exact phrase matching, prefix wildcards |
| `FREETEXT` | `FREETEXT()` | Natural language queries, semantic matching |

#### Response Type: `FileSearchResult`

```graphql
type FileSearchResult {
  files: [FileSearchEntry!]!
  pageInfo: PageInfo!
  totalCount: Int!
  metrics: FileSearchQueryMetrics!
}

type FileSearchEntry {
  path: String!
  fileName: String!
  fileType: String!
  size: Int!
  dateModified: String!
  dateCreated: String!
  author: String
  title: String
  tags: [String!]!
}

type FileSearchQueryMetrics {
  queryCount: Int!
  responseDurationMs: Int!
  resultsReturned: Int!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
```

#### Example Queries

**Simple text search:**
```graphql
query {
  fileSearch(searchText: "quarterly report") {
    files {
      path
      fileName
      size
      dateModified
    }
    totalCount
  }
}
```

**Search with filters:**
```graphql
query {
  fileSearch(
    searchText: "budget"
    fileType: ".xlsx"
    modifiedAfter: "2024-01-01T00:00:00Z"
    limit: 50
  ) {
    files {
      path
      fileName
      size
      dateModified
      author
    }
    totalCount
    pageInfo {
      hasNextPage
    }
  }
}
```

**File name pattern search:**
```graphql
query {
  fileSearch(
    fileName: "report*"
    path: "C:\\Users\\Documents"
    fileType: ".pdf"
  ) {
    files {
      path
      fileName
      size
    }
    totalCount
  }
}
```

**Paginated results:**
```graphql
# Page 1
query {
  fileSearch(searchText: "meeting notes", limit: 25, offset: 0) {
    files { path fileName }
    totalCount
    pageInfo { hasNextPage }
  }
}

# Page 2
query {
  fileSearch(searchText: "meeting notes", limit: 25, offset: 25) {
    files { path fileName }
    totalCount
    pageInfo { hasNextPage hasPreviousPage }
  }
}
```

**Natural language search:**
```graphql
query {
  fileSearch(
    searchText: "documents about machine learning"
    searchMode: FREETEXT
    limit: 10
  ) {
    files {
      path
      fileName
      title
      tags
    }
    totalCount
    metrics {
      responseDurationMs
    }
  }
}
```

#### Error Codes

| Code | Description |
|------|-------------|
| `SERVICE_DISABLED` | FileSearch service is disabled |
| `SCOPE_VIOLATION` | Search path is outside allowed scope |
| `INVALID_LIMIT` | Validation error (limit, offset, size, dates) |
| `SEARCH_FAILED` | Windows Search query execution failed |

#### Error Response Example

```json
{
  "errors": [
    {
      "message": "Search path is outside allowed scope",
      "extensions": {
        "code": "SCOPE_VIOLATION"
      }
    }
  ]
}
```

---

## MCP Tool API

### `filesearch_query`

Search files indexed by Windows Search with full-text search, file type, size, and date filters.

#### Input Schema

```json
{
  "type": "object",
  "properties": {
    "searchText": {
      "type": "string",
      "description": "Full-text search query"
    },
    "searchMode": {
      "type": "string",
      "enum": ["CONTAINS", "FREETEXT"],
      "description": "Search mode: CONTAINS (exact phrase) or FREETEXT (natural language). Default: CONTAINS"
    },
    "path": {
      "type": "string",
      "description": "Restrict search to a directory path (e.g., C:\\Users\\Documents)"
    },
    "fileName": {
      "type": "string",
      "description": "File name pattern with wildcards (* and ?)"
    },
    "fileType": {
      "type": "string",
      "description": "File extension filter (e.g., .pdf, .docx, .txt)"
    },
    "author": {
      "type": "string",
      "description": "Filter by document author"
    },
    "minSize": {
      "type": "number",
      "description": "Minimum file size in bytes"
    },
    "maxSize": {
      "type": "number",
      "description": "Maximum file size in bytes"
    },
    "modifiedAfter": {
      "type": "string",
      "description": "ISO 8601 timestamp - files modified after this date"
    },
    "modifiedBefore": {
      "type": "string",
      "description": "ISO 8601 timestamp - files modified before this date"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results to return (default: 25, max: 1000)"
    },
    "offset": {
      "type": "number",
      "description": "Skip first N results for pagination (default: 0)"
    }
  }
}
```

#### Example Requests

**Search by text:**
```json
{
  "searchText": "quarterly report",
  "limit": 50
}
```

**Search by file type and date:**
```json
{
  "fileType": ".pdf",
  "modifiedAfter": "2024-06-01T00:00:00Z",
  "limit": 100
}
```

**Search by name pattern in path:**
```json
{
  "fileName": "invoice*",
  "path": "C:\\Users\\Documents\\Finance",
  "fileType": ".xlsx"
}
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "files": [
      {
        "path": "C:\\Users\\user_a1b2c3\\Documents\\report.pdf",
        "fileName": "report.pdf",
        "fileType": ".pdf",
        "size": 245760,
        "dateModified": "2024-02-10T10:30:00Z",
        "dateCreated": "2024-01-15T08:00:00Z",
        "author": "user_a1b2c3",
        "title": "Quarterly Report",
        "tags": ["finance", "Q4"]
      }
    ],
    "totalCount": 42,
    "returned": 25,
    "pageInfo": {
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "metrics": {
      "queryCount": 1,
      "responseDurationMs": 45,
      "resultsReturned": 25
    }
  }
}
```

---

## Security Notes

- **PII Anonymization**: When enabled, user names in file paths and author fields are replaced with consistent hash-based pseudonyms (e.g., `user_a1b2c3`)
- **Scope Restrictions**: Searches can be restricted to specific directory paths via configuration
- **SQL Injection Prevention**: All user inputs are sanitized before being used in Windows Search SQL queries
- **Path Traversal Prevention**: Paths with `..` segments, UNC paths, and null bytes are rejected
- **Input Validation**: All parameters validated at both GraphQL resolver and provider layers
