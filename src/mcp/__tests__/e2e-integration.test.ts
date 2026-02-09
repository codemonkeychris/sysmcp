/**
 * End-to-End Integration Tests
 *
 * Tests complete MCP flow: init → list tools → execute tool
 * Tests multi-service routing and error scenarios
 * Tests with simulated MCP client and real JSON-RPC messages
 */

import { ProtocolHandler, JSON_RPC_ERRORS } from '../protocol-handler';
import { ServiceManager } from '../service-manager';
import { ToolExecutor } from '../tool-executor';
import { SchemaValidator } from '../schema-validator';
import { EventLogMcpService } from '../../services/eventlog/mcp-service';
import { Readable, Writable } from 'stream';

/**
 * Mock readable stream for stdin
 */
class MockReadable extends Readable {
  private lines: string[] = [];
  private index: number = 0;

  constructor(lines: string[]) {
    super();
    this.lines = lines;
  }

  _read(): void {
    if (this.index < this.lines.length) {
      this.push(this.lines[this.index] + '\n');
      this.index++;
    } else {
      this.push(null);
    }
  }
}

/**
 * Mock writable stream for stdout
 */
class MockWritable extends Writable {
  public output: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    this.output.push(chunk.toString());
    callback();
  }

  getJsonResponses(): unknown[] {
    return this.output
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((obj) => obj !== null);
  }
}

/**
 * Test suite for End-to-End MCP Integration
 */
