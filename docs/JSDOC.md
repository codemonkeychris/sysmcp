# MCP Host Bootstrap - TypeScript/Node.js Module

## Overview

This module provides comprehensive JSDoc documentation for all public APIs. All functions, classes, interfaces, and types include detailed documentation with examples, parameters, return types, and usage information.

## Module Documentation

### Core Modules

#### `src/index.ts`

Main entry point for the application.

```typescript
/**
 * Initialize the application
 * 
 * Performs the following steps in order:
 * 1. Load environment variables from .env
 * 2. Create configuration
 * 3. Initialize logger
 * 4. Create Express app and health endpoint
 * 5. Initialize service registry
 * 6. Initialize service lifecycle manager
 * 7. Start file watcher (development mode only)
 * 8. Start HTTP server
 * 
 * @returns {Promise<AppContext>} Application context containing all components
 * @throws {Error} If initialization fails at any step
 * 
 * @example
 * const context = await initializeApp();
 * console.log(`Server running on port ${context.config.port}`);
 */
async function initializeApp(): Promise<AppContext>
```

#### `src/config/index.ts`

Configuration management from environment variables.

```typescript
/**
 * Load and validate configuration from environment variables
 * 
 * Loads configuration from .env file and process.env, with sensible defaults.
 * Validates all values and throws an error if invalid.
 * 
 * @returns {Config} Validated configuration object
 * @throws {Error} If configuration validation fails
 * 
 * @example
 * const config = loadConfig();
 * console.log(`Running in ${config.nodeEnv} mode on port ${config.port}`);
 */
export function loadConfig(): Config
```

#### `src/logger/index.ts`

Structured JSON logging with PII filtering.

```typescript
/**
 * Create a logger instance with configuration
 * 
 * Creates a structured logger that outputs JSON-formatted logs with:
 * - Automatic PII filtering (emails, phone numbers, SSNs, etc.)
 * - Multiple output targets (stdout, optional file)
 * - Child logger support for context propagation
 * - Configurable log levels
 * 
 * @param {LoggerFactoryOptions} options Logger configuration
 * @param {LogLevel} options.level Minimum log level to output
 * @param {string} options.service Service name for log context
 * @param {string} [options.logFile] Optional file path for logging
 * @returns {Logger} Logger instance
 * 
 * @example
 * const logger = createLogger({
 *   level: 'info',
 *   service: 'my-service',
 *   logFile: '/tmp/app.log'
 * });
 * logger.info('Application started', { version: '1.0.0' });
 */
export function createLogger(options: LoggerFactoryOptions): Logger
```

#### `src/services/registry.ts`

In-memory service registry with state tracking.

```typescript
/**
 * Create a new service registry
 * 
 * Creates an in-memory registry for managing services with:
 * - O(1) service lookup by name
 * - State machine validation (no invalid transitions)
 * - Automatic timestamp tracking for READY state
 * - Error message storage for failed services
 * 
 * @param {Logger} [logger] Optional logger for state change events
 * @returns {ServiceRegistry} Service registry instance
 * 
 * @example
 * const registry = createRegistry(logger);
 * registry.register({ name: 'api', type: 'http' });
 * registry.updateState('api', 'starting');
 * registry.updateState('api', 'ready');
 */
export function createRegistry(logger?: Logger): ServiceRegistry
```

#### `src/services/lifecycle.ts`

Service start, stop, and restart operations with retry logic.

```typescript
/**
 * Create a service lifecycle manager
 * 
 * Manages service lifecycle operations with:
 * - Automatic retry logic (3 attempts with exponential backoff)
 * - Configurable timeouts (10 seconds for startup/shutdown)
 * - Proper error handling and state transitions
 * - Logging of all operations
 * 
 * @param {ServiceRegistry} registry Service registry instance
 * @param {Logger} logger Logger instance for operation logging
 * @returns {ServiceLifecycleManager} Lifecycle manager instance
 * 
 * @example
 * const manager = createLifecycleManager(registry, logger);
 * manager.registerInit('api', async () => {
 *   // Initialize service
 * });
 * await manager.startService('api');
 */
export function createLifecycleManager(
  registry: ServiceRegistry,
  logger: Logger
): ServiceLifecycleManager
```

#### `src/server.ts`

Express HTTP server with health endpoint and graceful shutdown.

```typescript
/**
 * Create an HTTP server with Express
 * 
 * Sets up an Express server with:
 * - Automatic middleware (JSON parsing, request logging)
 * - Health check endpoint at GET /health
 * - Graceful shutdown with SIGTERM/SIGINT handling
 * - Request timeout configuration
 * - Error handling middleware
 * 
 * @param {Logger} logger Logger instance
 * @param {Config} config Application configuration
 * @param {ServiceRegistry} [registry] Optional service registry for health checks
 * @returns {Server} Server instance with start() and stop() methods
 * 
 * @example
 * const server = createServer(logger, config, registry);
 * await server.start(); // Listens on configured port
 * // ... later ...
 * await server.stop();  // Graceful shutdown
 */
export function createServer(
  logger: Logger,
  config: Config,
  registry?: ServiceRegistry
): Server
```

