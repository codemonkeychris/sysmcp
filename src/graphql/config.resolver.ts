/**
 * Config Resolver — GraphQL queries and mutations for service configuration
 *
 * Provides GraphQL API for managing service permissions, enabling/disabling
 * services, and querying service configuration state.
 *
 * Each mutation:
 * 1. Validates serviceId
 * 2. Reads current value (for audit)
 * 3. Applies change to config manager
 * 4. Persists via ConfigStore
 * 5. Logs via AuditLogger
 * 6. Returns updated ServiceConfig
 */

import { GraphQLError } from 'graphql';
import { PermissionLevel, EventLogConfigManager } from '../services/eventlog/config';
import { FileSearchConfigManager } from '../services/filesearch/config';
import { ConfigStore, PersistedConfig, createDefaultConfig } from '../config/config-store';
import { AuditLogger } from '../audit/audit-logger';
import { GQLServiceConfig, GQLPermissionLevel } from './types';
import { KNOWN_SERVICE_IDS } from '../security/types';

/**
 * Resolver context expected by config resolvers
 */
export interface ConfigResolverContext {
  configStore?: ConfigStore;
  auditLogger?: AuditLogger;
  eventlogConfigManager?: EventLogConfigManager;
  filesearchConfigManager?: FileSearchConfigManager;
}

/**
 * Map of serviceId → config manager accessor
 */
function getConfigManager(
  serviceId: string,
  context: ConfigResolverContext
): EventLogConfigManager | FileSearchConfigManager | null {
  switch (serviceId) {
    case 'eventlog':
      return context.eventlogConfigManager ?? null;
    case 'filesearch':
      return context.filesearchConfigManager ?? null;
    default:
      return null;
  }
}

/**
 * Convert internal PermissionLevel to GraphQL enum
 */
function toGQLPermissionLevel(level: PermissionLevel): GQLPermissionLevel {
  switch (level) {
    case 'disabled':
      return GQLPermissionLevel.DISABLED;
    case 'read-only':
      return GQLPermissionLevel.READ_ONLY;
    case 'read-write':
      return GQLPermissionLevel.READ_WRITE;
    default:
      return GQLPermissionLevel.DISABLED;
  }
}

/**
 * Convert GraphQL PermissionLevel enum to internal type
 */
function fromGQLPermissionLevel(level: string): PermissionLevel {
  switch (level) {
    case 'DISABLED':
      return 'disabled';
    case 'READ_ONLY':
      return 'read-only';
    case 'READ_WRITE':
      return 'read-write';
    default:
      throw new GraphQLError(`Invalid permission level: ${level}`, {
        extensions: { code: 'INVALID_PERMISSION_LEVEL' },
      });
  }
}

/**
 * Build a GQLServiceConfig from a config manager
 */
function buildServiceConfig(
  serviceId: string,
  manager: EventLogConfigManager | FileSearchConfigManager
): GQLServiceConfig {
  return {
    serviceId,
    enabled: manager.isEnabled(),
    permissionLevel: toGQLPermissionLevel(manager.getPermissionLevel()),
    enableAnonymization: manager.isAnonymizationEnabled(),
  };
}

/**
 * SECURITY: Write lock to prevent concurrent config writes (SEC-007).
 * Serializes all persistConfig calls to prevent last-write-wins races.
 */
let configWriteLock: Promise<void> = Promise.resolve();

/**
 * Reset the write lock (for testing only)
 */
export function resetConfigWriteLock(): void {
  configWriteLock = Promise.resolve();
}

/**
 * Persist current config state to ConfigStore, serialized by write lock
 */
async function persistConfig(context: ConfigResolverContext): Promise<void> {
  if (!context.configStore) return;

  // Acquire lock by chaining onto the previous write
  const previousLock = configWriteLock;
  let resolve: () => void;
  configWriteLock = new Promise<void>((r) => { resolve = r; });

  try {
    await previousLock;
    await persistConfigInner(context);
  } finally {
    resolve!();
  }
}

/**
 * Inner persist logic (called under write lock)
 */
async function persistConfigInner(context: ConfigResolverContext): Promise<void> {
  const config: PersistedConfig = createDefaultConfig();

  // Save eventlog config if available
  if (context.eventlogConfigManager) {
    const ec = context.eventlogConfigManager;
    config.services.eventlog = {
      enabled: ec.isEnabled(),
      permissionLevel: ec.getPermissionLevel(),
      enableAnonymization: ec.isAnonymizationEnabled(),
      maxResults: ec.getMaxResults(),
      timeoutMs: ec.getTimeoutMs(),
    };
  }

  // Save filesearch config if available
  if (context.filesearchConfigManager) {
    const fc = context.filesearchConfigManager;
    config.services.filesearch = {
      enabled: fc.isEnabled(),
      permissionLevel: fc.getPermissionLevel(),
      enableAnonymization: fc.isAnonymizationEnabled(),
      maxResults: fc.getMaxResults(),
      timeoutMs: fc.getTimeoutMs(),
    };
  }

  await context.configStore!.save(config);
}

/**
 * SECURITY: Sanitize serviceId for safe use in error messages (SEC-012).
 * Truncates and strips non-alphanumeric characters to prevent XSS.
 */
function sanitizeServiceId(serviceId: string): string {
  const truncated = String(serviceId).slice(0, 50);
  return truncated.replace(/[^a-zA-Z0-9_\-]/g, '');
}

