/**
 * Tests for the Structured Logger
 */

import { createLogger, createLoggerFromConfig } from '../index';
import { filterPII, shouldLog } from '../formatters';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Logger: formatters.ts', () => {
  describe('shouldLog', () => {
    it('should log error at error level', () => {
      expect(shouldLog('error', 'error')).toBe(true);
    });

    it('should not log info at error level', () => {
      expect(shouldLog('error', 'info')).toBe(false);
    });

    it('should log warn at warn level', () => {
      expect(shouldLog('warn', 'warn')).toBe(true);
    });

    it('should log error at warn level', () => {
      expect(shouldLog('warn', 'error')).toBe(true);
    });

    it('should log debug at debug level', () => {
      expect(shouldLog('debug', 'debug')).toBe(true);
    });

    it('should log all levels at debug', () => {
      expect(shouldLog('debug', 'error')).toBe(true);
      expect(shouldLog('debug', 'warn')).toBe(true);
      expect(shouldLog('debug', 'info')).toBe(true);
      expect(shouldLog('debug', 'debug')).toBe(true);
    });
  });

  describe('filterPII', () => {
    it('should mask email addresses to show only domain', () => {
      const input = 'User john.doe@example.com contacted us';
      const output = filterPII(input);
      expect(output).toContain('@example.com');
      expect((output as string).includes('john')).toBe(false);
      expect((output as string).includes('doe')).toBe(false);
    });

    it('should mask phone numbers to show last 4 digits', () => {
      const input = 'Call me at 555-123-4567';
      const output = filterPII(input);
      expect(output).toContain('4567');
      expect((output as string).includes('555-123')).toBe(false);
    });

    it('should mask SSN numbers', () => {
      const input = 'SSN is 123-45-6789';
      const output = filterPII(input);
      expect(output).toContain('6789');
      expect((output as string).includes('123-45')).toBe(false);
    });

    it('should mask passwords', () => {
      const input = 'password: "mySecurePass123"';
      const output = filterPII(input);
      expect((output as string).includes('REDACTED')).toBe(true);
      expect((output as string).includes('mySecurePass123')).toBe(false);
    });

    it('should mask tokens', () => {
      const input = 'token = "abc123xyz"';
      const output = filterPII(input);
      expect((output as string).includes('REDACTED')).toBe(true);
      expect((output as string).includes('abc123xyz')).toBe(false);
    });

    it('should mask API keys', () => {
      const input = 'api-key: "sk_live_12345"';
      const output = filterPII(input);
      expect((output as string).includes('REDACTED')).toBe(true);
    });

    it('should handle objects with PII', () => {
      const input = { email: 'test@example.com', name: 'John' };
      const output = filterPII(input) as Record<string, unknown>;
      expect((output.email as string).includes('example.com')).toBe(true);
      expect((output.email as string).includes('test')).toBe(false);
    });

    it('should handle arrays with PII', () => {
      const input = ['user@example.com', '555-123-4567'];
      const output = filterPII(input) as unknown[];
      expect((output[0] as string).includes('@example.com')).toBe(true);
      expect((output[1] as string).includes('4567')).toBe(true);
    });

    it('should return non-string/non-object values unchanged', () => {
      expect(filterPII(123)).toBe(123);
      expect(filterPII(true)).toBe(true);
      expect(filterPII(null)).toBe(null);
      expect(filterPII(undefined)).toBe(undefined);
    });
  });
});

