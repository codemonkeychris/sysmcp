/**
 * MCP Logger Tests
 *
 * Tests for structured logging with context tracking
 */

import {
  McpLogger,
  LogLevel,
  getLogger,
  setLogger,
  initializeLogger,
} from '../logger';

describe('McpLogger', () => {
  let logger: McpLogger;
  let loggedEntries: Array<{ message: string; level: LogLevel }> = [];

  beforeEach(() => {
    logger = new McpLogger();
    loggedEntries = [];
    logger.subscribe((entry) => {
      loggedEntries.push({ message: entry.message, level: entry.level });
    });
  });

  describe('Initialization Logging', () => {
    it('logs initialization with client info', () => {
      logger.logInitialize({
        name: 'TestClient',
        version: '1.0.0',
      });

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toContain('initialized');
      expect(loggedEntries[0].level).toBe(LogLevel.INFO);
    });

    it('logs client name in context', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logInitialize({
        name: 'MyClient',
        version: '2.0.0',
      });

      expect(entryDetails[0].context?.clientName).toBe('MyClient');
      expect(entryDetails[0].context?.clientVersion).toBe('2.0.0');
    });
  });

  describe('Tool Discovery Logging', () => {
    it('logs tools/list request', () => {
      logger.logToolList(1, 5, 42);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toContain('Tools list');
      expect(loggedEntries[0].level).toBe(LogLevel.INFO);
    });

    it('logs tool count', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolList(1, 10, 50);

      expect(entryDetails[0].context?.toolCount).toBe(10);
    });

    it('logs request ID', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolList('req-123', 3, 25);

      expect(entryDetails[0].requestId).toBe('req-123');
      expect(entryDetails[0].method).toBe('tools/list');
    });

    it('logs execution duration', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolList(1, 5, 75);

      expect(entryDetails[0].duration).toBe(75);
    });
  });

  describe('Tool Execution Logging', () => {
    it('logs tool execution', () => {
      logger.logToolCall(1, 'eventlog_query', 100, true);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].message).toContain('Tool executed');
      expect(loggedEntries[0].level).toBe(LogLevel.INFO);
    });

    it('includes tool name in context', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolCall(1, 'eventlog_query', 100, true);

      expect(entryDetails[0].context?.toolName).toBe('eventlog_query');
      expect(entryDetails[0].context?.success).toBe(true);
    });

    it('includes result summary', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolCall(
        1,
        'eventlog_query',
        100,
        true,
        '5 events returned'
      );

      expect(entryDetails[0].context?.resultSummary).toBe('5 events returned');
    });

    it('includes request ID and method', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logToolCall('req-456', 'eventlog_query', 100, true);

      expect(entryDetails[0].requestId).toBe('req-456');
      expect(entryDetails[0].method).toBe('tools/call');
    });
  });

  describe('Error Logging', () => {
    it('logs error with message', () => {
      const error = new Error('Test error');
      logger.logError('Operation failed', error);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].level).toBe(LogLevel.ERROR);
      expect(loggedEntries[0].message).toContain('Operation failed');
    });

    it('includes error code', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      const error = new Error('Test');
      (error as any).code = -32002;
      logger2.logError('Failed', error);

      expect(entryDetails[0].error?.code).toBe(-32002);
    });

    it('includes error stack trace', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      const error = new Error('Test error');
      logger2.logError('Failed', error);

      expect(entryDetails[0].error?.stack).toBeDefined();
      expect(entryDetails[0].error?.stack).toContain('Test error');
    });

    it('includes request ID and method', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logError('Failed', new Error('Test'), 'req-789', 'tools/call');

      expect(entryDetails[0].requestId).toBe('req-789');
      expect(entryDetails[0].method).toBe('tools/call');
    });

    it('handles string errors', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logError('Failed', 'String error message');

      expect(entryDetails[0].error?.message).toBe('String error message');
    });

    it('handles unknown error types', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logError('Failed', { unknown: 'object' });

      expect(entryDetails[0].error?.message).toBe('Unknown error');
    });
  });

  describe('Validation Error Logging', () => {
    it('logs validation error', () => {
      logger.logValidationError('eventlog_query', 1, [
        { field: 'logName', message: 'Required' },
      ]);

      expect(loggedEntries).toHaveLength(1);
      expect(loggedEntries[0].level).toBe(LogLevel.WARN);
      expect(loggedEntries[0].message).toContain('Validation failed');
    });

    it('includes validation errors', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      const errors = [
        { field: 'logName', message: 'Required' },
        { field: 'limit', message: 'Must be positive' },
      ];
      logger2.logValidationError('eventlog_query', 1, errors);

      expect(entryDetails[0].context?.validationErrors).toEqual(errors);
    });

    it('includes tool name and request ID', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logValidationError('eventlog_query', 'req-111', [
        { message: 'Error' },
      ]);

      expect(entryDetails[0].serviceName).toBe('eventlog_query');
      expect(entryDetails[0].requestId).toBe('req-111');
    });
  });

  describe('Log Levels', () => {
    it('respects configured log level', () => {
      const logger2 = new McpLogger();
      const entries: any[] = [];
      logger2.subscribe((entry) => entries.push(entry));

      logger2.setLogLevel(LogLevel.ERROR);
      logger2.logDebug('Debug message');
      logger2.logValidationError('tool', 1, []);
      logger2.logError('Error message', new Error('test'));

      // Should only have error, not debug or warn
      expect(entries).toHaveLength(1);
      expect(entries[0].level).toBe(LogLevel.ERROR);
    });

    it('logs INFO and above when set to INFO', () => {
      const logger2 = new McpLogger();
      const entries: any[] = [];
      logger2.subscribe((entry) => entries.push(entry));

      logger2.setLogLevel(LogLevel.INFO);
      logger2.logDebug('Debug message');
      logger2.logToolList(1, 5, 10);
      logger2.logError('Error message', new Error('test'));

      // Should have INFO and ERROR, not DEBUG
      expect(entries.length).toBe(2);
      expect(entries.map((e) => e.level)).toContain(LogLevel.INFO);
      expect(entries.map((e) => e.level)).toContain(LogLevel.ERROR);
    });

    it('logs all levels when set to DEBUG', () => {
      const logger2 = new McpLogger();
      const entries: any[] = [];
      logger2.subscribe((entry) => entries.push(entry));

      logger2.setLogLevel(LogLevel.DEBUG);
      logger2.logDebug('Debug message');
      logger2.logToolList(1, 5, 10);
      logger2.logValidationError('tool', 1, []);
      logger2.logError('Error message', new Error('test'));

      expect(entries.length).toBe(4);
    });
  });

  describe('Logging Timestamp', () => {
    it('includes timestamp in log entries', () => {
      const entryDetails: any[] = [];
      const logger2 = new McpLogger();
      logger2.setLogLevel(LogLevel.DEBUG); // Need to enable debug logging
      logger2.subscribe((entry) => entryDetails.push(entry));

      logger2.logDebug('Test message');

      expect(entryDetails[0].timestamp).toBeDefined();
      // Should be ISO 8601 format
      expect(new Date(entryDetails[0].timestamp)).not.toBeNull();
    });
  });

  describe('Subscriber Management', () => {
    it('subscribes to log entries', () => {
      const logger2 = new McpLogger();
      logger2.setLogLevel(LogLevel.DEBUG); // Enable debug logging
      let callCount = 0;

      logger2.subscribe(() => {
        callCount++;
      });

      logger2.logDebug('Message 1');
      logger2.logDebug('Message 2');

      expect(callCount).toBe(2);
    });

    it('unsubscribes from log entries', () => {
      const logger2 = new McpLogger();
      logger2.setLogLevel(LogLevel.DEBUG); // Enable debug logging
      let callCount = 0;

      const listener = () => {
        callCount++;
      };

      logger2.subscribe(listener);
      logger2.logDebug('Message 1');

      logger2.unsubscribe(listener);
      logger2.logDebug('Message 2');

      expect(callCount).toBe(1);
    });

    it('handles listener errors gracefully', () => {
      const logger2 = new McpLogger();
      logger2.setLogLevel(LogLevel.DEBUG);
      logger2.subscribe(() => {
        throw new Error('Listener error');
      });

      // Should not throw
      expect(() => logger2.logDebug('Message')).not.toThrow();
    });
  });

  describe('Global Logger Functions', () => {
    it('getLogger returns global instance', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
    });

    it('setLogger updates global instance', () => {
      const newLogger = new McpLogger();
      setLogger(newLogger);

      expect(getLogger()).toBe(newLogger);
    });

    it('initializeLogger creates and sets global instance', () => {
      const mockPino = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const logger = initializeLogger(mockPino);

      expect(logger).toBe(getLogger());
      expect(logger).toBeInstanceOf(McpLogger);
    });
  });

  describe('Pino Integration', () => {
    it('logs to pino when available', () => {
      const mockPino = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const logger = new McpLogger(mockPino);
      logger.setLogLevel(LogLevel.DEBUG);
      logger.logDebug('Test message');

      expect(mockPino.debug).toHaveBeenCalledWith('Test message', expect.any(Object));
    });

    it('logs validation error to pino', () => {
      const mockPino = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const logger = new McpLogger(mockPino);
      logger.logValidationError('tool', 1, [
        { field: 'name', message: 'Required' },
      ]);

      expect(mockPino.warn).toHaveBeenCalled();
    });

    it('logs error to pino', () => {
      const mockPino = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      };

      const logger = new McpLogger(mockPino);
      logger.logError('Failed', new Error('Test error'));

      expect(mockPino.error).toHaveBeenCalled();
    });
  });
});