#### `src/watcher.ts`

File system watcher for development mode hot-reloading.

```typescript
/**
 * Create a file watcher for development mode
 * 
 * Creates a file watcher that:
 * - Only activates in development mode (NODE_ENV !== 'production')
 * - Watches src/ and config files for changes
 * - Debounces rapid changes (500ms)
 * - Prevents cascade restarts (2-second cooldown)
 * - Restarts all healthy services on file change
 * 
 * @param {Logger} logger Logger instance
 * @param {Config} config Configuration with NODE_ENV
 * @param {ServiceRegistry} registry Service registry
 * @param {ServiceLifecycleManager} lifecycleManager Lifecycle manager
 * @returns {FileWatcher} File watcher instance
 * 
 * @example
 * const watcher = createFileWatcher(logger, config, registry, manager);
 * await watcher.start();
 * // Services auto-restart when files change in development
 * await watcher.stop(); // Graceful shutdown
 */
export function createFileWatcher(
  logger: Logger,
  config: Config,
  registry: ServiceRegistry,
  lifecycleManager: ServiceLifecycleManager
): FileWatcher
```

#### `src/graphql/resolvers.ts`

GraphQL resolver implementations for service management queries and mutations.

```typescript
/**
 * GraphQL resolvers for service management
 * 
 * Implements the following operations:
 * 
 * **Queries:**
 * - services: Returns all registered services
 * - service(name): Returns specific service or null
 * - health: Returns current system health status
 * 
 * **Mutations:**
 * - registerService(input): Registers a new service
 * - startService(name): Starts a service with retries
 * - stopService(name): Stops a running service
 * - restartService(name): Restarts a service
 * 
 * @example
 * // All mutations return { success, service?, error? }
 * const result = await resolvers.Mutation.startService(
 *   null,
 *   { name: 'api-service' },
 *   { registry, logger, lifecycleManager }
 * );
 * if (result.success) {
 *   console.log(`Service started: ${result.service?.name}`);
 * } else {
 *   console.error(`Error: ${result.error}`);
 * }
 */
export const resolvers: {
  Query: { ... };
  Mutation: { ... };
}
```

### Type Definitions

#### Logger Types (`src/logger/types.ts`)

```typescript
/** Union of all valid log levels */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Log entry structure for JSON output */
export interface LogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Log level (error, warn, info, debug) */
  level: LogLevel;
  /** Service name for context */
  service: string;
  /** Main log message */
  message: string;
  /** Optional context object (PII filtered) */
  context?: Record<string, unknown>;
  /** Stack trace (for errors in debug mode) */
  stack?: string;
}

/** Logger interface for structured logging */
export interface Logger {
  error(message: string, context?: Record<string, unknown> | Error): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  /** Create child logger with service name */
  child(serviceName: string): Logger;
}
```

#### Service Types (`src/services/types.ts`)

```typescript
/** Service state in the lifecycle state machine */
export type ServiceState = 'disabled' | 'starting' | 'ready' | 'error' | 'stopping';

/** Configuration for service registration */
export interface ServiceConfig {
  /** Unique service name */
  name: string;
  /** Service type (e.g., 'http', 'graphql', 'worker') */
  type: string;
  /** Required permissions for operation */
  requiredPermissions?: string[];
  /** Service-specific configuration */
  config?: Record<string, unknown>;
}

/** Service instance with state tracking */
export interface Service extends ServiceConfig {
  /** Current service state */
  state: ServiceState;
  /** Error message if state is ERROR */
  errorMessage?: string;
  /** Timestamp when service transitioned to READY */
  startedAt?: Date;
}

/** Service registry interface */
export interface ServiceRegistry {
  /** Register a new service */
  register(config: ServiceConfig): void;
  /** Get service by name */
  get(name: string): Service | undefined;
  /** Get all services */
  getAll(): Service[];
  /** Check if service exists */
  exists(name: string): boolean;
  /** Remove service from registry */
  remove(name: string): boolean;
  /** Update service state with validation */
  updateState(name: string, state: ServiceState, errorMessage?: string): void;
}
```

#### GraphQL Types (`src/graphql/types.ts`)

