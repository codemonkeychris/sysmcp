/**
 * Service Lifecycle Manager
 * Handles service start, stop, and restart operations with retry logic and timeouts
 */

import { Logger } from '../logger';
import { ServiceRegistry } from './types';

/**
 * Service initialization function (placeholder for actual service startup)
 */
type ServiceInitFn = () => Promise<void>;

/**
 * Service cleanup function (placeholder for actual service shutdown)
 */
type ServiceCleanupFn = () => Promise<void>;

/**
 * Lifecycle manager interface
 */
export interface ServiceLifecycleManager {
  startService(name: string): Promise<void>;
  stopService(name: string): Promise<void>;
  restartService(name: string): Promise<void>;
  isServiceHealthy(name: string): boolean;
}

/**
 * Lifecycle manager implementation
 */
class ServiceLifecycleManagerImpl implements ServiceLifecycleManager {
  private registry: ServiceRegistry;
  private logger: Logger;
  private initFunctions: Map<string, ServiceInitFn>;
  private cleanupFunctions: Map<string, ServiceCleanupFn>;
  private readonly STARTUP_TIMEOUT_MS = 10000;
  private readonly SHUTDOWN_TIMEOUT_MS = 10000;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

  constructor(registry: ServiceRegistry, logger: Logger) {
    this.registry = registry;
    this.logger = logger;
    this.initFunctions = new Map();
    this.cleanupFunctions = new Map();
  }

  /**
   * Register service initialization function
   */
  registerInit(serviceName: string, fn: ServiceInitFn): void {
    this.initFunctions.set(serviceName, fn);
  }

  /**
   * Register service cleanup function
   */
  registerCleanup(serviceName: string, fn: ServiceCleanupFn): void {
    this.cleanupFunctions.set(serviceName, fn);
  }

  /**
   * Start a service with retry logic and timeout
   */
  async startService(name: string): Promise<void> {
    // Validate service exists
    if (!this.registry.exists(name)) {
      const error = `Service '${name}' not found`;
      this.logger.error(error);
      throw new Error(error);
    }

    const service = this.registry.get(name)!;

    // Check if already running
    if (service.state === 'ready' || service.state === 'starting') {
      const error = `Service '${name}' is already running or starting`;
      this.logger.warn(error);
      throw new Error(error);
    }

    // Transition to STARTING
    this.registry.updateState(name, 'starting');
    this.logger.info(`Starting service: ${name}`);

    let lastError: Error | undefined;

    // Attempt startup with retries
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        // Wait before retry (except on first attempt)
        if (attempt > 0) {
          const delay = this.RETRY_DELAYS[attempt - 1];
          this.logger.debug(`Retry ${attempt} for service ${name}, waiting ${delay}ms`);
          await this.sleep(delay);
        }

        // Execute startup with timeout
        await this.executeWithTimeout(name, this.STARTUP_TIMEOUT_MS);

        // Success! Transition to READY
        this.registry.updateState(name, 'ready');
        this.logger.info(`Service started successfully: ${name}`);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Service startup attempt ${attempt + 1} failed for ${name}`, {
          error: lastError.message,
          attempt: attempt + 1,
          maxAttempts: this.MAX_RETRIES,
        });
      }
    }

    // All retries failed
    const errorMessage = `Failed to start service after ${this.MAX_RETRIES} attempts: ${lastError?.message}`;
    this.registry.updateState(name, 'error', errorMessage);
    this.logger.error(`Service startup failed: ${name}`, { error: lastError?.message });
    throw new Error(errorMessage);
  }

  /**
   * Stop a service
   */
  async stopService(name: string): Promise<void> {
    // Validate service exists
    if (!this.registry.exists(name)) {
      const error = `Service '${name}' not found`;
      this.logger.error(error);
      throw new Error(error);
    }

    const service = this.registry.get(name)!;

    // Only stop if not already stopping/disabled
    if (service.state === 'stopping' || service.state === 'disabled') {
      this.logger.debug(`Service '${name}' is not running, skipping stop`);
      return;
    }

    // Transition to STOPPING
    this.registry.updateState(name, 'stopping');
    this.logger.info(`Stopping service: ${name}`);

    try {
      // Execute cleanup with timeout
      const cleanupFn = this.cleanupFunctions.get(name);
      if (cleanupFn) {
        await this.executeWithTimeout(name, this.SHUTDOWN_TIMEOUT_MS, cleanupFn);
      }

      // Transition to DISABLED
      this.registry.updateState(name, 'disabled');
      this.logger.info(`Service stopped successfully: ${name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.registry.updateState(name, 'error', `Shutdown failed: ${errorMsg}`);
      this.logger.error(`Service shutdown failed: ${name}`, { error: errorMsg });
      throw error;
    }
  }

  /**
   * Restart a service
   */
  async restartService(name: string): Promise<void> {
    this.logger.info(`Restarting service: ${name}`);

    try {
      await this.stopService(name);
      await this.startService(name);
      this.logger.info(`Service restarted successfully: ${name}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Service restart failed: ${name}`, { error: errorMsg });
      throw error;
    }
  }

  /**
   * Check if service is healthy (READY state)
   */
  isServiceHealthy(name: string): boolean {
    const service = this.registry.get(name);
    return service?.state === 'ready';
  }

  /**
   * Execute a function with timeout
   */
  private executeWithTimeout(
    serviceName: string,
    timeoutMs: number,
    fn?: ServiceCleanupFn | ServiceInitFn
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;
      let completed = false;

      // Get the function to execute
      const execFn = fn || this.initFunctions.get(serviceName) || (() => Promise.resolve());

      // Set up timeout
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          const error = `Service operation timed out after ${timeoutMs}ms`;
          this.logger.error(`Timeout for service ${serviceName}`, {
            timeoutMs,
            operation: fn ? 'cleanup' : 'init',
          });
          reject(new Error(error));
        }
      }, timeoutMs);

      // Execute function
      Promise.resolve()
        .then(() => execFn())
        .then(() => {
          if (!completed) {
            completed = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve();
          }
        })
        .catch((error) => {
          if (!completed) {
            completed = true;
            if (timeoutId) clearTimeout(timeoutId);
            reject(error);
          }
        });
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a new lifecycle manager
 */
export function createLifecycleManager(
  registry: ServiceRegistry,
  logger: Logger
): ServiceLifecycleManager & {
  registerInit: (name: string, fn: ServiceInitFn) => void;
  registerCleanup: (name: string, fn: ServiceCleanupFn) => void;
} {
  return new ServiceLifecycleManagerImpl(registry, logger);
}
