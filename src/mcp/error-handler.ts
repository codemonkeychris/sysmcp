/**
 * MCP Error Handler
 *
 * Handles error formatting, logging, and response generation
 */

import { JsonRpcError } from './message-types';

/**
 * MCP and JSON-RPC Error Codes
 */
export const MCP_ERROR_CODES = {
  // JSON-RPC 2.0 standard error codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // MCP-specific error codes
  SERVER_NOT_INITIALIZED: -32002,
  INVALID_TOOL_PARAMS: -32003,
  TOOL_NOT_FOUND: -32004,
  TOOL_EXECUTION_ERROR: -32005,
} as const;

/**
 * Custom error class for MCP errors
 */
export class McpError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'McpError';
  }
}

/**
 * Validation error with details
 */
export class ValidationError extends McpError {
  constructor(
    message: string,
    public validationErrors: Array<{
      field?: string;
      message: string;
    }> = []
  ) {
    super(MCP_ERROR_CODES.INVALID_PARAMS, message, validationErrors);
    this.name = 'ValidationError';
  }
}

/**
 * Tool execution error
 */
export class ToolExecutionError extends McpError {
  constructor(
    message: string,
    public toolName: string,
    data?: unknown
  ) {
    super(MCP_ERROR_CODES.TOOL_EXECUTION_ERROR, message, data);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Error handler for MCP
 */
export class ErrorHandler {
  /**
   * Format an error as a JSON-RPC error response
   * SECURITY: Error messages are sanitized (no system details)
   */
  static formatError(err: unknown): JsonRpcError {
    if (err instanceof McpError) {
      return {
        code: err.code,
        message: err.message,
        data: err.data,
      };
    }

    if (err instanceof Error) {
      // Don't expose error details to client, only message
      return {
        code: MCP_ERROR_CODES.INTERNAL_ERROR,
        message: err.message || 'Internal error',
      };
    }

    if (typeof err === 'string') {
      return {
        code: MCP_ERROR_CODES.INTERNAL_ERROR,
        message: err,
      };
    }

    return {
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: 'Unknown error',
    };
  }

  /**
   * Get error code from an error
   */
  static getErrorCode(err: unknown): number {
    if (err instanceof McpError) {
      return err.code;
    }

    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'number'
    ) {
      return (err as { code: number }).code;
    }

    return MCP_ERROR_CODES.INTERNAL_ERROR;
  }

  /**
   * Get error message from an error
   */
  static getErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message || 'Internal error';
    }

    if (typeof err === 'string') {
      return err;
    }

    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === 'string') {
        return msg;
      }
    }

    return 'Unknown error';
  }

  /**
   * Check if error is a client error (4xx equivalent)
   */
  static isClientError(code: number): boolean {
    return (
      code === MCP_ERROR_CODES.INVALID_REQUEST ||
      code === MCP_ERROR_CODES.INVALID_PARAMS ||
      code === MCP_ERROR_CODES.METHOD_NOT_FOUND ||
      code === MCP_ERROR_CODES.INVALID_TOOL_PARAMS ||
      code === MCP_ERROR_CODES.TOOL_NOT_FOUND ||
      code === MCP_ERROR_CODES.SERVER_NOT_INITIALIZED
    );
  }

  /**
   * Check if error is a server error (5xx equivalent)
   */
  static isServerError(code: number): boolean {
    return (
      code === MCP_ERROR_CODES.INTERNAL_ERROR ||
      code === MCP_ERROR_CODES.TOOL_EXECUTION_ERROR
    );
  }
}
