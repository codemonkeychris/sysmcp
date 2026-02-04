# MCP Host Bootstrap - API Documentation

## Overview

MCP Host Bootstrap is a Node.js service that provides a GraphQL API for managing service lifecycle operations. It handles service registration, startup, shutdown, and monitoring with a focus on graceful error handling and development-mode hot-reloading.

## Architecture

```
┌─────────────────────────────────────┐
│      Client/External System         │
└────────────────┬────────────────────┘
                 │
                 │ HTTP/GraphQL
                 ▼
┌─────────────────────────────────────┐
│        Express HTTP Server          │
│  ┌─────────────────────────────┐   │
│  │    GraphQL Endpoint         │   │
│  │  - Query: services          │   │
│  │  - Query: service           │   │
│  │  - Query: health            │   │
│  │  - Mutation: register       │   │
│  │  - Mutation: start          │   │
│  │  - Mutation: stop           │   │
│  │  - Mutation: restart        │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │   REST Health Endpoint      │   │
│  │   GET /health               │   │
│  └─────────────────────────────┘   │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
┌──────────────┐  ┌─────────────────────────┐
│   Logging    │  │  Service Management     │
│   System     │  │  ┌───────────────────┐ │
│              │  │  │ Service Registry  │ │
│              │  │  ├───────────────────┤ │
│              │  │  │ Lifecycle Manager │ │
│              │  │  └───────────────────┘ │
│              │  └─────────────────────────┘
│              │
│              │  (Development Only)
│              │  ┌──────────────────┐
│              │  │  File Watcher    │
│              │  └──────────────────┘
└──────────────┘
```

## REST API

### GET /health

Returns the current health status of the system.

**Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 120,
  "services": 3,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response Fields:**
- `status` (string): "ok" or "degraded" (degraded if any service is in ERROR state)
- `uptime` (number): Server uptime in seconds
- `services` (number): Total number of registered services
- `timestamp` (string): ISO 8601 timestamp of the response

**Status Codes:**
- `200 OK`: Health check successful

## GraphQL API

The GraphQL endpoint is available at `POST /graphql`.

### Queries

#### Query.services

Returns all registered services.

**Request:**
```graphql
query {
  services {
    name
    type
    state
    errorMessage
    startedAt
    requiredPermissions
  }
}
```

**Response:**
```json
{
  "data": {
    "services": [
      {
        "name": "web-service",
        "type": "http",
        "state": "READY",
        "errorMessage": null,
        "startedAt": "2024-01-15T10:25:00Z",
        "requiredPermissions": ["read"]
      }
    ]
  }
}
```

#### Query.service(name: String!)

Returns a specific service by name.

**Request:**
```graphql
query {
  service(name: "web-service") {
    name
    state
    startedAt
  }
}
```

**Response:**
```json
{
  "data": {
    "service": {
      "name": "web-service",
      "state": "READY",
      "startedAt": "2024-01-15T10:25:00Z"
    }
  }
}
```

Returns `null` if the service does not exist.

#### Query.health

Returns the current system health status.

**Request:**
```graphql
query {
  health {
    status
    uptime
    services
    timestamp
  }
}
```

**Response:**
```json
{
  "data": {
    "health": {
      "status": "ok",
      "uptime": 120,
      "services": 3,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }
}
```

### Mutations

#### Mutation.registerService(input: RegisterServiceInput!)

Registers a new service.

**Request:**
```graphql
mutation {
  registerService(input: {
    name: "new-service"
    type: "custom"
    requiredPermissions: ["read", "write"]
  }) {
    success
    service {
      name
      type
      state
    }
    error
  }
}
```

**Response (Success):**
```json
{
  "data": {
    "registerService": {
      "success": true,
      "service": {
        "name": "new-service",
        "type": "custom",
        "state": "DISABLED"
      },
      "error": null
    }
  }
}
```

**Response (Error):**
```json
{
  "data": {
    "registerService": {
      "success": false,
      "service": null,
      "error": "Service 'new-service' already exists"
    }
  }
}
```

#### Mutation.startService(name: String!)

Starts a registered service.

**Request:**
```graphql
mutation {
  startService(name: "web-service") {
    success
    service {
      name
      state
      startedAt
    }
    error
  }
}
```

**Response (Success):**
```json
{
  "data": {
    "startService": {
      "success": true,
      "service": {
        "name": "web-service",
        "state": "READY",
        "startedAt": "2024-01-15T10:30:00Z"
      },
      "error": null
    }
  }
}
```

**Behavior:**
- Service transitions to STARTING state
- Service startup is attempted with automatic retries (max 3 attempts)
- On success, service transitions to READY state with a start timestamp
- On failure after retries, service transitions to ERROR state with error message

#### Mutation.stopService(name: String!)

Stops a running service.

**Request:**
```graphql
mutation {
  stopService(name: "web-service") {
    success
    service {
      name
      state
    }
    error
  }
}
```

**Response:**
```json
{
  "data": {
    "stopService": {
      "success": true,
      "service": {
        "name": "web-service",
        "state": "DISABLED"
      },
      "error": null
    }
  }
}
```

#### Mutation.restartService(name: String!)

Restarts a service (stop and then start).

**Request:**
```graphql
mutation {
  restartService(name: "web-service") {
    success
    service {
      name
      state
      startedAt
    }
    error
  }
}
```

**Response:**
```json
{
  "data": {
    "restartService": {
      "success": true,
      "service": {
        "name": "web-service",
        "state": "READY",
        "startedAt": "2024-01-15T10:31:00Z"
      },
      "error": null
    }
  }
}
```

