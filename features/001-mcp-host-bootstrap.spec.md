# Feature Specification: MCP Host Bootstrap

**Feature Number**: 001  
**Feature Title**: MCP Host Bootstrap  
**Status**: Specification Complete  
**Created**: 2024  
**Version**: 1.0  

---

## Overview

The MCP Host Bootstrap feature establishes the foundational Node.js service that hosts multiple MCP (Model Context Protocol) servers. This service serves as the core runtime environment for the SysMCP project, providing GraphQL endpoint access, service lifecycle management, automatic restart on code changes, and comprehensive logging.

The bootstrap service is the entry point for all MCP requests, implementing core infrastructure that will support system resource providers (EventLog, File System, Registry, etc.) built in subsequent features.

---

## Requirements

### Functional Requirements

#### F1: Node.js Server Infrastructure
- Start a Node.js HTTP server listening on **port 3000**
- Server must start cleanly within **2 seconds**
- Support graceful shutdown (5-second drain timeout for in-flight requests)
- Handle server startup failures with clear error messages

#### F2: GraphQL Endpoint
- Implement GraphQL endpoint at `/graphql`
- Use **Apollo Server 4.x** as the GraphQL server implementation
- Support both GraphQL queries and mutations
- Implement introspection for schema discovery (enabled in development, disabled in production)
- Return proper GraphQL error responses with error codes and messages
- Support query complexity analysis to prevent denial-of-service queries

#### F3: Service Lifecycle Management
- Implement service registry for registering MCP service providers
- Support service lifecycle operations: `register`, `start`, `stop`, `restart`, `status`
- Each service maintains state: `disabled`, `starting`, `ready`, `error`, `stopping`
- Service registration accepts: `name`, `type`, `config`, `requiredPermissions`
- Expose service status via GraphQL query: `services { name, state, errorMessage }`
- Return meaningful error messages when operations fail

#### F4: File Watcher for Auto-Restart
- Watch **all files in the `/src` directory** for changes
- Watch **configuration files**: `.env`, `config/*.yml`, `config/*.json`
- Do **NOT watch** node_modules, dist, build, .git, and other build artifacts
- On file change, gracefully restart all services
- Implement **debouncing**: collect multiple file changes within 500ms into a single restart
- Only enable file watcher in **development mode** (when `NODE_ENV != 'production'`)
- Log restart attempts and success/failure
- Prevent restart cascades (ignore changes triggered during restart for 2 seconds)

#### F5: Basic Logging
- Implement structured logging with JSON output format
- Log levels: `error`, `warn`, `info`, `debug`
- Default log level: `info` (configurable via `LOG_LEVEL` env var)
- Log to `stdout` by default
- Optionally log to file (if `LOG_FILE` environment variable provided)
- Include in every log entry:
  - `timestamp` (ISO 8601 format)
  - `level` (error, warn, info, debug)
  - `service` (which service or component)
  - `message` (main log message)
  - `context` (optional JSON object with additional data)
- Sensitive data filtering: never log credentials, tokens, or PII

#### F6: Configuration Management
- Support environment variables for configuration:
  - `NODE_ENV` - 'development' or 'production' (default: 'development')
  - `PORT` - server port (default: 3000)
  - `LOG_LEVEL` - logging level (default: 'info')
  - `LOG_FILE` - optional file path for log output
  - `GRAPHQL_INTROSPECTION` - enable/disable introspection (default: true in dev, false in prod)
  - `MAX_QUERY_DEPTH` - GraphQL query max depth (default: 10)
  - `REQUEST_TIMEOUT_MS` - request timeout in milliseconds (default: 30000)
- Support `.env` file loading (via dotenv package)
- Configuration validation: exit with clear error if required config is missing

#### F7: Error Handling and Recovery
- Implement global error handler for uncaught exceptions
- Graceful degradation: service crashes should not crash entire host
- Retry failed service starts up to 3 times with exponential backoff
- Service health checks: expose `/health` endpoint returning JSON with status
- Implement circuit breaker pattern for service communication (basic version)
- Clear logging of all errors with stack traces in debug mode

#### F8: Startup Initialization Sequence
1. Load environment variables from `.env` file
2. Initialize logger
3. Validate configuration
4. Create HTTP server
5. Initialize GraphQL server
6. Initialize service registry
7. Start file watcher (development only)
8. Start listening on configured port
9. Log successful startup with port and mode

---

## Technical Constraints

### Technology Stack
- **Runtime**: Node.js 18.x or later
- **Framework**: Express.js for HTTP server
- **GraphQL**: Apollo Server 4.x
- **File Watching**: chokidar for file system events
- **Logging**: Custom logger with JSON output (or Winston/Pino)
- **Environment**: dotenv for configuration

### Performance Constraints
- Server must start in **< 2 seconds** (excluding node startup)
- GraphQL queries must resolve in **< 100ms** for status queries
- Service start/stop operations must complete within **10 seconds** or timeout
- File watcher must detect changes within **500ms**
- Memory footprint: **< 100MB** at startup

