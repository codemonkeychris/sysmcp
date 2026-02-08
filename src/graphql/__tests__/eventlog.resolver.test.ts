/**
 * Tests for EventLog GraphQL Resolver
 */

import { eventLogsResolver, eventlogResolver, EventLogGraphQLError, EventLogErrorCode } from '../eventlog.resolver';
import { EventLogProvider } from '../../services/eventlog/provider';
import { Logger } from '../../logger/types';
import { EventLevel } from '../../services/eventlog/types';

describe('EventLog GraphQL Resolver', () => {
  let mockLogger: Logger;
  let mockProvider: EventLogProvider;
  let context: any;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => mockLogger)
    };

    mockProvider = {
      query: jest.fn()
    } as any;

    context = {
      logger: mockLogger,
      eventlogProvider: mockProvider
    };
  });

  describe('Validation', () => {
    it('should reject missing logName', async () => {
      await expect(
        eventLogsResolver(null, { logName: '', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('logName is required');
    });

    it('should return error code MISSING_LOG_NAME for missing logName', async () => {
      try {
        await eventLogsResolver(null, { logName: '', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.MissingLogName);
      }
    });

    it('should reject logName that is not a string', async () => {
      await expect(
        eventLogsResolver(null, { logName: null as any, offset: 0, limit: 100 }, context)
      ).rejects.toThrow('logName is required');
    });

    it('should reject limit < 1', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 0, offset: 0 }, context)
      ).rejects.toThrow('limit must be between 1 and 1000');
    });

    it('should reject limit > 1000', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 1001, offset: 0 }, context)
      ).rejects.toThrow('limit must be between 1 and 1000');
    });

    it('should return error code INVALID_LIMIT for limit > 1000', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', limit: 1001, offset: 0 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidLimit);
        expect(gqlError.extensions?.code).toBe(EventLogErrorCode.InvalidLimit);
      }
    });

    it('should return error code INVALID_LIMIT for limit < 1', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', limit: 0, offset: 0 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidLimit);
      }
    });

    it('should accept limit at boundary 1', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', limit: 1, offset: 0 }, context);
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should accept limit at boundary 1000', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', limit: 1000, offset: 0 }, context);
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should reject negative offset', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 100, offset: -1 }, context)
      ).rejects.toThrow('offset must be >= 0');
    });

    it('should return error code INVALID_OFFSET for negative offset', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', limit: 100, offset: -1 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidOffset);
      }
    });

    it('should accept offset 0', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', limit: 100, offset: 0 }, context);
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should reject invalid startTime', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', startTime: 'invalid-date', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('startTime must be a valid');
    });

    it('should return error code INVALID_START_TIME for invalid startTime', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', startTime: 'invalid-date', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidStartTime);
      }
    });

    it('should reject invalid endTime', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', endTime: 'invalid-date', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('endTime must be a valid');
    });

    it('should return error code INVALID_END_TIME for invalid endTime', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', endTime: 'invalid-date', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidEndTime);
      }
    });

    it('should reject startTime > endTime', async () => {
      await expect(
        eventLogsResolver(null, {
          logName: 'System',
          startTime: '2024-02-02T00:00:00Z',
          endTime: '2024-02-01T00:00:00Z',
          offset: 0,
          limit: 100
        }, context)
      ).rejects.toThrow('startTime must be <= endTime');
    });

    it('should return error code INVALID_DATE_RANGE for startTime > endTime', async () => {
      try {
        await eventLogsResolver(null, {
          logName: 'System',
          startTime: '2024-02-02T00:00:00Z',
          endTime: '2024-02-01T00:00:00Z',
          offset: 0,
          limit: 100
        }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidDateRange);
      }
    });

    it('should accept startTime == endTime', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, {
        logName: 'System',
        startTime: '2024-02-01T00:00:00Z',
        endTime: '2024-02-01T00:00:00Z',
        offset: 0,
        limit: 100
      }, context);
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should reject invalid minLevel', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', minLevel: 'INVALID', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('minLevel must be one of');
    });

    it('should return error code INVALID_EVENT_LEVEL for invalid minLevel', async () => {
      try {
        await eventLogsResolver(null, { logName: 'System', minLevel: 'INVALID', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidEventLevel);
      }
    });

    it('should accept valid minLevel values', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      for (const level of ['ERROR', 'WARNING', 'INFO', 'VERBOSE', 'DEBUG']) {
        mockProvider.query.mockClear();
        await eventLogsResolver(null, {
          logName: 'System',
          minLevel: level,
          offset: 0,
          limit: 100
        }, context);
        expect(mockProvider.query).toHaveBeenCalled();
      }
    });
  });

  describe('Service availability', () => {
    it('should fail if provider not available', async () => {
      context.eventlogProvider = undefined;

      await expect(
        eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('EventLog service not available');
    });

    it('should return error code SERVICE_DISABLED when provider unavailable', async () => {
      context.eventlogProvider = undefined;

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.ServiceDisabled);
        expect(gqlError.extensions?.code).toBe(EventLogErrorCode.ServiceDisabled);
      }
    });
  });

  describe('Successful queries', () => {
    it('should return empty result for no events', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      expect(result).toEqual({
        entries: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: 0,
          endCursor: -1
        },
        totalCount: 0,
        metrics: {
          queryCount: 1,
          responseDurationMs: expect.any(Number),
          resultsReturned: 0
        }
      });
    });

    it('should return event entries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            timeCreated: new Date('2024-02-01T10:00:00Z'),
            levelDisplayName: 'Error',
            providerName: 'System',
            eventId: 1000,
            message: 'Test error'
          }
        ],
        totalCount: 1,
        hasMore: false
      });

      const result = await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        id: 1,
        timestamp: new Date('2024-02-01T10:00:00Z'),
        level: 'ERROR',
        source: 'System',
        eventId: 1000,
        message: 'Test error'
      });
    });

    it('should calculate pagination correctly', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [{ id: 1 }, { id: 2 }, { id: 3 }],
        totalCount: 50,
        hasMore: true
      });

      const result = await eventLogsResolver(null, { logName: 'System', offset: 10, limit: 3 }, context);

      expect(result.pageInfo).toEqual({
        hasNextPage: true,
        hasPreviousPage: true,
        startCursor: 10,
        endCursor: 12
      });
    });

    it('should include metrics in result', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      const result = await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      expect(result.metrics).toEqual({
        queryCount: 1,
        responseDurationMs: expect.any(Number),
        resultsReturned: 0
      });

      expect(result.metrics.responseDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should pass filters to provider', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, {
        logName: 'System',
        minLevel: 'ERROR',
        source: 'Application',
        startTime: '2024-02-01T00:00:00Z',
        endTime: '2024-02-02T00:00:00Z',
        messageContains: 'error',
        offset: 0,
        limit: 100
      }, context);

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          logName: 'System',
          filters: {
            level: 'ERROR',
            providerId: 'Application',
            startTime: new Date('2024-02-01T00:00:00Z'),
            endTime: new Date('2024-02-02T00:00:00Z'),
            messageContains: 'error'
          },
          pagination: {
            limit: 100,
            offset: 0
          }
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle provider errors with generic message', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Generic error'));

      await expect(
        eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('Failed to query event logs');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should return error code WINDOWS_API_ERROR for Windows API errors', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Windows API error HRESULT 0x80070005'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.WindowsApiError);
        expect(gqlError.internalDetails).toContain('Windows API error');
      }
    });

    it('should return error code SERVICE_UNAVAILABLE for service disabled', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Service disabled'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.ServiceUnavailable);
      }
    });

    it('should return error code PERMISSION_DENIED for permission errors', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Permission denied: access denied'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.PermissionDenied);
      }
    });

    it('should return error code ANONYMIZATION_FAILURE for anonymization errors', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Anonymization failed to process'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.AnonymizationFailure);
      }
    });

    it('should return error code UNKNOWN_ERROR for unclassified errors', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Unexpected error that does not match known patterns'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.UnknownError);
      }
    });

    it('should include error code in GraphQL error extensions', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.extensions?.code).toBe(gqlError.code);
        expect(gqlError.extensions?.timestamp).toBeDefined();
      }
    });

    it('should include timestamp in error for debugging', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.timestamp).toBeDefined();
        expect(gqlError.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should log internal error details', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Critical error detail: system code 0x123'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalled();
      const calls = (mockLogger.error as jest.Mock).mock.calls;
      const errorCall = calls.find(c => c[0].includes('error') || c[0].includes('Error'));
      expect(errorCall).toBeDefined();
    });

    it('should log successful queries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [{ id: 1 }],
        totalCount: 1,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'EventLog query completed',
        expect.objectContaining({
          logName: 'System',
          resultCount: 1,
          totalCount: 1,
          durationMs: expect.any(Number)
        })
      );
    });

    it('should not expose system details in error message', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(
        new Error('Windows error code 0x80070005: Access denied at C:\\Windows\\System32')
      );

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        // Message should not contain path or specific error codes
        expect(gqlError.message).not.toContain('C:\\Windows');
        expect(gqlError.message).not.toContain('0x80070005');
        // But internal details should be preserved
        expect(gqlError.internalDetails).toContain('0x80070005');
      }
    });
  });

  describe('Cursor-based pagination', () => {
    it('should accept cursor parameter', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [{ id: 1 }],
        totalCount: 1,
        hasMore: false
      });

      // Create a valid cursor
      const { encodeCursor } = require('../cursor');
      const cursor = encodeCursor({
        logName: 'System',
        eventId: 100,
        timestamp: '2024-02-01T10:00:00Z'
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        cursor,
        offset: 0,
        limit: 100
      }, context);

      expect(result).toBeDefined();
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should reject invalid cursor', async () => {
      try {
        await eventLogsResolver(null, {
          logName: 'System',
          cursor: 'invalid-cursor-not-base64!!!',
          offset: 0,
          limit: 100
        }, context);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(EventLogGraphQLError);
        const gqlError = error as EventLogGraphQLError;
        expect(gqlError.code).toBe(EventLogErrorCode.InvalidCursor);
      }
    });

    it('should generate nextPageCursor when results have more pages', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          { id: 1, timeCreated: new Date('2024-02-01T10:00:00Z'), eventId: 100, providerName: 'System' },
          { id: 2, timeCreated: new Date('2024-02-01T11:00:00Z'), eventId: 101, providerName: 'System' }
        ],
        totalCount: 100,
        hasMore: true
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        offset: 0,
        limit: 100
      }, context);

      expect(result.pageInfo.nextPageCursor).toBeDefined();
      expect(result.pageInfo.nextPageCursor).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64
    });

    it('should not generate nextPageCursor when no more pages', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [{ id: 1 }],
        totalCount: 1,
        hasMore: false
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        offset: 0,
        limit: 100
      }, context);

      expect(result.pageInfo.nextPageCursor).toBeUndefined();
    });

    it('should generate previousPageCursor when offset > 0', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          { id: 1, timeCreated: new Date('2024-02-01T10:00:00Z'), eventId: 100, providerName: 'System' }
        ],
        totalCount: 100,
        hasMore: true
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        offset: 10,
        limit: 100
      }, context);

      expect(result.pageInfo.previousPageCursor).toBeDefined();
      expect(result.pageInfo.previousPageCursor).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64
    });

    it('should not generate previousPageCursor when at beginning', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [{ id: 1 }],
        totalCount: 100,
        hasMore: true
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        offset: 0,
        limit: 100
      }, context);

      expect(result.pageInfo.previousPageCursor).toBeUndefined();
    });

    it('should include nextPageCursor with entry data encoded', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            timeCreated: new Date('2024-02-01T10:00:00Z'),
            eventId: 1000,
            providerName: 'System',
            message: 'Test event'
          }
        ],
        totalCount: 100,
        hasMore: true
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        offset: 0,
        limit: 100
      }, context);

      expect(result.pageInfo.nextPageCursor).toBeDefined();

      // Verify cursor can be decoded
      const { decodeCursor } = require('../cursor');
      const decoded = decodeCursor(result.pageInfo.nextPageCursor!);
      expect(decoded.logName).toBe('System');
      expect(decoded.eventId).toBe(1000);
    });
  });
    it('should export resolver with Query field', () => {
      expect(eventlogResolver).toEqual({
        Query: {
          eventLogs: eventLogsResolver
        }
      });
    });

    it('should export eventLogs resolver function', () => {
      expect(eventlogResolver.Query.eventLogs).toBe(eventLogsResolver);
    });
  });

  describe('Default parameters', () => {
    it('should use default limit of 1000', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', offset: 0 }, context);

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            limit: 1000,
            offset: 0
          }
        })
      );
    });

    it('should use default offset of 0', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', limit: 100 }, context);

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          pagination: {
            limit: 100,
            offset: 0
          }
        })
      );
    });
  });
});
