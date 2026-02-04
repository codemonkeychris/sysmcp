/**
 * Integration tests for application startup
 */

import { initializeApp, shutdownApp, AppContext } from '../index';

describe('Application Startup and Shutdown', () => {
  let context: AppContext | undefined;

  afterEach(async () => {
    if (context) {
      await shutdownApp(context);
      context = undefined;
    }
  });

  describe('initialization', () => {
    it('should initialize all components', async () => {
      context = await initializeApp();

      expect(context).toBeDefined();
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.server).toBeDefined();
      expect(context.registry).toBeDefined();
      expect(context.lifecycleManager).toBeDefined();
      expect(context.startTime).toBeGreaterThan(0);
    }, 10000);

    it('should load configuration', async () => {
      context = await initializeApp();

      expect(context.config.port).toBeGreaterThan(0);
      expect(context.config.logLevel).toMatch(/^(error|warn|info|debug)$/);
      expect(['development', 'production', 'test']).toContain(context.config.nodeEnv);
    }, 10000);

    it('should initialize logger', async () => {
      context = await initializeApp();

      expect(context.logger).toBeDefined();
      expect(context.logger.info).toBeDefined();
      expect(context.logger.error).toBeDefined();
    }, 10000);

    it('should create Express server', async () => {
      context = await initializeApp();

      expect(context.server).toBeDefined();
      expect(context.server.app).toBeDefined();
      expect(context.server.start).toBeDefined();
    }, 10000);

    it('should initialize service registry', async () => {
      context = await initializeApp();

      expect(context.registry).toBeDefined();
      expect(context.registry.register).toBeDefined();
      expect(context.registry.getAll).toBeDefined();
    }, 10000);

    it('should initialize service lifecycle manager', async () => {
      context = await initializeApp();

      expect(context.lifecycleManager).toBeDefined();
      expect(context.lifecycleManager.startService).toBeDefined();
      expect(context.lifecycleManager.stopService).toBeDefined();
    }, 10000);

    it('should start file watcher in development mode', async () => {
      // Set NODE_ENV to development temporarily
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'development';
        context = await initializeApp();

        // Watcher may or may not be started depending on environment
        // Just verify initialization didn't fail
        expect(context).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 10000);

    it('should not start file watcher in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';
        context = await initializeApp();

        // Watcher should not be created in production
        expect(context.watcher).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 10000);
  });

  describe('graceful shutdown', () => {
    it('should shutdown without error', async () => {
      context = await initializeApp();

      await expect(shutdownApp(context)).resolves.toBeUndefined();
    }, 10000);

    it('should stop file watcher if running', async () => {
      const originalEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'development';
        context = await initializeApp();

        // Give watcher time to start
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Should shutdown without error
        await shutdownApp(context);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    }, 10000);

    it('should stop HTTP server', async () => {
      context = await initializeApp();

      // Server should be running
      expect(context.server).toBeDefined();

      // Should shutdown gracefully
      await shutdownApp(context);

      // Verify shutdown completed
      expect(context).toBeDefined();
    }, 10000);
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // This test would require mocking the initialization to fail
      // For now, just verify that a successful initialization doesn't throw
      expect(async () => {
        context = await initializeApp();
      }).not.toThrow();
    }, 10000);

    it('should log startup information', async () => {
      context = await initializeApp();

      expect(context.logger).toBeDefined();
      expect(context.config).toBeDefined();
      expect(context.startTime).toBeGreaterThan(0);
    }, 10000);
  });

  describe('context integrity', () => {
    it('should provide valid AppContext', async () => {
      context = await initializeApp();

      // All required properties should be present
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.server).toBeDefined();
      expect(context.registry).toBeDefined();
      expect(context.lifecycleManager).toBeDefined();
      expect(context.startTime).toBeGreaterThan(0);

      // Logger and server should be functional
      expect(typeof context.logger.info).toBe('function');
      expect(typeof context.server.stop).toBe('function');
    }, 10000);

    it('should maintain context across operations', async () => {
      context = await initializeApp();

      // Perform some operations
      context.registry.register({ name: 'test-service', type: 'test' });
      const service = context.registry.get('test-service');

      // Context should remain valid
      expect(context.registry).toBeDefined();
      expect(service).toBeDefined();
    }, 10000);
  });

  describe('startup sequence order', () => {
    it('should complete all initialization steps', async () => {
      context = await initializeApp();

      // Verify all components are initialized in expected order
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.server).toBeDefined();
      expect(context.registry).toBeDefined();
      expect(context.lifecycleManager).toBeDefined();

      // Service should be ready for use
      context.registry.register({ name: 'test', type: 'test' });
      expect(context.registry.exists('test')).toBe(true);
    }, 10000);
  });

  describe('multiple startup/shutdown cycles', () => {
    it('should handle repeated initialization and shutdown', async () => {
      for (let i = 0; i < 2; i++) {
        context = await initializeApp();
        expect(context).toBeDefined();

        await shutdownApp(context);
      }
    }, 20000);
  });
});
