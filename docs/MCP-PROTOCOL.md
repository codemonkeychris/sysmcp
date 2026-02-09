# MCP Protocol Documentation

## Overview

The Model Context Protocol (MCP) is a standardized protocol for enabling AI models like Claude to interact with tools and resources. SysMCP implements a fully compliant MCP server that exposes system resources (EventLog, file search, registry, etc.) as discoverable tools.

## Protocol Version

- **MCP Protocol Version**: 2024-11-05
- **Transport**: JSON-RPC 2.0 over stdio (newline-delimited)
- **Server Implementation**: TypeScript/Node.js

## Message Format

All MCP messages are JSON-RPC 2.0 formatted and newline-terminated:

```
{JSON message}\n
```

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "method_name",
  "params": {
    "key": "value"
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "data": "response_data"
  }
}
```

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": {
      "details": "Additional error information"
    }
  }
}
```

## Core Methods

### 1. initialize

Initialize the MCP protocol and exchange capabilities.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "Claude",
      "version": "1.0.0"
    },
    "protocolVersion": "2024-11-05"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "SysMCP",
      "version": "1.0.0"
    }
  }
}
```

**Error Cases:**
- `-32602 (InvalidParams)`: Missing or invalid clientInfo
- `-32603 (InternalError)`: Server initialization error

### 2. tools/list

Discover all available tools from all registered services.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "eventlog_query",
        "description": "Query Windows Event Log",
        "inputSchema": {
          "type": "object",
          "properties": {
            "logName": {
              "type": "string",
              "description": "Event log name (System, Application, Security, etc.)"
            },
            "limit": {
              "type": "number",
              "description": "Maximum number of results (default: 100, max: 10000)"
            },
            "offset": {
              "type": "number",
              "description": "Pagination offset (default: 0)"
            },
            "minLevel": {
              "type": "string",
              "description": "Minimum event level (INFORMATION, WARNING, ERROR)"
            },
            "source": {
              "type": "string",
              "description": "Event source filter"
            }
          },
          "required": ["logName"]
        }
      },
      {
        "name": "eventlog_list_logs",
        "description": "List all available Windows Event Logs",
        "inputSchema": {
          "type": "object",
          "properties": {}
        }
      }
    ]
  }
}
```

**Error Cases:**
- `-32603 (InternalError)`: Service enumeration error
- Returns empty tools list if no services registered

### 3. tools/call

Execute a specific tool with provided arguments.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "eventlog_query",
    "arguments": {
      "logName": "System",
      "limit": 100
    }
  }
}
```

**Response (Success):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "success": true,
    "data": {
      "entries": [
        {
          "id": 12345,
          "logName": "System",
          "level": "ERROR",
          "source": "kernel",
          "message": "Event message...",
          "timestamp": "2024-02-10T10:30:45Z"
        }
      ],
      "totalCount": 523,
      "nextOffset": 100,
      "page": 1,
      "pageSize": 100
    }
  }
}
```

**Response (Error):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "success": false,
    "error": {
      "code": "InvalidParams",
      "message": "Invalid parameter: limit must be a number",
      "details": {
        "path": "arguments.limit",
        "expected": "number",
        "received": "string"
      }
    }
  }
}
```

**Error Cases:**
- `-32602 (InvalidParams)`: Tool arguments don't match schema
- `ToolNotFound`: Unknown tool name
- `ToolExecutionError`: Service tool execution failed
- `-32603 (InternalError)`: Unexpected server error

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| -32700 | ParseError | Invalid JSON was received |
| -32600 | InvalidRequest | The JSON sent is not a valid Request object |
| -32601 | MethodNotFound | The method does not exist or is unavailable |
| -32602 | InvalidParams | Invalid method parameters |
| -32603 | InternalError | Internal server error |
| MCP-ToolNotFound | ToolNotFound | Tool does not exist |
| MCP-ToolExecutionError | ToolExecutionError | Tool execution failed |
| MCP-ValidationError | ValidationError | Input validation failed |

## Data Types

### ToolDefinition

```typescript
interface ToolDefinition {
  name: string;              // Unique tool name
  description: string;        // Human-readable description
  inputSchema: JSONSchema;    // JSON Schema for parameters
}
```

### ToolResult

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;            // Tool result on success
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### EventLogEntry

```typescript
interface EventLogEntry {
  id: number;
  logName: string;
  level: string;             // INFORMATION, WARNING, ERROR, etc.
  source: string;
  eventId: number;
  message: string;
  timestamp: string;         // ISO 8601 format
}
```

## Protocol Lifecycle

```
Client                          Server
  |                               |
  |-------initialize request----->|
  |<-----initialize response-------|
  |                               |
  |----tools/list request-------->|
  |<---tools/list response---------|
  |                               |
  |----tools/call request-------->|
  |<---tools/call response---------|
  |                               |
  |----tools/call request-------->|
  |<---tools/call response---------|
