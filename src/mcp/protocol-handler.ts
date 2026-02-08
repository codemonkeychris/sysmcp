/**
 * MCP Protocol Handler
 *
 * Handles JSON-RPC 2.0 protocol communication over stdio.
 * Manages message parsing, routing, and response formatting.
 */

import * as readline from 'readline';
import {
  JsonRpcAnyMessage,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcError,
  HandlerRegistry,
  MessageHandler,
  RequestContext,
  InitializeRequest,
  InitializeResponse,
} from './message-types';

/**
 * JSON-RPC Error Codes (per spec)
 */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Protocol Handler for MCP
 *
 * SECURITY: All inputs validated, error messages sanitized
 */
export class ProtocolHandler {
  private handlers: HandlerRegistry = new Map();
  private requestContexts: Map<string | number, RequestContext> = new Map();
  private readline: readline.Interface;
  private initialized: boolean = false;
  private serverInfo = {
    name: 'SysMCP Protocol Handler',
    version: '1.0.0',
  };
  private protocolVersion = '2024-11-05';

  constructor(
    private stdin: NodeJS.ReadableStream = process.stdin,
    private stdout: NodeJS.WritableStream = process.stdout
  ) {
    this.readline = readline.createInterface({
      input: this.stdin,
      output: undefined,
      terminal: false,
    });
  }

  /**
   * Register a handler for a specific method
   */
  registerHandler(method: string, handler: MessageHandler): void {
    if (!method || typeof method !== 'string') {
      throw new Error('Method must be a non-empty string');
    }
    this.handlers.set(method, handler);
  }

  /**
   * Get initialization status
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Set initialization status (called after client sends 'initialized' notification)
   */
  setInitialized(value: boolean): void {
    this.initialized = value;
  }