```typescript
/** GraphQL service state enum (uppercase) */
export enum ServiceStateEnum {
  DISABLED = 'disabled',
  STARTING = 'starting',
  READY = 'ready',
  ERROR = 'error',
  STOPPING = 'stopping',
}

/** Service as represented in GraphQL */
export interface GQLService {
  name: string;
  type: string;
  state: ServiceStateEnum;
  errorMessage?: string;
  startedAt?: string; // ISO 8601
  requiredPermissions?: string[];
}

/** Result type for service operations */
export interface ServiceOperationResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Service after operation (if successful) */
  service?: GQLService;
  /** Error message (if failed) */
  error?: string;
}
```

### Configuration Types (`src/config/index.ts`)

```typescript
/** Application configuration */
export interface Config {
  /** Node environment (development, production, test) */
  nodeEnv: 'development' | 'production' | 'test';
  /** HTTP server port */
  port: number;
  /** Minimum log level to output */
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /** Optional log file path */
  logFile?: string;
  /** Enable GraphQL introspection */
  graphqlIntrospection: boolean;
  /** Maximum GraphQL query depth */
  maxQueryDepth: number;
  /** HTTP request timeout in milliseconds */
  requestTimeoutMs: number;
}
```

## Function Usage Examples

### Starting the Application

```typescript
import { initializeApp, shutdownApp } from './src/index';

// Start application
const context = await initializeApp();
console.log(`Server running on ${context.config.port}`);

// ... application running ...

// Graceful shutdown
await shutdownApp(context);
```

### Working with Services

```typescript
import { createRegistry } from './src/services/registry';
import { createLifecycleManager } from './src/services/lifecycle';

const registry = createRegistry(logger);
const manager = createLifecycleManager(registry, logger);

// Register a service
registry.register({
  name: 'api-service',
  type: 'http',
  requiredPermissions: ['read'],
  config: { port: 8000 }
});

// Define startup logic
manager.registerInit('api-service', async () => {
  // Actual service startup code
  console.log('API service starting...');
});

// Define shutdown logic
manager.registerCleanup('api-service', async () => {
  // Actual service shutdown code
  console.log('API service shutting down...');
});

// Start the service
await manager.startService('api-service');

// Query service status
const service = registry.get('api-service');
console.log(`Service state: ${service?.state}`);

// Stop the service
await manager.stopService('api-service');
```

### Logging with PII Filtering

```typescript
import { createLogger } from './src/logger';

const logger = createLogger({
  level: 'info',
  service: 'my-app',
  logFile: '/var/log/my-app.log'
});

// Logs PII is automatically filtered
logger.info('User account created', {
  email: 'john.doe@example.com',  // Will be masked: ***@example.com
  phone: '555-123-4567',          // Will be masked: ***-****-4567
  ssn: '123-45-6789'              // Will be masked: ***-**-6789
});

// Create child logger for component-specific logging
const componentLogger = logger.child('auth-service');
componentLogger.warn('Authentication failed');
```

## Performance and Memory

- **Startup Time**: < 2 seconds (excluding Node startup)
- **Memory Usage**: < 100MB at startup
- **Query Response Time**: < 100ms for GraphQL queries
- **File Watcher Latency**: < 500ms for file change detection (debounced)

## Security Features

1. **PII Filtering in Logs**
   - Passwords and tokens redacted
   - Email addresses show domain only
   - Phone numbers show last 4 digits
   - SSNs partially masked

2. **Service Isolation**
   - Each service has its own state
   - No shared memory between services
   - Proper error isolation

3. **Input Validation**
   - All configuration validated at startup
   - Service names validated
   - Type safety with TypeScript

4. **Graceful Shutdown**
   - Signal handlers for SIGTERM/SIGINT
   - Drains in-flight requests
   - Logs shutdown sequence

## Testing

All modules include comprehensive JSDoc with usage examples that can be used as:
- Documentation for developers
- Examples for testing
- Type information for IDEs

Run tests with:
```bash
npm test
```

View test coverage:
```bash
npm run test -- --coverage
```

## Module Dependencies

```
src/
├── index.ts (depends on all components)
├── config/ (no dependencies)
├── logger/ (depends on: config)
├── services/ (depends on: logger)
├── server.ts (depends on: logger, services, config)
├── watcher.ts (depends on: logger, services, config)
└── graphql/ (depends on: logger, services)
```

## Contributing

When adding new functions or classes:
1. Include JSDoc with description
2. Document all parameters with types
3. Document return type
4. Include @example with usage
5. Include @throws if function can throw
6. Keep examples concise and realistic

Example template:
```typescript
/**
 * Brief description of what function does
 * 
 * Longer explanation of behavior, side effects, etc.
 * 
 * @param {Type} paramName Description
 * @param {Type} [optionalParam] Optional description
 * @returns {ReturnType} Description of return value
 * @throws {Error} When condition occurs
 * 
 * @example
 * const result = functionName(param1);
 * console.log(result);
 */
export function functionName(paramName: Type): ReturnType { ... }
```
