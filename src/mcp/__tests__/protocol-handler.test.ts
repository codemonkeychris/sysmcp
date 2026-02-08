/**
 * Protocol Handler Tests
 *
 * Tests for JSON-RPC 2.0 message parsing, routing, and response formatting
 */

import { ProtocolHandler, JSON_RPC_ERRORS } from '../protocol-handler';
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
}

/**
 * Test suite
 */
describe('ProtocolHandler', () => {
  let handler: ProtocolHandler;
  let mockOutput: MockWritable;

  beforeEach(() => {
    mockOutput = new MockWritable();
  });

  /**
   * Parse tests
   */
  describe('Parsing', () => {
    it('parses valid JSON-RPC request', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test_method',
          params: { key: 'value' },
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      let receivedParams: unknown;

      handler.registerHandler('test_method', async (params) => {
        receivedParams = params;
        return { success: true };
      });

      handler.start();

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedParams).toEqual({ key: 'value' });
    });

    it('parses valid JSON-RPC notification', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notify_method',
          params: { data: 'test' },
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      let receivedParams: unknown;

      handler.registerHandler('notify_method', async (params) => {
        receivedParams = params;
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedParams).toEqual({ data: 'test' });
      // Notifications should not produce responses
      expect(mockOutput.output.length).toBe(0);
    });

    it('returns parse error for invalid JSON', async () => {
      const mockInput = new MockReadable(['{invalid json}']);

      handler = new ProtocolHandler(mockInput, mockOutput);
      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockOutput.output.length).toBeGreaterThan(0);
      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error.code).toBe(JSON_RPC_ERRORS.PARSE_ERROR);
      expect(response.id).toBeNull();
    });

    it('returns invalid request for missing jsonrpc field', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error.code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
    });

    it('returns invalid request for non-2.0 version', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '1.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error.code).toBe(JSON_RPC_ERRORS.INVALID_REQUEST);
    });
  });

  /**
   * Message routing tests
   */
  describe('Message Routing', () => {
    it('routes messages to registered handlers', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'handler1',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      let handler1Called = false;

      handler.registerHandler('handler1', async () => {
        handler1Called = true;
        return { ok: true };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handler1Called).toBe(true);
    });

    it('returns method not found for unknown method', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'unknown_method',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);
      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error.code).toBe(JSON_RPC_ERRORS.METHOD_NOT_FOUND);
      expect(response.id).toBe(1);
    });

    it('includes request ID in response', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 'abc-123',
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { ok: true };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.id).toBe('abc-123');
    });
  });

  /**
   * Output format tests
   */
  describe('Output Format', () => {
    it('formats responses as valid JSON-RPC', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { result: 'data' };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect('result' in response || 'error' in response).toBe(true);
    });

    it('terminates output with newline', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { ok: true };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockOutput.output[0]).toMatch(/\n$/);
    });

    it('includes all required fields in response', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { data: 'value' };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response).toHaveProperty('jsonrpc');
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('result');
    });
  });

  /**
   * State management tests
   */
  describe('State Management', () => {
    it('handles multiple requests sequentially', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 2,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { ok: true };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(mockOutput.output.length).toBe(2);

      const response1 = JSON.parse(mockOutput.output[0]);
      const response2 = JSON.parse(mockOutput.output[1]);

      expect(response1.id).toBe(1);
      expect(response2.id).toBe(2);
    });

    it('matches response to original request', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          params: { id: 1 },
          id: 'req-1',
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async (params) => {
        return { originalId: (params as any)?.id };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.id).toBe('req-1');
      expect(response.result.originalId).toBe(1);
    });
  });

  /**
   * Handler registration tests
   */
  describe('Handler Registration', () => {
    it('registers multiple handlers', () => {
      handler = new ProtocolHandler(new MockReadable([]), mockOutput);

      handler.registerHandler('method1', async () => ({ ok: true }));
      handler.registerHandler('method2', async () => ({ ok: true }));

      expect(() => {
        handler.registerHandler('method1', async () => ({ ok: true }));
      }).not.toThrow();
    });

    it('throws on invalid method name', () => {
      handler = new ProtocolHandler(new MockReadable([]), mockOutput);

      expect(() => {
        handler.registerHandler('', async () => ({ ok: true }));
      }).toThrow();
    });

    it('allows handler to return any value', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        return { complex: { nested: { value: [1, 2, 3] } } };
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.result).toEqual({
        complex: { nested: { value: [1, 2, 3] } },
      });
    });
  });

  /**
   * Error handling in handlers
   */
  describe('Handler Errors', () => {
    it('catches handler errors and sends error response', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        throw new Error('Test error');
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(JSON_RPC_ERRORS.INTERNAL_ERROR);
      expect(response.id).toBe(1);
    });

    it('handles non-Error exceptions', async () => {
      const mockInput = new MockReadable([
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'test',
          id: 1,
        }),
      ]);

      handler = new ProtocolHandler(mockInput, mockOutput);

      handler.registerHandler('test', async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      });

      handler.start();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const response = JSON.parse(mockOutput.output[0]);
      expect(response.error).toBeDefined();
      expect(response.id).toBe(1);
    });
  });
});
