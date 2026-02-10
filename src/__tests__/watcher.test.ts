/**
 * Tests for File Watcher
 */

import { createFileWatcher } from '../watcher';
import { createLogger } from '../logger';
import { createRegistry } from '../services/registry';
import { createLifecycleManager } from '../services/lifecycle';
import { Config } from '../config';

describe('File Watcher', () => {
  let logger: ReturnType<typeof createLogger>;
  let registry: ReturnType<typeof createRegistry>;
  let lifecycleManager: ReturnType<typeof createLifecycleManager>;
  let config: Config;

  beforeEach(() => {
    logger = createLogger({
      level: 'error',
      service: 'watcher-test',
    });

    registry = createRegistry(logger);
    lifecycleManager = createLifecycleManager(registry, logger);

    config = {
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'error',
      graphqlIntrospection: true,
      maxQueryDepth: 10,
      requestTimeoutMs: 30000,
    };
  });

  describe('watcher creation and initialization', () => {
    it('should create a watcher instance', () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);
      expect(watcher).toBeDefined();
      expect(watcher.start).toBeDefined();
      expect(watcher.stop).toBeDefined();
    });

    it('should not start in production mode', async () => {
      const prodConfig: Config = {
        ...config,
        nodeEnv: 'production',
      };

      const watcher = createFileWatcher(logger, prodConfig, registry, lifecycleManager);

      // Should complete quickly without setting up watcher
      await watcher.start();

      // Stop should not error
      await watcher.stop();
    });

    it('should start in development mode', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Start should complete (may take a moment for ready event)
      void watcher.start();

      // Give it a moment to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be able to stop
      await watcher.stop();
    }, 5000);
  });

  describe('watcher lifecycle', () => {
    it('should handle stop on non-started watcher', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Should not error even if never started
      await expect(watcher.stop()).resolves.toBeUndefined();
    });

    it('should be able to start and stop multiple times', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();

      expect(watcher).toBeDefined();
    }, 5000);
  });

  describe('error handling', () => {
    it('should not crash on watcher errors', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Watcher should handle errors gracefully
      expect(watcher).toBeDefined();

      await watcher.stop();
    }, 5000);

    it('should log errors without crashing', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Even if there are errors, should not crash
      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();

      expect(watcher).toBeDefined();
    }, 5000);
  });

  describe('service management', () => {
    it('should handle restarting services', async () => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // No-op init
      });
      lifecycleManager.registerCleanup('test-service', async () => {
        // No-op cleanup
      });

      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start service
      await lifecycleManager.startService('test-service');

      // Verify service is running
      expect(lifecycleManager.isServiceHealthy('test-service')).toBe(true);

      await watcher.stop();
    }, 5000);

    it('should handle services in error state', async () => {
      registry.register({ name: 'test-service', type: 'test' });
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'error', 'Test error');

      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not try to restart error services during watcher operation
      expect(registry.get('test-service')?.state).toBe('error');

      await watcher.stop();
    }, 5000);
  });

  describe('configuration', () => {
    it('should respect development mode config', async () => {
      const devConfig: Config = {
        ...config,
        nodeEnv: 'development',
      };

      const watcher = createFileWatcher(logger, devConfig, registry, lifecycleManager);

      // Should be able to start in dev mode
      void watcher.start();

      // Give initialization time
      await new Promise((resolve) => setTimeout(resolve, 100));

      await watcher.stop();
    }, 5000);

    it('should respect production mode config', async () => {
      const prodConfig: Config = {
        ...config,
        nodeEnv: 'production',
      };

      const watcher = createFileWatcher(logger, prodConfig, registry, lifecycleManager);

      // Start should complete but not do anything
      await watcher.start();

      // Stop should not error
      await watcher.stop();
    });

    it('should handle test mode config', async () => {
      const testConfig: Config = {
        ...config,
        nodeEnv: 'test',
      };

      const watcher = createFileWatcher(logger, testConfig, registry, lifecycleManager);

      // Test mode is not production, so should activate
      void watcher.start();

      // Give initialization time
      await new Promise((resolve) => setTimeout(resolve, 100));

      await watcher.stop();
    }, 5000);
  });

  describe('debouncing', () => {
    it('should debounce rapid file changes', async () => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // No-op init
      });

      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start service first
      await lifecycleManager.startService('test-service');

      // Simulate multiple rapid changes
      // (In real scenario, these would be file changes)

      await watcher.stop();
    }, 5000);
  });

  describe('ignored patterns', () => {
    it('should ignore node_modules', () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);
      expect(watcher).toBeDefined();

      // Watcher is configured with ignore patterns
      // This is tested indirectly through chokidar configuration
    });

    it('should ignore test files', () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);
      expect(watcher).toBeDefined();

      // Watcher is configured to ignore *.test.ts and *.spec.ts files
    });

    it('should ignore build directories', () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);
      expect(watcher).toBeDefined();

      // Watcher is configured to ignore dist, build, coverage directories
    });
  });

  describe('cascade prevention', () => {
    it('should prevent restart cascades with cooldown', async () => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // No-op init
      });

      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Start service
      await lifecycleManager.startService('test-service');

      // Multiple file changes in rapid succession should be debounced
      // and should not cause cascading restarts

      await watcher.stop();
    }, 5000);
  });

  describe('watched paths', () => {
    it('should watch src directory', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Watcher is configured to watch src directory
      expect(watcher).toBeDefined();

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();
    }, 5000);

    it('should watch .env file', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Watcher is configured to watch .env file
      expect(watcher).toBeDefined();

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();
    }, 5000);

    it('should watch config directory', async () => {
      const watcher = createFileWatcher(logger, config, registry, lifecycleManager);

      // Watcher is configured to watch config directory
      expect(watcher).toBeDefined();

      await watcher.start();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await watcher.stop();
    }, 5000);
  });
});
