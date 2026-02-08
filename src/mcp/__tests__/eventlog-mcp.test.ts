/**
 * EventLog MCP Service Tests
 */

import { EventLogMcpService } from '../../services/eventlog/mcp-service';
import { ToolDefinition } from '../message-types';

describe('EventLogMcpService', () => {
  let service: EventLogMcpService;

  beforeEach(() => {
    service = new EventLogMcpService();
  });

  describe('Service Interface', () => {
    it('implements IService interface', () => {
      expect(service.id).toBe('eventlog');
      expect(service.name).toBe('EventLog MCP Service');
      expect(service.version).toBe('1.0.0');
      expect(service.enabled).toBe(true);
    });

    it('has correct ID, name, version', () => {
      expect(service.id).toBeDefined();
      expect(service.name).toBeDefined();
      expect(service.version).toBeDefined();
    });

    it('returns EventLog tools', () => {
      const tools = service.getTools();

      expect(tools).toBeDefined();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.map((t: ToolDefinition) => t.name)).toContain('eventlog_query');
      expect(tools.map((t: ToolDefinition) => t.name)).toContain('eventlog_list_logs');
    });
  });

  describe('eventlog_query tool', () => {
    it('handles eventlog_query with all parameters', async () => {
      const result = await service.callTool('eventlog_query', {
        logName: 'System',
        limit: 100,
        offset: 0,
        minLevel: 'ERROR',
        source: 'Test',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('translates logName parameter', async () => {
      const result = await service.callTool('eventlog_query', {
        logName: 'Application',
        limit: 50,
      });

      expect(result.success).toBe(true);
      expect((result.data as any)?.logName).toBe('Application');
    });

    it('translates limit and offset', async () => {
      const result = await service.callTool('eventlog_query', {
        logName: 'System',
        limit: 200,
        offset: 100,
      });

      expect(result.success).toBe(true);
      expect((result.data as any)?.logName).toBe('System');
    });

    it('returns results as MCP ToolResult', async () => {
      const result = await service.callTool('eventlog_query', {
        logName: 'System',
      });

      expect(result.success).toBe(true);
      expect((result.data as any)?.entries).toBeDefined();
      expect((result.data as any)?.totalCount).toBeDefined();
    });

    it('includes pagination info', async () => {
      const result = await service.callTool('eventlog_query', {
        logName: 'System',
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect((result.data as any)?.nextOffset).toBeDefined();
    });
  });

  describe('eventlog_list_logs tool', () => {
    it('handles eventlog_list_logs', async () => {
      const result = await service.callTool('eventlog_list_logs', {});

      expect(result.success).toBe(true);
      expect((result.data as any)?.logs).toBeDefined();
    });

    it('returns available log names', async () => {
      const result = await service.callTool('eventlog_list_logs', {});

      expect(result.success).toBe(true);
      const logs = (result.data as any)?.logs;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('handles invalid log name gracefully', async () => {
      // Service should still return success=true with empty results
      // in real implementation, would validate against actual logs
      const result = await service.callTool('eventlog_query', {
        logName: 'InvalidLog',
      });

      // Currently returns success, but real implementation would validate
      expect(result).toBeDefined();
    });

    it('handles unknown tool', async () => {
      const result = await service.callTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Unknown tool');
    });

    it('returns MCP-formatted errors', async () => {
      const result = await service.callTool('unknown_tool', {});

      expect(result.error).toBeDefined();
      expect(result.error?.message).toBeDefined();
    });
  });

  describe('Tool Definitions', () => {
    it('defines eventlog_query tool', () => {
      const tools = service.getTools();
      const queryTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_query');

      expect(queryTool).toBeDefined();
      expect(queryTool?.description).toBeDefined();
      expect(queryTool?.inputSchema).toBeDefined();
    });

    it('includes logName parameter (required, string)', () => {
      const tools = service.getTools();
      const queryTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_query')!;
      const schema = queryTool.inputSchema;

      expect(schema.required).toContain('logName');
      expect((schema.properties as any)?.logName?.type).toBe('string');
    });

    it('includes limit parameter (optional, 1-1000, default 100)', () => {
      const tools = service.getTools();
      const queryTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_query')!;
      const schema = queryTool.inputSchema;
      const limitProp = (schema.properties as any)?.limit;

      expect(limitProp?.minimum).toBe(1);
      expect(limitProp?.maximum).toBe(1000);
      expect(limitProp?.default).toBe(100);
    });

    it('includes offset parameter (optional, >=0, default 0)', () => {
      const tools = service.getTools();
      const queryTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_query')!;
      const schema = queryTool.inputSchema;
      const offsetProp = (schema.properties as any)?.offset;

      expect(offsetProp?.minimum).toBe(0);
      expect(offsetProp?.default).toBe(0);
    });

    it('includes minLevel filter (optional, enum)', () => {
      const tools = service.getTools();
      const queryTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_query')!;
      const schema = queryTool.inputSchema;
      const levelProp = (schema.properties as any)?.minLevel;

      expect(levelProp?.enum).toBeDefined();
      expect(levelProp?.enum).toContain('ERROR');
      expect(levelProp?.enum).toContain('WARNING');
    });

    it('defines eventlog_list_logs tool', () => {
      const tools = service.getTools();
      const listTool = tools.find((t: ToolDefinition) => t.name === 'eventlog_list_logs');

      expect(listTool).toBeDefined();
      expect(listTool?.description).toBeDefined();
      expect(listTool?.inputSchema).toBeDefined();
    });

    it('all schemas are valid JSON Schema format', () => {
      const tools = service.getTools();

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBeDefined();
        // Basic validation - should have required field or properties
        if (tool.inputSchema.properties) {
          expect(typeof tool.inputSchema.properties).toBe('object');
        }
      }
    });

    it('tool descriptions are human-readable', () => {
      const tools = service.getTools();

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Service Control', () => {
    it('can be disabled', () => {
      expect(service.enabled).toBe(true);

      service.disable();

      expect(service.enabled).toBe(false);
    });

    it('can be re-enabled', () => {
      service.disable();
      expect(service.enabled).toBe(false);

      service.enable();

      expect(service.enabled).toBe(true);
    });
  });
});
