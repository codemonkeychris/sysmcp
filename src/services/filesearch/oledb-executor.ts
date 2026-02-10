/**
 * OLE DB Executor
 *
 * Executes Windows Search SQL queries via node-adodb OLE DB provider.
 * Handles connection lifecycle, error classification, and timeout.
 */

/**
 * Configuration options for the OLE DB executor
 */
export interface OleDbExecutorOptions {
  /** Query timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Result from an OLE DB query execution
 */
export interface OleDbResult {
  /** Result rows as key-value records */
  rows: Record<string, unknown>[];
  /** Whether the query succeeded */
  success: boolean;
  /** Error message if query failed */
  errorMessage?: string;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/** Windows Search OLE DB connection string */
const CONNECTION_STRING = "Provider=Search.CollatorDSO;Extended Properties='Application=Windows'";

/**
 * OLE DB Executor for Windows Search
 *
 * Wraps node-adodb for executing Windows Search SQL queries.
 * Creates a new connection per query (lightweight <10ms).
 */
export class OleDbExecutor {
  private timeoutMs: number;

  constructor(options?: OleDbExecutorOptions) {
    this.timeoutMs = options?.timeoutMs ?? 30000;
  }

  /**
   * Execute a Windows Search SQL query
   *
   * @param sql - Windows Search SQL query string
   * @returns Query result with rows and execution metadata
   */
  async execute(sql: string): Promise<OleDbResult> {
    const startTime = Date.now();

    try {
      // Dynamic import to allow mocking in tests
      const ADODB = require('node-adodb');
      const connection = ADODB.open(CONNECTION_STRING);

      // Execute with timeout
      const result = await Promise.race([
        connection.query(sql),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), this.timeoutMs)
        )
      ]);

      const executionTimeMs = Date.now() - startTime;
      const rows = Array.isArray(result) ? result : [];

      return {
        rows: rows as Record<string, unknown>[],
        success: true,
        executionTimeMs
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = this.classifyError(error);

      return {
        rows: [],
        success: false,
        errorMessage,
        executionTimeMs
      };
    }
  }

  /**
   * Check if the Windows Search service is available
   *
   * @returns Availability status with descriptive message
   */
  async checkAvailability(): Promise<{ available: boolean; message: string }> {
    try {
      const result = await this.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      if (result.success) {
        return { available: true, message: 'Windows Search service is available' };
      }

      return { available: false, message: result.errorMessage || 'Unknown error' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { available: false, message };
    }
  }

  /**
   * Classify OLE DB errors into user-friendly messages
   * SECURITY: Never expose internal error details to callers
   */
  private classifyError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('timeout') || message.includes('Timeout')) {
      return `Query timed out after ${this.timeoutMs}ms`;
    }

    if (message.includes('0x80040E37') || message.includes('provider')) {
      return 'Windows Search service is not running. Start the WSearch service to enable file search.';
    }

    if (message.includes('0x80070005') || message.includes('Access denied')) {
      return 'Access denied to Windows Search service';
    }

    if (message.includes('0x80040E14') || message.includes('syntax')) {
      // Log internally but return generic message
      return 'Search query failed';
    }

    if (message.includes('ADODB') || message.includes('node-adodb')) {
      return 'Windows Search OLE DB provider is not available';
    }

    return 'Search query failed';
  }
}
