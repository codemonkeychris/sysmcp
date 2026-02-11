/**
 * HTTP Server Setup with Express
 * Provides REST health endpoint and graceful shutdown
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { Logger } from './logger';
import { ServiceRegistry } from './services/types';
import { Config } from './config';
import { typeDefs } from './graphql/schema';
import { createResolvers } from './graphql/resolvers';
import { EventLogProvider } from './services/eventlog/provider';
import { FileSearchProvider } from './services/filesearch/provider';
import { PathAnonymizer } from './services/filesearch/path-anonymizer';
import { PiiAnonymizer } from './services/eventlog/lib/src/anonymizer';
import { EventLogConfigManager } from './services/eventlog/config';
import { FileSearchConfigManager } from './services/filesearch/config';
import { ConfigStoreImpl } from './config/config-store';
import { AuditLoggerImpl } from './audit/audit-logger';
import { createPermissionChecker, PermissionCheckerImpl } from './security/permission-checker';
import { ServiceConfigProvider } from './security/types';
import { createPermissionPlugin } from './graphql/permission-middleware';

/**
 * Server instance interface
 */
export interface Server {
  app: Express;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Request context for logging
 */
interface RequestContext {
  startTime: number;
  path: string;
  method: string;
}

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  services: number;
  timestamp: string;
}

/**
 * Server implementation
 */
class ServerImpl implements Server {
  app: Express;
  private logger: Logger;
  private config: Config;
  private registry?: ServiceRegistry;
  private httpServer?: ReturnType<Express['listen']>;
  private apolloServer?: ApolloServer;
  private eventlogProvider?: EventLogProvider;
  private fileSearchProvider?: FileSearchProvider;
  private fileSearchAnonymizer?: PathAnonymizer;
  private eventlogConfigManager?: EventLogConfigManager;
  private filesearchConfigManager?: FileSearchConfigManager;
  private configStore?: ConfigStoreImpl;
  private auditLogger?: AuditLoggerImpl;
  private permissionChecker?: PermissionCheckerImpl;
  private startTime: number = Date.now();
  private isShuttingDown = false;

  constructor(logger: Logger, config: Config, registry?: ServiceRegistry) {
    this.app = express();
    this.logger = logger;
    this.config = config;
    this.registry = registry;

    this.setupMiddleware();
    this.setupErrorHandling();
  }

