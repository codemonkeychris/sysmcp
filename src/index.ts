/**
 * MCP Host Bootstrap - Main Entry Point
 * Orchestrates startup of all components in correct order
 */

import { createConfig, Config } from './config';
import { createLoggerFromConfig, Logger } from './logger';
import { createServer, Server } from './server';
import { createRegistry, ServiceRegistry } from './services/registry';
import { createLifecycleManager, ServiceLifecycleManager } from './services/lifecycle';
import { createFileWatcher, FileWatcher } from './watcher';

/**
 * Application context
 */
export interface AppContext {
  config: Config;
  logger: Logger;
  server: Server;
  registry: ServiceRegistry;
  lifecycleManager: ServiceLifecycleManager;
  watcher?: FileWatcher;
  startTime: number;
}

/**
 * Initialize the application
 */
async function initializeApp(): Promise<AppContext> {
  console.log('Initializing MCP Host Bootstrap...');

  // Step 1: Load environment variables from .env
  console.log('Loading environment configuration...');
  const config = createConfig();

  // Step 2: Validate configuration (exit with error if invalid)
  console.log(`Configuration loaded: NODE_ENV=${config.nodeEnv}, PORT=${config.port}`);

  // Step 3: Initialize logger
  const logger = createLoggerFromConfig('mcp-host', config.logLevel, config.logFile);
  logger.info('Logger initialized');

  // Step 4: Create Express app with health endpoint
  logger.info('Creating Express server...');
  const registry = createRegistry(logger);
  const server = createServer(logger, config, registry);

  // Step 5: Initialize service registry (done above)
  logger.info('Service registry initialized');

  // Step 6: Initialize service lifecycle manager
  const lifecycleManager = createLifecycleManager(registry, logger);
  logger.info('Service lifecycle manager initialized');

  // Step 7: Start file watcher (if development mode)
  let watcher: FileWatcher | undefined;
  if (config.nodeEnv !== 'production') {
    logger.info('Starting file watcher for development mode');
    watcher = createFileWatcher(logger, config, registry, lifecycleManager);
    try {
      await watcher.start();
      logger.info('File watcher started');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Failed to start file watcher', { error: message });
    }
  }

  // Step 8: Start listening on configured port
  logger.info('Starting HTTP server...');
  try {
    await server.start();
    logger.info('Server started successfully', {
      port: config.port,
      mode: config.nodeEnv,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start server', { error: message });
    throw error;
  }

  // Return context for external use
  const context: AppContext = {
    config,
    logger,
    server,
    registry,
    lifecycleManager,
    watcher,
    startTime: Date.now(),
  };

  return context;
}

/**
 * Gracefully shutdown the application
 */
async function shutdownApp(context: AppContext): Promise<void> {
  context.logger.info('Starting graceful shutdown...');

  try {
    // Stop file watcher first
    if (context.watcher) {
      context.logger.debug('Stopping file watcher...');
      await context.watcher.stop();
      context.logger.debug('File watcher stopped');
    }

    // Stop HTTP server
    context.logger.debug('Stopping HTTP server...');
    await context.server.stop();
    context.logger.debug('HTTP server stopped');

    context.logger.info('Application shutdown complete');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.error('Error during shutdown', { error: message });
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  let context: AppContext | undefined;

  try {
    // Initialize application
    context = await initializeApp();

    // Set up global error handlers
    process.on('uncaughtException', (error) => {
      if (context) {
        context.logger.error('Uncaught exception', { error: error.message });
      } else {
        console.error('Uncaught exception before logger initialized:', error);
      }
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      if (context) {
        const message = reason instanceof Error ? reason.message : String(reason);
        context.logger.error('Unhandled promise rejection', { error: message });
      } else {
        console.error('Unhandled rejection before logger initialized:', reason);
      }
    });

    // Set up signal handlers for graceful shutdown
    const signals = ['SIGTERM', 'SIGINT'] as const;
    for (const signal of signals) {
      process.on(signal, async () => {
        if (context) {
          context.logger.info(`Received ${signal} signal`);
          await shutdownApp(context);
        }
        process.exit(0);
      });
    }

    // Application is running
    if (context) {
      context.logger.info('MCP Host Bootstrap is ready', {
        uptime: `${Math.floor((Date.now() - context.startTime) / 1000)}s`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (context) {
      context.logger.error('Failed to initialize application', { error: message });
    } else {
      console.error('Failed to initialize application:', message);
    }
    process.exit(1);
  }
}

// Export main functions for testing
export { main, initializeApp, shutdownApp };

// Run main if this is the entry point
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
