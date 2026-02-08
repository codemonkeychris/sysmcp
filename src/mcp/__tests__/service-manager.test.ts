/**
 * Service Manager Tests
 *
 * Tests for service registration, discovery, and tool execution routing
 */

import { ServiceManager } from '../service-manager';
import { IService, ToolExecutionResult } from '../../services/shared/service-interface';
import { ToolDefinition } from '../message-types';

/**
 * Mock service implementation for testing
 */
class MockService implements IService {
  private isEnabled: boolean = true;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly version: string,
    private tools: ToolDefinition[] = [],
    private toolExecutor?: (
      toolName: string,
      args: Record<string, unknown>
    ) => Promise<ToolExecutionResult>
  ) {}

  get enabled(): boolean {
    return this.isEnabled;
  }

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    if (this.toolExecutor) {
      return this.toolExecutor(toolName, args);
    }
    return { success: true, data: { tool: toolName, args } };
  }

  enable(): void {
    this.isEnabled = true;
  }

  disable(): void {
    this.isEnabled = false;
  }
}

describe('ServiceManager', () => {
  let manager: ServiceManager;

  beforeEach(() => {
    manager = new ServiceManager();
  });

  describe('Service Registration', () => {
    it('registers new service', () => {
      const service = new MockService('test_service', 'Test Service', '1.0.0');

      expect(() => manager.registerService(service)).not.toThrow();
    });

    it('throws on duplicate service ID', () => {
      const service1 = new MockService('test_service', 'Test 1', '1.0.0');
      const service2 = new MockService('test_service', 'Test 2', '2.0.0');

      manager.registerService(service1);

      expect(() => manager.registerService(service2)).toThrow(
        /already registered/
      );
    });

    it('rejects service without id', () => {
      const invalidService = {
        name: 'Test',
        version: '1.0.0',
        enabled: true,
        getTools: () => [],
        callTool: async () => ({ success: true }),
        enable: () => {},
        disable: () => {},
        // missing id
      } as any;

      expect(() => manager.registerService(invalidService)).toThrow();
    });

    it('rejects service with missing fields', () => {
      const invalidService = {
        id: 'test',
        name: 'Test',
        // missing version and enabled
      } as any;

      expect(() => manager.registerService(invalidService)).toThrow(
        /missing required fields/
      );
    });
  });

  describe('Service Discovery', () => {
    it('lists all services', () => {
      const service1 = new MockService('service1', 'Service 1', '1.0.0');
      const service2 = new MockService('service2', 'Service 2', '2.0.0');

      manager.registerService(service1);
      manager.registerService(service2);

      const all = manager.getAllServices();

      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id)).toContain('service1');
      expect(all.map((s) => s.id)).toContain('service2');
    });

    it('gets service by ID', () => {
      const service = new MockService('test_service', 'Test', '1.0.0');
      manager.registerService(service);

      const retrieved = manager.getService('test_service');

      expect(retrieved).toBe(service);
    });

    it('returns undefined for unknown service', () => {
      const retrieved = manager.getService('unknown_service');

      expect(retrieved).toBeUndefined();
    });

    it('returns empty list when no services', () => {
      const all = manager.getAllServices();

      expect(all).toEqual([]);
    });
  });

  describe('Tool Management', () => {
    it('lists all tools from all services', () => {
      const tools1: ToolDefinition[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' },
        },
      ];
      const tools2: ToolDefinition[] = [
        {
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: { type: 'object' },
        },
        {
          name: 'tool3',
          description: 'Tool 3',
          inputSchema: { type: 'object' },
        },
      ];

      const service1 = new MockService('svc1', 'Service 1', '1.0.0', tools1);
      const service2 = new MockService('svc2', 'Service 2', '1.0.0', tools2);

      manager.registerService(service1);
      manager.registerService(service2);

      const allTools = manager.getAllTools();

      expect(allTools).toHaveLength(3);
      expect(allTools.map((t) => t.name)).toContain('tool1');
      expect(allTools.map((t) => t.name)).toContain('tool2');
      expect(allTools.map((t) => t.name)).toContain('tool3');
    });

    it('skips disabled service tools', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' },
        },
      ];

      const service1 = new MockService('svc1', 'Service 1', '1.0.0', tools);
      const service2 = new MockService('svc2', 'Service 2', '1.0.0', tools);

      manager.registerService(service1);
      manager.registerService(service2);

      service2.disable();

      const allTools = manager.getAllTools();

      // Should only have tools from enabled service1
      expect(allTools).toHaveLength(1);
      expect(allTools[0].name).toBe('tool1');
    });

    it('includes tool name, description, schema', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: { arg: { type: 'string' } } },
        },
      ];

      const service = new MockService('test', 'Test', '1.0.0', tools);
      manager.registerService(service);

      const allTools = manager.getAllTools();

      expect(allTools[0].name).toBe('test_tool');
      expect(allTools[0].description).toBe('A test tool');
      expect(allTools[0].inputSchema.properties).toBeDefined();
    });

    it('returns empty array when no enabled services', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' },
        },
      ];

      const service = new MockService('svc1', 'Service 1', '1.0.0', tools);
      manager.registerService(service);
      service.disable();

      const allTools = manager.getAllTools();

      expect(allTools).toEqual([]);
    });
  });

  describe('Tool Routing', () => {
    it('routes tool call to correct service', async () => {
      const executor = jest.fn(async () => ({
        success: true,
        data: 'executed',
      }));

      const service = new MockService(
        'eventlog',
        'EventLog',
        '1.0.0',
        [
          {
            name: 'eventlog_query',
            description: 'Query events',
            inputSchema: { type: 'object' },
          },
        ],
        executor
      );

      manager.registerService(service);

      await manager.callTool('eventlog_query', { logName: 'System' });

      expect(executor).toHaveBeenCalledWith('eventlog_query', { logName: 'System' });
    });

    it('extracts service ID from tool name', async () => {
      const executor = jest.fn(async () => ({
        success: true,
        data: 'ok',
      }));

      const service = new MockService(
        'eventlog',
        'EventLog',
        '1.0.0',
        [
          {
            name: 'eventlog_query',
            description: 'Query',
            inputSchema: { type: 'object' },
          },
        ],
        executor
      );

      manager.registerService(service);

      await manager.callTool('eventlog_query', {});

      expect(executor).toHaveBeenCalled();
    });

    it('returns error for unknown tool', async () => {
      const service = new MockService('eventlog', 'EventLog', '1.0.0', []);
      manager.registerService(service);

      const result = await manager.callTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('not found');
    });

    it('returns error for disabled service', async () => {
      const service = new MockService(
        'eventlog',
        'EventLog',
        '1.0.0',
        [
          {
            name: 'eventlog_query',
            description: 'Query',
            inputSchema: { type: 'object' },
          },
        ]
      );

      manager.registerService(service);
      service.disable();

      const result = await manager.callTool('eventlog_query', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('disabled');
    });

    it('handles service execution errors', async () => {
      const executor = jest.fn(async () => {
        throw new Error('Execution failed');
      });

      const service = new MockService(
        'eventlog',
        'EventLog',
        '1.0.0',
        [
          {
            name: 'eventlog_query',
            description: 'Query',
            inputSchema: { type: 'object' },
          },
        ],
        executor
      );

      manager.registerService(service);

      const result = await manager.callTool('eventlog_query', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Execution failed');
    });

    it('searches all services if service ID not in tool name', async () => {
      const executor = jest.fn(async () => ({
        success: true,
        data: 'ok',
      }));

      const service = new MockService(
        'my_service',
        'My Service',
        '1.0.0',
        [
          {
            name: 'custom_tool_name',
            description: 'Custom tool',
            inputSchema: { type: 'object' },
          },
        ],
        executor
      );

      manager.registerService(service);

      await manager.callTool('custom_tool_name', { arg: 'value' });

      expect(executor).toHaveBeenCalledWith('custom_tool_name', { arg: 'value' });
    });
  });

  describe('Service Control', () => {
    it('disables service', () => {
      const service = new MockService('test', 'Test', '1.0.0');
      manager.registerService(service);

      manager.disableService('test');

      expect(service.enabled).toBe(false);
    });

    it('enables service', () => {
      const service = new MockService('test', 'Test', '1.0.0');
      manager.registerService(service);
      service.disable();

      manager.enableService('test');

      expect(service.enabled).toBe(true);
    });

    it('disabled service tools not discoverable', () => {
      const tools: ToolDefinition[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: { type: 'object' },
        },
      ];

      const service = new MockService('test', 'Test', '1.0.0', tools);
      manager.registerService(service);
      manager.disableService('test');

      const allTools = manager.getAllTools();

      expect(allTools).toHaveLength(0);
    });

    it('throws error when enabling unknown service', () => {
      expect(() => manager.enableService('unknown')).toThrow(/not found/);
    });

    it('throws error when disabling unknown service', () => {
      expect(() => manager.disableService('unknown')).toThrow(/not found/);
    });

    it('checks if service is enabled', () => {
      const service = new MockService('test', 'Test', '1.0.0');
      manager.registerService(service);

      expect(manager.isServiceEnabled('test')).toBe(true);

      service.disable();

      expect(manager.isServiceEnabled('test')).toBe(false);
    });

    it('returns false for unknown service when checking enabled', () => {
      expect(manager.isServiceEnabled('unknown')).toBe(false);
    });
  });

  describe('Multiple Services', () => {
    it('handles multiple services with different tools', async () => {
      const eventlogTools: ToolDefinition[] = [
        {
          name: 'eventlog_query',
          description: 'Query events',
          inputSchema: { type: 'object' },
        },
      ];

      const fileSearchTools: ToolDefinition[] = [
        {
          name: 'filesearch_find',
          description: 'Find files',
          inputSchema: { type: 'object' },
        },
      ];

      const eventlogExecutor = jest.fn(async () => ({
        success: true,
        data: 'events',
      }));
      const fileSearchExecutor = jest.fn(async () => ({
        success: true,
        data: 'files',
      }));

      const eventlogService = new MockService(
        'eventlog',
        'EventLog',
        '1.0.0',
        eventlogTools,
        eventlogExecutor
      );
      const fileSearchService = new MockService(
        'filesearch',
        'FileSearch',
        '1.0.0',
        fileSearchTools,
        fileSearchExecutor
      );

      manager.registerService(eventlogService);
      manager.registerService(fileSearchService);

      const allTools = manager.getAllTools();
      expect(allTools).toHaveLength(2);

      await manager.callTool('eventlog_query', { logName: 'System' });
      expect(eventlogExecutor).toHaveBeenCalled();

      await manager.callTool('filesearch_find', { pattern: '*.txt' });
      expect(fileSearchExecutor).toHaveBeenCalled();
    });
  });
});
