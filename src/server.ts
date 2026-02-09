/**
 * HTTP Server Setup with Express
 * Provides REST health endpoint and graceful shutdown
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { Logger } from './logger';
import { ServiceRegistry } from './services/types';
import { Config } from './config';

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
  private startTime: number = Date.now();
  private isShuttingDown = false;

  constructor(logger: Logger, config: Config, registry?: ServiceRegistry) {
    this.app = express();
    this.logger = logger;
    this.config = config;
    this.registry = registry;

    this.setupMiddleware();
    this.setupRoutes();
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
      res.send = function (this: any, data: any) {
        const duration = Date.now() - context.startTime;
        const statusCode = res.statusCode;

        // Log request/response
        const logLevel = statusCode >= 400 ? 'warn' : 'info';
        if (logLevel === 'warn') {
          this.logger.warn('HTTP request completed', {
            method: context.method,
            path: context.path,
            status: statusCode,
            duration: `${duration}ms`,
          });
        } else {
          this.logger.debug('HTTP request completed', {
            method: context.method,
            path: context.path,
            status: statusCode,
            duration: `${duration}ms`,
          });
        }

        // Call original send
        return originalSend.call(this, data);
      }.bind(this);

      next();
    });
  }

  /**
   * Set up routes
   */
  private setupRoutes(): void {
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