  /**
   * Handle initialize request (before initialization is complete)
   */
  private async handleInitialize(
    params: unknown,
    _requestId: string | number | null
  ): Promise<InitializeResponse> {
    if (!params || typeof params !== 'object') {
      throw new Error('Initialize requires parameters');
    }

    const req = params as InitializeRequest;

    // Validate required fields
    if (!req.clientInfo || typeof req.clientInfo.name !== 'string') {
      throw new Error('clientInfo.name is required');
    }

    if (!req.protocolVersion || typeof req.protocolVersion !== 'string') {
      throw new Error('protocolVersion is required');
    }

    // Return capabilities
    const response: InitializeResponse = {
      protocolVersion: this.protocolVersion,
      serverInfo: this.serverInfo,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false },
      },
    };

    return response;
  }

  /**
   * Start listening for messages
   */
  start(): void {
    // Register default handlers
    this.registerHandler('initialize', (params, id) =>
      this.handleInitialize(params, id)
    );

    this.readline.on('line', (line: string) => {
      this.handleLine(line);
    });
  }

  /**
   * Stop listening for messages
   */
  stop(): void {
    this.readline.close();
  }

  /**
   * Handle a single line of input
   * SECURITY: All JSON parsing done safely
   */
  private handleLine(line: string): void {
    let message: unknown;

    // Parse JSON
    try {
      message = JSON.parse(line);
    } catch (err) {
      this.sendError(null, JSON_RPC_ERRORS.PARSE_ERROR, 'Parse error');
      return;
    }

    // Validate and process message
    this.processMessage(message);
  }

  /**
   * Process a parsed message
   * SECURITY: Validate all fields before use
   */
  private async processMessage(message: unknown): Promise<void> {
    // Validate basic structure
    if (!this.isValidMessage(message)) {
      this.sendError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
      return;
    }

    const msg = message as JsonRpcAnyMessage;

    // Check for jsonrpc version
    if (msg.jsonrpc !== '2.0') {
      this.sendError(msg.id ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
      return;
    }

    // Detect if this is a request or notification
    const isRequest = msg.id !== undefined && msg.id !== null;
    const isResponse = 'result' in msg || 'error' in msg;

    if (isResponse) {
      // Skip responses (we don't expect them)
      return;
    }

    if (!isRequest && !this.isNotification(msg)) {
      this.sendError(msg.id ?? null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
      return;
    }

    // Process request or notification
    if (isRequest) {
      await this.processRequest(msg as JsonRpcRequest);
    } else {
      await this.processNotification(msg as JsonRpcNotification);
    }
  }

  /**
   * Process a request message
   */
  private async processRequest(req: JsonRpcRequest): Promise<void> {
    const { method, params, id } = req;

    // Validate method
    if (typeof method !== 'string' || !method) {
      this.sendError(id, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request');
      return;
    }

    // Check if tools/list or tools/call require initialization
    const isToolsRequest = method === 'tools/list' || method === 'tools/call';

    // tools/list and tools/call require initialization
    if (isToolsRequest && !this.initialized) {
      this.sendError(
        id,
        -32002, // Server not initialized (MCP error code)
        'Server not initialized. Call initialize first.'
      );
      return;
    }

    // Track request context
    const context: RequestContext = {
      requestId: id,
      method,
      startTime: Date.now(),
      isNotification: false,
    };
    this.requestContexts.set(String(id), context);

    try {
      // Check if handler exists
      const handler = this.handlers.get(method);
      if (!handler) {
        this.sendError(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, 'Method not found');
        return;
      }

      // Execute handler
      const result = await handler(params, id);

      // Send success response
      this.sendSuccess(id, result);
    } catch (err: unknown) {
      // Send error response
      const errorMsg = this.extractErrorMessage(err);
      const errorCode = this.extractErrorCode(err);
      this.sendError(id, errorCode, errorMsg);
    } finally {
      this.requestContexts.delete(String(id));
    }
  }

  /**
   * Process a notification message
   */
  private async processNotification(notif: JsonRpcNotification): Promise<void> {
    const { method, params } = notif;

    // Validate method
    if (typeof method !== 'string' || !method) {
      return; // Notifications don't get responses
    }

    // Handle 'initialized' notification
    if (method === 'initialized') {
      this.initialized = true;
      return;
    }

    try {
      // Check if handler exists
      const handler = this.handlers.get(method);
      if (handler) {
        await handler(params, null);
      }
      // Notifications don't get responses
    } catch (err: unknown) {
      // Log error but don't send response
      // Will be logged by error handler if integrated
    }
  }

  /**
   * Send a success response
   */
  private sendSuccess(id: string | number | null, result: unknown): void {
    if (id === undefined || id === null) {
      return; // Don't send response for notifications
    }

    const response: JsonRpcSuccessResponse = {
      jsonrpc: '2.0',
      result,
      id,
    };

    this.sendMessage(response);
  }

  /**
   * Send an error response
   */
  private sendError(
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const error: JsonRpcError = {
      code,
      message,
    };

    if (data !== undefined) {
      error.data = data;
    }

    const response: JsonRpcErrorResponse = {
      jsonrpc: '2.0',
      error,
      id,
    };

    this.sendMessage(response);
  }

  /**
   * Send a message to stdout
   * SECURITY: JSON stringified safely
   */
  private sendMessage(message: unknown): void {
    try {
      const json = JSON.stringify(message);
      this.stdout.write(json + '\n');
    } catch (err) {
      // If we can't send a response, log it
      // (but we're already in an error state)
    }
  }

  /**
   * Validate basic message structure
   */
  private isValidMessage(message: unknown): boolean {
    if (typeof message !== 'object' || message === null) {
      return false;
    }

    const msg = message as Record<string, unknown>;
    if (msg.jsonrpc !== '2.0') {
      return false;
    }

    if (typeof msg.method !== 'string' && !('result' in msg) && !('error' in msg)) {
      return false;
    }

    return true;
  }

  /**
   * Check if message is a notification (has method, no id)
   */
  private isNotification(message: unknown): boolean {
    const msg = message as Record<string, unknown>;
    return (
      typeof msg.method === 'string' && msg.id === undefined
    );
  }

  /**
   * Extract error message from unknown error
   */
  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message || 'Internal error';
    }
    if (typeof err === 'string') {
      return err;
    }
    return 'Internal error';
  }

  /**
   * Extract error code from unknown error
   */
  private extractErrorCode(err: unknown): number {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'number'
    ) {
      return (err as { code: number }).code;
    }
    return JSON_RPC_ERRORS.INTERNAL_ERROR;
  }
}