### Architectural Constraints
- Service communication must be local (localhost only, no network exposure)
- All services run within the same Node.js process initially
- No database required for bootstrap feature
- No authentication required for bootstrap feature
- GraphQL must expose service lifecycle operations (plan for authentication in future)

### Development Constraints
- Must run on Windows, macOS, and Linux
- No system-level privileges required for core bootstrap
- Development and production modes must be clearly separated
- Configuration must be externalized (no hardcoded values)

---

## Out of Scope

The following are explicitly out of scope for this feature:

- **Authentication/Authorization**: Service security is implemented in Feature 2+
- **Persistent Storage**: All data is in-memory for bootstrap
- **Resource Providers**: EventLog, File System, Registry providers come in later features
- **System Tray UI**: User interface is a separate feature
- **Write Operation Buffering**: Implemented in Feature 2 with security layer
- **PII Filtering**: Filtering logic comes with resource providers
- **Clustering/Multi-Process**: Single-process architecture only
- **TLS/HTTPS**: HTTP only for bootstrap (HTTPS in future feature)
- **API Gateway**: Direct HTTP/GraphQL only
- **Monitoring/Metrics**: Logging only, no metrics aggregation yet
- **Load Balancing**: Single process only

---

## Success Criteria

### Core Functionality
- [ ] HTTP server listens on port 3000 and accepts requests
- [ ] GraphQL endpoint at `/graphql` resolves valid GraphQL queries
- [ ] Services can be registered and their status queried via GraphQL
- [ ] Service state transitions work correctly (disabled → starting → ready)
- [ ] File watcher detects changes and triggers service restart
- [ ] Restart occurs within 500ms of file change (debounced)

### Logging
- [ ] All startup steps logged with timestamps
- [ ] Service lifecycle events logged (start, stop, restart, error)
- [ ] File watcher events logged (files changed, restart triggered)
- [ ] Log format is valid JSON, parseable by log aggregation tools
- [ ] Sensitive data never appears in logs

### Configuration
- [ ] Environment variables are read and applied
- [ ] `.env` file is loaded if present
- [ ] Configuration validation fails with clear error message if required config missing
- [ ] Server works correctly with all supported environment variables

### Error Handling
- [ ] Server gracefully handles and logs unhandled exceptions
- [ ] Service crashes don't crash the entire host
- [ ] Failed service restarts are retried with exponential backoff
- [ ] Health endpoint returns correct status

### Development Experience
- [ ] File changes cause visible restart in logs
- [ ] Restart is fast (debounced, < 500ms detection)
- [ ] No false-positive restarts from unrelated files
- [ ] Debug logging available in development mode

### Code Quality
- [ ] Code is TypeScript (when language chosen is TypeScript)
- [ ] All modules export clear interfaces
- [ ] Error handling uses consistent patterns
- [ ] No hardcoded secrets or credentials
- [ ] Code is documented with JSDoc comments for public APIs

---

## Design Decisions

### Decision 1: Apollo Server over other GraphQL implementations
**Choice**: Apollo Server 4.x  
**Rationale**: Industry-standard, excellent documentation, built-in middleware support, active community, works well with Express.js  
**Alternative Considered**: GraphQL-Yoga (lighter weight but less mature)  

### Decision 2: File Watcher Scope
**Choice**: Watch `/src` and config files, ignore node_modules  
**Rationale**: Reduces false-positive restarts, improves performance, developers expect src changes to trigger restart  
**Alternative Considered**: Watch all files except node_modules (too aggressive, many false positives)  

### Decision 3: Service Registry Pattern
**Choice**: In-memory registry with GraphQL interface  
**Rationale**: Simple for bootstrap, no DB required, GraphQL provides clean API for future UI  
**Alternative Considered**: Service discovery library (too complex for initial version)  

### Decision 4: Error Handling Strategy
**Choice**: Global error handler + service isolation  
**Rationale**: Prevents cascading failures, one bad service doesn't crash host  
**Alternative Considered**: Process-per-service (overcomplex for initial version)  

---

## Implementation Notes

### GraphQL Schema Overview (Initial)
```graphql
type Query {
  services: [Service!]!
  service(name: String!): Service
  health: HealthStatus!
}

type Service {
  name: String!
  type: String!
  state: ServiceState!
  errorMessage: String
  startedAt: DateTime
}

enum ServiceState {
  DISABLED
  STARTING
  READY
  ERROR
  STOPPING
}

type HealthStatus {
  status: String!
  uptime: Int!
  services: Int!
}

type Mutation {
  registerService(input: RegisterServiceInput!): ServiceRegistrationResult!
  startService(name: String!): ServiceOperationResult!
  stopService(name: String!): ServiceOperationResult!
  restartService(name: String!): ServiceOperationResult!
}
```

