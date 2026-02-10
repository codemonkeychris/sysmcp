/**
 * Config Resolver Unit Tests
 */

import { configResolver } from '../config.resolver';
import { EventLogConfigManager } from '../../services/eventlog/config';
import { FileSearchConfigManager } from '../../services/filesearch/config';
import { GQLPermissionLevel } from '../types';

// Mock ConfigStore
function createMockConfigStore() {
  return {
    load: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockReturnValue(false),
  };
}

// Mock AuditLogger
function createMockAuditLogger() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
    getRecentEntries: jest.fn().mockResolvedValue([]),
  };
}

function createContext() {
  return {
    configStore: createMockConfigStore(),
    auditLogger: createMockAuditLogger(),
    eventlogConfigManager: new EventLogConfigManager(),
    filesearchConfigManager: new FileSearchConfigManager(),
  };
}

describe('Config Resolver', () => {
  describe('Query: serviceConfig', () => {
    it('should return current config for eventlog', () => {
      const context = createContext();
      const result = configResolver.Query.serviceConfig(null, { serviceId: 'eventlog' }, context);

      expect(result.serviceId).toBe('eventlog');
      expect(result.enabled).toBe(true);
      expect(result.permissionLevel).toBe(GQLPermissionLevel.READ_ONLY);
      expect(result.enableAnonymization).toBe(true);
    });

    it('should return current config for filesearch', () => {
      const context = createContext();
      const result = configResolver.Query.serviceConfig(null, { serviceId: 'filesearch' }, context);

      expect(result.serviceId).toBe('filesearch');
      expect(result.enabled).toBe(true);
    });

    it('should throw for unknown service', () => {
      const context = createContext();
      expect(() =>
        configResolver.Query.serviceConfig(null, { serviceId: 'unknown' }, context)
      ).toThrow('Unknown service');
    });
  });

  describe('Query: allServiceConfigs', () => {
    it('should return all known services', () => {
      const context = createContext();
      const results = configResolver.Query.allServiceConfigs(null, {}, context);

      expect(results.length).toBe(2);
      expect(results.map((r: any) => r.serviceId).sort()).toEqual(['eventlog', 'filesearch']);
    });
  });

  describe('Mutation: enableService', () => {
    it('should set enabled=true and permissionLevel=read-only', async () => {
      const context = createContext();
      context.eventlogConfigManager.setEnabled(false);
      context.eventlogConfigManager.setPermissionLevel('disabled');

      const result = await configResolver.Mutation.enableService(
        null,
        { serviceId: 'eventlog' },
        context
      );

      expect(result.enabled).toBe(true);
      expect(result.permissionLevel).toBe(GQLPermissionLevel.READ_ONLY);
    });

    it('should call ConfigStore.save()', async () => {
      const context = createContext();
      await configResolver.Mutation.enableService(null, { serviceId: 'eventlog' }, context);

      expect(context.configStore.save).toHaveBeenCalledTimes(1);
    });

    it('should call AuditLogger.log() with correct action', async () => {
      const context = createContext();
      await configResolver.Mutation.enableService(null, { serviceId: 'eventlog' }, context);

      expect(context.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.enable',
          serviceId: 'eventlog',
          source: 'graphql-mutation',
        })
      );
    });

    it('should throw for unknown service', async () => {
      const context = createContext();
      await expect(
        configResolver.Mutation.enableService(null, { serviceId: 'unknown' }, context)
      ).rejects.toThrow('Unknown service');
    });
  });

  describe('Mutation: disableService', () => {
    it('should set enabled=false and permissionLevel=disabled', async () => {
      const context = createContext();

      const result = await configResolver.Mutation.disableService(
        null,
        { serviceId: 'eventlog' },
        context
      );

      expect(result.enabled).toBe(false);
      expect(result.permissionLevel).toBe(GQLPermissionLevel.DISABLED);
    });

    it('should call ConfigStore.save()', async () => {
      const context = createContext();
      await configResolver.Mutation.disableService(null, { serviceId: 'eventlog' }, context);

      expect(context.configStore.save).toHaveBeenCalledTimes(1);
    });

    it('should call AuditLogger.log() with correct action', async () => {
      const context = createContext();
      await configResolver.Mutation.disableService(null, { serviceId: 'eventlog' }, context);

      expect(context.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.disable',
          serviceId: 'eventlog',
        })
      );
    });
  });

  describe('Mutation: setPermissionLevel', () => {
    it('should update permission level to READ_WRITE', async () => {
      const context = createContext();

      const result = await configResolver.Mutation.setPermissionLevel(
        null,
        { serviceId: 'eventlog', level: 'READ_WRITE' },
        context
      );

      expect(result.permissionLevel).toBe(GQLPermissionLevel.READ_WRITE);
      expect(result.enabled).toBe(true);
    });

    it('should set enabled=false when level is DISABLED', async () => {
      const context = createContext();

      const result = await configResolver.Mutation.setPermissionLevel(
        null,
        { serviceId: 'eventlog', level: 'DISABLED' },
        context
      );

      expect(result.permissionLevel).toBe(GQLPermissionLevel.DISABLED);
      expect(result.enabled).toBe(false);
    });

    it('should call AuditLogger with permission.change action', async () => {
      const context = createContext();
      await configResolver.Mutation.setPermissionLevel(
        null,
        { serviceId: 'filesearch', level: 'READ_WRITE' },
        context
      );

      expect(context.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'permission.change',
          serviceId: 'filesearch',
          previousValue: 'read-only',
          newValue: 'read-write',
        })
      );
    });

    it('should throw for invalid permission level', async () => {
      const context = createContext();
      await expect(
        configResolver.Mutation.setPermissionLevel(
          null,
          { serviceId: 'eventlog', level: 'INVALID' },
          context
        )
      ).rejects.toThrow('Invalid permission level');
    });
  });

  describe('Mutation: setPiiAnonymization', () => {
    it('should update anonymization toggle', async () => {
      const context = createContext();

      const result = await configResolver.Mutation.setPiiAnonymization(
        null,
        { serviceId: 'eventlog', enabled: false },
        context
      );

      expect(result.enableAnonymization).toBe(false);
    });

    it('should call AuditLogger with pii.toggle action', async () => {
      const context = createContext();
      await configResolver.Mutation.setPiiAnonymization(
        null,
        { serviceId: 'eventlog', enabled: false },
        context
      );

      expect(context.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'pii.toggle',
          serviceId: 'eventlog',
          previousValue: true,
          newValue: false,
        })
      );
    });

    it('should persist config', async () => {
      const context = createContext();
      await configResolver.Mutation.setPiiAnonymization(
        null,
        { serviceId: 'eventlog', enabled: false },
        context
      );

      expect(context.configStore.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Mutation: resetServiceConfig', () => {
    it('should reset to secure defaults', async () => {
      const context = createContext();

      const result = await configResolver.Mutation.resetServiceConfig(
        null,
        { serviceId: 'eventlog' },
        context
      );

      expect(result.enabled).toBe(false);
      expect(result.permissionLevel).toBe(GQLPermissionLevel.DISABLED);
      expect(result.enableAnonymization).toBe(true);
    });

    it('should call AuditLogger with config.reset action', async () => {
      const context = createContext();
      await configResolver.Mutation.resetServiceConfig(
        null,
        { serviceId: 'eventlog' },
        context
      );

      expect(context.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'config.reset',
          serviceId: 'eventlog',
        })
      );
    });

    it('should persist config', async () => {
      const context = createContext();
      await configResolver.Mutation.resetServiceConfig(
        null,
        { serviceId: 'eventlog' },
        context
      );

      expect(context.configStore.save).toHaveBeenCalledTimes(1);
    });

    it('should throw for unknown service', async () => {
      const context = createContext();
      await expect(
        configResolver.Mutation.resetServiceConfig(null, { serviceId: 'bogus' }, context)
      ).rejects.toThrow('Unknown service');
    });
  });
});
