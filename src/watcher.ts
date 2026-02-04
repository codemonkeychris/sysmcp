/**
 * File Watcher for Development Mode
 * Watches source files and configuration for changes and triggers service restarts
 */

import chokidar from 'chokidar';
import path from 'path';
import { Logger } from './logger';
import { ServiceLifecycleManager } from './services/lifecycle';
import { ServiceRegistry } from './services/types';
import { Config } from './config';

/**
 * File watcher interface
 */
export interface FileWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * File watcher implementation
 */
class FileWatcherImpl implements FileWatcher {
  private logger: Logger;
  private config: Config;
  private registry: ServiceRegistry;
  private lifecycleManager: ServiceLifecycleManager;
  private watcher?: ReturnType<typeof chokidar.watch>;
  private debounceTimer?: NodeJS.Timeout;
  private restartWindow: number = 0; // Timestamp when restart is allowed
  private restartCooldown: number = 2000; // 2 seconds to prevent cascades
  private debounceDelay: number = 500; // 500ms debounce

  /**
   * Patterns to ignore
   */
  private ignoredPatterns = [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.git/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/*.log',
    '**/logs/**',
  ];

  constructor(
    logger: Logger,
    config: Config,
    registry: ServiceRegistry,
    lifecycleManager: ServiceLifecycleManager
  ) {
    this.logger = logger;
    this.config = config;
    this.registry = registry;
    this.lifecycleManager = lifecycleManager;
  }

  /**
   * Start the file watcher
   */
  async start(): Promise<void> {
    // Only enable in development mode
    if (this.config.nodeEnv === 'production') {
      this.logger.debug('File watcher disabled in production mode');
      return;
    }

    this.logger.info('Starting file watcher');

    const projectRoot = process.cwd();

    // Watch patterns
    const watchPatterns = [
      path.join(projectRoot, 'src'),
      path.join(projectRoot, '.env'),
      path.join(projectRoot, 'config'),
    ];

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: this.ignoredPatterns,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100,
      },
    });

    // Set up event handlers
    this.watcher.on('add', (filePath) => this.handleFileChange(filePath, 'added'));
    this.watcher.on('change', (filePath) => this.handleFileChange(filePath, 'modified'));
    this.watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'deleted'));

    this.watcher.on('error', (error) => {
      this.logger.error('File watcher error', { error: error.message });
    });

    return new Promise((resolve) => {
      this.watcher?.on('ready', () => {
        this.logger.info('File watcher ready and monitoring changes');
        resolve();
      });
    });
  }

  /**
   * Stop the file watcher
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      this.logger.info('Stopping file watcher');

      // Clear any pending debounce
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(filePath: string, action: string): void {
    // Check if we're in restart cooldown window
    if (Date.now() < this.restartWindow) {
      this.logger.debug('Ignoring file change during restart cooldown', {
        file: path.basename(filePath),
      });
      return;
    }

    const relativePath = path.relative(process.cwd(), filePath);
    this.logger.debug(`File ${action}: ${relativePath}`);

    // Clear previous debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.restartServices();
    }, this.debounceDelay);
  }

  /**
   * Restart all services
   */
  private async restartServices(): Promise<void> {
    // Set restart window to prevent cascades
    this.restartWindow = Date.now() + this.restartCooldown;

    const services = this.registry.getAll();
    const serviceNames = services.map((s) => s.name);

    this.logger.info('Restarting services due to file changes', {
      serviceCount: serviceNames.length,
      services: serviceNames,
    });

    for (const service of services) {
      try {
        if (this.lifecycleManager.isServiceHealthy(service.name)) {
          await this.lifecycleManager.restartService(service.name);
          this.logger.debug(`Service restarted: ${service.name}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to restart service ${service.name}`, {
          error: message,
        });
      }
    }

    this.logger.info('Service restart cycle completed');
  }
}

/**
 * Create a new file watcher
 */
export function createFileWatcher(
  logger: Logger,
  config: Config,
  registry: ServiceRegistry,
  lifecycleManager: ServiceLifecycleManager
): FileWatcher {
  return new FileWatcherImpl(logger, config, registry, lifecycleManager);
}

export { FileWatcher };
