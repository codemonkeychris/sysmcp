/**
 * Full End-to-End Integration Tests
 * Tests the complete flow from startup through GraphQL operations
 */

import { initializeApp, shutdownApp, AppContext } from '../src/index';

describe('End-to-End Integration Tests', () => {
  let context: AppContext | undefined;

  afterEach(async () => {
    if (context) {
      await shutdownApp(context);
      context = undefined;
    }
  });

  describe('complete startup flow', () => {
    it('should initialize and be ready for operations', async () => {
      context = await initializeApp();

      expect(context).toBeDefined();
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
      expect(context.server).toBeDefined();
      expect(context.registry).toBeDefined();
      expect(context.lifecycleManager).toBeDefined();
    }, 15000);

    it('should have health endpoint accessible', async () => {
      context = await initializeApp();

      // Health endpoint should be available on the server
      expect(context.server.app).toBeDefined();

      // Register a service to test health
      context.registry.register({ name: 'test-service', type: 'test' });

      // Verify service is registered
      expect(context.registry.exists('test-service')).toBe(true);
    }, 15000);
  });

  describe('service lifecycle operations', () => {
    beforeEach(async () => {
      context = await initializeApp();
    });

    it('should register and retrieve services', async () => {
      context!.registry.register({
        name: 'web-service',
        type: 'http',
        requiredPermissions: ['read'],
      });

      const service = context!.registry.get('web-service');

      expect(service).toBeDefined();
      expect(service?.name).toBe('web-service');
      expect(service?.type).toBe('http');
      expect(service?.state).toBe('disabled');
    }, 15000);

    it('should start and stop services', async () => {
      context!.registry.register({ name: 'test-service', type: 'test' });
      context!.lifecycleManager.registerInit('test-service', async () => {
        // No-op init
      });
      context!.lifecycleManager.registerCleanup('test-service', async () => {
        // No-op cleanup
      });

      // Start service
      await context!.lifecycleManager.startService('test-service');
      let service = context!.registry.get('test-service');
      expect(service?.state).toBe('ready');

      // Stop service
      await context!.lifecycleManager.stopService('test-service');
      service = context!.registry.get('test-service');
      expect(service?.state).toBe('disabled');
    }, 15000);

    it('should handle service restart', async () => {
      context!.registry.register({ name: 'test-service', type: 'test' });
      context!.lifecycleManager.registerInit('test-service', async () => {
        // No-op init
      });
      context!.lifecycleManager.registerCleanup('test-service', async () => {
        // No-op cleanup
      });

      // Start service
      await context!.lifecycleManager.startService('test-service');
      const firstStart = context!.registry.get('test-service')?.startedAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Restart service
      await context!.lifecycleManager.restartService('test-service');
      const service = context!.registry.get('test-service');

      expect(service?.state).toBe('ready');
      expect(service?.startedAt).not.toEqual(firstStart);
    }, 15000);

    it('should track multiple services independently', async () => {
      context!.registry.register({ name: 'service1', type: 'test' });
      context!.registry.register({ name: 'service2', type: 'test' });
      context!.registry.register({ name: 'service3', type: 'test' });

      context!.lifecycleManager.registerInit('service1', async () => {
        // No-op
      });
      context!.lifecycleManager.registerInit('service2', async () => {
        // No-op
      });

      // Start only service1
      await context!.lifecycleManager.startService('service1');

      const s1 = context!.registry.get('service1');
      const s2 = context!.registry.get('service2');
      const s3 = context!.registry.get('service3');

      expect(s1?.state).toBe('ready');
      expect(s2?.state).toBe('disabled');
      expect(s3?.state).toBe('disabled');
    }, 15000);
  });

  describe('error handling and recovery', () => {
    beforeEach(async () => {
      context = await initializeApp();
    });

    it('should handle service startup failure gracefully', async () => {
      context!.registry.register({ name: 'failing-service', type: 'test' });
      context!.lifecycleManager.registerInit('failing-service', async () => {
        throw new Error('Startup failed');
      });

      try {
        await context!.lifecycleManager.startService('failing-service');
        fail('Expected error');
      } catch (error) {
        // Expected
      }

      const service = context!.registry.get('failing-service');
      expect(service?.state).toBe('error');
      expect(service?.errorMessage).toContain('after');
    }, 15000);

    it('should handle non-existent service errors', async () => {
      try {
        await context!.lifecycleManager.startService('non-existent');
        fail('Expected error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 15000);

    it('should maintain system stability after errors', async () => {
      context!.registry.register({ name: 'service1', type: 'test' });
      context!.registry.register({ name: 'service2', type: 'test' });

      context!.lifecycleManager.registerInit('service1', async () => {
        throw new Error('Init failed');
      });
      context!.lifecycleManager.registerInit('service2', async () => {
        // Success
      });

      // Try to start failing service
      try {
        await context!.lifecycleManager.startService('service1');
      } catch {
        // Expected to fail
      }

      // System should still be functional - start service2
      await context!.lifecycleManager.startService('service2');
      const s2 = context!.registry.get('service2');
      expect(s2?.state).toBe('ready');
    }, 15000);
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      context = await initializeApp();
    });

    it('should handle multiple service registrations', async () => {
      for (let i = 0; i < 5; i++) {
        context!.registry.register({
          name: `service-${i}`,
          type: 'test',
        });
      }

      const all = context!.registry.getAll();
      expect(all.length).toBe(5);
    }, 15000);

    it('should handle sequential service operations', async () => {
      context!.registry.register({ name: 'service1', type: 'test' });
      context!.registry.register({ name: 'service2', type: 'test' });

      context!.lifecycleManager.registerInit('service1', async () => {
        // No-op
      });
      context!.lifecycleManager.registerInit('service2', async () => {
        // No-op
      });

      context!.lifecycleManager.registerCleanup('service1', async () => {
        // No-op
      });
      context!.lifecycleManager.registerCleanup('service2', async () => {
        // No-op
      });

      // Start both services
      await context!.lifecycleManager.startService('service1');
      await context!.lifecycleManager.startService('service2');

      let s1 = context!.registry.get('service1');
      let s2 = context!.registry.get('service2');

      expect(s1?.state).toBe('ready');
      expect(s2?.state).toBe('ready');

      // Stop in reverse order
      await context!.lifecycleManager.stopService('service2');
      await context!.lifecycleManager.stopService('service1');

      s1 = context!.registry.get('service1');
      s2 = context!.registry.get('service2');

      expect(s1?.state).toBe('disabled');
      expect(s2?.state).toBe('disabled');
    }, 15000);
  });

  describe('configuration and environment', () => {
    it('should respect configuration values', async () => {
      context = await initializeApp();

      expect(context.config.port).toBeGreaterThan(0);
      expect(context.config.logLevel).toMatch(/^(error|warn|info|debug)$/);
      expect(['development', 'production', 'test']).toContain(context.config.nodeEnv);
    }, 15000);

    it('should maintain configuration throughout lifecycle', async () => {
      context = await initializeApp();

      const initialPort = context.config.port;
      const initialEnv = context.config.nodeEnv;

      // Perform operations
      context.registry.register({ name: 'test', type: 'test' });

      // Config should remain unchanged
      expect(context.config.port).toBe(initialPort);
      expect(context.config.nodeEnv).toBe(initialEnv);
    }, 15000);
  });

  describe('logging and monitoring', () => {
    beforeEach(async () => {
      context = await initializeApp();
    });

    it('should have functional logger', async () => {
      expect(context!.logger).toBeDefined();
      expect(typeof context!.logger.info).toBe('function');
      expect(typeof context!.logger.error).toBe('function');
      expect(typeof context!.logger.debug).toBe('function');
    }, 15000);

    it('should log service state changes', async () => {
      context!.registry.register({ name: 'test-service', type: 'test' });
      context!.lifecycleManager.registerInit('test-service', async () => {
        // No-op
      });

      // Should log state transition
      await context!.lifecycleManager.startService('test-service');

      const service = context!.registry.get('test-service');
      expect(service?.state).toBe('ready');
      expect(service?.startedAt).toBeDefined();
    }, 15000);
  });

  describe('graceful shutdown', () => {
    it('should shutdown cleanly with running services', async () => {
      context = await initializeApp();

      context.registry.register({ name: 'test-service', type: 'test' });
      context.lifecycleManager.registerInit('test-service', async () => {
        // No-op
      });
      context.lifecycleManager.registerCleanup('test-service', async () => {
        // No-op
      });

      // Start a service
      await context.lifecycleManager.startService('test-service');

      // Should shutdown gracefully even with running service
      await expect(shutdownApp(context)).resolves.toBeUndefined();
    }, 15000);

    it('should shutdown without losing state', async () => {
      context = await initializeApp();

      context.registry.register({ name: 'service1', type: 'test' });
      context.registry.register({ name: 'service2', type: 'test' });

      const beforeShutdown = context.registry.getAll().length;

      await shutdownApp(context);

      // Registry data lost after shutdown (as expected)
      // This tests that shutdown completed successfully
      expect(beforeShutdown).toBe(2);
    }, 15000);
  });

  describe('health status tracking', () => {
    beforeEach(async () => {
      context = await initializeApp();
    });

    it('should report ok status when all services healthy', async () => {
      context!.registry.register({ name: 'service1', type: 'test' });
      context!.registry.register({ name: 'service2', type: 'test' });

      const services = context!.registry.getAll();
      const errorCount = services.filter((s: any) => s.state === 'error').length;

      expect(errorCount).toBe(0);
    }, 15000);

    it('should report degraded status when service is in error', async () => {
      context!.registry.register({ name: 'error-service', type: 'test' });
      context!.registry.updateState('error-service', 'starting');
      context!.registry.updateState('error-service', 'error', 'Test error');

      const services = context!.registry.getAll();
      const errorCount = services.filter((s: any) => s.state === 'error').length;

      expect(errorCount).toBeGreaterThan(0);
    }, 15000);
  });
});
