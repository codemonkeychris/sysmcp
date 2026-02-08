/**
 * Tests for EventLog GraphQL Resolver
 */

import { eventLogsResolver, eventlogResolver } from '../eventlog.resolver';
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

    it('should reject logName that is not a string', async () => {
      await expect(
        eventLogsResolver(null, { logName: null as any, offset: 0, limit: 100 }, context)
      ).rejects.toThrow('logName is required');
    });

    it('should reject limit < 1', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 0, offset: 0 }, context)
      ).rejects.toThrow('limit must be between 1 and 10000');
    });

    it('should reject limit > 10000', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 10001, offset: 0 }, context)
      ).rejects.toThrow('limit must be between 1 and 10000');
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

    it('should accept limit at boundary 10000', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false
      });

      await eventLogsResolver(null, { logName: 'System', limit: 10000, offset: 0 }, context);
      expect(mockProvider.query).toHaveBeenCalled();
    });

    it('should reject negative offset', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', limit: 100, offset: -1 }, context)
      ).rejects.toThrow('offset must be >= 0');
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

    it('should reject invalid endTime', async () => {
      await expect(
        eventLogsResolver(null, { logName: 'System', endTime: 'invalid-date', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('endTime must be a valid');
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
      ).rejects.toThrow('EventLog service unavailable');
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
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Windows API error'));

      await expect(
        eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context)
      ).rejects.toThrow('Failed to query event logs');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log errors with details', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(new Error('Test error'));

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'EventLog query failed',
        expect.objectContaining({
          error: 'Test error',
          logName: 'System',
          durationMs: expect.any(Number)
        })
      );
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
  });

  describe('Resolver export', () => {
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