describe('Logger: createLogger', () => {
  let logOutput: string[] = [];

  // Mock console.log
  const originalLog = console.log;
  beforeEach(() => {
    logOutput = [];
    console.log = jest.fn((msg: string) => {
      logOutput.push(msg);
    });
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should create a logger instance', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  it('should log info messages', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });

    logger.info('Test message');

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('Test message');
    expect(entry.service).toBe('test-service');
    expect(entry.timestamp).toBeDefined();
  });

  it('should log error messages', () => {
    const logger = createLogger({
      level: 'error',
      service: 'test-service',
    });

    logger.error('An error occurred');

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.level).toBe('error');
    expect(entry.message).toBe('An error occurred');
  });

  it('should log warn messages', () => {
    const logger = createLogger({
      level: 'warn',
      service: 'test-service',
    });

    logger.warn('A warning');

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.level).toBe('warn');
  });

  it('should log debug messages only if level is debug', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });

    logger.debug('Debug message');

    expect(logOutput.length).toBe(0);
  });

  it('should include context in logs', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });

    logger.info('Test with context', { userId: 123, action: 'login' });

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.context.userId).toBe(123);
    expect(entry.context.action).toBe('login');
  });

  it('should filter PII in context', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });

    logger.info('User signup', { email: 'john@example.com', password: 'secret123' });

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect((entry.context.email as string).includes('@example.com')).toBe(true);
    expect((entry.context.email as string).includes('john')).toBe(false);
    expect(entry.context.password).toContain('REDACTED');
  });

  it('should format timestamp in ISO 8601 format', () => {
    const logger = createLogger({
      level: 'info',
      service: 'test-service',
    });

    logger.info('Test');

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    // ISO 8601 format validation
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should respect log level filtering', () => {
    const logger = createLogger({
      level: 'warn',
      service: 'test-service',
    });

    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    // Should only have warn and error (2 messages)
    expect(logOutput.length).toBe(2);
    const warnEntry = JSON.parse(logOutput[0]);
    const errorEntry = JSON.parse(logOutput[1]);
    expect(warnEntry.level).toBe('warn');
    expect(errorEntry.level).toBe('error');
  });

  it('should create child loggers with same configuration', () => {
    const logger = createLogger({
      level: 'info',
      service: 'parent-service',
    });

    const childLogger = logger.child('child-service');
    childLogger.info('Child log');

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.service).toBe('child-service');
  });

  it('should handle errors in context', () => {
    const logger = createLogger({
      level: 'error',
      service: 'test-service',
    });

    const error = new Error('Something went wrong');
    logger.error('An error occurred', error);

    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.context.error).toBe('Something went wrong');
  });
});

describe('Logger: createLoggerFromConfig', () => {
  const originalLog = console.log;
  let logOutput: string[] = [];

  beforeEach(() => {
    logOutput = [];
    console.log = jest.fn((msg: string) => {
      logOutput.push(msg);
    });
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should create logger from config parameters', () => {
    const logger = createLoggerFromConfig('my-service', 'info', undefined);
    expect(logger).toBeDefined();

    logger.info('Test');
    expect(logOutput.length).toBe(1);
    const entry = JSON.parse(logOutput[0]);
    expect(entry.service).toBe('my-service');
    expect(entry.level).toBe('info');
  });
});

describe('Logger: File Output', () => {
  const originalLog = console.log;

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should write logs to file if logFile option provided', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    const logFile = path.join(tmpDir, 'test.log');

    const logger = createLogger({
      level: 'info',
      service: 'file-test',
      logFile,
    });

    logger.info('Test message');

    // Give async write queue time to process
    setTimeout(() => {
      expect(fs.existsSync(logFile)).toBe(true);
      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('Test message');
      expect(content).toContain('file-test');

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
      done();
    }, 50);
  });

  it('should create log directory if it does not exist', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    const logFile = path.join(tmpDir, 'nested', 'dir', 'test.log');

    const logger = createLogger({
      level: 'info',
      service: 'file-test',
      logFile,
    });

    logger.info('Test message');

    setTimeout(() => {
      expect(fs.existsSync(logFile)).toBe(true);
      fs.rmSync(tmpDir, { recursive: true });
      done();
    }, 50);
  });

  it('should handle multiple log entries asynchronously', (done) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    const logFile = path.join(tmpDir, 'test.log');

    const logger = createLogger({
      level: 'debug',
      service: 'multi-test',
      logFile,
    });

    logger.info('Message 1');
    logger.warn('Message 2');
    logger.error('Message 3');

    setTimeout(() => {
      const content = fs.readFileSync(logFile, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('Message 1');
      expect(lines[1]).toContain('Message 2');
      expect(lines[2]).toContain('Message 3');

      fs.rmSync(tmpDir, { recursive: true });
      done();
    }, 100);
  });
});
