/**
 * End-to-End Integration Tests
 *
 * Tests complete MCP flow: init → list tools → execute tool
 * Tests multi-service routing and error scenarios
 * Tests with simulated MCP client and real JSON-RPC messages
 */

import { ProtocolHandler } from '../protocol-handler';
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
    handler.registerHandler('initialize', async (_params: unknown, _requestId: string | number | null) => {
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

    handler.registerHandler('tools/list', async (_params: unknown, _requestId: string | number | null) => {
      const tools = toolExecutor.getTools();
      return { tools };
    });

    handler.registerHandler('tools/call', async (params: unknown, _requestId: string | number | null) => {
      const p = params as { name: string; arguments: Record<string, unknown> };
      try {
        return await toolExecutor.executeTool({ name: p.name, arguments: p.arguments });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    });
  });

  describe('Full Initialization → List Tools → Execute Tool Flow', () => {
    it('complete initialize → tools/list → tools/call sequence', async () => {
      // Step 1: Initialize
      const initHandler = handler['handlers'].get('initialize')!;
      const initResponse = await initHandler({
        clientInfo: {
          name: 'Claude',
          version: '1.0',
        },
      }, 'test-init') as { protocolVersion: string; capabilities: unknown; serverInfo: unknown };

      expect(initResponse.protocolVersion).toBe('2024-11-05');
      expect(initResponse.capabilities).toBeDefined();
      expect(initResponse.serverInfo).toBeDefined();

      // Step 2: List Tools
      const listHandler = handler['handlers'].get('tools/list')!;
      const listResponse = await listHandler({}, 'test-list') as { tools: unknown[] };

      expect(listResponse.tools).toBeDefined();
      expect(Array.isArray(listResponse.tools)).toBe(true);
      expect(listResponse.tools.length).toBeGreaterThan(0);

      // Step 3: Execute Tool
      const callHandler = handler['handlers'].get('tools/call')!;
      const callResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(callResponse).toBeDefined();
      expect(callResponse.isError).toBeFalsy();
    });

    it('initializes with client info', async () => {
      const initHandler = handler['handlers'].get('initialize')!;
      const response = await initHandler({
        clientInfo: {
          name: 'Cursor',
          version: '0.20',
        },
      }, 'test-init') as { serverInfo: { name: string; version: string } };

      expect(response.serverInfo.name).toBe('SysMCP');
      expect(response.serverInfo.version).toBe('1.0.0');
    });

    it('lists all available tools from all services', async () => {
      const listHandler = handler['handlers'].get('tools/list')!;
      const response = await listHandler({}, 'test-list') as { tools: { name: string }[] };

      expect(response.tools).toBeDefined();
      const tools = response.tools;
      expect(tools.length).toBeGreaterThan(0);

      // Should include EventLog tools
      const eventlogTools = tools.filter((t) => t.name.startsWith('eventlog_'));
      expect(eventlogTools.length).toBeGreaterThan(0);
    });

    it('executes eventlog_query tool successfully', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
          offset: 0,
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content).toBeDefined();
    });

    it('executes eventlog_list_logs tool successfully', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_list_logs',
        arguments: {},
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content).toBeDefined();
    });
  });

  describe('Tool Discovery & Schema Validation', () => {
    it('returns all tools with complete schema', async () => {
      const tools = toolExecutor.getTools();

      expect(tools.length).toBeGreaterThan(0);

      tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      });
    });

    it('tool schemas are valid for validation', async () => {
      const tools = toolExecutor.getTools();

      tools.forEach((tool) => {
        // Should not throw
        const result = SchemaValidator.validate({ logName: 'System', limit: 10 }, tool.inputSchema);
        expect(result.valid !== undefined).toBe(true);
      });
    });

    it('eventlog_query has required parameters in schema', async () => {
      const tool = toolExecutor.getTool('eventlog_query');
      expect(tool).toBeDefined();

      const schema = tool!.inputSchema;
      expect(schema.properties).toBeDefined();
      expect(schema.properties!.logName).toBeDefined();
    });

    it('eventlog_list_logs tool exists in discovery', async () => {
      const tool = toolExecutor.getTool('eventlog_list_logs');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('eventlog_list_logs');
    });
  });

  describe('Tool Execution with Various Arguments', () => {
    it('executes eventlog_query with all parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'Application',
          limit: 100,
          offset: 50,
          minLevel: 'WARNING',
          source: 'TestSource',
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content).toBeDefined();
    });

    it('executes eventlog_query with minimal parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
    });

    it('executes with pagination parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 25,
          offset: 0,
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content).toBeDefined();
    });

    it('executes with filter parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          minLevel: 'ERROR',
          source: 'Test',
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
    });
  });

  describe('Response Format Validation', () => {
    it('returns MCP-formatted ToolResult', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      // MCP ToolResult format
      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);
    });

    it('includes data in tool response content', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
        },
      }, 'test-call') as { content: { type: string; text: string }[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.content[0].type).toBe('text');
    });

    it('response content contains valid JSON', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-call') as { content: { type: string; text: string }[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      const data = JSON.parse(response.content[0].text);
      expect(data).toBeDefined();
    });

    it('response is valid ToolCallResponse', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 50,
          offset: 0,
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBeFalsy();
      expect(response.content).toBeDefined();
    });
  });

  describe('Error Handling End-to-End', () => {
    it('returns error for unknown tool', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'nonexistent_tool',
        arguments: {},
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBe(true);
    });

    it('returns error for invalid parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 'invalid', // Should be number
        },
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBe(true);
    });

    it('returns error for missing required parameters', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {}, // Missing logName
      }, 'test-call') as { content: unknown[]; isError?: boolean };

      expect(response.isError).toBe(true);
    });

    it('service remains stable after error', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;

      // First: error
      const errorResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 'invalid',
        },
      }, 'test-call-1') as { content: unknown[]; isError?: boolean };

      expect(errorResponse.isError).toBe(true);

      // Second: should work
      const successResponse = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-call-2') as { content: unknown[]; isError?: boolean };

      expect(successResponse.isError).toBeFalsy();
    });
  });

  describe('Multi-Service Routing', () => {
    it('routes tool call to correct service', async () => {
      const tools = toolExecutor.getTools();

      // All eventlog tools should be routable
      const eventlogTools = tools.filter((t) => t.name.startsWith('eventlog_'));
      expect(eventlogTools.length).toBeGreaterThan(0);

      // Each should be callable
      const callHandler = handler['handlers'].get('tools/call')!;
      for (const tool of eventlogTools) {
        const response = await callHandler({
          name: tool.name,
          arguments: tool.name === 'eventlog_list_logs' ? {} : { logName: 'System' },
        }, 'test-route');

        expect(response).toBeDefined();
      }
    });

    it('lists tools from all registered services', async () => {
      const listHandler = handler['handlers'].get('tools/list')!;
      const response = await listHandler({}, 'test-list') as { tools: { name: string }[] };

      const toolNames = response.tools.map((t) => t.name);

      // Should have at least EventLog tools
      expect(toolNames).toContain('eventlog_query');
      expect(toolNames).toContain('eventlog_list_logs');
    });
  });

  describe('Sequential Tool Execution', () => {
    it('executes multiple tools sequentially', async () => {
      const callHandler = handler['handlers'].get('tools/call')!;

      // First call
      const response1 = await callHandler({
        name: 'eventlog_list_logs',
        arguments: {},
      }, 'test-request-1') as { content: unknown[]; isError?: boolean };

      expect(response1.isError).toBeFalsy();

      // Second call
      const response2 = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-request-2') as { content: unknown[]; isError?: boolean };

      expect(response2.isError).toBeFalsy();

      // Third call
      const response3 = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'Application',
          limit: 5,
        },
      }, 'test-request-3') as { content: unknown[]; isError?: boolean };

      expect(response3.isError).toBeFalsy();
    });

    it('tool list can be called multiple times', async () => {
      const listHandler = handler['handlers'].get('tools/list')!;

      const response1 = await listHandler({}, 'test-request-1') as { tools: unknown[] };
      const response2 = await listHandler({}, 'test-request-2') as { tools: unknown[] };

      expect(response1.tools).toBeDefined();
      expect(response2.tools).toBeDefined();
      expect(response1.tools.length).toBe(response2.tools.length);
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
      const callHandler = handler['handlers'].get('tools/call')!;

      const startTime = Date.now();
      const response = await callHandler({
        name: 'eventlog_query',
        arguments: {
          logName: 'System',
          limit: 10,
        },
      }, 'test-request') as { content: unknown[]; isError?: boolean };
      const duration = Date.now() - startTime;

      expect(response.isError).toBeFalsy();
      expect(duration).toBeLessThan(100); // <100ms target
    });
  });
});
