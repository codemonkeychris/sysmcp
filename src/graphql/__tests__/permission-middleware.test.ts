/**
 * Permission Middleware Unit Tests
 */

import { createPermissionPlugin } from '../permission-middleware';
import { PermissionCheckerImpl, createPermissionChecker } from '../../security/permission-checker';
import { ServiceConfigProvider, PermissionLevel } from '../../security/types';
import { parse } from 'graphql';

function createMockProvider(
  enabled: boolean = true,
  permissionLevel: PermissionLevel = 'read-only'
): ServiceConfigProvider {
  return {
    isEnabled: () => enabled,
    getPermissionLevel: () => permissionLevel,
  };
}

function createDocument(query: string) {
  return parse(query);
}

describe('Permission Middleware', () => {
  let checker: PermissionCheckerImpl;
  let providers: Map<string, ServiceConfigProvider>;

  beforeEach(() => {
    providers = new Map();
    providers.set('eventlog', createMockProvider(true, 'read-only'));
    providers.set('filesearch', createMockProvider(true, 'read-only'));
    checker = createPermissionChecker(providers);
  });

  async function executePlugin(query: string) {
    const plugin = createPermissionPlugin(checker);
    const requestDidStart = (plugin as any).requestDidStart;
    const handlers = await requestDidStart();

    const document = createDocument(query);
    const requestContext = { document };

    return handlers.responseForOperation(requestContext);
  }

  describe('data queries', () => {
    it('should allow eventLogs query when service is enabled', async () => {
      const result = await executePlugin(
        '{ eventLogs(logName: "System") { entries { id } } }'
      );
      expect(result).toBeNull(); // null = continue execution
    });

    it('should allow fileSearch query when service is enabled', async () => {
      const result = await executePlugin(
        '{ fileSearch { files { path } } }'
      );
      expect(result).toBeNull();
    });

    it('should deny eventLogs query when service is disabled', async () => {
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      await expect(
        executePlugin('{ eventLogs(logName: "System") { entries { id } } }')
      ).rejects.toThrow('Permission denied');
    });

    it('should deny fileSearch query when service is disabled', async () => {
      providers.set('filesearch', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      await expect(
        executePlugin('{ fileSearch { files { path } } }')
      ).rejects.toThrow('Permission denied');
    });

    it('should return PERMISSION_DENIED error code', async () => {
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      try {
        await executePlugin(
          '{ eventLogs(logName: "System") { entries { id } } }'
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.extensions?.code).toBe('PERMISSION_DENIED');
      }
    });

    it('should not expose internal details in error message', async () => {
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      try {
        await executePlugin(
          '{ eventLogs(logName: "System") { entries { id } } }'
        );
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toBe('Permission denied');
        expect(error.message).not.toContain('disabled');
        expect(error.message).not.toContain('eventlog');
      }
    });
  });

  describe('admin/meta queries bypass checks', () => {
    beforeEach(() => {
      // Disable all services
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      providers.set('filesearch', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);
    });

    it('should allow services query', async () => {
      const result = await executePlugin('{ services { name state } }');
      expect(result).toBeNull();
    });

    it('should allow service query', async () => {
      const result = await executePlugin(
        '{ service(name: "eventlog") { name } }'
      );
      expect(result).toBeNull();
    });

    it('should allow health query', async () => {
      const result = await executePlugin('{ health { status } }');
      expect(result).toBeNull();
    });
  });

  describe('config mutations bypass checks', () => {
    beforeEach(() => {
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);
    });

    it('should allow enableService mutation', async () => {
      const result = await executePlugin(
        'mutation { enableService(serviceId: "eventlog") { serviceId } }'
      );
      expect(result).toBeNull();
    });

    it('should allow disableService mutation', async () => {
      const result = await executePlugin(
        'mutation { disableService(serviceId: "eventlog") { serviceId } }'
      );
      expect(result).toBeNull();
    });

    it('should allow setPermissionLevel mutation', async () => {
      const result = await executePlugin(
        'mutation { setPermissionLevel(serviceId: "eventlog", level: READ_ONLY) { serviceId } }'
      );
      expect(result).toBeNull();
    });
  });

  describe('multiple fields in one query', () => {
    it('should check all data fields', async () => {
      providers.set('eventlog', createMockProvider(true, 'read-only'));
      providers.set('filesearch', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      await expect(
        executePlugin(
          '{ eventLogs(logName: "System") { entries { id } } fileSearch { files { path } } }'
        )
      ).rejects.toThrow('Permission denied');
    });

    it('should allow when all data fields have permission', async () => {
      const result = await executePlugin(
        '{ eventLogs(logName: "System") { entries { id } } fileSearch { files { path } } }'
      );
      expect(result).toBeNull();
    });
  });

  describe('no document', () => {
    it('should continue when document is null', async () => {
      const plugin = createPermissionPlugin(checker);
      const handlers = await (plugin as any).requestDidStart();
      const result = await handlers.responseForOperation({ document: null });
      expect(result).toBeNull();
    });
  });

  describe('SEC-003: Middleware fails closed on parse error', () => {
    it('should deny request when document has no definitions', async () => {
      const plugin = createPermissionPlugin(checker);
      const handlers = await (plugin as any).requestDidStart();

      // Document with no definitions property causes parse to throw
      const malformedDoc = { /* no definitions */ };

      await expect(
        handlers.responseForOperation({ document: malformedDoc })
      ).rejects.toThrow('Permission denied');
    });

    it('should deny request when definitions is not iterable', async () => {
      const plugin = createPermissionPlugin(checker);
      const handlers = await (plugin as any).requestDidStart();

      const malformedDoc = { definitions: 42 };

      await expect(
        handlers.responseForOperation({ document: malformedDoc })
      ).rejects.toThrow('Permission denied');
    });

    it('should deny request with unexpected AST structure', async () => {
      const plugin = createPermissionPlugin(checker);
      const handlers = await (plugin as any).requestDidStart();

      // Definition with kind but null selectionSet
      const malformedDoc = {
        definitions: [{ kind: 'OperationDefinition', selectionSet: null }],
      };

      await expect(
        handlers.responseForOperation({ document: malformedDoc })
      ).rejects.toThrow('Permission denied');
    });

    it('should return PERMISSION_DENIED code on parse error', async () => {
      const plugin = createPermissionPlugin(checker);
      const handlers = await (plugin as any).requestDidStart();

      const malformedDoc = { definitions: null };

      try {
        await handlers.responseForOperation({ document: malformedDoc });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.extensions?.code).toBe('PERMISSION_DENIED');
      }
    });

    it('should still allow valid queries (positive case)', async () => {
      const result = await executePlugin(
        '{ eventLogs(logName: "System") { entries { id } } }'
      );
      expect(result).toBeNull();
    });
  });
});
