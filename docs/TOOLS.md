# Tools Documentation

## Overview

SysMCP exposes system resource tools through the MCP protocol. These tools allow Claude and other MCP clients to query, filter, and analyze system data.

## Available Services

- [EventLog Tools](#eventlog-tools)
- [FileSearch Tools](#filesearch-tools)

---

## EventLog Tools

### 1. eventlog_query

Query Windows Event Log with optional filtering and pagination.

#### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `logName` | string | ✅ Yes | — | Event log name (System, Application, Security, etc.) |
| `limit` | number | ❌ No | 100 | Maximum results (1-10000) |
| `offset` | number | ❌ No | 0 | Pagination offset |
| `minLevel` | string | ❌ No | — | Minimum event level (INFORMATION, WARNING, ERROR, CRITICAL) |
| `source` | string | ❌ No | — | Event source filter |

#### Schema

```json
{
  "type": "object",
  "properties": {
    "logName": {
      "type": "string",
      "description": "Event log name: System, Application, Security, Internet Explorer, Windows PowerShell, etc."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results to return (default: 100, max: 10000)"
    },
    "offset": {
      "type": "number",
      "description": "Pagination offset for large result sets (default: 0)"
    },
    "minLevel": {
      "type": "string",
      "description": "Minimum event level filter: INFORMATION, WARNING, ERROR, CRITICAL"
    },
    "source": {
      "type": "string",
      "description": "Filter by event source (e.g., kernel, WinLogon, Service Control Manager)"
    }
  },
  "required": ["logName"]
}
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "logName": "System",
    "entries": [
      {
        "id": 12345,
        "logName": "System",
        "level": "ERROR",
        "source": "kernel",
        "eventId": 6008,
        "message": "The previous system shutdown was unexpected.",
        "timestamp": "2024-02-10T10:30:45Z",
        "computer": "COMPUTER-NAME"
      }
    ],
    "totalCount": 523,
    "returnedCount": 100,
    "offset": 0,
    "nextOffset": 100,
    "hasMore": true,
    "pageSize": 100,
    "page": 1
  }
}
```

#### Example Requests

**Query System log with defaults:**
```json
{
  "logName": "System"
}
```

**Query with filtering:**
```json
{
  "logName": "System",
  "limit": 50,
  "minLevel": "ERROR"
}
```

**Query with pagination:**
```json
{
  "logName": "Application",
  "limit": 100,
  "offset": 100
}
```

**Query Security log by source:**
```json
{
  "logName": "Security",
  "source": "Microsoft-Windows-Security-Auditing",
  "limit": 200
}
```

#### Response Details

- **logName**: Name of the queried event log
- **entries**: Array of event log entries
- **totalCount**: Total events matching filters (approximate, may be large)
- **returnedCount**: Number of entries in current response
- **offset**: Starting position of this batch
- **nextOffset**: Starting position for next batch (if hasMore=true)
- **hasMore**: Whether more results are available
- **pageSize**: Number of results per page
- **page**: Current page number (1-based)

#### Common Event Levels

| Level | Description |
|-------|-------------|
| INFORMATION | Informational events |
| WARNING | Warning events |
| ERROR | Error events |
| CRITICAL | Critical events (rare) |

#### Common Event Sources

- `kernel` - Windows kernel
- `WinLogon` - Logon/logoff events
- `Service Control Manager` - Service events
- `NVIDIA` - Graphics driver events
- `Microsoft-Windows-Security-Auditing` - Security events

#### Error Cases

- **Missing logName**: Returns validation error
- **Invalid logName**: Returns error (log not found)
- **Invalid limit**: Must be number 1-10000
- **Invalid minLevel**: Must be valid level string
- **Permission denied**: If user lacks read access to log

#### Performance

- Typical query: 20-50ms
- Large limit (10000): <100ms
- Filters applied server-side for efficiency

---

### 2. eventlog_list_logs

List all available Windows Event Logs on the system.

#### Parameters

No parameters required.

#### Schema

```json
{
  "type": "object",
  "properties": {}
}
```

#### Response Format

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "name": "System",
        "description": "System events",
        "entries": 15234,
        "maxSize": 20971520
      },
      {
        "name": "Application",
        "description": "Application events",
        "entries": 8912,
        "maxSize": 20971520
      },
      {
        "name": "Security",
        "description": "Security events",
        "entries": 45123,
        "maxSize": 20971520
      }
    ],
    "count": 3,
    "timestamp": "2024-02-10T10:30:45Z"
  }
}
```

#### Example Requests

**List all logs:**
```json
{}
```

#### Response Details

- **logs**: Array of available event log objects
  - **name**: Log name (use with eventlog_query)
  - **description**: Log description
  - **entries**: Approximate number of entries in log
  - **maxSize**: Maximum log size in bytes
- **count**: Total number of logs
- **timestamp**: Time list was generated

#### Standard Logs (Windows 10/11)

| Name | Purpose |
|------|---------|
| System | System events, driver events, hardware events |
| Application | Application errors and information |
| Security | Security-related events (requires admin) |
| Internet Explorer | IE events (if installed) |
| Windows PowerShell | PowerShell script and command events |
| Key Management Service | KMS activation events |
| System Restore | System restore operations |

#### Error Cases

- **Permission denied**: If user lacks read access to any logs

#### Performance

- Typical listing: 5-10ms
- Always returns quickly regardless of system load

---

## Usage Patterns

### Pattern 1: Get System Errors

```json
{
  "logName": "System",
  "minLevel": "ERROR",
  "limit": 50
}
```

### Pattern 2: Analyze Recent Events

```json
{
  "logName": "Application",
  "limit": 100,
  "offset": 0
}
```

### Pattern 3: Security Audit

```json
{
  "logName": "Security",
  "source": "Microsoft-Windows-Security-Auditing",
  "limit": 200
}
```

### Pattern 4: Pagination Loop

```
// First call
{
  "logName": "System",
  "limit": 100,
  "offset": 0
}
Response: {"nextOffset": 100, "hasMore": true, ...}