describe('E2E MCP Integration', () => {
  let handler: ProtocolHandler;
  let serviceManager: ServiceManager;
  let toolExecutor: ToolExecutor;
  let mockOutput: MockWritable;
  let eventlogService: EventLogMcpService;

  beforeEach(() => {
    mockOutput = new MockWritable();
    handler = new ProtocolHandler(new MockReadable([]), mockOutput);

    // Set up service manager with EventLog service
    serviceManager = new ServiceManager();
    eventlogService = new EventLogMcpService();
    serviceManager.registerService(eventlogService);

    // Set up tool executor
    toolExecutor = new ToolExecutor(serviceManager);

    // Register MCP handlers
    handler.registerHandler('initialize', async (params: any) => {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'SysMCP',
          version: '1.0.0',
        },
      };
    });

    handler.registerHandler('tools/list', async () => {
      const tools = toolExecutor.getTools();
      return { tools };
    });

    handler.registerHandler('tools/call', async (params: any) => {
      return await toolExecutor.executeTool(params.name, params.arguments);
    });
  });

  describe('Full Initialization → List Tools → Execute Tool Flow', () => {
    it('complete initialize → tools/list → tools/call sequence', async () => {
      // Step 1: Initialize
      const initHandler = handler['handlers'].get('initialize');
      const initResponse = await initHandler({
        clientInfo: {
          name: 'Claude',
          version: '1.0',
        },
      });

      expect(initResponse.protocolVersion).toBe('2024-11-05');
      expect(initResponse.capabilities).toBeDefined();
      expect(initResponse.serverInfo).toBeDefined();

      // Step 2: List Tools
      const listHandler = handler['handlers'].get('tools/list');
      const listResponse = await listHandler({});

      expect(listResponse.tools).toBeDefined();
      expect(Array.isArray(listResponse.tools)).toBe(true);
      expect(listResponse.tools.length).toBeGreaterThan(0);

      // Step 3: Execute Tool
      const callHandler = handler['handlers'].get('tools/call');
      const callResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });

      expect(callResponse).toBeDefined();
      expect(callResponse.success).toBe(true);
    });

    it('initializes with client info', async () => {
      const initHandler = handler['handlers'].get('initialize');
      const response = await initHandler({
        clientInfo: {
          name: 'Cursor',
          version: '0.20',
        },
      });

      expect(response.serverInfo.name).toBe('SysMCP');
      expect(response.serverInfo.version).toBe('1.0.0');
    });

    it('lists all available tools from all services', async () => {
      const listHandler = handler['handlers'].get('tools/list');
      const response = await listHandler({});

      expect(response.tools).toBeDefined();
      const tools = response.tools as any[];
      expect(tools.length).toBeGreaterThan(0);

      // Should include EventLog tools
      const eventlogTools = tools.filter((t) => t.name.startsWith('eventlog_'));
      expect(eventlogTools.length).toBeGreaterThan(0);
    });

    it('executes eventlog_query tool successfully', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
          offset: 0,
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('executes eventlog_list_logs tool successfully', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_list_logs',
        arguments: {},
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });
  });

  describe('Tool Discovery & Schema Validation', () => {
    it('returns all tools with complete schema', async () => {
      const tools = toolExecutor.getTools();

      expect(tools.length).toBeGreaterThan(0);

      tools.forEach((tool: any) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });

    it('tool schemas are valid for validation', async () => {
      const tools = toolExecutor.getTools();
      const validator = new SchemaValidator();

      tools.forEach((tool: any) => {
        // Should not throw
        const result = validator.validate({ logName: 'System', limit: 10 }, tool.inputSchema);
        expect(result.valid !== undefined).toBe(true);
      });
    });

    it('eventlog_query has required parameters in schema', async () => {
      const tool = toolExecutor.getTool('eventlog_query');
      expect(tool).toBeDefined();

      const schema = (tool as any).inputSchema;
      expect(schema.properties).toBeDefined();
      expect(schema.properties.logName).toBeDefined();
    });

    it('eventlog_list_logs tool exists in discovery', async () => {
      const tool = toolExecutor.getTool('eventlog_list_logs');
      expect(tool).toBeDefined();
      expect((tool as any).name).toBe('eventlog_list_logs');
    });
  });

  describe('Tool Execution with Various Arguments', () => {
    it('executes eventlog_query with all parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'Application',
          limit: 100,
          offset: 50,
          minLevel: 'WARNING',
          source: 'TestSource',
        },
      });

      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('executes eventlog_query with minimal parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
        },
      });

      expect(response.success).toBe(true);
    });

    it('executes with pagination parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 25,
          offset: 0,
        },
      });

      expect(response.success).toBe(true);
      const data = (response.data as any);
      expect(data.nextOffset !== undefined).toBe(true);
    });

    it('executes with filter parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          minLevel: 'ERROR',
          source: 'Test',
        },
      });

      expect(response.success).toBe(true);
    });
  });

  describe('Response Format Validation', () => {
    it('returns MCP-formatted ToolResult', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });

      // MCP ToolResult format
      expect(response.success).toBeDefined();
      expect(typeof response.success).toBe('boolean');
      expect(response.data).toBeDefined();
    });

    it('includes pagination metadata in response', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
        },
      });

      expect(response.success).toBe(true);
      const data = (response.data as any);
      expect(data.totalCount !== undefined).toBe(true);
      expect(data.entries !== undefined).toBe(true);
    });

    it('response includes proper data structure', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });

      expect(response.success).toBe(true);
      const data = (response.data as any);
      expect(Array.isArray(data.entries)).toBe(true);
      expect(typeof data.totalCount).toBe('number');
    });

    it('includes nextOffset for pagination', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
          offset: 0,
        },
      });

      expect(response.success).toBe(true);
      const data = (response.data as any);
      expect(data.nextOffset !== undefined).toBe(true);
    });
  });

  describe('Error Handling End-to-End', () => {
    it('returns error for unknown tool', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'nonexistent_tool',
        arguments: {},
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('returns error for invalid parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 'invalid', // Should be number
        },
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('returns error for missing required parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call');
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {}, // Missing logName
      });

      expect(response.success).toBe(false);
    });

    it('service remains stable after error', async () => {
      const callHandler = handler['handlers'].get('tools/call');

      // First: error
      const errorResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 'invalid',
        },
      });

      expect(errorResponse.success).toBe(false);

      // Second: should work
      const successResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });

      expect(successResponse.success).toBe(true);
    });
  });

  describe('Multi-Service Routing', () => {
    it('routes tool call to correct service', async () => {
      const tools = toolExecutor.getTools();

      // All eventlog tools should be routable
      const eventlogTools = tools.filter((t: any) => t.name.startsWith('eventlog_'));
      expect(eventlogTools.length).toBeGreaterThan(0);

      // Each should be callable
      const callHandler = handler['handlers'].get('tools/call');
      for (const tool of eventlogTools) {
        const response = await callHandler({
          name: (tool as any).name,
          arguments: (tool as any).name === 'eventlog_list_logs' ? {} : { logName: 'System' },
        });

        expect(response).toBeDefined();
      }
    });

    it('lists tools from all registered services', async () => {
      const listHandler = handler['handlers'].get('tools/list');
      const response = await listHandler({});

      const tools = response.tools as any[];
      const toolNames = tools.map((t) => t.name);

      // Should have at least EventLog tools
      expect(toolNames).toContain('eventlog_query');
      expect(toolNames).toContain('eventlog_list_logs');
    });
  });

  describe('Sequential Tool Execution', () => {
    it('executes multiple tools sequentially', async () => {
      const callHandler = handler['handlers'].get('tools/call');

      // First call
      const response1 = await callHandler({
        name: 'eventlog_list_logs',
        arguments: {},
      });

      expect(response1.success).toBe(true);

      // Second call
      const response2 = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });

      expect(response2.success).toBe(true);

      // Third call
      const response3 = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'Application',
          limit: 5,
        },
      });

      expect(response3.success).toBe(true);
    });

    it('tool list can be called multiple times', async () => {
      const listHandler = handler['handlers'].get('tools/list');

      const response1 = await listHandler({});
      const response2 = await listHandler({});

      expect(response1.tools).toBeDefined();
      expect(response2.tools).toBeDefined();
      expect((response1.tools as any[]).length).toBe((response2.tools as any[]).length);
    });
  });

  describe('Performance Requirements', () => {
    it('tool discovery completes in reasonable time', async () => {
      const startTime = Date.now();
      const tools = toolExecutor.getTools();
      const duration = Date.now() - startTime;

      expect(tools.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // <50ms target
    });

    it('tool execution completes in reasonable time', async () => {
      const callHandler = handler['handlers'].get('tools/call');

      const startTime = Date.now();
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      });
      const duration = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(duration).toBeLessThan(100); // <100ms target
    });
  });
});