```

## Performance Requirements

| Operation | Target | Typical |
|-----------|--------|---------|
| Tool Discovery | <50ms | 5-10ms |
| Tool Execution | <100ms | 20-50ms |
| Schema Validation | <10ms | 1-5ms |
| Protocol Parsing | <10ms | 1-3ms |

## Features

### Multi-Service Architecture

The protocol handler automatically routes tool calls to the appropriate service based on tool naming convention:

```
Tool Name: {service_id}_{action}
Example: eventlog_query
           ↑
           Service ID
```

### Tool Aggregation

Tools from multiple services appear as a single unified list:

```
Service 1: eventlog_query, eventlog_list_logs
Service 2: fs_search, fs_stat
Service 3: reg_read, reg_write

Combined: [all 6 tools]
```

### Service Discovery

Services can be dynamically registered and unregistered. The tool list automatically updates without requiring client reconnection.

### Input Validation

All tool arguments are validated against JSON Schema before execution. Detailed validation errors are returned to the client.

### Error Recovery

Server remains functional after any error. Subsequent requests work normally even after validation or execution errors.

## Security Considerations

1. **Input Validation**: All inputs validated against schemas before processing
2. **Error Messages**: Generic error messages to prevent information leakage
3. **Localhost Only**: MCP services accessible only from 127.0.0.1
4. **Type Safety**: TypeScript strict mode prevents many vulnerabilities
5. **No Shell Access**: Tool execution never invokes shell commands

## Notifications

The server does not currently emit notifications, but may in future versions:

```json
{
  "jsonrpc": "2.0",
  "method": "notification_name",
  "params": { }
}
```

## Examples

### Complete Interaction Example

```
1. Initialize:
Client: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"Claude","version":"1.0"}}}
Server: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"SysMCP","version":"1.0.0"}}}

2. List Tools:
Client: {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
Server: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"eventlog_query",...}]}}

3. Execute Tool:
Client: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"eventlog_query","arguments":{"logName":"System","limit":50}}}
Server: {"jsonrpc":"2.0","id":3,"result":{"success":true,"data":{"entries":[...],"totalCount":523}}}
```

### Error Example

```
Client: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"eventlog_query","arguments":{"logName":"System","limit":"invalid"}}}
Server: {"jsonrpc":"2.0","id":4,"result":{"success":false,"error":{"code":"InvalidParams","message":"Invalid parameter: limit must be a number","details":{"path":"arguments.limit"}}}}
```

## Debugging

To debug MCP communication, enable structured logging:

```
LOG_LEVEL=debug node dist/mcp/index.js
```

This will log:
- Incoming JSON-RPC messages
- Handler invocations
- Tool discoveries
- Execution results
- Validation errors
- Performance metrics

## Future Extensions

Planned features for future releases:

1. **Pagination**: Large result set support
2. **Streaming**: Streaming large responses
3. **Subscriptions**: Tool result subscriptions
4. **Batch Requests**: Process multiple requests in one message
5. **Authorization**: Per-tool access control