/**
 * Validate that a serviceId is known
 */
function validateServiceId(serviceId: string): void {
  if (!(KNOWN_SERVICE_IDS as readonly string[]).includes(serviceId)) {
    throw new GraphQLError(`Unknown service: ${sanitizeServiceId(serviceId)}`, {
      extensions: { code: 'UNKNOWN_SERVICE' },
    });
  }
}

/**
 * Config resolver object compatible with Apollo Server resolver composition
 */
export const configResolver = {
  Query: {
    serviceConfig: (
      _parent: any,
      args: { serviceId: string },
      context: ConfigResolverContext
    ): GQLServiceConfig => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service configuration not available: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }
      return buildServiceConfig(args.serviceId, manager);
    },

    allServiceConfigs: (
      _parent: any,
      _args: any,
      context: ConfigResolverContext
    ): GQLServiceConfig[] => {
      const configs: GQLServiceConfig[] = [];
      for (const serviceId of KNOWN_SERVICE_IDS) {
        const manager = getConfigManager(serviceId, context);
        if (manager) {
          configs.push(buildServiceConfig(serviceId, manager));
        }
      }
      return configs;
    },
  },

  Mutation: {
    enableService: async (
      _parent: any,
      args: { serviceId: string },
      context: ConfigResolverContext
    ): Promise<GQLServiceConfig> => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service not found: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }

      const previousEnabled = manager.isEnabled();
      const previousLevel = manager.getPermissionLevel();

      manager.setEnabled(true);
      manager.setPermissionLevel('read-only');

      await persistConfig(context);

      if (context.auditLogger) {
        await context.auditLogger.log({
          action: 'service.enable',
          serviceId: args.serviceId,
          previousValue: { enabled: previousEnabled, permissionLevel: previousLevel },
          newValue: { enabled: true, permissionLevel: 'read-only' },
          source: 'graphql-mutation',
        });
      }

      return buildServiceConfig(args.serviceId, manager);
    },

    disableService: async (
      _parent: any,
      args: { serviceId: string },
      context: ConfigResolverContext
    ): Promise<GQLServiceConfig> => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service not found: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }

      const previousEnabled = manager.isEnabled();
      const previousLevel = manager.getPermissionLevel();

      manager.setEnabled(false);
      manager.setPermissionLevel('disabled');

      await persistConfig(context);

      if (context.auditLogger) {
        await context.auditLogger.log({
          action: 'service.disable',
          serviceId: args.serviceId,
          previousValue: { enabled: previousEnabled, permissionLevel: previousLevel },
          newValue: { enabled: false, permissionLevel: 'disabled' },
          source: 'graphql-mutation',
        });
      }

      return buildServiceConfig(args.serviceId, manager);
    },

    setPermissionLevel: async (
      _parent: any,
      args: { serviceId: string; level: string },
      context: ConfigResolverContext
    ): Promise<GQLServiceConfig> => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service not found: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }

      const internalLevel = fromGQLPermissionLevel(args.level);
      const previousLevel = manager.getPermissionLevel();

      manager.setPermissionLevel(internalLevel);

      // Auto-set enabled state based on permission level
      if (internalLevel === 'disabled') {
        manager.setEnabled(false);
      } else {
        manager.setEnabled(true);
      }

      await persistConfig(context);

      if (context.auditLogger) {
        await context.auditLogger.log({
          action: 'permission.change',
          serviceId: args.serviceId,
          previousValue: previousLevel,
          newValue: internalLevel,
          source: 'graphql-mutation',
        });
      }

      return buildServiceConfig(args.serviceId, manager);
    },

    setPiiAnonymization: async (
      _parent: any,
      args: { serviceId: string; enabled: boolean },
      context: ConfigResolverContext
    ): Promise<GQLServiceConfig> => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service not found: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }

      const previousValue = manager.isAnonymizationEnabled();
      manager.setAnonymizationEnabled(args.enabled);

      await persistConfig(context);

      if (context.auditLogger) {
        await context.auditLogger.log({
          action: 'pii.toggle',
          serviceId: args.serviceId,
          previousValue,
          newValue: args.enabled,
          source: 'graphql-mutation',
        });
      }

      return buildServiceConfig(args.serviceId, manager);
    },

    resetServiceConfig: async (
      _parent: any,
      args: { serviceId: string },
      context: ConfigResolverContext
    ): Promise<GQLServiceConfig> => {
      validateServiceId(args.serviceId);
      const manager = getConfigManager(args.serviceId, context);
      if (!manager) {
        throw new GraphQLError(`Service not found: ${args.serviceId}`, {
          extensions: { code: 'SERVICE_NOT_FOUND' },
        });
      }

      const previousConfig = {
        enabled: manager.isEnabled(),
        permissionLevel: manager.getPermissionLevel(),
        enableAnonymization: manager.isAnonymizationEnabled(),
      };

      // Reset to secure defaults
      manager.setEnabled(false);
      manager.setPermissionLevel('disabled');
      manager.setAnonymizationEnabled(true);

      await persistConfig(context);

      if (context.auditLogger) {
        await context.auditLogger.log({
          action: 'config.reset',
          serviceId: args.serviceId,
          previousValue: previousConfig,
          newValue: { enabled: false, permissionLevel: 'disabled', enableAnonymization: true },
          source: 'graphql-mutation',
        });
      }

      return buildServiceConfig(args.serviceId, manager);
    },
  },
};
