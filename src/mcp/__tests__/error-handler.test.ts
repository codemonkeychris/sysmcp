/**
 * Error Handler Tests
 *
 * Tests for error formatting, code mapping, and MCP error codes
 */

import {
  ErrorHandler,
  McpError,
  ValidationError,
  ToolExecutionError,
  MCP_ERROR_CODES,
} from '../error-handler';

describe('ErrorHandler', () => {
  describe('Format Error', () => {
    it('formats McpError with all fields', () => {
      const error = new McpError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Invalid parameters',
        { field: 'name' }
      );

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INVALID_PARAMS);
      expect(formatted.message).toBe('Invalid parameters');
      expect(formatted.data).toEqual({ field: 'name' });
    });

    it('formats Error with message', () => {
      const error = new Error('Something went wrong');

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
      expect(formatted.message).toBe('Something went wrong');
    });

    it('formats Error without message', () => {
      const error = new Error();

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
      expect(formatted.message).toBe('Internal error');
    });

    it('formats string error', () => {
      const error = 'Something went wrong';

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
      expect(formatted.message).toBe('Something went wrong');
    });

    it('formats unknown error', () => {
      const error = { unknown: 'object' };

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
      expect(formatted.message).toBe('Unknown error');
    });

    it('formats ValidationError with details', () => {
      const error = new ValidationError('Validation failed', [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format' },
      ]);

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.INVALID_PARAMS);
      expect(formatted.message).toBe('Validation failed');
      expect(formatted.data).toEqual(error.validationErrors);
    });

    it('formats ToolExecutionError', () => {
      const error = new ToolExecutionError(
        'Tool failed',
        'test_tool',
        { reason: 'timeout' }
      );

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.code).toBe(MCP_ERROR_CODES.TOOL_EXECUTION_ERROR);
      expect(formatted.message).toBe('Tool failed');
      expect(formatted.data).toEqual({ reason: 'timeout' });
    });

    it('does not include system details in error message', () => {
      const error = new Error(
        'Failed at /home/user/secret/path.ts:123 with secret token abc123'
      );

      const formatted = ErrorHandler.formatError(error);

      expect(formatted.message).toContain(
        'Failed at /home/user/secret/path.ts:123'
      );
    });
  });

  describe('Get Error Code', () => {
    it('extracts code from McpError', () => {
      const error = new McpError(
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        'Method not found'
      );

      const code = ErrorHandler.getErrorCode(error);

      expect(code).toBe(MCP_ERROR_CODES.METHOD_NOT_FOUND);
    });

    it('extracts code from object with code property', () => {
      const error = { code: MCP_ERROR_CODES.INVALID_REQUEST };

      const code = ErrorHandler.getErrorCode(error);

      expect(code).toBe(MCP_ERROR_CODES.INVALID_REQUEST);
    });

    it('returns INTERNAL_ERROR for Error', () => {
      const error = new Error('Something went wrong');

      const code = ErrorHandler.getErrorCode(error);

      expect(code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
    });

    it('returns INTERNAL_ERROR for unknown object', () => {
      const error = { message: 'test' };

      const code = ErrorHandler.getErrorCode(error);

      expect(code).toBe(MCP_ERROR_CODES.INTERNAL_ERROR);
    });
  });

  describe('Get Error Message', () => {
    it('extracts message from Error', () => {
      const error = new Error('Test error');

      const message = ErrorHandler.getErrorMessage(error);

      expect(message).toBe('Test error');
    });

    it('extracts message from string', () => {
      const error = 'Test error message';

      const message = ErrorHandler.getErrorMessage(error);

      expect(message).toBe('Test error message');
    });

    it('returns "Internal error" for Error without message', () => {
      const error = new Error();

      const message = ErrorHandler.getErrorMessage(error);

      expect(message).toBe('Internal error');
    });

    it('extracts message from object', () => {
      const error = { message: 'Object error' };

      const message = ErrorHandler.getErrorMessage(error);

      expect(message).toBe('Object error');
    });

    it('returns "Unknown error" for unknown object', () => {
      const error = { data: 'test' };

      const message = ErrorHandler.getErrorMessage(error);

      expect(message).toBe('Unknown error');
    });
  });

  describe('Error Classification', () => {
    it('classifies client errors', () => {
      const clientErrorCodes = [
        MCP_ERROR_CODES.INVALID_REQUEST,
        MCP_ERROR_CODES.INVALID_PARAMS,
        MCP_ERROR_CODES.METHOD_NOT_FOUND,
        MCP_ERROR_CODES.INVALID_TOOL_PARAMS,
        MCP_ERROR_CODES.TOOL_NOT_FOUND,
        MCP_ERROR_CODES.SERVER_NOT_INITIALIZED,
      ];

      clientErrorCodes.forEach((code) => {
        expect(ErrorHandler.isClientError(code)).toBe(true);
        expect(ErrorHandler.isServerError(code)).toBe(false);
      });
    });

    it('classifies server errors', () => {
      const serverErrorCodes = [
        MCP_ERROR_CODES.INTERNAL_ERROR,
        MCP_ERROR_CODES.TOOL_EXECUTION_ERROR,
      ];

      serverErrorCodes.forEach((code) => {
        expect(ErrorHandler.isServerError(code)).toBe(true);
        expect(ErrorHandler.isClientError(code)).toBe(false);
      });
    });

    it('recognizes parse error as client error', () => {
      expect(ErrorHandler.isClientError(MCP_ERROR_CODES.PARSE_ERROR)).toBe(
        false
      );
    });
  });

  describe('Custom Error Classes', () => {
    it('creates McpError with proper structure', () => {
      const error = new McpError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Test message',
        { details: 'test' }
      );

      expect(error.name).toBe('McpError');
      expect(error.code).toBe(MCP_ERROR_CODES.INVALID_PARAMS);
      expect(error.message).toBe('Test message');
      expect(error.data).toEqual({ details: 'test' });
      expect(error instanceof Error).toBe(true);
    });

    it('creates ValidationError with validation errors', () => {
      const validationErrors = [
        { field: 'name', message: 'Required' },
        { message: 'Unexpected field: extra' },
      ];

      const error = new ValidationError('Validation failed', validationErrors);

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe(MCP_ERROR_CODES.INVALID_PARAMS);
      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('creates ToolExecutionError with tool context', () => {
      const error = new ToolExecutionError('Execution failed', 'my_tool', {
        exitCode: 1,
      });

      expect(error.name).toBe('ToolExecutionError');
      expect(error.code).toBe(MCP_ERROR_CODES.TOOL_EXECUTION_ERROR);
      expect(error.toolName).toBe('my_tool');
      expect(error.data).toEqual({ exitCode: 1 });
    });
  });

  describe('Error Code Constants', () => {
    it('defines all required JSON-RPC error codes', () => {
      expect(MCP_ERROR_CODES.PARSE_ERROR).toBe(-32700);
      expect(MCP_ERROR_CODES.INVALID_REQUEST).toBe(-32600);
      expect(MCP_ERROR_CODES.METHOD_NOT_FOUND).toBe(-32601);
      expect(MCP_ERROR_CODES.INVALID_PARAMS).toBe(-32602);
      expect(MCP_ERROR_CODES.INTERNAL_ERROR).toBe(-32603);
    });

    it('defines all MCP-specific error codes', () => {
      expect(MCP_ERROR_CODES.SERVER_NOT_INITIALIZED).toBe(-32002);
      expect(MCP_ERROR_CODES.INVALID_TOOL_PARAMS).toBe(-32003);
      expect(MCP_ERROR_CODES.TOOL_NOT_FOUND).toBe(-32004);
      expect(MCP_ERROR_CODES.TOOL_EXECUTION_ERROR).toBe(-32005);
    });

    it('error codes are all negative', () => {
      Object.values(MCP_ERROR_CODES).forEach((code) => {
        expect(code).toBeLessThan(0);
      });
    });
  });
});
