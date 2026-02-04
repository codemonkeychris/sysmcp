/**
 * Structured Logger Implementation
 * Provides JSON-formatted logging with PII filtering and multiple output targets
 */

import fs from 'fs';
import path from 'path';
import { Logger, LogEntry, LogLevel, LoggerFactoryOptions } from './types';
import { formatLogEntry, shouldLog } from './formatters';

/**
 * Queue for async file writes to prevent blocking
 */
class WriteQueue {
  private queue: string[] = [];
  private writing = false;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  add(entry: string): void {
    this.queue.push(entry);
    this.processQueue();
  }

  private processQueue(): void {
    if (this.writing || this.queue.length === 0) {
      return;
    }

    this.writing = true;
    const entries = this.queue.splice(0);

    setImmediate(() => {
      fs.appendFile(
        this.filePath,
        entries.map((e) => e + '\n').join(''),
        (err) => {
          this.writing = false;
          if (err) {
            console.error(`Failed to write to log file: ${err.message}`);
          }
          if (this.queue.length > 0) {
            this.processQueue();
          }
        }
      );
    });
  }
}

/**
 * Structured logger implementation
 */
class StructuredLogger implements Logger {
  private configuredLevel: LogLevel;
  private service: string;
  private writeQueue?: WriteQueue;
  private parentContext?: Record<string, unknown>;

  constructor(
    configuredLevel: LogLevel,
    service: string,
    logFile?: string,
    parentContext?: Record<string, unknown>
  ) {
    this.configuredLevel = configuredLevel;
    this.service = service;
    this.parentContext = parentContext;

    if (logFile) {
      // Ensure directory exists
      const dir = path.dirname(logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.writeQueue = new WriteQueue(logFile);
    }
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Check if this level should be logged
    if (!shouldLog(this.configuredLevel, level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      context: context ? { ...this.parentContext, ...context } : this.parentContext,
    };

    // Handle errors specially to include stack trace in debug mode
    if (level === 'error' && context instanceof Error) {
      entry.stack = this.configuredLevel === 'debug' ? context.stack : undefined;
    }

    const formatted = formatLogEntry(entry);

    // Output to stdout
    console.log(formatted);

    // Output to file if configured
    if (this.writeQueue) {
      this.writeQueue.add(formatted);
    }
  }

  error(message: string, context?: Record<string, unknown> | Error): void {
    const ctx = context instanceof Error ? { error: context.message } : context;
    this.log('error', message, ctx);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  child(serviceName: string): Logger {
    return new StructuredLogger(
      this.configuredLevel,
      serviceName,
      undefined,
      this.parentContext
    );
  }
}

/**
 * Create a logger instance with the given configuration
 */
export function createLogger(options: LoggerFactoryOptions): Logger {
  return new StructuredLogger(options.level, options.service, options.logFile);
}

/**
 * Create a logger from application configuration
 */
export function createLoggerFromConfig(
  service: string,
  logLevel: LogLevel,
  logFile?: string
): Logger {
  return createLogger({
    level: logLevel,
    service,
    logFile,
  });
}

export { Logger, LogEntry, LogContext } from './types';
