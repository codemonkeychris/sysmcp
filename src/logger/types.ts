/**
 * Logger type definitions and interfaces
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Log entry structure for JSON-formatted logs
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, unknown>;
  stack?: string;
}

/**
 * Logger context for child loggers
 */
export interface LogContext {
  service: string;
  parentContext?: Record<string, unknown>;
}

/**
 * Logger interface
 */
export interface Logger {
  error(message: string, context?: Record<string, unknown> | Error): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  child(serviceName: string): Logger;
}

/**
 * Logger factory options
 */
export interface LoggerFactoryOptions {
  level: LogLevel;
  service: string;
  logFile?: string;
}
