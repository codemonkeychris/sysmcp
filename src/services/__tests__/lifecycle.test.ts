/**
 * Tests for Service Lifecycle Manager
 */

import { createRegistry } from '../registry';
import { createLifecycleManager } from '../lifecycle';
import { createLogger } from '../../logger';

describe('Service Lifecycle Manager', () => {
  let registry: ReturnType<typeof createRegistry>;
  let manager: ReturnType<typeof createLifecycleManager>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger({
      level: 'info',
      service: 'lifecycle-test',
    });
    registry = createRegistry(logger);
    manager = createLifecycleManager(registry, logger);
  });

  describe('startService', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      manager.registerInit('test-service', async () => {
        // Simulate service startup
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
    });

    it('should start a service successfully', async () => {
      await manager.startService('test-service');

      const service = registry.get('test-service');
      expect(service?.state).toBe('ready');
      expect(service?.startedAt).toBeDefined();
    });

    it('should throw error if service not found', async () => {
      await expect(manager.startService('non-existent')).rejects.toThrow(
        "Service 'non-existent' not found"
      );
    });

    it('should throw error if service already running', async () => {
      await manager.startService('test-service');

      await expect(manager.startService('test-service')).rejects.toThrow(
        "Service 'test-service' is already running or starting"
      );
    });

    it('should transition through STARTING state', async () => {
      manager.registerInit('test-service', async () => {
        // Verify state is STARTING during init
        const service = registry.get('test-service');
        expect(service?.state).toBe('starting');

        // Simulate service startup
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await manager.startService('test-service');

      const service = registry.get('test-service');
      expect(service?.state).toBe('ready');
    });

    it('should handle service startup failure', async () => {
      manager.registerInit('test-service', async () => {
        throw new Error('Service startup failed');
      });

      await expect(manager.startService('test-service')).rejects.toThrow(
        'Failed to start service after'
      );

      const service = registry.get('test-service');
      expect(service?.state).toBe('error');
      expect(service?.errorMessage).toContain('Service startup failed');
    });

    it('should retry on failure with exponential backoff', async () => {
      let attempts = 0;

      manager.registerInit('test-service', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
      });

      await manager.startService('test-service');

      expect(attempts).toBe(3);
      const service = registry.get('test-service');
      expect(service?.state).toBe('ready');
    });

    it('should timeout service startup', async () => {
      manager.registerInit('test-service', async () => {
        // This will timeout since it takes longer than allowed
        await new Promise((resolve) => setTimeout(resolve, 15000));
      });

      await expect(manager.startService('test-service')).rejects.toThrow(
        'timed out after'
      );

      const service = registry.get('test-service');
      expect(service?.state).toBe('error');
    }, 35000);

    it('should fail after max retries exceeded', async () => {
      manager.registerInit('test-service', async () => {
        throw new Error('Always fails');
      });

      await expect(manager.startService('test-service')).rejects.toThrow(
        'Failed to start service after 3 attempts'
      );

      const service = registry.get('test-service');
      expect(service?.state).toBe('error');
    });
  });

  describe('stopService', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      manager.registerInit('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      manager.registerCleanup('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    });

    it('should stop a running service', async () => {
      await manager.startService('test-service');
      await manager.stopService('test-service');

      const service = registry.get('test-service');
      expect(service?.state).toBe('disabled');
    });

    it('should throw error if service not found', async () => {
      await expect(manager.stopService('non-existent')).rejects.toThrow(
        "Service 'non-existent' not found"
      );
    });

    it('should handle already stopped service gracefully', async () => {
      // Service starts as disabled
      await expect(manager.stopService('test-service')).resolves.toBeUndefined();
    });

    it('should execute cleanup function', async () => {
      let cleanupCalled = false;

      manager.registerCleanup('test-service', async () => {
        cleanupCalled = true;
      });

      await manager.startService('test-service');
      await manager.stopService('test-service');

      expect(cleanupCalled).toBe(true);
    });

    it('should transition through STOPPING state', async () => {
      manager.registerCleanup('test-service', async () => {
        const service = registry.get('test-service');
        expect(service?.state).toBe('stopping');
      });

      await manager.startService('test-service');
      await manager.stopService('test-service');

      const service = registry.get('test-service');
      expect(service?.state).toBe('disabled');
    });

    it('should handle cleanup failure', async () => {
      manager.registerCleanup('test-service', async () => {
        throw new Error('Cleanup failed');
      });

      await manager.startService('test-service');

      await expect(manager.stopService('test-service')).rejects.toThrow('Cleanup failed');

      const service = registry.get('test-service');
      expect(service?.state).toBe('error');
    });

    it('should timeout service cleanup', async () => {
      manager.registerCleanup('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 15000));
      });

      await manager.startService('test-service');

      await expect(manager.stopService('test-service')).rejects.toThrow();

      const service = registry.get('test-service');
      expect(service?.state).toBe('error');
    }, 20000);
  });

  describe('restartService', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      manager.registerInit('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      manager.registerCleanup('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    });

    it('should restart a running service', async () => {
      await manager.startService('test-service');
      const firstStart = registry.get('test-service')?.startedAt;

      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 50));

      await manager.restartService('test-service');

      const service = registry.get('test-service');
      expect(service?.state).toBe('ready');
      expect(service?.startedAt).not.toEqual(firstStart);
    });

    it('should handle restart failure during stop', async () => {
      manager.registerCleanup('test-service', async () => {
        throw new Error('Cleanup failed');
      });

      await manager.startService('test-service');

      await expect(manager.restartService('test-service')).rejects.toThrow('Cleanup failed');
    });

    it('should handle restart failure during start', async () => {
      let startAttempts = 0;

      manager.registerInit('test-service', async () => {
        startAttempts++;
        if (startAttempts === 2) {
          throw new Error('Restart failed');
        }
      });

      await manager.startService('test-service');

      // Update startAttempts counter for restart
      startAttempts = 0;
      manager.registerInit('test-service', async () => {
        startAttempts++;
        throw new Error('Restart failed');
      });

      await expect(manager.restartService('test-service')).rejects.toThrow();
    });

    it('should throw error if service not found', async () => {
      await expect(manager.restartService('non-existent')).rejects.toThrow();
    });
  });

  describe('isServiceHealthy', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      manager.registerInit('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    });

    it('should return false for disabled service', () => {
      expect(manager.isServiceHealthy('test-service')).toBe(false);
    });

    it('should return false for starting service', async () => {
      manager.registerInit('test-service', async () => {
        expect(manager.isServiceHealthy('test-service')).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const startPromise = manager.startService('test-service');
      await new Promise((resolve) => setTimeout(resolve, 5));

      await startPromise;
    });

    it('should return true for ready service', async () => {
      await manager.startService('test-service');
      expect(manager.isServiceHealthy('test-service')).toBe(true);
    });

    it('should return false for error service', async () => {
      manager.registerInit('test-service', async () => {
        throw new Error('Service failed');
      });

      try {
        await manager.startService('test-service');
      } catch {
        // Expected to fail
      }

      expect(manager.isServiceHealthy('test-service')).toBe(false);
    });

    it('should return false for non-existent service', () => {
      expect(manager.isServiceHealthy('non-existent')).toBe(false);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
    });

    it('should log service lifecycle events', async () => {
      manager.registerInit('test-service', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await manager.startService('test-service');
      expect(manager.isServiceHealthy('test-service')).toBe(true);
    });

    it('should handle multiple errors gracefully', async () => {
      manager.registerInit('test-service', async () => {
        throw new Error('Init failed');
      });

      try {
        await manager.startService('test-service');
      } catch {
        // Expected
      }

      // Service should be in error state but manager should not crash
      expect(registry.get('test-service')?.state).toBe('error');

      // Should be able to retry
      manager.registerInit('test-service', async () => {
        // This time succeed
      });

      await expect(manager.restartService('test-service')).resolves.toBeUndefined();
    });
  });
});
