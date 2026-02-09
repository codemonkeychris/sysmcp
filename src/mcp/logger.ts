/**
 * MCP Logger
 *
 * Structured logging for MCP operations with context tracking
 */

/**
 * Log level enumeration
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log entry interface
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string | number | null;
  method?: string;
  duration?: number;
  serviceName?: string;
  context?: Record<string, unknown>;
  error?: {
    code?: number;
    message: string;
    stack?: string;
  };
}

/**
 * MCP Logger
 *
 * Provides structured logging for all MCP operations
 */
export class McpLogger {
  private logLevel: LogLevel = LogLevel.INFO;
  private listeners: Array<(entry: LogEntry) => void> = [];

  constructor(
    private pino?: {
      debug: (msg: string, obj?: unknown) => void;
      info: (msg: string, obj?: unknown) => void;
      warn: (msg: string, obj?: unknown) => void;
      error: (msg: string, obj?: unknown) => void;
    }
  ) {}

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Subscribe to log entries
   */
  subscribe(listener: (entry: LogEntry) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Unsubscribe from log entries
   */
  unsubscribe(listener: (entry: LogEntry) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Log initialization
   */
  logInitialize(clientInfo: {
    name: string;
    version: string;
  }): void {
    this.log(LogLevel.INFO, 'MCP Server initialized', {
      context: {
        clientName: clientInfo.name,
        clientVersion: clientInfo.version,
      },
    });
  }

  /**
   * Log tool discovery (tools/list)
   */
  logToolList(
    requestId: string | number | null,
    toolCount: number,
    duration: number
  ): void {
    this.log(LogLevel.INFO, 'Tools list requested', {
      requestId,
      method: 'tools/list',
      duration,
      context: { toolCount },
    });
  }

  /**
   * Log tool execution
   */
  logToolCall(
    requestId: string | number | null,
    toolName: string,
    duration: number,
    success: boolean,
    resultSummary?: string
  ): void {
    this.log(LogLevel.INFO, `Tool executed: ${toolName}`, {
      requestId,
      method: 'tools/call',
      serviceName: toolName.split('_')[0],
      duration,
      context: {
        toolName,
        success,
        resultSummary,
      },
    });
  }

  /**
   * Log error
   */
  logError(
    message: string,
    error: unknown,
    requestId?: string | number | null,
    method?: string
  ): void {
    const errorInfo = this.extractErrorInfo(error);

    this.log(LogLevel.ERROR, message, {
      requestId,
      method,
      error: errorInfo,
    });
  }

  /**
   * Log validation error
   */
  logValidationError(
    toolName: string,
    requestId: string | number | null,
    validationErrors: Array<{ field?: string; message: string }>
  ): void {
    this.log(LogLevel.WARN, `Validation failed for tool: ${toolName}`, {
      requestId,
      method: 'tools/call',
      serviceName: toolName,
      context: {
        validationErrors,
      },
    });
  }

  /**
   * Log debug information
   */
  logDebug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, { context });
  }

  /**
   * Log with full context
   */
  private log(level: LogLevel, message: string, options: Partial<LogEntry> = {}): void {
    // Check if we should log at this level
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...options,
    };

    // Send to pino logger if available
    if (this.pino) {
      const levelKey = level as keyof typeof this.pino;
      const logFn = this.pino[levelKey] || this.pino.info;
      const logObj: Record<string, unknown> = {};
      
      if (entry.requestId !== undefined) logObj.requestId = entry.requestId;
      if (entry.method !== undefined) logObj.method = entry.method;
      if (entry.duration !== undefined) logObj.duration = entry.duration;
      if (entry.serviceName !== undefined) logObj.serviceName = entry.serviceName;
      if (entry.context !== undefined) logObj.context = entry.context;
      if (entry.error !== undefined) logObj.error = entry.error;

      logFn(message, logObj);
    }

    // Notify subscribers
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        // Silently ignore listener errors to prevent cascading failures
      }
    });
  }

  /**
   * Check if message should be logged at this level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.logLevel);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  /**
   * Extract error information from unknown error
   */
  private extractErrorInfo(err: unknown): LogEntry['error'] {
    if (err instanceof Error) {
      return {
        message: err.message,
        stack: err.stack,
        code: (err as any).code,
      };
    }

    if (typeof err === 'string') {
      return {
        message: err,
      };
    }

    if (
      typeof err === 'object' &&
      err !== null
    ) {
      const errObj = err as Record<string, unknown>;
      const code = typeof errObj.code === 'number' ? errObj.code : undefined;
      const message =
        typeof errObj.message === 'string' ? errObj.message : 'Unknown error';
      return {
        code,
        message,
      };
    }

    return {
      message: 'Unknown error',
    };
  }
}

/**
 * Global logger instance
 */
let globalLogger = new McpLogger();

/**
 * Get global logger instance
 */
export function getLogger(): McpLogger {
  return globalLogger;
}

/**
 * Set global logger instance
 */
export function setLogger(logger: McpLogger): void {
  globalLogger = logger;
}

/**
 * Initialize logger with pino
 */
export function initializeLogger(
  pino?: McpLogger['pino']
): McpLogger {
  const logger = new McpLogger(pino);
  globalLogger = logger;
  return logger;
}
