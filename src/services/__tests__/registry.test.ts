/**
 * Tests for Service Registry
 */

import { createRegistry } from '../registry';
import { ServiceConfig } from '../types';

describe('Service Registry', () => {
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    registry = createRegistry();
  });

  describe('register', () => {
    it('should register a service', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        type: 'test',
      };

      registry.register(config);

      expect(registry.exists('test-service')).toBe(true);
    });

    it('should set service to disabled state on registration', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        type: 'test',
      };

      registry.register(config);
      const service = registry.get('test-service');

      expect(service).toBeDefined();
      expect(service?.state).toBe('disabled');
    });

    it('should throw error if service already registered', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        type: 'test',
      };

      registry.register(config);

      expect(() => registry.register(config)).toThrow(
        "Service 'test-service' is already registered"
      );
    });

    it('should store service config', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        type: 'graphql',
        requiredPermissions: ['read'],
        config: { port: 3000 },
      };

      registry.register(config);
      const service = registry.get('test-service');

      expect(service?.type).toBe('graphql');
      expect(service?.requiredPermissions).toEqual(['read']);
      expect(service?.config).toEqual({ port: 3000 });
    });
  });

  describe('get', () => {
    it('should retrieve registered service', () => {
      const config: ServiceConfig = {
        name: 'test-service',
        type: 'test',
      };

      registry.register(config);
      const service = registry.get('test-service');

      expect(service).toBeDefined();
      expect(service?.name).toBe('test-service');
    });

    it('should return undefined for non-existent service', () => {
      const service = registry.get('non-existent');
      expect(service).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no services registered', () => {
      const services = registry.getAll();
      expect(services).toEqual([]);
    });

    it('should return all registered services', () => {
      registry.register({ name: 'service1', type: 'test' });
      registry.register({ name: 'service2', type: 'test' });
      registry.register({ name: 'service3', type: 'test' });

      const services = registry.getAll();

      expect(services.length).toBe(3);
      expect(services.map((s) => s.name)).toEqual(['service1', 'service2', 'service3']);
    });
  });

  describe('exists', () => {
    it('should return true for registered service', () => {
      registry.register({ name: 'test-service', type: 'test' });
      expect(registry.exists('test-service')).toBe(true);
    });

    it('should return false for non-existent service', () => {
      expect(registry.exists('non-existent')).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove registered service', () => {
      registry.register({ name: 'test-service', type: 'test' });
      const removed = registry.remove('test-service');

      expect(removed).toBe(true);
      expect(registry.exists('test-service')).toBe(false);
    });

    it('should return false when removing non-existent service', () => {
      const removed = registry.remove('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('updateState', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
    });

    it('should update service state', () => {
      registry.updateState('test-service', 'starting');

      const service = registry.get('test-service');
      expect(service?.state).toBe('starting');
    });

    it('should throw error for invalid state transition', () => {
      // Set to ready first
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'ready');

      // Can't go from ready to starting
      expect(() => {
        registry.updateState('test-service', 'starting');
      }).toThrow('Invalid state transition: ready -> starting');
    });

    it('should set startedAt when transitioning to ready', () => {
      const before = new Date();

      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'ready');

      const service = registry.get('test-service');
      expect(service?.startedAt).toBeDefined();
      if (service?.startedAt) {
        expect(service.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      }
    });

    it('should store error message when transitioning to error state', () => {
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'error', 'Service startup failed');

      const service = registry.get('test-service');
      expect(service?.errorMessage).toBe('Service startup failed');
    });

    it('should throw error for non-existent service', () => {
      expect(() => {
        registry.updateState('non-existent', 'starting');
      }).toThrow("Service 'non-existent' not found");
    });

    it('should allow valid state transitions', () => {
      const transitions = [
        { from: 'disabled', to: 'starting' },
        { from: 'starting', to: 'ready' },
        { from: 'ready', to: 'stopping' },
        { from: 'stopping', to: 'disabled' },
      ];

      for (const { from, to } of transitions) {
        const service = registry.get('test-service');
        if (service?.state !== from) {
          // Reset to the expected from state
          registry.remove('test-service');
          registry.register({ name: 'test-service', type: 'test' });

          // Manually set initial states as needed
          let current: any = 'disabled';
          let current_service = registry.get('test-service');
          while (current_service?.state !== from && current !== from) {
            if (current === 'disabled' && from === 'starting') {
              registry.updateState('test-service', 'starting');
              current = 'starting';
            } else if (current === 'starting' && from === 'ready') {
              registry.updateState('test-service', 'ready');
              current = 'ready';
            } else if (current === 'ready' && from === 'stopping') {
              registry.updateState('test-service', 'stopping');
              current = 'stopping';
            } else {
              break;
            }
          }
        }

        // Now test the transition
        expect(() => {
          registry.updateState('test-service', to as any);
        }).not.toThrow();
      }
    });
  });

  describe('state machine', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
    });

    it('should enforce valid disabled state transitions', () => {
      expect(() => registry.updateState('test-service', 'starting')).not.toThrow();
      registry.remove('test-service');
      registry.register({ name: 'test-service', type: 'test' });
      expect(() => registry.updateState('test-service', 'error')).not.toThrow();
    });

    it('should enforce valid starting state transitions', () => {
      registry.updateState('test-service', 'starting');

      expect(() => registry.updateState('test-service', 'ready')).not.toThrow();
      registry.updateState('test-service', 'stopping');
      registry.remove('test-service');
      registry.register({ name: 'test-service', type: 'test' });
      registry.updateState('test-service', 'starting');

      expect(() => registry.updateState('test-service', 'error')).not.toThrow();
    });

    it('should enforce valid ready state transitions', () => {
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'ready');

      expect(() => registry.updateState('test-service', 'stopping')).not.toThrow();
      registry.updateState('test-service', 'disabled');
      registry.remove('test-service');
      registry.register({ name: 'test-service', type: 'test' });
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'ready');

      expect(() => registry.updateState('test-service', 'error')).not.toThrow();
    });
  });
});