// Second call
{
  "logName": "System",
  "limit": 100,
  "offset": 100
}
Response: {"nextOffset": 200, "hasMore": true, ...}

// Continue until hasMore = false
```

---

## Integration Guide

### With Claude

```
You: "Show me the latest 50 System errors on my computer"

Claude calls:
{
  "method": "tools/call",
  "name": "eventlog_query",
  "arguments": {
    "logName": "System",
    "minLevel": "ERROR",
    "limit": 50
  }
}

Receives: List of 50 most recent system errors
Returns: Summary and analysis of errors
```

### With Cursor

```typescript
const result = await callTool('eventlog_query', {
  logName: 'Application',
  limit: 100
});

// Process results
result.data.entries.forEach(entry => {
  console.log(`[${entry.timestamp}] ${entry.source}: ${entry.message}`);
});
```

### Error Handling

```json
{
  "success": false,
  "error": {
    "code": "InvalidParams",
    "message": "Invalid parameter: minLevel must be one of INFORMATION, WARNING, ERROR, CRITICAL",
    "details": {
      "parameter": "minLevel",
      "received": "FATAL"
    }
  }
}
```

---

## Performance & Limits

### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| List logs | <10ms | Always fast |
| Query (limit 50) | 20-30ms | Small result set |
| Query (limit 1000) | 50-80ms | Medium result set |
| Query (limit 10000) | 80-100ms | Large result set |

### Limits

| Limit | Value |
|-------|-------|
| Max limit parameter | 10,000 |
| Min limit parameter | 1 |
| Default limit | 100 |
| Max offset | Unlimited (practical: <1M) |
| Timeout | 30 seconds |

### Memory

- Each event log entry: ~500 bytes average
- Max response size: ~5MB (with limit=10000)
- Response streaming: Not currently supported

---

## Advanced Topics

### Filtering Performance

The EventLog service applies filters server-side for efficiency:

1. minLevel filter is applied before sorting
2. source filter is applied during enumeration
3. Fewer filters = faster queries

### Pagination Strategy

For large result sets:

1. Use smaller limit (100-500) for better responsiveness
2. Check nextOffset before making next request
3. Stop when hasMore = false
4. Cache results if doing multiple passes

### Entry Fields

Each EventLog entry includes:

- `id` - Unique event ID (integer)
- `logName` - Source log name
- `level` - INFORMATION, WARNING, ERROR, CRITICAL
- `source` - Event source/producer
- `eventId` - Windows event ID
- `message` - Event message text
- `timestamp` - ISO 8601 timestamp
- `computer` - Computer name where event occurred

---

## Troubleshooting

### "Log not found"

- Log name is case-sensitive in Windows
- Common names: "System", "Application", "Security"
- Use eventlog_list_logs to see available logs

### "Permission denied"

- Some logs (Security) require admin privileges
- Run MCP server as administrator or with elevated token

### "No results returned"

- Log might be empty
- Filters might be too restrictive
- Check totalCount > 0 in response

### "Query timeout"

- Limit set too high or offset too large
- Reduce limit or add more specific filters
- Check system disk I/O status

---

## FileSearch Tools

The FileSearch tools expose Windows Search Indexer functionality through the MCP protocol.

### 1. filesearch_query

Search files indexed by Windows Search with full-text search, metadata filters, and pagination.

#### Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `searchText` | string | ❌ No | — | Full-text search query |
| `searchMode` | string | ❌ No | CONTAINS | CONTAINS (exact) or FREETEXT (natural language) |
| `path` | string | ❌ No | — | Restrict search to a directory path |
| `fileName` | string | ❌ No | — | File name pattern with wildcards (`*` and `?`) |
| `fileType` | string | ❌ No | — | File extension filter (e.g., .pdf, .docx) |
| `author` | string | ❌ No | — | Filter by document author |
| `minSize` | number | ❌ No | — | Minimum file size in bytes |
| `maxSize` | number | ❌ No | — | Maximum file size in bytes |
| `modifiedAfter` | string | ❌ No | — | ISO 8601 date - files modified after this date |
| `modifiedBefore` | string | ❌ No | — | ISO 8601 date - files modified before this date |
| `limit` | number | ❌ No | 25 | Maximum results (1-1000) |
| `offset` | number | ❌ No | 0 | Pagination offset |

#### Schema

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
      "description": "Search mode: CONTAINS (exact phrase) or FREETEXT (natural language)"
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

#### Error Cases

- **Invalid limit**: Must be 1-1000
- **Scope violation**: Path outside configured allowed paths
- **Search failed**: Windows Search service unavailable
- **Service disabled**: FileSearch service is disabled

#### Performance

- Simple query: <200ms
- Complex query (text + filters): <400ms
- Pagination within 500 offset: <200ms

---

## Usage Patterns

### Pattern 1: Find Recent Documents

```json
{
  "searchText": "project plan",
  "fileType": ".docx",
  "modifiedAfter": "2024-01-01T00:00:00Z",
  "limit": 20
}
```

### Pattern 2: Find Large Files

```json
{
  "minSize": 104857600,
  "limit": 50
}
```

### Pattern 3: Natural Language Search

```json
{
  "searchText": "meeting notes about budget planning",
  "searchMode": "FREETEXT",
  "limit": 10
}
```

### Pattern 4: Pagination Loop

```
// First call
{ "searchText": "report", "limit": 25, "offset": 0 }
Response: {"totalCount": 150, "pageInfo": {"hasNextPage": true}, ...}

// Second call
{ "searchText": "report", "limit": 25, "offset": 25 }
Response: {"totalCount": 150, "pageInfo": {"hasNextPage": true, "hasPreviousPage": true}, ...}

// Continue until hasNextPage = false
```

---

## Integration Guide

### With Claude

```
You: "Find all PDF files modified this month"

Claude calls:
{
  "method": "tools/call",
  "name": "filesearch_query",
  "arguments": {
    "fileType": ".pdf",
    "modifiedAfter": "2024-02-01T00:00:00Z"
  }
}

Receives: List of matching PDF files with metadata
Returns: Summary of files found
```

---

## Related Documentation

- [MCP Protocol Documentation](./MCP-PROTOCOL.md)
- [Extension Guide](./EXTENSION-GUIDE.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [FileSearch API Reference](../src/services/filesearch/API.md)
