# Technical Implementation Plan: MCP Host Bootstrap

**Feature Number**: 001  
**Feature Title**: MCP Host Bootstrap  
**Document Version**: 1.0  
**Created**: 2024  
**Status**: Ready for Implementation  

---

## Executive Summary

This document provides the technical implementation plan for Feature 001: MCP Host Bootstrap, the foundational Node.js service that will host multiple MCP servers. The bootstrap establishes the core infrastructure needed for all subsequent features, including HTTP server management, GraphQL endpoint, service lifecycle management, file watching, structured logging, and configuration management.

The implementation uses a modular architecture with clear separation of concerns, designed to support future expansion with resource providers and security layers while maintaining clean interfaces for testing and integration.

---

## Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         SysMCP Bootstrap Service                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   HTTP/Express Server                     │  │
│  │              (PORT: 3000, graceful shutdown)              │  │
│  └──────────────────────────────────────────────────────────┘  │
│     ↓                           ↓                   ↓           │
│  ┌────────┐          ┌──────────────────┐      ┌──────────┐   │
│  │/health │          │  /graphql        │      │/graphql  │   │
│  │(JSON)  │          │  (Apollo Server) │      │(WebSocket)   │
│  └────────┘          └──────────────────┘      └──────────┘   │
│                           ↓                                     │
│                  ┌────────────────────┐                         │
│                  │  GraphQL Resolvers │                         │
│                  │  - Services Query  │                         │
│                  │  - Health Query    │                         │
│                  │  - Service Mutations                         │
│                  └────────────────────┘                         │
│                           ↓                                     │
│           ┌───────────────────────────────────┐                │
│           │      Service Registry & Lifecycle │                │
│           │  ┌─────────────────────────────┐  │                │
│           │  │ Service Registry            │  │                │
│           │  │ - Store service instances   │  │                │
│           │  │ - Track service state       │  │                │
│           │  └─────────────────────────────┘  │                │
│           │  ┌─────────────────────────────┐  │                │
│           │  │ Lifecycle Manager           │  │                │
│           │  │ - Start/Stop/Restart logic  │  │                │
│           │  │ - Error handling            │  │                │
│           │  │ - Retry with backoff        │  │                │
│           │  └─────────────────────────────┘  │                │
│           └───────────────────────────────────┘                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Support Services                            │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌──────────┐  ┌───────────────────┐  │  │
│  │  │ Logger     │  │ Config   │  │ File Watcher      │  │  │
│  │  │ (JSON)     │  │ Manager  │  │ (dev mode only)   │  │  │
│  │  └────────────┘  └──────────┘  └───────────────────┘  │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

Environment (.env, env vars) → Configuration Manager → All modules
```

### Data Flow

**Startup Sequence**:
```
1. Load Configuration
   ↓
2. Initialize Logger
   ↓
3. Validate Configuration
   ↓
4. Create Express App
   ↓
5. Setup Health Endpoint
   ↓
6. Initialize GraphQL Server
   ↓
7. Initialize Service Registry
   ↓
8. Start File Watcher (dev only)
   ↓
9. Start HTTP Server
   ↓
10. Log successful startup
```

**Request Flow (GraphQL)**:
```
HTTP Request → Express Middleware → Apollo Server
                                     ↓
                                 GraphQL Parser
                                     ↓
                         Route to appropriate resolver
                                     ↓
                         Query Service Registry / Lifecycle Manager
                                     ↓
                            Return GraphQL Response
                                     ↓
                               HTTP Response
```

**Service Lifecycle Flow**:
```
registerService()
   ↓
Service stored in Registry (DISABLED state)
   ↓
startService()
   ↓
Transition to STARTING
   ↓
Execute service initialization
   ↓
Success? → READY : ERROR (with retry logic)
   ↓
GraphQL queries reflect current state
   ↓
stopService() → STOPPING → Remove from active services
```

---

## Components to Create/Modify

### 1. Project Structure and Configuration Files

#### Files to Create:
```
SysMCP/
├── package.json              # Node.js project configuration
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Example environment variables
├── .env (development)        # Local development env vars
├── .prettierrc               # Code formatting config
├── .eslintrc.json            # Linting config
├── .gitignore                # Git ignore patterns
├── jest.config.js            # Jest testing configuration
│
├── src/
│   ├── index.ts              # Entry point, main initialization
│   ├── server.ts             # Express HTTP server setup
│   │
│   ├── config/
│   │   └── index.ts          # Configuration loader and validator
│   │
│   ├── logger/
│   │   ├── index.ts          # Logger factory
│   │   ├── types.ts          # Logger types/interfaces
│   │   └── formatters.ts     # JSON formatting, filters
│   │
│   ├── graphql/
│   │   ├── schema.ts         # GraphQL type definitions
│   │   ├── resolvers.ts      # Query and mutation resolvers
│   │   └── types.ts          # TypeScript types for GraphQL
│   │
│   ├── services/
│   │   ├── registry.ts       # Service registry implementation
│   │   ├── lifecycle.ts      # Service lifecycle management
│   │   └── types.ts          # Service-related types
│   │
│   ├── health.ts             # Health check endpoint
│   │
│   └── watcher.ts            # File watcher for dev mode
│
├── tests/
│   ├── unit/
│   │   ├── config.test.ts
│   │   ├── logger.test.ts
│   │   ├── registry.test.ts
│   │   ├── lifecycle.test.ts
│   │   └── health.test.ts
│   │
│   ├── integration/
│   │   ├── startup.test.ts
│   │   ├── graphql.test.ts
│   │   └── file-watcher.test.ts
│   │
│   └── e2e/
│       └── bootstrap.test.ts
│
└── docs/
    └── bootstrap-design.md   # Detailed design documentation
