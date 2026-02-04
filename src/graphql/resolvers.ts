/**
 * GraphQL Resolvers
 * Implements Query and Mutation resolvers for service management
 */

import { Logger } from '../logger';
import { ServiceRegistry } from '../services/types';
import { ServiceLifecycleManager } from '../services/lifecycle';
import {
  GQLService,
  GQLHealthStatus,
  RegisterServiceInput,
  ServiceRegistrationResult,
  ServiceOperationResult,
  ServiceStateEnum,
} from './types';

/**
 * Convert backend Service to GraphQL Service type
 */
function serviceToGraphQL(service: any): GQLService {
  return {
    name: service.name,
    type: service.type,
    state: service.state.toUpperCase() as ServiceStateEnum,
    errorMessage: service.errorMessage,
    startedAt: service.startedAt ? service.startedAt.toISOString() : undefined,
    requiredPermissions: service.requiredPermissions,
  };
}

/**
 * Resolvers implementation
 */
export const resolvers = {
  Query: {
    /**
     * Get all registered services
     */
    services: (
      _parent: any,
      _args: any,
      context: { registry: ServiceRegistry; logger: Logger }
    ): GQLService[] => {
      try {
        const services = context.registry.getAll();
        return services.map(serviceToGraphQL);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error retrieving services', { error: message });
        throw new Error('Failed to retrieve services');
      }
    },

    /**
     * Get a specific service by name
     */
    service: (
      _parent: any,
      args: { name: string },
      context: { registry: ServiceRegistry; logger: Logger }
    ): GQLService | null => {
      try {
        const service = context.registry.get(args.name);
        return service ? serviceToGraphQL(service) : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error retrieving service', { error: message, name: args.name });
        throw new Error('Failed to retrieve service');
      }
    },

    /**
     * Get current health status
     */
    health: (
      _parent: any,
      _args: any,
      context: { registry: ServiceRegistry; logger: Logger; startTime: number }
    ): GQLHealthStatus => {
      try {
        const services = context.registry.getAll();
        const errorCount = services.filter((s) => s.state === 'error').length;
        const uptime = Math.floor((Date.now() - context.startTime) / 1000);

        return {
          status: errorCount > 0 ? 'degraded' : 'ok',
          uptime,
          services: services.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error retrieving health status', { error: message });
        throw new Error('Failed to retrieve health status');
      }
    },
  },

  Mutation: {
    /**
     * Register a new service
     */
    registerService: async (
      _parent: any,
      args: { input: RegisterServiceInput },
      context: { registry: ServiceRegistry; logger: Logger }
    ): Promise<ServiceRegistrationResult> => {
      try {
        const { input } = args;

        // Validate input
        if (!input.name || !input.type) {
          return {
            success: false,
            error: 'Service name and type are required',
          };
        }

        // Check if service already exists
        if (context.registry.exists(input.name)) {
          return {
            success: false,
            error: `Service '${input.name}' already exists`,
          };
        }

        // Register service
        context.registry.register({
          name: input.name,
          type: input.type,
          requiredPermissions: input.requiredPermissions,
          config: input.config ? JSON.parse(input.config) : undefined,
        });

        const service = context.registry.get(input.name);

        context.logger.info('Service registered', { name: input.name, type: input.type });

        return {
          success: true,
          service: service ? serviceToGraphQL(service) : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error registering service', { error: message });
        return {
          success: false,
          error: `Failed to register service: ${message}`,
        };
      }
    },

    /**
     * Start a service
     */
    startService: async (
      _parent: any,
      args: { name: string },
      context: {
        registry: ServiceRegistry;
        logger: Logger;
        lifecycleManager: ServiceLifecycleManager;
      }
    ): Promise<ServiceOperationResult> => {
      try {
        await context.lifecycleManager.startService(args.name);

        const service = context.registry.get(args.name);
        context.logger.info('Service started via GraphQL', { name: args.name });

        return {
          success: true,
          service: service ? serviceToGraphQL(service) : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error starting service', { error: message, name: args.name });
        return {
          success: false,
          error: `Failed to start service: ${message}`,
        };
      }
    },

    /**
     * Stop a service
     */
    stopService: async (
      _parent: any,
      args: { name: string },
      context: {
        registry: ServiceRegistry;
        logger: Logger;
        lifecycleManager: ServiceLifecycleManager;
      }
    ): Promise<ServiceOperationResult> => {
      try {
        await context.lifecycleManager.stopService(args.name);

        const service = context.registry.get(args.name);
        context.logger.info('Service stopped via GraphQL', { name: args.name });

        return {
          success: true,
          service: service ? serviceToGraphQL(service) : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error stopping service', { error: message, name: args.name });
        return {
          success: false,
          error: `Failed to stop service: ${message}`,
        };
      }
    },

    /**
     * Restart a service
     */
    restartService: async (
      _parent: any,
      args: { name: string },
      context: {
        registry: ServiceRegistry;
        logger: Logger;
        lifecycleManager: ServiceLifecycleManager;
      }
    ): Promise<ServiceOperationResult> => {
      try {
        await context.lifecycleManager.restartService(args.name);

        const service = context.registry.get(args.name);
        context.logger.info('Service restarted via GraphQL', { name: args.name });

        return {
          success: true,
          service: service ? serviceToGraphQL(service) : undefined,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error('Error restarting service', { error: message, name: args.name });
        return {
          success: false,
          error: `Failed to restart service: ${message}`,
        };
      }
    },
  },
};