  /**
   * Set up Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON request bodies
    this.app.use(express.json());

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const context: RequestContext = {
        startTime: Date.now(),
        path: req.path,
        method: req.method,
      };

      // Log response when it's sent
      const originalSend = res.send;
      const logger = this.logger;
      
      res.send = function (data: any) {
        const duration = Date.now() - context.startTime;
        const statusCode = res.statusCode;

        // Log request/response
        const logLevel = statusCode >= 400 ? 'warn' : 'info';
        if (logLevel === 'warn') {
          logger.warn('HTTP request completed', {
            method: context.method,
            path: context.path,
            status: statusCode,
            duration: `${duration}ms`,
          });
        } else {
          logger.debug('HTTP request completed', {
            method: context.method,
            path: context.path,
            status: statusCode,
            duration: `${duration}ms`,
          });
        }

        // Call original send with correct context
        return originalSend.call(this, data);
      };

      next();
    });
  }

  /**
   * Set up routes
   */
  private async setupRoutes(): Promise<void> {
    // Initialize config store and load persisted configuration
    this.configStore = new ConfigStoreImpl();
    const persistedConfig = await this.configStore.load();

    // Initialize config managers
    this.eventlogConfigManager = new EventLogConfigManager();
    this.filesearchConfigManager = new FileSearchConfigManager();

    // Apply persisted config or use defaults
    if (persistedConfig) {
      this.logger.info('Loaded persisted configuration');
      if (persistedConfig.services.eventlog) {
        const ec = persistedConfig.services.eventlog;
        this.eventlogConfigManager.setEnabled(ec.enabled);
        this.eventlogConfigManager.setPermissionLevel(ec.permissionLevel);
        this.eventlogConfigManager.setAnonymizationEnabled(ec.enableAnonymization);
      }
      if (persistedConfig.services.filesearch) {
        const fc = persistedConfig.services.filesearch;
        this.filesearchConfigManager.setEnabled(fc.enabled);
        this.filesearchConfigManager.setPermissionLevel(fc.permissionLevel);
        this.filesearchConfigManager.setAnonymizationEnabled(fc.enableAnonymization);
      }
    } else {
      this.logger.info('No persisted config found, using defaults');
    }

    // Initialize audit logger
    this.auditLogger = new AuditLoggerImpl();

    // Create permission checker with config manager registry
    const configProviders = new Map<string, ServiceConfigProvider>();
    configProviders.set('eventlog', this.eventlogConfigManager);
    configProviders.set('filesearch', this.filesearchConfigManager);
    this.permissionChecker = createPermissionChecker(configProviders);

    // Initialize EventLog provider
    this.eventlogProvider = new EventLogProvider(this.logger, {
      enabled: true,
      maxResults: 1000,
      timeoutMs: 30000,
      anonymize: false,
    });

    // Start the EventLog provider
    try {
      await this.eventlogProvider.start();
      this.logger.info('EventLog provider started');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to start EventLog provider', { error: message });
    }

    // Initialize FileSearch provider
    this.fileSearchProvider = new FileSearchProvider(this.logger, {
      enabled: true,
      maxResults: 10000,
      timeoutMs: 30000,
      anonymize: true,
      allowedPaths: [],
    });

    // Start the FileSearch provider
    try {
      await this.fileSearchProvider.start();
      this.logger.info('FileSearch provider started');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Failed to start FileSearch provider', { error: message });
    }

    // Initialize FileSearch anonymizer
    this.fileSearchAnonymizer = new PathAnonymizer(new PiiAnonymizer());

    // Initialize Apollo Server for GraphQL with permission plugin
    this.apolloServer = new ApolloServer({
      typeDefs,
      resolvers: createResolvers(this.registry, this.logger),
      introspection: true,
      plugins: [createPermissionPlugin(this.permissionChecker)],
      context: async ({ req }: { req: any }) => ({
        req,
        registry: this.registry,
        logger: this.logger,
        startTime: this.startTime,
        eventlogProvider: this.eventlogProvider,
        eventlogAnonymizer: undefined,
        eventlogMetricsCollector: undefined,
        eventlogMappingPath: undefined,
        fileSearchProvider: this.fileSearchProvider,
        fileSearchAnonymizer: this.fileSearchAnonymizer,
        permissionChecker: this.permissionChecker,
        configStore: this.configStore,
        auditLogger: this.auditLogger,
        eventlogConfigManager: this.eventlogConfigManager,
        filesearchConfigManager: this.filesearchConfigManager,
      }),
    });

    // Start Apollo Server
    await this.apolloServer.start();

    // Mount Apollo Server to /graphql endpoint using applyMiddleware
    (this.apolloServer as any).applyMiddleware({ app: this.app, path: '/graphql' });

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      const allServices = this.registry?.getAll() || [];
      const errorServices = allServices.filter((s) => s.state === 'error');

      const response: HealthCheckResponse = {
        status: errorServices.length > 0 ? 'degraded' : 'ok',
        uptime,
        services: allServices.length,
        timestamp: new Date().toISOString(),
      };

      res.json(response);
    });

    // 404 handler for undefined routes (must be before error handler)
    this.app.use((req: Request, res: Response) => {
      this.logger.debug('Not found', {
        path: req.path,
        method: req.method,
      });
      res.status(404).json({
        error: 'Not found',
        path: req.path,
      });
    });
  }

  /**
   * Set up error handling middleware
   */
  private setupErrorHandling(): void {
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      this.logger.error('Unhandled error', {
        error: err.message,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        error: 'Internal server error',
        message: this.config.nodeEnv === 'development' ? err.message : 'An error occurred',
      });
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    // Set up routes (including GraphQL)
    await this.setupRoutes();

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.config.port, () => {
          this.logger.info('HTTP server started', {
            port: this.config.port,
            mode: this.config.nodeEnv,
          });
          resolve();
        });

        // Set request timeout
        this.httpServer.setTimeout(this.config.requestTimeoutMs);

        // Handle server errors
        this.httpServer.on('error', (error) => {
          this.logger.error('Server error', { error: error.message });
          reject(error);
        });

        // Set up graceful shutdown handlers
        this.setupGracefulShutdown();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to start server', { error: message });
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (!this.httpServer || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown');

    // Stop EventLog provider if running
    if (this.eventlogProvider) {
      try {
        await this.eventlogProvider.stop();
        this.logger.debug('EventLog provider stopped');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('Error stopping EventLog provider', { error: message });
      }
    }

    // Stop FileSearch provider if running
    if (this.fileSearchProvider) {
      try {
        await this.fileSearchProvider.stop();
        this.logger.debug('FileSearch provider stopped');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('Error stopping FileSearch provider', { error: message });
      }
    }

    // Stop Apollo Server if running
    if (this.apolloServer) {
      try {
        await this.apolloServer.stop();
        this.logger.debug('Apollo Server stopped');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn('Error stopping Apollo Server', { error: message });
      }
    }

    return new Promise((resolve) => {
      // Set 5-second timeout for graceful shutdown
      const shutdownTimeout = setTimeout(() => {
        this.logger.warn('Graceful shutdown timeout, forcing close');
        if (this.httpServer) {
          this.httpServer.close(() => {
            this.logger.info('Server closed');
            resolve();
          });
        } else {
          resolve();
        }
      }, 5000);

      // Close the server and wait for connections to drain
      if (this.httpServer) {
        this.httpServer.close(() => {
          clearTimeout(shutdownTimeout);
          this.logger.info('Server closed gracefully');
          resolve();
        });
      } else {
        clearTimeout(shutdownTimeout);
        resolve();
      }
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const signals = ['SIGTERM', 'SIGINT'] as const;

    signals.forEach((signal) => {
      process.on(signal, async () => {
        this.logger.info(`Received ${signal} signal`);
        try {
          await this.stop();
          process.exit(0);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Error during shutdown: ${message}`);
          process.exit(1);
        }
      });
    });
  }
}

/**
 * Create a new HTTP server
 */
export function createServer(
  logger: Logger,
  config: Config,
  registry?: ServiceRegistry
): Server {
  return new ServerImpl(logger, config, registry);
}