```

### 2. Core Components Detail

#### Component 2.1: Configuration Manager (`src/config/index.ts`)

**Responsibility**: Load, validate, and expose configuration

**Interface**:
```typescript
export interface Config {
  // Server config
  nodeEnv: 'development' | 'production';
  port: number;
  requestTimeoutMs: number;

  // GraphQL config
  graphqlIntrospectionEnabled: boolean;
  maxQueryDepth: number;

  // Logging config
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  logFile?: string;

  // Features
  fileWatcherEnabled: boolean;
}

export interface ConfigLoader {
  load(): Config;
  validate(): void;
  get<K extends keyof Config>(key: K): Config[K];
}

export function createConfig(): ConfigLoader;
```

**Implementation Details**:
- Load `.env` file using `dotenv` if present (fail silently if missing)
- Override with environment variables (env vars take precedence)
- Validate required fields at startup
- Apply defaults for optional fields
- Sanitize sensitive values (never expose tokens in logs)
- Throw clear errors if validation fails

**Environment Variables**:
```
NODE_ENV=development          # development | production
PORT=3000                     # Server port
LOG_LEVEL=info               # error | warn | info | debug
LOG_FILE=./logs/app.log      # Optional file output
GRAPHQL_INTROSPECTION=true   # Enable GraphQL introspection
MAX_QUERY_DEPTH=10           # Query complexity limit
REQUEST_TIMEOUT_MS=30000     # Request timeout
```

#### Component 2.2: Logger (`src/logger/index.ts`)

**Responsibility**: Structured JSON logging with multiple outputs

**Interface**:
```typescript
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

export interface LogEntry {
  timestamp: string;           // ISO 8601
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
  stack?: string;              // For errors
}

export function createLogger(service: string, config: Config): Logger;
```

**Implementation Details**:
- Output JSON format by default
- Each entry includes: timestamp, level, service, message, context
- Sensitive data filter: never log passwords, tokens, SSNs, PII
- Write to stdout by default
- Optional file output if `LOG_FILE` configured
- Child loggers maintain service context
- Stack traces included in debug mode for errors
- Performance: <1ms per log entry

**Log Filtering Rules**:
- Remove fields matching patterns: `password`, `token`, `secret`, `credential`, `ssn`, `apikey`
- Mask email addresses: show only domain
- Mask phone numbers: show only last 4 digits
- Mask full names: show first character only

#### Component 2.3: Service Registry (`src/services/registry.ts`)

**Responsibility**: In-memory registry of services with state management

**Interface**:
```typescript
export type ServiceState = 'disabled' | 'starting' | 'ready' | 'error' | 'stopping';

export interface ServiceConfig {
  name: string;
  type: string;
  config?: unknown;
  requiredPermissions?: string[];
}

export interface Service extends ServiceConfig {
  state: ServiceState;
  errorMessage?: string;
  startedAt?: Date;
  error?: Error;
}

export interface ServiceRegistry {
  register(config: ServiceConfig): Service;
  get(name: string): Service | undefined;
  getAll(): Service[];
  updateState(name: string, state: ServiceState, error?: Error): void;
  exists(name: string): boolean;
  remove(name: string): void;
}

export function createServiceRegistry(): ServiceRegistry;
```

**Implementation Details**:
- In-memory Map for O(1) lookups
- Thread-safe state updates (use locks if concurrent operations)
- State transitions validated (can't go from READY directly to STOPPING)
- Services start in DISABLED state
- Timestamp recorded when transitioning to READY
- Error messages stored for debugging
- No persistence (all data lost on restart - acceptable for bootstrap)

**State Machine**:
```
DISABLED ← (initial state or after stop)
   ↓
STARTING ← (startService called)
   ↓ (success)
READY
   ├─ (error during operation)
   └→ ERROR
STOPPING ← (stopService called)
   ↓
DISABLED
```

#### Component 2.4: Service Lifecycle Manager (`src/services/lifecycle.ts`)

**Responsibility**: Manage service state transitions, error handling, and retries

**Interface**:
```typescript
export interface LifecycleManager {
  startService(name: string): Promise<void>;
  stopService(name: string): Promise<void>;
  restartService(name: string): Promise<void>;
  isServiceHealthy(name: string): boolean;
}

