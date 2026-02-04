/**
 * Tests for GraphQL Resolvers
 */

import { resolvers } from '../resolvers';
import { createRegistry } from '../../services/registry';
import { createLifecycleManager } from '../../services/lifecycle';
import { createLogger } from '../../logger';
import { typeDefs } from '../schema';

describe('GraphQL Resolvers', () => {
  let context: any;
  let registry: ReturnType<typeof createRegistry>;
  let lifecycleManager: ReturnType<typeof createLifecycleManager>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger({
      level: 'error',
      service: 'graphql-test',
    });

    registry = createRegistry(logger);
    lifecycleManager = createLifecycleManager(registry, logger);

    context = {
      registry,
      logger,
      lifecycleManager,
      startTime: Date.now(),
    };
  });

  describe('Query.services', () => {
    it('should return empty array when no services', () => {
      const result = resolvers.Query.services(null, {}, context);
      expect(result).toEqual([]);
    });

    it('should return all registered services', () => {
      registry.register({ name: 'service1', type: 'test' });
      registry.register({ name: 'service2', type: 'test' });

      const result = resolvers.Query.services(null, {}, context);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('service1');
      expect(result[1].name).toBe('service2');
    });

    it('should convert service states to uppercase', () => {
      registry.register({ name: 'test-service', type: 'test' });

      const result = resolvers.Query.services(null, {}, context);

      expect(result[0].state).toBe('DISABLED');
    });

    it('should include service properties', () => {
      registry.register({
        name: 'test-service',
        type: 'graphql',
        requiredPermissions: ['read', 'write'],
      });

      const result = resolvers.Query.services(null, {}, context);

      expect(result[0].name).toBe('test-service');
      expect(result[0].type).toBe('graphql');
      expect(result[0].requiredPermissions).toEqual(['read', 'write']);
    });
  });

  describe('Query.service', () => {
    it('should return service by name', () => {
      registry.register({ name: 'test-service', type: 'test' });

      const result = resolvers.Query.service(null, { name: 'test-service' }, context);

      expect(result).toBeDefined();
      expect(result?.name).toBe('test-service');
    });

    it('should return null for non-existent service', () => {
      const result = resolvers.Query.service(null, { name: 'non-existent' }, context);
      expect(result).toBeNull();
    });

    it('should include error message if service in error state', () => {
      registry.register({ name: 'error-service', type: 'test' });
      registry.updateState('error-service', 'starting');
      registry.updateState('error-service', 'error', 'Service failed');

      const result = resolvers.Query.service(null, { name: 'error-service' }, context);

      expect(result?.errorMessage).toBe('Service failed');
    });
  });

  describe('Query.health', () => {
    it('should return health status as ok when no errors', () => {
      const result = resolvers.Query.health(null, {}, context);

      expect(result.status).toBe('ok');
    });

    it('should return health status as degraded when service in error', () => {
      registry.register({ name: 'test-service', type: 'test' });
      registry.updateState('test-service', 'starting');
      registry.updateState('test-service', 'error', 'Test error');

      const result = resolvers.Query.health(null, {}, context);

      expect(result.status).toBe('degraded');
    });

    it('should include correct service count', () => {
      registry.register({ name: 'service1', type: 'test' });
      registry.register({ name: 'service2', type: 'test' });

      const result = resolvers.Query.health(null, {}, context);

      expect(result.services).toBe(2);
    });

    it('should calculate uptime correctly', () => {
      const beforeContext = { ...context, startTime: Date.now() - 10000 };

      const result = resolvers.Query.health(null, {}, beforeContext);

      expect(result.uptime).toBeGreaterThanOrEqual(10);
    });

    it('should include timestamp', () => {
      const result = resolvers.Query.health(null, {}, context);

      expect(result.timestamp).toBeDefined();
      // Verify ISO 8601 format
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('Mutation.registerService', () => {
    it('should register a new service', async () => {
      const input = {
        name: 'new-service',
        type: 'custom',
      };

      const result = await resolvers.Mutation.registerService(null, { input }, context);

      expect(result.success).toBe(true);
      expect(result.service?.name).toBe('new-service');
      expect(registry.exists('new-service')).toBe(true);
    });

    it('should return error if service name missing', async () => {
      const input = {
        name: '',
        type: 'custom',
      };

      const result = await resolvers.Mutation.registerService(null, { input }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should return error if service already exists', async () => {
      registry.register({ name: 'existing', type: 'test' });

      const input = {
        name: 'existing',
        type: 'custom',
      };

      const result = await resolvers.Mutation.registerService(null, { input }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should include permissions in registered service', async () => {
      const input = {
        name: 'perm-service',
        type: 'custom',
        requiredPermissions: ['read', 'write'],
      };

      const result = await resolvers.Mutation.registerService(null, { input }, context);

      expect(result.service?.requiredPermissions).toEqual(['read', 'write']);
    });
  });

  describe('Mutation.startService', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // Minimal init
      });
    });

    it('should start a service', async () => {
      const result = await resolvers.Mutation.startService(
        null,
        { name: 'test-service' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.service?.state).toBe('READY');
    });

    it('should return error if service not found', async () => {
      const result = await resolvers.Mutation.startService(null, { name: 'non-existent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should transition service to ready state', async () => {
      const result = await resolvers.Mutation.startService(
        null,
        { name: 'test-service' },
        context
      );

      const service = registry.get('test-service');
      expect(service?.state).toBe('ready');
      expect(result.service?.state).toBe('READY');
    });
  });

  describe('Mutation.stopService', () => {
    beforeEach(async () => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // Minimal init
      });
      lifecycleManager.registerCleanup('test-service', async () => {
        // Minimal cleanup
      });
      // Start the service first
      await lifecycleManager.startService('test-service');
    });

    it('should stop a running service', async () => {
      const result = await resolvers.Mutation.stopService(
        null,
        { name: 'test-service' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.service?.state).toBe('DISABLED');
    });

    it('should return error if service not found', async () => {
      const result = await resolvers.Mutation.stopService(null, { name: 'non-existent' }, context);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Mutation.restartService', () => {
    beforeEach(() => {
      registry.register({ name: 'test-service', type: 'test' });
      lifecycleManager.registerInit('test-service', async () => {
        // Minimal init
      });
      lifecycleManager.registerCleanup('test-service', async () => {
        // Minimal cleanup
      });
    });

    it('should restart a service', async () => {
      // Start first
      await lifecycleManager.startService('test-service');

      const result = await resolvers.Mutation.restartService(
        null,
        { name: 'test-service' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.service?.state).toBe('READY');
    });

    it('should return error if service not found', async () => {
      const result = await resolvers.Mutation.restartService(
        null,
        { name: 'non-existent' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle query errors gracefully', () => {
      // Create a broken context to test error handling
      const brokenContext = {
        registry: {
          getAll: () => {
            throw new Error('Registry error');
          },
        } as any,
        logger,
      };

      expect(() => {
        resolvers.Query.services(null, {}, brokenContext);
      }).toThrow('Failed to retrieve services');
    });

    it('should handle mutation errors gracefully', async () => {
      const brokenContext = {
        registry: {
          exists: () => false,
          register: () => {
            throw new Error('Registration error');
          },
        } as any,
        logger,
      };

      const input = {
        name: 'test',
        type: 'test',
      };

      const result = await resolvers.Mutation.registerService(null, { input }, brokenContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to register service');
    });
  });

  describe('schema types', () => {
    it('should define required GraphQL types', () => {
      expect(typeDefs).toContain('type Query');
      expect(typeDefs).toContain('type Mutation');
      expect(typeDefs).toContain('type Service');
      expect(typeDefs).toContain('enum ServiceState');
    });

    it('should define all query fields', () => {
      expect(typeDefs).toContain('services: [Service!]!');
      expect(typeDefs).toContain('service(name: String!): Service');
      expect(typeDefs).toContain('health: HealthStatus!');
    });

    it('should define all mutation fields', () => {
      expect(typeDefs).toContain('registerService');
      expect(typeDefs).toContain('startService');
      expect(typeDefs).toContain('stopService');
      expect(typeDefs).toContain('restartService');
    });

    it('should define ServiceState enum values', () => {
      expect(typeDefs).toContain('DISABLED');
      expect(typeDefs).toContain('STARTING');
      expect(typeDefs).toContain('READY');
      expect(typeDefs).toContain('ERROR');
      expect(typeDefs).toContain('STOPPING');
    });
  });
});
