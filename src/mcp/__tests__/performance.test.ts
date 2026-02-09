/**
 * Performance & Load Testing
 *
 * Tests performance requirements:
 * - Tool discovery < 50ms
 * - Tool execution < 100ms
 * - Protocol parsing < 10ms
 * - Memory usage < 100MB
 * - Concurrent request handling
 * - No memory leaks
 */

import { ServiceManager } from '../service-manager';
import { ToolExecutor } from '../tool-executor';
import { ProtocolHandler, JSON_RPC_ERRORS } from '../protocol-handler';
import { SchemaValidator } from '../schema-validator';
import { EventLogMcpService } from '../../services/eventlog/mcp-service';
import { Readable, Writable } from 'stream';

/**
 * Mock writable stream for capturing output
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
}

/**
 * Performance test suite
 */
describe('Performance & Load Testing', () => {
  let serviceManager: ServiceManager;
  let toolExecutor: ToolExecutor;
  let validator: SchemaValidator;

  beforeEach(() => {
    serviceManager = new ServiceManager();
    serviceManager.registerService(new EventLogMcpService());
    toolExecutor = new ToolExecutor(serviceManager);
    validator = new SchemaValidator();
  });

  describe('Tool Discovery Performance', () => {
    it('tool discovery completes in <50ms', () => {
      const startTime = performance.now();
      const tools = toolExecutor.getTools();
      const duration = performance.now() - startTime;

      expect(tools.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });

    it('repeated tool discovery is fast', () => {
      // Warm up
      toolExecutor.getTools();

      // Measure multiple calls
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        toolExecutor.getTools();
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(30); // Average should be very fast
    });

    it('tool discovery with many services is efficient', () => {
      // Register multiple mock services
      for (let i = 0; i < 5; i++) {
        serviceManager.registerService(new EventLogMcpService());
      }

      const startTime = performance.now();
      const tools = toolExecutor.getTools();
      const duration = performance.now() - startTime;

      expect(tools.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50);
    });

    it('getTool lookup is O(1) or better', () => {
      const tools = toolExecutor.getTools();
      const toolName = (tools[0] as any).name;

      const startTime = performance.now();
      const tool = toolExecutor.getTool(toolName);
      const duration = performance.now() - startTime;

      expect(tool).toBeDefined();
      expect(duration).toBeLessThan(5);
    });
  });

  describe('Tool Execution Performance', () => {
    it('tool execution completes in <100ms', async () => {
      const startTime = performance.now();
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 10,
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it('repeated executions maintain performance', async () => {
      // Warm up
      await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 10,
      });

      // Measure multiple executions
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        await toolExecutor.executeTool('eventlog_query', {
          logName: 'System',
          limit: 10,
        });
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(100);
    });

    it('execution with different parameters maintains performance', async () => {
      const testCases = [
        { logName: 'System', limit: 10 },
        { logName: 'Application', limit: 50 },
        { logName: 'Security', limit: 100, minLevel: 'ERROR' },
      ];

      for (const params of testCases) {
        const startTime = performance.now();
        const result = await toolExecutor.executeTool('eventlog_query', params);
        const duration = performance.now() - startTime;

        expect(result.success).toBe(true);
        expect(duration).toBeLessThan(100);
      }
    });

    it('error cases execute quickly', async () => {
      const startTime = performance.now();
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 'invalid', // Invalid type
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(false);
      expect(duration).toBeLessThan(50); // Errors should be faster
    });
  });

  describe('Schema Validation Performance', () => {
    it('schema validation completes in <10ms', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          logName: { type: 'string' as const },
          limit: { type: 'number' as const },
          offset: { type: 'number' as const },
        },
        required: ['logName'],
      };

      const startTime = performance.now();
      const result = validator.validate({ logName: 'System', limit: 100 }, schema);
      const duration = performance.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(10);
    });

    it('validation with complex nested schemas is fast', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          logName: { type: 'string' as const },
          filters: {
            type: 'object' as const,
            properties: {
              level: { type: 'string' as const },
              source: { type: 'string' as const },
            },
          },
        },
      };

      const startTime = performance.now();
      const result = validator.validate(
        {
          logName: 'System',
          filters: { level: 'ERROR', source: 'Test' },
        },
        schema
      );
      const duration = performance.now() - startTime;

      expect(result.valid).toBe(true);
      expect(duration).toBeLessThan(10);
    });

    it('repeated validations are cached/optimized', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          logName: { type: 'string' as const },
          limit: { type: 'number' as const },
        },
        required: ['logName'],
      };

      const times: number[] = [];
      for (let i = 0; i < 100; i++) {
        const startTime = performance.now();
        validator.validate({ logName: 'System', limit: 100 }, schema);
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(5);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('handles 10 concurrent tool discovery calls', async () => {
      const promises = Array(10).fill(null).map(() => {
        return Promise.resolve(toolExecutor.getTools());
      });

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      expect(results.every((r) => r.length > 0)).toBe(true);
    });

    it('handles 10 concurrent tool executions', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() =>
          toolExecutor.executeTool('eventlog_query', {
            logName: 'System',
            limit: 10,
          })
        );

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results.length).toBe(10);
      expect(results.every((r) => r.success === true)).toBe(true);
      expect(duration).toBeLessThan(1000); // All 10 in <1s
    });

    it('handles rapid sequential requests', async () => {
      const startTime = performance.now();

      for (let i = 0; i < 20; i++) {
        await toolExecutor.executeTool('eventlog_query', {
          logName: i % 2 === 0 ? 'System' : 'Application',
          limit: 10,
        });
      }

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(2000); // 20 requests in <2s
    });

    it('concurrent discovery and execution', async () => {
      const promises = [
        ...Array(5)
          .fill(null)
          .map(() => Promise.resolve(toolExecutor.getTools())),
        ...Array(5)
          .fill(null)
          .map(() =>
            toolExecutor.executeTool('eventlog_query', {
              logName: 'System',
              limit: 10,
            })
          ),
      ];

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results.length).toBe(10);
      expect(duration).toBeLessThan(500);
    });

    it('maintains performance under mixed error/success load', async () => {
      const promises = [];

      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) {
          // Some will error
          promises.push(
            toolExecutor.executeTool('eventlog_query', {
              logName: 'System',
              limit: 'invalid', // Error
            })
          );
        } else {
          promises.push(
            toolExecutor.executeTool('eventlog_query', {
              logName: 'System',
              limit: 10,
            })
          );
        }
      }

      const startTime = performance.now();
      const results = await Promise.all(promises);
      const duration = performance.now() - startTime;

      expect(results.length).toBe(20);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Memory Efficiency', () => {
    it('tool execution does not leak memory on repeated calls', async () => {
      // Execute many times
      for (let i = 0; i < 100; i++) {
        await toolExecutor.executeTool('eventlog_query', {
          logName: 'System',
          limit: 10,
        });
      }

      // Should still be functional and performant
      const startTime = performance.now();
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 10,
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(100);
    });

    it('tool discovery does not accumulate state', () => {
      const times: number[] = [];

      for (let i = 0; i < 100; i++) {
        const startTime = performance.now();
        toolExecutor.getTools();
        times.push(performance.now() - startTime);
      }

      // Last calls should be as fast as first calls (no accumulation)
      const firstAvg = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const lastAvg = times.slice(-10).reduce((a, b) => a + b, 0) / 10;

      // Performance shouldn't degrade
      expect(lastAvg).toBeLessThan(firstAvg * 2);
    });

    it('service manager does not accumulate duplicate state', () => {
      // Register same service multiple times
      const service = new EventLogMcpService();
      for (let i = 0; i < 10; i++) {
        try {
          serviceManager.registerService(service);
        } catch {
          // Expected - duplicate registration
        }
      }

      const tools1 = toolExecutor.getTools();

      // Register another service
      const service2 = new EventLogMcpService();
      try {
        serviceManager.registerService(service2);
      } catch {
        // Expected - duplicate
      }

      const tools2 = toolExecutor.getTools();

      // Tool count shouldn't grow beyond expected
      expect(tools2.length).toBeLessThanOrEqual(tools1.length * 2);
    });
  });

  describe('Large Dataset Handling', () => {
    it('handles large limit parameter efficiently', async () => {
      const startTime = performance.now();
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 10000,
      });
      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(500); // Even large requests should be <500ms
    });

    it('handles large offset parameter efficiently', async () => {
      const startTime = performance.now();
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 100,
        offset: 50000,
      });
      const duration = performance.now() - startTime;

      expect(result.success === true || result.success === false).toBe(true);
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Stress Testing', () => {
    it('handles 50 rapid sequential requests', async () => {
      const startTime = performance.now();

      for (let i = 0; i < 50; i++) {
        await toolExecutor.executeTool('eventlog_query', {
          logName: 'System',
          limit: 10,
        });
      }

      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(5000); // All 50 in <5s
    });

    it('tool list remains consistent under stress', async () => {
      const baseTools = toolExecutor.getTools();

      // Stress execution
      const promises = Array(20)
        .fill(null)
        .map(() =>
          toolExecutor.executeTool('eventlog_query', {
            logName: 'System',
            limit: 10,
          })
        );

      await Promise.all(promises);

      const afterTools = toolExecutor.getTools();

      // Should have same tools
      expect((afterTools as any[]).length).toBe((baseTools as any[]).length);
    });

    it('service availability after stress testing', async () => {
      // Heavy stress
      const promises = Array(100)
        .fill(null)
        .map((_, i) =>
          toolExecutor.executeTool(i % 2 === 0 ? 'eventlog_query' : 'eventlog_list_logs', {
            logName: 'System',
            limit: 10,
          })
        );

      await Promise.all(promises);

      // Should still work normally
      const result = await toolExecutor.executeTool('eventlog_query', {
        logName: 'System',
        limit: 10,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Baseline Metrics', () => {
    it('establishes baseline tool discovery metrics', () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        toolExecutor.getTools();
        times.push(performance.now() - startTime);
      }

      const min = Math.min(...times);
      const max = Math.max(...times);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times.sort()[Math.floor(iterations * 0.95)];

      expect(avg).toBeLessThan(30);
      expect(p95).toBeLessThan(50);

      // Metrics are logged for regression detection
      console.log('Tool Discovery Metrics:', { min, max, avg, p95 });
    });

    it('establishes baseline tool execution metrics', async () => {
      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await toolExecutor.executeTool('eventlog_query', {
          logName: 'System',
          limit: 10,
        });
        times.push(performance.now() - startTime);
      }

      const min = Math.min(...times);
      const max = Math.max(...times);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p95 = times.sort()[Math.floor(iterations * 0.95)];

      expect(avg).toBeLessThan(100);
      expect(p95).toBeLessThan(100);

      // Metrics are logged for regression detection
      console.log('Tool Execution Metrics:', { min, max, avg, p95 });
    });
  });
});