export function createLifecycleManager(
  registry: ServiceRegistry,
  logger: Logger,
  config: Config
): LifecycleManager;
```

**Implementation Details**:
- Start operation flow:
  1. Validate service exists
  2. Check if already running
  3. Update state to STARTING
  4. Call service initialization (placeholder for now)
  5. Set timeout of 10 seconds
  6. On success: update state to READY
  7. On failure: retry up to 3 times with exponential backoff (1s, 2s, 4s)
  8. If all retries fail: update state to ERROR with message

- Stop operation flow:
  1. Validate service exists
  2. Update state to STOPPING
  3. Call service cleanup (placeholder for now)
  4. Set timeout of 10 seconds
  5. Update state to DISABLED
  6. Remove from active tracking

- Error handling:
  - Caught errors don't crash host
  - Meaningful error messages stored in service.errorMessage
  - Stack traces logged in debug mode
  - Errors trigger alert logging (visible to operators)

**Retry Strategy**:
- Initial delay: 1 second
- Exponential backoff: delay * 2 each retry
- Max retries: 3
- Total time budget: 7 seconds (1 + 2 + 4)

#### Component 2.5: GraphQL Schema & Resolvers

**File**: `src/graphql/schema.ts`

```typescript
// Type definitions using gql template string
export const typeDefs = gql`
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

  scalar DateTime

  type HealthStatus {
    status: String!
    uptime: Int!
    services: Int!
    timestamp: DateTime!
  }

  type Mutation {
    registerService(input: RegisterServiceInput!): ServiceRegistrationResult!
    startService(name: String!): ServiceOperationResult!
    stopService(name: String!): ServiceOperationResult!
    restartService(name: String!): ServiceOperationResult!
  }

  input RegisterServiceInput {
    name: String!
    type: String!
    config: JSON
    requiredPermissions: [String!]
  }

  type ServiceRegistrationResult {
    success: Boolean!
    service: Service
    error: String
  }

  type ServiceOperationResult {
    success: Boolean!
    error: String
  }
`;
```

**File**: `src/graphql/resolvers.ts`

```typescript
export function createResolvers(
  registry: ServiceRegistry,
  lifecycle: LifecycleManager,
  logger: Logger
) {
  return {
    Query: {
      services: () => registry.getAll(),
      service: (_, { name }) => registry.get(name),
      health: () => ({
        status: 'healthy',
        uptime: process.uptime(),
        services: registry.getAll().length,
        timestamp: new Date()
      })
    },
    Mutation: {
      registerService: async (_, { input }) => {
        try {
          const service = registry.register(input);
          logger.info('Service registered', { service: input.name });
          return { success: true, service };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      startService: async (_, { name }) => {
        try {
          await lifecycle.startService(name);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
      // Similar for stopService, restartService
    }
  };
}
```

#### Component 2.6: Express HTTP Server (`src/server.ts`)

**Responsibility**: Setup Express app with middleware and health endpoint

**Interface**:
```typescript
export interface ServerConfig {
  port: number;
  requestTimeoutMs: number;
  graphqlIntrospectionEnabled: boolean;
}

export async function createServer(
  config: ServerConfig,
  graphqlServer: ApolloServer,
  logger: Logger
): Promise<http.Server>;

export function setupGracefulShutdown(
  server: http.Server,
  logger: Logger,
  timeout: number
): void;
```

**Implementation Details**:

- Express middleware stack:
  1. Request logging middleware (log incoming requests)
  2. JSON body parser (limit to 1MB)
  3. Error handling middleware
  4. Request timeout middleware
  5. Health check endpoint
  6. GraphQL endpoint (Apollo Server)

- Health endpoint (`/health`):
  ```typescript
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });
  ```

- Graceful shutdown:
  - Listen for SIGTERM and SIGINT
  - Stop accepting new connections
  - Wait up to 5 seconds for in-flight requests
  - Force close if timeout exceeded
  - Log shutdown event

#### Component 2.7: File Watcher (`src/watcher.ts`)

**Responsibility**: Watch file changes and trigger service restart (dev mode only)

**Interface**:
```typescript
export interface FileWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  isWatching(): boolean;
}

export function createFileWatcher(
  lifecycle: LifecycleManager,
  logger: Logger,
  config: Config
): FileWatcher;
```

**Implementation Details**:

- Use `chokidar` library for cross-platform file watching
- Watch patterns:
  - Include: `/src/**` (all source files)
  - Include: `.env`, `config/**/*.{yml,json}` (configuration)
  - Exclude: `node_modules`, `dist`, `build`, `.git`, `*.log`, `*.tmp`

- Debouncing:
  - Collect file changes over 500ms
  - Batch changes into single restart
  - Prevents cascade restarts

- Restart suppression:
  - After restart completes, ignore changes for 2 seconds
  - Prevents infinite restart loops

- Logging:
  - Log files changed
  - Log restart triggered
  - Log restart success/failure

```typescript
private debounce() {
  // Reset 500ms timer, collecting changes
  if (this.debounceTimer) clearTimeout(this.debounceTimer);
  
  this.debounceTimer = setTimeout(() => {
    if (this.isRestartingNow) return; // Too soon after restart
    this.triggerRestart();
  }, 500);
}

private async triggerRestart() {
  this.isRestartingNow = true;
  this.logger.info('Restarting services due to file changes');
  
  // Restart logic would go here
  
  // Suppress changes for 2 seconds
  setTimeout(() => { this.isRestartingNow = false; }, 2000);
}
```

#### Component 2.8: Health Check (`src/health.ts`)

**Responsibility**: Provide health status endpoint

**Interface**:
```typescript
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  services: number;
  readyServices: number;
  errorServices: number;
  timestamp: string;
}