## Data Types

### Service

```graphql
type Service {
  name: String!
  type: String!
  state: ServiceState!
  errorMessage: String
  startedAt: String
  requiredPermissions: [String!]
}
```

### ServiceState Enum

```graphql
enum ServiceState {
  DISABLED
  STARTING
  READY
  ERROR
  STOPPING
}
```

**State Transitions:**
- DISABLED → STARTING (when starting)
- STARTING → READY (on successful startup)
- STARTING → ERROR (on startup failure)
- READY → STOPPING (when stopping)
- STOPPING → DISABLED (on successful shutdown)
- Any state → ERROR (on operational error)

### HealthStatus

```graphql
type HealthStatus {
  status: String!
  uptime: Int!
  services: Int!
  timestamp: String!
}
```

### RegisterServiceInput

```graphql
input RegisterServiceInput {
  name: String!
  type: String!
  requiredPermissions: [String!]
  config: String
}
```

### ServiceOperationResult

```graphql
type ServiceOperationResult {
  success: Boolean!
  service: Service
  error: String
}
```

## Error Handling

### GraphQL Errors

All mutations return a `ServiceOperationResult` with a `success` flag. Errors are reported in the result object rather than as GraphQL errors (except for validation errors).

**Example Error Response:**
```json
{
  "data": {
    "startService": {
      "success": false,
      "service": null,
      "error": "Service 'unknown' not found"
    }
  }
}
```

### Service Startup Retries

When starting a service fails:
1. First attempt happens immediately
2. On failure, waits 1 second and retries (attempt 2)
3. On failure, waits 2 seconds and retries (attempt 3)
4. If all attempts fail, service transitions to ERROR state
5. Error message indicates the reason and number of attempts

### Timeout Handling

- Service startup has a 10-second timeout per attempt
- Service shutdown has a 10-second timeout
- If a timeout occurs, the service transitions to ERROR state

## Configuration

Configuration is loaded from environment variables and the `.env` file:

- `NODE_ENV`: "development" | "production" | "test" (default: "development")
- `PORT`: HTTP server port (default: 3000)
- `LOG_LEVEL`: "error" | "warn" | "info" | "debug" (default: "info")
- `LOG_FILE`: Optional path to log file
- `GRAPHQL_INTROSPECTION`: Enable GraphQL introspection (default: true for development)
- `MAX_QUERY_DEPTH`: Maximum GraphQL query depth (default: 10)
- `REQUEST_TIMEOUT_MS`: HTTP request timeout in milliseconds (default: 30000)

## Development Features

### File Watcher (Development Mode Only)

In development mode (`NODE_ENV !== 'production'`), the system includes a file watcher that:

- Watches for changes in `/src` directory and configuration files
- Detects file additions, modifications, and deletions
- Debounces rapid changes (500ms window)
- Prevents restart cascades with a 2-second cooldown
- Automatically restarts all healthy services on file changes

**Ignored Patterns:**
- `node_modules/`
- `dist/`, `build/`, `coverage/`
- `.git/`
- `*.test.ts`, `*.spec.ts`
- Log files

### Logging

All operations are logged using structured JSON logging:

**Log Entry Format:**
```json
{
  "timestamp": "2024-01-15T10:30:00.123Z",
  "level": "info",
  "service": "mcp-host",
  "message": "Service started successfully",
  "context": {
    "serviceName": "web-service"
  }
}
```

**Log Levels:**
- `error`: Error conditions (startup failures, exceptions)
- `warn`: Warning conditions (retries, non-critical issues)
- `info`: Informational messages (startup, shutdown, operations)
- `debug`: Debug information (detailed operation logs)

## Performance Targets

- Server startup: < 2 seconds
- GraphQL query execution: < 100ms
- File change detection: < 500ms (debounced)
- Memory usage: < 100MB at startup

## Security Considerations

### PII Filtering

Logs apply PII filtering to prevent exposure of sensitive information:
- Passwords and tokens are redacted
- Email addresses show domain only
- Phone numbers show last 4 digits only
- SSNs are partially masked

### Localhost Only

In production, ensure the HTTP server is only accessible from localhost (127.0.0.1) and not exposed to the network.

### Introspection Disabled in Production

GraphQL introspection is disabled in production mode to prevent schema exposure.

## Examples

### Starting a Service via GraphQL

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '
{
  "query": "mutation { startService(name: \"web-service\") { success service { name state } error } }"
}
'
```

### Checking System Health

```bash
curl http://localhost:3000/health
```

### Registering a New Service

```bash
curl -X POST http://localhost:3000/graphql \
  -H "Content-Type: application/json" \
  -d '
{
  "query": "mutation { registerService(input: { name: \"api-service\" type: \"graphql\" }) { success service { name type state } error } }"
}
'
```

## Troubleshooting

### Service Won't Start

1. Check error message in service state: `query { service(name: "service-name") { errorMessage } }`
2. Check logs for startup errors
3. Verify service configuration is correct
4. Check system resources (memory, CPU)

### File Watcher Not Restarting Services

1. Ensure `NODE_ENV` is not set to "production"
2. Check logs for file watcher errors
3. Verify file patterns are not in the ignore list
4. Check service state - only healthy services are restarted

### High Memory Usage

1. Check for services in STARTING state (stuck operations)
2. Review logs for memory leaks
3. Restart the application

## References

- [GraphQL Specification](https://spec.graphql.org/)
- [Apollo Server Documentation](https://www.apollographql.com/docs/apollo-server/)
- [Express.js Documentation](https://expressjs.com/)
