/**
 * Integration Tests for Complete EventLog Query Pipeline
 *
 * End-to-end tests from GraphQL query through provider, anonymization, to response
 */

import { eventLogsResolver } from '../../../graphql/eventlog.resolver';
import { EventLogProvider } from '../provider';
import { Logger } from '../../../logger/types';
import * as fs from 'fs';
import * as path from 'path';

describe('EventLog GraphQL Resolver - Integration Tests', () => {
  let mockLogger: Logger;
  let mockProvider: EventLogProvider;
  let context: any;
  let tempMappingPath: string;

  beforeEach(() => {
    tempMappingPath = path.join(__dirname, 'integration-test-mapping.json');

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
      eventlogProvider: mockProvider,
      eventlogMappingPath: tempMappingPath
    };

    // Clean up temp file
    if (fs.existsSync(tempMappingPath)) {
      fs.unlinkSync(tempMappingPath);
    }
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempMappingPath)) {
      fs.unlinkSync(tempMappingPath);
    }
  });

  describe('Basic Query Pipeline', () => {
    it('should query system log with no filters and return anonymized entries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'System startup',
            timeCreated: new Date('2024-01-15T10:00:00Z'),
            userId: 'SYSTEM',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          },
          {
            id: 2,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1001,
            levelDisplayName: 'Warning',
            message: 'Disk space low on DOMAIN\\user path',
            timeCreated: new Date('2024-01-15T11:00:00Z'),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 2,
        hasMore: false,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.metrics.resultsReturned).toBe(2);

      // Verify anonymization
      expect(result.entries[0].message).toBe('System startup');
      expect(result.entries[1].message).not.toContain('DOMAIN\\user');
      expect(result.entries[1].username).not.toBe('DOMAIN\\user');
    });

    it('should apply pagination correctly', async () => {
      const entries = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        logName: 'System',
        providerName: 'EventLog',
        eventId: 1000 + i,
        levelDisplayName: 'Information',
        message: `Event ${i + 1}`,
        timeCreated: new Date(),
        userId: 'SYSTEM',
        computerName: 'SERVER1',
        executionTimeMs: 50,
        success: true
      }));

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: entries.slice(0, 20),
        totalCount: 50,
        hasMore: true,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 20, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(20);
      expect(result.totalCount).toBe(50);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(false);
      expect(result.pageInfo.startCursor).toBe(0);
      expect(result.pageInfo.endCursor).toBe(19);
    });

    it('should handle second page of results', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, i) => ({
          id: 21 + i,
          logName: 'System',
          providerName: 'EventLog',
          eventId: 1020 + i,
          levelDisplayName: 'Information',
          message: `Event ${21 + i}`,
          timeCreated: new Date(),
          userId: 'SYSTEM',
          computerName: 'SERVER1',
          executionTimeMs: 50,
          success: true
        })),
        totalCount: 50,
        hasMore: true,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 20, offset: 20 },
        context
      );

      expect(result.entries.length).toBe(20);
      expect(result.totalCount).toBe(50);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.hasPreviousPage).toBe(true);
      expect(result.pageInfo.startCursor).toBe(20);
      expect(result.pageInfo.endCursor).toBe(39);
    });
  });

  describe('Filtered Queries', () => {
    it('should apply time range filter and return anonymized results', async () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T12:00:00Z');

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Event in time range',
            timeCreated: new Date('2024-01-15T11:00:00Z'),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        {
          logName: 'System',
          limit: 100,
          offset: 0,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString()
        },
        context
      );

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            startTime,
            endTime
          })
        })
      );

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].username).not.toBe('DOMAIN\\user');
    });

    it('should apply level filter correctly', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Error',
            message: 'Critical error occurred',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0, minLevel: 'ERROR' },
        context
      );

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            level: 'ERROR'
          })
        })
      );

      expect(result.entries.length).toBe(1);
    });

    it('should apply message filter correctly', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Application',
            providerName: 'MyApp',
            eventId: 5000,
            levelDisplayName: 'Information',
            message: 'User DOMAIN\\jsmith performed action',
            timeCreated: new Date(),
            userId: 'DOMAIN\\jsmith',
            computerName: 'WORKSTATION',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'Application', limit: 100, offset: 0, messageContains: 'performed' },
        context
      );

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            messageContains: 'performed'
          })
        })
      );

      expect(result.entries.length).toBe(1);
      // Verify message still matches the filter (even if PII is anonymized)
      expect(result.entries[0].message).toContain('performed');
    });

    it('should apply multiple filters together', async () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T12:00:00Z');

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4624,
            levelDisplayName: 'Information',
            message: 'User DOMAIN\\admin logged in',
            timeCreated: new Date('2024-01-15T11:00:00Z'),
            userId: 'DOMAIN\\admin',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        {
          logName: 'Security',
          limit: 100,
          offset: 0,
          minLevel: 'INFORMATION',
          source: 'EventLog',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          messageContains: 'logged in'
        },
        context
      );

      expect(mockProvider.query).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            level: 'INFORMATION',
            providerId: 'EventLog',
            startTime,
            endTime,
            messageContains: 'logged in'
          })
        })
      );

      expect(result.entries.length).toBe(1);
    });
  });

  describe('Consistency Across Queries', () => {
    it('should produce same anonymization for same data across queries', async () => {
      const testUser = 'DOMAIN\\testuser';
      const testComputer = 'TESTSERVER';

      // First query
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: `User ${testUser} logged in to ${testComputer}`,
            timeCreated: new Date(),
            userId: testUser,
            computerName: testComputer,
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result1 = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      const anonUser1 = result1.entries[0].username;
      const anonComputer1 = result1.entries[0].computername;

      // Second query - clear context but keep mapping file
      context.eventlogAnonymizer = undefined;

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 2,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1001,
            levelDisplayName: 'Information',
            message: `User ${testUser} logged out from ${testComputer}`,
            timeCreated: new Date(),
            userId: testUser,
            computerName: testComputer,
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result2 = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      const anonUser2 = result2.entries[0].username;
      const anonComputer2 = result2.entries[0].computername;

      // Verify consistency
      expect(anonUser2).toBe(anonUser1);
      expect(anonComputer2).toBe(anonComputer1);
    });

    it('should maintain consistency with same PII appearing in different entries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4624,
            levelDisplayName: 'Information',
            message: 'User DOMAIN\\admin logged in',
            timeCreated: new Date(),
            userId: 'DOMAIN\\admin',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          },
          {
            id: 2,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4625,
            levelDisplayName: 'Information',
            message: 'User DOMAIN\\admin failed to log in',
            timeCreated: new Date(),
            userId: 'DOMAIN\\admin',
            computerName: 'SERVER2',
            executionTimeMs: 50,
            success: true
          },
          {
            id: 3,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4634,
            levelDisplayName: 'Information',
            message: 'User DOMAIN\\admin logged out',
            timeCreated: new Date(),
            userId: 'DOMAIN\\admin',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 3,
        hasMore: false,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'Security', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(3);

      // All entries should have same anonymized username
      const username1 = result.entries[0].username;
      const username2 = result.entries[1].username;
      const username3 = result.entries[2].username;

      expect(username1).toBe(username2);
      expect(username2).toBe(username3);

      // Different computers should have different anonymization
      const computer1 = result.entries[0].computername;
      const computer2 = result.entries[1].computername;
      expect(computer1).not.toBe(computer2);
    });
  });

  describe('Error Cases', () => {
    it('should handle invalid date range', async () => {
      const result = eventLogsResolver(
        null,
        {
          logName: 'System',
          limit: 100,
          offset: 0,
          startTime: '2024-01-15T12:00:00Z',
          endTime: '2024-01-15T10:00:00Z' // End before start
        },
        context
      );

      await expect(result).rejects.toThrow('startTime must be <= endTime');
    });

    it('should handle inaccessible log', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(
        new Error('Access denied to Security log')
      );

      const result = eventLogsResolver(
        null,
        { logName: 'Security', limit: 100, offset: 0 },
        context
      );

      await expect(result).rejects.toThrow();
    });

    it('should handle invalid parameters', async () => {
      const result = eventLogsResolver(
        null,
        { logName: 'System', limit: 20000, offset: 0 }, // limit > max
        context
      );

      await expect(result).rejects.toThrow('limit must be between 1 and 1000');
    });

    it('should handle provider failure gracefully', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(
        new Error('Windows API error: The specified log does not exist')
      );

      const result = eventLogsResolver(
        null,
        { logName: 'NonExistent', limit: 100, offset: 0 },
        context
      );

      await expect(result).rejects.toThrow();
    });
  });

  describe('Metrics Collection', () => {
    it('should collect correct metrics', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: Array.from({ length: 25 }, (_, i) => ({
          id: i + 1,
          logName: 'System',
          providerName: 'EventLog',
          eventId: 1000 + i,
          levelDisplayName: 'Information',
          message: `Event ${i + 1}`,
          timeCreated: new Date(),
          userId: 'SYSTEM',
          computerName: 'SERVER1',
          executionTimeMs: 50,
          success: true
        })),
        totalCount: 100,
        hasMore: true,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 25, offset: 0 },
        context
      );

      expect(result.metrics.queryCount).toBe(0);
      expect(result.metrics.resultsReturned).toBe(25);
      expect(result.metrics.responseDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should log successful query with anonymization flag', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'EventLog query completed',
        expect.objectContaining({
          logName: 'System',
          anonymized: true
        })
      );
    });
  });

  describe('Audit Logging', () => {
    it('should log query parameters', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [],
        totalCount: 0,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      await eventLogsResolver(
        null,
        { logName: 'Application', limit: 50, offset: 10 },
        context
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processing eventLogs query',
        expect.objectContaining({
          logName: 'Application'
        })
      );
    });

    it('should log errors with appropriate detail', async () => {
      mockProvider.query = jest.fn().mockRejectedValue(
        new Error('Test error')
      );

      try {
        await eventLogsResolver(
          null,
          { logName: 'System', limit: 100, offset: 0 },
          context
        );
      } catch {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unknown error during EventLog query',
        expect.objectContaining({
          logName: 'System'
        })
      );
    });
  });
});