export function getHealthStatus(
  registry: ServiceRegistry,
  lifecycle: LifecycleManager
): HealthStatus;
```

**Health Status Logic**:
- `healthy`: All services are READY or DISABLED, no ERRORs
- `degraded`: Some services in ERROR state but host running
- `unhealthy`: Critical services in ERROR state (future feature)

### 3. Main Entry Point (`src/index.ts`)

**Responsibility**: Orchestrate startup sequence

```typescript
async function main() {
  try {
    // 1. Load configuration
    const config = createConfig();
    config.validate();

    // 2. Initialize logger
    const logger = createLogger('bootstrap', config);
    logger.info('Starting MCP Host Bootstrap...');

    // 3. Create Express app
    const app = express();

    // 4. Initialize service registry
    const registry = createServiceRegistry();

    // 5. Initialize lifecycle manager
    const lifecycle = createLifecycleManager(registry, logger, config);

    // 6. Setup GraphQL
    const apolloServer = new ApolloServer({
      typeDefs,
      resolvers: createResolvers(registry, lifecycle, logger),
      introspection: config.graphqlIntrospectionEnabled,
      plugins: {
        didEncounterErrors: (err) => logger.error('GraphQL error', { error: err })
      }
    });
    await apolloServer.start();
    apolloServer.installHandlers(app);

    // 7. Setup health endpoint
    app.get('/health', (req, res) => {
      res.json(getHealthStatus(registry, lifecycle));
    });

    // 8. Create and start HTTP server
    const server = await createServer(config, apolloServer, logger);
    
    // 9. Start file watcher (dev only)
    if (config.fileWatcherEnabled) {
      const watcher = createFileWatcher(lifecycle, logger, config);
      await watcher.start();
    }

    logger.info('Bootstrap complete', { port: config.port, env: config.nodeEnv });

  } catch (error) {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

main();
```

---

## Data Flow Diagrams

### Startup Initialization Sequence

```
┌─────────────────────────────────────────────────────────────┐
│ START PROCESS                                               │
└────┬────────────────────────────────────────────────────────┘
     │
     ├─ Load .env file (dotenv)
     │  └─ Set process.env variables
     │
     ├─ Load environment variables
     │  └─ Create Config object
     │
     ├─ Validate configuration
     │  └─ Check: PORT, LOG_LEVEL, NODE_ENV
     │  └─ Exit with error if missing critical config
     │
     ├─ Initialize Logger
     │  └─ Create root logger instance
     │  └─ Configure output: stdout + optional file
     │
     ├─ Log startup message
     │
     ├─ Create Express app
     │  └─ Setup middleware stack
     │
     ├─ Initialize Service Registry
     │  └─ Create empty registry Map
     │
     ├─ Initialize Lifecycle Manager
     │  └─ Ready to start/stop services
     │
     ├─ Initialize GraphQL
     │  └─ Parse type definitions
     │  └─ Attach resolvers
     │  └─ Create Apollo Server instance
     │  └─ Start Apollo server
     │  └─ Install Apollo middleware on Express
     │
     ├─ Setup health endpoint (/health)
     │
     ├─ Create HTTP server
     │  └─ Bind to config.port
     │  └─ Setup graceful shutdown
     │
     ├─ [DEV MODE ONLY] Start file watcher
     │  └─ Watch src/ and config files
     │  └─ Setup debounce and restart suppression
     │
     ├─ Call server.listen()
     │
     ├─ Log success message with port
     │
     └─ Ready to accept GraphQL requests
```

### GraphQL Query Execution Flow

```
HTTP POST /graphql
│
└─ Express receives request
   │
   └─ Apollo Server middleware
      │
      ├─ Parse GraphQL query
      │
      ├─ Check introspection enabled
      │
      ├─ Analyze query complexity (optional)
      │
      ├─ Find matching resolver
      │
      ├─ Execute resolver
      │  │
      │  ├─ Query.services
      │  │  └─ registry.getAll()
      │  │  └─ Return array of services
      │  │
      │  ├─ Query.service(name)
      │  │  └─ registry.get(name)
      │  │  └─ Return single service or null
      │  │
      │  ├─ Query.health
      │  │  └─ Calculate uptime
      │  │  └─ Count services
      │  │  └─ Return health status
      │  │
      │  ├─ Mutation.registerService
      │  │  └─ Validate input
      │  │  └─ registry.register()
      │  │  └─ Log event
      │  │  └─ Return result
      │  │
      │  └─ Mutation.startService
      │     └─ Validate service exists
      │     └─ lifecycle.startService()
      │     └─ Return success/error
      │
      ├─ Format response (GraphQL JSON)
      │
      ├─ Log response time
      │
      └─ Send HTTP response

HTTP Response 200 OK
```

### File Watcher Restart Flow

```
File system detects change
│
└─ chokidar fires change event
   │
   └─ FileWatcher.onChange()
      │
      ├─ Check if already in restart suppression window
      │  └─ Yes: ignore change
      │  └─ No: continue
      │
      ├─ Log file changed
      │
      ├─ Clear previous debounce timer (if any)
      │
      ├─ Set new 500ms debounce timer
      │
      └─ [After 500ms debounce expires]
         │
         ├─ Check restart suppression again
         │
         ├─ Set isRestartingNow = true
         │
         ├─ Log restart triggered
         │
         ├─ lifecycle.restartService() for all running services
         │  └─ Stop service
         │  └─ Start service
         │  └─ Update state
         │
         ├─ Log restart complete
         │
         ├─ Set 2-second restart suppression window
         │  └─ Ignore all changes for 2 seconds
         │
         └─ Set isRestartingNow = false (after 2 seconds)
```

---

## API Changes and Contracts

### GraphQL API Specification

#### Queries

**Query: services**
```graphql
query {
  services {
    name
    type
    state
    errorMessage
    startedAt
  }
}
```

Response example:
```json
{
  "data": {
    "services": [
      {
        "name": "eventlog",
        "type": "resource-provider",
        "state": "READY",
        "errorMessage": null,
        "startedAt": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

**Query: service(name)**
```graphql
query {
  service(name: "eventlog") {
    name
    state
    errorMessage
  }
}
```

**Query: health**
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

#### Mutations

**Mutation: registerService**
```graphql
mutation {
  registerService(input: {
    name: "eventlog"
    type: "resource-provider"
    config: {}
    requiredPermissions: ["read:eventlog"]
  }) {
    success
    service { name state }
    error
  }
}
```

**Mutation: startService**
```graphql
mutation {
  startService(name: "eventlog") {
    success
    error
  }
}
```

### REST API Specification

**Health Endpoint: GET /health**
```
Request:
  GET /health

Response (200 OK):
  {
    "status": "healthy",
    "uptime": 1234.56,
    "services": 3,
    "readyServices": 2,
    "errorServices": 1,
    "timestamp": "2024-01-15T10:30:00Z"
  }
```

---

## Database/Storage Schema

**Not applicable for bootstrap feature.** All data is in-memory:
- Service registry: In-memory Map
- Configuration: Loaded into memory at startup
- Logs: Written to stdout and optional file
- No persistent storage required

Future features (write buffering, audit trails) will require persistent storage.

---

## Security Considerations

### 1. GraphQL Introspection Control

**Risk**: Schema introspection exposes service structure in production  
**Mitigation**:
- Disable introspection by default in production (`GRAPHQL_INTROSPECTION=false`)
- Enable in development for better developer experience
- Log introspection requests in debug mode

### 2. Query Complexity Analysis

**Risk**: Complex nested queries could cause DoS  
**Mitigation**:
- Set `MAX_QUERY_DEPTH=10` by default
- Reject queries exceeding depth limit
- Log rejected queries with source information

### 3. Sensitive Data in Logs

**Risk**: Credentials, tokens, PII logged accidentally  
**Mitigation**:
- Implement sensitive data filter in logger
- Filter patterns: `password`, `token`, `secret`, `credential`, `ssn`, `apikey`
- Never log stack traces in production
- Log sensitive actions (restarts, errors) without revealing details

### 4. Request Timeout

**Risk**: Malicious slow requests consume server resources  
**Mitigation**:
- Set `REQUEST_TIMEOUT_MS=30000` (30 seconds default)
- Enforce timeout on all GraphQL requests
- Log timeout events as warnings

### 5. Port Binding

**Risk**: Port 3000 might be in use, service fails to start  
**Mitigation**:
- Check port availability before binding
- Fail with clear error message if unavailable
- Log which port service is binding to
- Allow configuration via `PORT` env var

### 6. File Watcher Restrictions

**Risk**: Watching too many files impacts performance or triggers infinite restart loops  
**Mitigation**:
- Exclude: node_modules, dist, build, .git, *.log
- Include only: src/, config files
- Implement 2-second restart suppression window
- Debounce changes to 500ms batches
- Log all file watching activity

### 7. Graceful Shutdown

**Risk**: Services not properly cleaned up, resource leaks  
**Mitigation**:
- Listen for SIGTERM and SIGINT signals
- Stop accepting new connections
- Wait up to 5 seconds for in-flight requests
- Force close if timeout exceeded
- Log shutdown event clearly

### 8. Error Message Disclosure

**Risk**: Detailed error messages in GraphQL responses leak internal details  
**Mitigation**:
- Return generic error messages to client
- Log detailed errors internally for debugging
- Different error messages for development vs production mode

---

## Testing Strategy

### Unit Tests

**Test Files**:
- `tests/unit/config.test.ts` - Configuration loading and validation
- `tests/unit/logger.test.ts` - Logger formatting and filtering
- `tests/unit/registry.test.ts` - Service registry operations
- `tests/unit/lifecycle.test.ts` - Service lifecycle state machine
- `tests/unit/health.test.ts` - Health status calculation

**Test Coverage Target**: >80% of logic

**Example Test Suite: Registry**
```typescript
describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = createServiceRegistry();
  });

  test('should register a new service', () => {
    const service = registry.register({
      name: 'test-service',
      type: 'provider'
    });

    expect(service.name).toBe('test-service');
    expect(service.state).toBe('disabled');
  });

  test('should retrieve service by name', () => {
    registry.register({ name: 'svc1', type: 'provider' });
    const service = registry.get('svc1');
    expect(service).toBeDefined();
    expect(service.name).toBe('svc1');
  });

  test('should update service state', () => {
    registry.register({ name: 'svc2', type: 'provider' });
    registry.updateState('svc2', 'ready');
    expect(registry.get('svc2').state).toBe('ready');
  });

  test('should return undefined for non-existent service', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });
});
```

### Integration Tests

**Test Files**:
- `tests/integration/startup.test.ts` - Full startup sequence
- `tests/integration/graphql.test.ts` - GraphQL endpoint queries/mutations
- `tests/integration/file-watcher.test.ts` - File watching and restart

**Example Test: GraphQL Services Query**
```typescript
describe('GraphQL Services Query', () => {
  let server: ApolloServer;
  let registry: ServiceRegistry;

  beforeAll(async () => {
    registry = createServiceRegistry();
    server = new ApolloServer({
      typeDefs,
      resolvers: createResolvers(registry, lifecycle, logger)
    });
  });

  test('services query returns all registered services', async () => {
    registry.register({ name: 'svc1', type: 'provider' });
    registry.register({ name: 'svc2', type: 'provider' });

    const result = await server.executeOperation({
      query: gql`query { services { name } }`
    });

    expect(result.data.services).toHaveLength(2);
    expect(result.data.services[0].name).toBe('svc1');
  });
});
```

### E2E Tests

**Test Files**:
- `tests/e2e/bootstrap.test.ts` - Full application startup and basic operations

**Scenarios**:
1. Start server → Health endpoint returns healthy
2. Register service → GraphQL query returns service
3. Start service → State transitions to READY
4. Stop service → State transitions to DISABLED
5. Change file → Watcher logs restart (dev mode only)

### Performance Tests

**Benchmarks to verify**:
- Server startup: < 2 seconds
- GraphQL query resolution: < 100ms
- Health endpoint response: < 50ms
- File watcher detection: < 500ms
- Memory footprint: < 100MB at startup

---

## Implementation Risks

### Risk 1: File Watcher Cascading Restarts

**Probability**: Medium  
**Severity**: High  
**Impact**: Service becomes unstable, constantly restarting

**Mitigation Strategies**:
1. Implement 2-second restart suppression window
2. Debounce changes to 500ms batches
3. Log all restart attempts
4. Monitor for restart loops (warn after 5 restarts in 1 minute)
5. Test extensively with rapid file changes

**Detection**: If restart log entries appear more than once per 2 seconds

### Risk 2: Service Startup Timeout

**Probability**: Low  
**Severity**: High  
**Impact**: Hanging server, operational confusion

**Mitigation Strategies**:
1. Set strict 10-second timeout on service startup
2. Implement timer-based abort
3. Log timeout clearly
4. Transition service to ERROR state
5. Ensure retry logic eventually stops

**Detection**: Service stuck in STARTING state after 10 seconds

### Risk 3: Memory Leak in File Watcher

**Probability**: Low  
**Severity**: Medium  
**Impact**: Long-running dev sessions consume excessive memory

**Mitigation Strategies**:
1. Use battle-tested chokidar library
2. Test with continuous file changes over 1 hour
3. Monitor memory usage in CI/CD
4. Implement file change history cleanup
5. Document known memory issues

**Detection**: Memory usage grows continuously without plateau

### Risk 4: Configuration Loading Errors

**Probability**: Medium  
**Severity**: Medium  
**Impact**: Server won't start, unclear error messages

**Mitigation Strategies**:
1. Validate all configuration at startup
2. Provide specific error messages for each missing field
3. Document all required env vars
4. Provide .env.example file
5. Test with missing/invalid config

**Detection**: Application exits with clear error message

### Risk 5: Port Already in Use

**Probability**: Medium  
**Severity**: Low  
**Impact**: Developer confusion, difficulty in testing

**Mitigation Strategies**:
1. Check port availability before binding
2. Attempt to bind and catch EADDRINUSE error
3. Provide clear message: "Port 3000 is already in use"
4. Suggest using PORT env var to use different port
5. Log which port is being used

**Detection**: Clear error message during startup

### Risk 6: GraphQL Introspection Performance Impact

**Probability**: Low  
**Severity**: Low  
**Impact**: Slow introspection queries in production

**Mitigation Strategies**:
1. Disable introspection in production by default
2. Cache introspection results
3. Monitor introspection query performance
4. Document introspection security implications
5. Test with large schema (future-proof)

**Detection**: GraphQL query execution time > 100ms

---

## Dependencies and Versions

### Runtime Dependencies

| Package | Version | Purpose | Security Notes |
|---------|---------|---------|-----------------|
| express | ^4.18.0 | HTTP server framework | Actively maintained |
| apollo-server-express | ^4.10.0 | GraphQL server | Requires graphql dependency |
| graphql | ^16.0.0 | GraphQL runtime | Required by apollo-server |
| dotenv | ^16.0.0 | .env file loading | Safe for production |
| chokidar | ^3.5.0 | File watcher | Actively maintained, cross-platform |
| winston | ^3.10.0 OR pino | Structured logging | Popular choice, many appenders |
| uuid | ^9.0.0 | Unique IDs (if needed) | Standard utility |

### Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| typescript | ^5.0.0 | Type checking |
| @types/express | ^4.17.0 | Express types |
| @types/node | ^20.0.0 | Node.js types |
| jest | ^29.0.0 | Testing framework |
| @types/jest | ^29.0.0 | Jest types |
| supertest | ^6.3.0 | HTTP testing |
| ts-jest | ^29.0.0 | TypeScript Jest integration |
| eslint | ^8.0.0 | Linting |
| @typescript-eslint/eslint-plugin | ^6.0.0 | TypeScript linting |
| prettier | ^3.0.0 | Code formatting |

### Peer Dependencies

None specified for this bootstrap feature.

### Dependency Analysis

**Critical Dependencies**:
- `express` - Core HTTP server, well-maintained
- `apollo-server-express` - GraphQL, industry standard
- `chokidar` - File watching, battle-tested

**Risk Dependencies**:
- None identified; all are well-maintained projects

**Future Considerations**:
- May add `winston` for advanced logging features
- May add `joi` for schema validation
- May add `helmet` for security headers

---

## Build and Deployment Considerations

### Build Process

**Build Commands**:
```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Run tests with coverage
npm run test:coverage

# Build TypeScript
npm run build

# Start application
npm start

# Development mode with file watching
npm run dev
```

**Build Output**:
- `dist/` directory contains compiled JavaScript
- Source maps included for debugging
- Tree-shaking enabled to minimize bundle size

### Development Environment Setup

**Prerequisites**:
- Node.js 18.x or later
- npm 8.x or later
- Git

**Setup Steps**:
```bash
# Clone repository
git clone <repository-url>

# Install dependencies
npm install

# Copy example env file
cp .env.example .env

# Start dev server
npm run dev
```

**Expected Output**:
```
[2024-01-15T10:30:00.000Z] info    bootstrap   Starting MCP Host Bootstrap...
[2024-01-15T10:30:00.100Z] info    bootstrap   GraphQL endpoint ready at http://localhost:3000/graphql
[2024-01-15T10:30:00.150Z] info    bootstrap   Bootstrap complete, port=3000, env=development
```

### Production Environment Setup

**Prerequisites**:
- Node.js 18.x or later (LTS)
- Environment variables configured
- No file watching (development feature only)

**Configuration**:
```bash
export NODE_ENV=production
export PORT=3000
export LOG_LEVEL=info
export GRAPHQL_INTROSPECTION=false
export MAX_QUERY_DEPTH=10
```

**Startup**:
```bash
npm start
```

### Docker Deployment (Optional)

**Dockerfile** (if containerization needed):
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist

# Set environment
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/index.js"]
```

### Logging and Monitoring

**Log Output**:
- JSON structured logs to stdout
- Optional file output if LOG_FILE configured
- Logs parseable by common aggregation tools (ELK, Datadog, CloudWatch)

**Metrics for Monitoring** (future):
- Startup time
- GraphQL query performance
- Service state transitions
- Error rates
- Memory usage

---

## Success Metrics

### Functional Success Metrics

1. **Server Startup**
   - [ ] HTTP server binds to port 3000 successfully
   - [ ] Startup completes in < 2 seconds
   - [ ] Health endpoint returns 200 OK

2. **GraphQL Endpoint**
   - [ ] `/graphql` endpoint responds to valid queries
   - [ ] Query: services returns registered services
   - [ ] Query: health returns uptime and service count
   - [ ] Mutation: registerService creates new service
   - [ ] Query response time < 100ms (measured)

3. **Service Lifecycle**
   - [ ] Service registered → appears in registry
   - [ ] Service state transitions correctly: DISABLED → STARTING → READY
   - [ ] Error handling works: failed start → ERROR state
   - [ ] Retry logic works: up to 3 attempts with backoff
   - [ ] Service stop works: transitions to STOPPING → DISABLED

4. **File Watcher** (Dev Mode)
   - [ ] File changes detected within 500ms
   - [ ] Multiple changes debounced into single restart
   - [ ] Restart suppression prevents infinite loops
   - [ ] Restart events logged with filenames changed

5. **Configuration Management**
   - [ ] .env file loaded if present
   - [ ] Environment variables override .env
   - [ ] Missing required config → clear error message
   - [ ] All env vars validated at startup

6. **Logging**
   - [ ] JSON structured logs to stdout
   - [ ] Each log entry has: timestamp, level, service, message
   - [ ] Sensitive data filtered: no passwords/tokens logged
   - [ ] Log level filtering works (debug/info/warn/error)

### Code Quality Metrics

1. **Test Coverage**
   - [ ] >80% overall code coverage
   - [ ] All public functions have unit tests
   - [ ] Integration tests cover full startup
   - [ ] No critical paths untested

2. **TypeScript**
   - [ ] Strict mode enabled (`strict: true`)
   - [ ] No `any` types except where necessary
   - [ ] All exported functions have type annotations

3. **Code Standards**
   - [ ] ESLint passes with zero errors
   - [ ] Prettier formatting applied
   - [ ] Code organized into focused modules
   - [ ] Public APIs documented with JSDoc

4. **Documentation**
   - [ ] README with setup instructions
   - [ ] Architecture documentation
   - [ ] API documentation for GraphQL schema
   - [ ] Example .env file with all variables
   - [ ] Inline comments for complex logic

### Performance Metrics

1. **Startup Performance**
   - [ ] Measured startup time: < 2 seconds
   - [ ] Initial memory footprint: < 100MB
   - [ ] Memory stable after 1 minute (no leaks)

2. **Request Performance**
   - [ ] GraphQL query p95: < 100ms
   - [ ] Health endpoint response: < 50ms
   - [ ] Request timeout enforcement works

3. **File Watcher Performance**
   - [ ] File change detection: < 500ms
   - [ ] CPU usage stable (no busy-loop)
   - [ ] No memory leaks during long session

### Operational Metrics

1. **Error Handling**
   - [ ] Unhandled exceptions don't crash host
   - [ ] Service errors logged with context
   - [ ] Clear error messages for all failures
   - [ ] Stack traces in debug mode

2. **Graceful Shutdown**
   - [ ] SIGTERM signal handled gracefully
   - [ ] In-flight requests complete (within timeout)
   - [ ] Server closes cleanly
   - [ ] Log entry on shutdown

---

## Open Questions for Clarification

### Q1: Service Initialization Placeholder
**Question**: How should services be initialized? Currently the lifecycle manager has placeholder code.

**Answer**: For bootstrap feature, services are registered but not actually started (no real providers yet). Future features will implement actual service initialization logic. For now, a successful `startService` simply transitions state to READY.

### Q2: Database Persistence
**Question**: Should service registry be persisted across restarts?

**Answer**: No, not for bootstrap. All data is in-memory and lost on restart. Write buffering and audit trails (Feature 2) will require persistent storage.

### Q3: Authentication for GraphQL
**Question**: Should GraphQL mutations require authentication in bootstrap?

**Answer**: No, not for bootstrap. Authentication is out of scope (Feature 2). All GraphQL endpoints are public.

### Q4: Clustering and Multiple Processes
**Question**: Should the bootstrap support multiple Node.js processes?

**Answer**: No, single-process architecture only. Clustering is out of scope for this feature.

### Q5: Monitoring and Metrics
**Question**: Should we implement Prometheus metrics or similar?

**Answer**: No, logging only for bootstrap. Metrics and monitoring are out of scope for this feature.

### Q6: WebSocket Support for GraphQL Subscriptions
**Question**: Should GraphQL subscriptions be supported?

**Answer**: No, mutations and queries only. Subscriptions are out of scope for this feature.

---

## Implementation Order and Dependencies

### Phase 1: Foundation (Week 1)
1. **Project Setup**
   - Create package.json, tsconfig.json
   - Setup npm scripts
   - Configure ESLint and Prettier

2. **Configuration System**
   - Implement config loader
   - Setup .env file loading
   - Configuration validation

3. **Logging System**
   - Implement JSON logger
   - Sensitive data filtering
   - File and stdout output

### Phase 2: Core Server (Week 1-2)
4. **Express HTTP Server**
   - Setup Express app
   - Middleware stack
   - Health endpoint
   - Graceful shutdown

5. **Service Registry**
   - In-memory registry implementation
   - Service state management
   - Lookup operations

6. **Service Lifecycle**
   - State transitions
   - Error handling
   - Retry logic with backoff

### Phase 3: GraphQL (Week 2)
7. **GraphQL Schema**
   - Type definitions
   - Query schema
   - Mutation schema

8. **GraphQL Resolvers**
   - Query resolvers
   - Mutation resolvers
   - Error handling

9. **Apollo Server Integration**
   - Setup Apollo Server
   - Install middleware
   - Introspection configuration

### Phase 4: Development Features (Week 2-3)
10. **File Watcher**
    - Setup chokidar
    - Debouncing logic
    - Restart suppression
    - Restart triggering

11. **Health Check**
    - Health status calculation
    - Status endpoint

### Phase 5: Testing (Week 3)
12. **Unit Tests**
    - Config tests
    - Logger tests
    - Registry tests
    - Lifecycle tests

13. **Integration Tests**
    - Startup tests
    - GraphQL endpoint tests
    - File watcher tests

14. **E2E Tests**
    - Full bootstrap scenario
    - Basic operations

### Phase 6: Documentation and Polish (Week 3-4)
15. **Documentation**
    - README with setup
    - API documentation
    - Architecture documentation
    - Example .env file

16. **Code Review and Quality**
    - Code review against guidelines
    - Coverage verification
    - Performance testing

---

## Next Steps

1. **Create git feature branch**:
   ```bash
   git checkout -b feature/001-mcp-host-bootstrap
   ```

2. **Run feature-tasks skill** to break plan into ordered implementation tasks

3. **Begin implementation** following the task checklist

4. **Verify against acceptance criteria** in specification

5. **Prepare for code review** with this plan as reference

---

## Appendix: File Structure

### Final Directory Structure

```
SysMCP/
├── .github/
│   └── copilot-instructions.md    # Architecture and guidelines
│
├── features/
│   ├── 001-mcp-host-bootstrap.spec.md    # Specification
│   ├── 001-mcp-host-bootstrap.plan.md    # This document
│   └── 001-mcp-host-bootstrap.tasks.md   # Task breakdown (from feature-tasks)
│
├── src/
│   ├── index.ts                   # Entry point, startup sequence
│   │
│   ├── config/
│   │   └── index.ts              # Configuration loader
│   │
│   ├── logger/
│   │   ├── index.ts              # Logger factory
│   │   ├── types.ts              # Logger interfaces
│   │   └── formatters.ts         # JSON formatting
│   │
│   ├── server.ts                 # Express server setup
│   │
│   ├── health.ts                 # Health endpoint handler
│   │
│   ├── graphql/
│   │   ├── schema.ts             # GraphQL type definitions
│   │   ├── resolvers.ts          # Query/mutation resolvers
│   │   └── types.ts              # TypeScript types
│   │
│   ├── services/
│   │   ├── registry.ts           # Service registry
│   │   ├── lifecycle.ts          # Service lifecycle manager
│   │   └── types.ts              # Service types
│   │
│   └── watcher.ts                # File watcher
│
├── tests/
│   ├── unit/
│   │   ├── config.test.ts
│   │   ├── logger.test.ts
│   │   ├── registry.test.ts
│   │   ├── lifecycle.test.ts
│   │   └── health.test.ts
│   │
│   ├── integration/
│   │   ├── startup.test.ts
│   │   ├── graphql.test.ts
│   │   └── file-watcher.test.ts
│   │
│   └── e2e/
│       └── bootstrap.test.ts
│
├── docs/
│   └── bootstrap-design.md       # Detailed design documentation
│
├── .env.example                  # Example environment variables
├── .gitignore                    # Git ignore patterns
├── .eslintrc.json               # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── jest.config.js               # Jest test configuration
├── package.json                 # NPM dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── README.md                    # Project overview
└── LICENSE                      # License file
```

---

**Document Status**: Ready for Implementation  
**Next Phase**: Run feature-tasks skill to break into ordered tasks