### File Structure (Expected)
```
src/
├── index.ts                    # Main entry point
├── server.ts                   # HTTP server setup
├── graphql/
│   ├── schema.ts              # GraphQL type definitions
│   └── resolvers.ts           # GraphQL resolvers
├── services/
│   ├── registry.ts            # Service registry
│   └── lifecycle.ts           # Service lifecycle management
├── watcher.ts                 # File watcher for dev mode
├── logger.ts                  # Logging utility
├── config.ts                  # Configuration management
└── health.ts                  # Health check endpoint
```

### Initialization Flow
```
1. Load .env file
2. Parse environment variables
3. Validate required config
4. Initialize logger
5. Create Express app
6. Setup health endpoint (/health)
7. Setup GraphQL endpoint (/graphql)
8. Initialize service registry
9. If development mode: start file watcher
10. Start listening on port
11. Log startup complete
```

---

## Risk Assessment

### Risk 1: File Watcher Cascading Restarts
**Probability**: Medium  
**Impact**: Service instability  
**Mitigation**: Implement 2-second ignore window after restart, proper debouncing  

### Risk 2: Service Startup Timeout
**Probability**: Low  
**Impact**: Hanging server  
**Mitigation**: Implement 10-second timeout per service, log timeouts clearly  

### Risk 3: Memory Leaks in File Watcher
**Probability**: Low  
**Impact**: Long-running development sessions use excessive memory  
**Mitigation**: Use battle-tested chokidar library, test with long-running session  

### Risk 4: Configuration Misconfiguration
**Probability**: Medium  
**Impact**: Server won't start  
**Mitigation**: Validate all configuration at startup, provide clear error messages  

---

## Testing Strategy

### Unit Tests
- Service registry: register, lookup, state transitions
- Logger: formatting, JSON output, sensitive data filtering
- Configuration: loading, validation, defaults
- Health check: status calculation

### Integration Tests
- Full startup sequence from cold start
- GraphQL queries for service status
- File watcher triggers and debouncing
- Service lifecycle operations (start → ready → stop)
- Error handling for service crashes

### Manual Tests (Development)
- Start server and verify port 3000 is listening
- Query `/graphql` and verify introspection works
- Change a file in `/src` and verify restart is logged
- Stop server with Ctrl+C and verify graceful shutdown
- Test with missing `.env` file (should not crash)

### Performance Tests
- Startup time < 2 seconds
- GraphQL query < 100ms
- File watcher detection < 500ms
- Memory usage at startup < 100MB

---

## Dependencies

### Runtime Dependencies
- `express` - HTTP server framework
- `apollo-server-express` - GraphQL server
- `graphql` - GraphQL runtime
- `chokidar` - File watcher
- `dotenv` - Environment variable loading
- `winston` or `pino` - Structured logging

### Development Dependencies
- `typescript` - Type checking
- `jest` or `vitest` - Testing framework
- `supertest` - HTTP testing
- `@types/express` - TypeScript types
- `eslint` - Linting
- `prettier` - Code formatting

---

## Acceptance Criteria

A feature is considered complete when:

1. ✅ HTTP server listens on port 3000 successfully
2. ✅ GraphQL `/graphql` endpoint returns valid responses
3. ✅ Service registry stores and retrieves services
4. ✅ File watcher detects changes and logs restarts
5. ✅ Logging is structured JSON format
6. ✅ All configuration methods work (env vars, .env file)
7. ✅ Error handling doesn't crash the host
8. ✅ Health endpoint provides accurate status
9. ✅ All unit tests pass with >80% coverage
10. ✅ Integration tests demonstrate end-to-end flow
11. ✅ Code follows project style guidelines
12. ✅ Documentation is complete and accurate

---

## Related Features

**Depends On**: None (this is the bootstrap feature)

**Blocks**: 
- Feature 002: Security Layer & Permission Model
- Feature 003: EventLog Resource Provider
- Feature 004: File System Resource Provider
- Feature 005: Registry Resource Provider
- All subsequent features

**Related To**: System architecture foundation

---

## Clarifying Questions Addressed

During specification creation, the following clarifying questions were considered and documented above:

1. **GraphQL Implementation**: Apollo Server 4.x chosen for maturity and Express integration
2. **Service Lifecycle Management**: In-memory registry with clear state machine defined
3. **File Watcher Scope**: `/src` and config files, with exclusions for build artifacts
4. **Logging**: Structured JSON logging with multiple output options
5. **Configuration Management**: Environment variables + .env file support with validation
6. **Error Handling**: Global handlers with service isolation and circuit breaker pattern
7. **Performance Requirements**: Clear time budgets defined (startup <2s, queries <100ms, etc.)

---

## Next Steps

1. **Create git branch**: `feature/001-mcp-host-bootstrap`
2. **Create implementation plan**: `feature-plan skill` will detail technical architecture
3. **Break into tasks**: `feature-tasks skill` will create ordered implementation checklist
4. **Begin implementation**: Use task checklist to drive development
5. **Verify acceptance criteria**: Test against criteria in this document

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Status**: Ready for Planning Phase
