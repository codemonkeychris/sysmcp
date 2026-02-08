/**
 * Tests for EventLog service types
 */

import {
  EventLevel,
  EventLogEntry,
  EventLogQueryParams,
  PageInfo,
  EventLogQueryMetrics,
  EventLogResult
} from '../types';

describe('EventLog Types', () => {
  describe('EventLevel Enum', () => {
    it('should have all required event levels', () => {
      expect(EventLevel.ERROR).toBe('ERROR');
      expect(EventLevel.WARNING).toBe('WARNING');
      expect(EventLevel.INFO).toBe('INFO');
      expect(EventLevel.VERBOSE).toBe('VERBOSE');
      expect(EventLevel.DEBUG).toBe('DEBUG');
    });

    it('should have 5 event level values', () => {
      const levels = Object.values(EventLevel);
      expect(levels).toHaveLength(5);
    });

    it('should allow using enum values', () => {
      const level: EventLevel = EventLevel.ERROR;
      expect(level).toBe('ERROR');
    });
  });

  describe('EventLogEntry Interface', () => {
    it('should allow creating a valid event log entry', () => {
      const entry: EventLogEntry = {
        id: 1,
        timestamp: new Date(),
        level: EventLevel.ERROR,
        source: 'System',
        eventId: 1000,
        username: 'DOMAIN\\user',
        computername: 'COMPUTER',
        message: 'Test event message'
      };

      expect(entry.id).toBe(1);
      expect(entry.level).toBe(EventLevel.ERROR);
      expect(entry.source).toBe('System');
      expect(entry.eventId).toBe(1000);
    });

    it('should allow optional fields', () => {
      const entry: EventLogEntry = {
        id: 1,
        timestamp: new Date(),
        level: EventLevel.INFO,
        source: 'Application',
        eventId: 500,
        message: 'Test message'
      };

      expect(entry.username).toBeUndefined();
      expect(entry.computername).toBeUndefined();
    });

    it('should have all required fields', () => {
      const entry: EventLogEntry = {
        id: 1,
        timestamp: new Date(),
        level: EventLevel.WARNING,
        source: 'Security',
        eventId: 4624,
        message: 'User logon'
      };

      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('level');
      expect(entry).toHaveProperty('source');
      expect(entry).toHaveProperty('eventId');
      expect(entry).toHaveProperty('message');
    });
  });

  describe('EventLogQueryParams Interface', () => {
    it('should allow creating a valid query params object', () => {
      const params: EventLogQueryParams = {
        logName: 'System',
        minLevel: EventLevel.WARNING,
        source: 'EventLog',
        startTime: new Date('2024-01-01'),
        endTime: new Date('2024-01-31'),
        messageContains: 'error',
        offset: 0,
        limit: 100
      };

      expect(params.logName).toBe('System');
      expect(params.offset).toBe(0);
      expect(params.limit).toBe(100);
    });

    it('should allow optional filter fields', () => {
      const params: EventLogQueryParams = {
        logName: 'Application',
        offset: 10,
        limit: 50
      };

      expect(params.minLevel).toBeUndefined();
      expect(params.source).toBeUndefined();
      expect(params.startTime).toBeUndefined();
      expect(params.endTime).toBeUndefined();
      expect(params.messageContains).toBeUndefined();
    });

    it('should require logName, offset, and limit', () => {
      const params: EventLogQueryParams = {
        logName: 'System',
        offset: 0,
        limit: 1000
      };

      expect(params.logName).toBeDefined();
      expect(params.offset).toBeDefined();
      expect(params.limit).toBeDefined();
    });
  });

  describe('PageInfo Interface', () => {
    it('should allow creating pagination metadata', () => {
      const pageInfo: PageInfo = {
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 0,
        endCursor: 99
      };

      expect(pageInfo.hasNextPage).toBe(true);
      expect(pageInfo.hasPreviousPage).toBe(false);
      expect(pageInfo.startCursor).toBe(0);
      expect(pageInfo.endCursor).toBe(99);
    });

    it('should support all cursor positions', () => {
      const firstPage: PageInfo = {
        hasNextPage: true,
        hasPreviousPage: false,
        startCursor: 0,
        endCursor: 49
      };

      expect(firstPage.startCursor).toBe(0);
      expect(firstPage.endCursor).toBe(49);

      const lastPage: PageInfo = {
        hasNextPage: false,
        hasPreviousPage: true,
        startCursor: 950,
        endCursor: 999
      };

      expect(lastPage.startCursor).toBe(950);
      expect(lastPage.endCursor).toBe(999);
    });

    it('should support middle pages', () => {
      const middlePage: PageInfo = {
        hasNextPage: true,
        hasPreviousPage: true,
        startCursor: 100,
        endCursor: 199
      };

      expect(middlePage.hasNextPage).toBe(true);
      expect(middlePage.hasPreviousPage).toBe(true);
    });
  });

  describe('EventLogQueryMetrics Interface', () => {
    it('should allow creating metrics', () => {
      const metrics: EventLogQueryMetrics = {
        queryCount: 5,
        responseDurationMs: 150,
        resultsReturned: 42
      };

      expect(metrics.queryCount).toBe(5);
      expect(metrics.responseDurationMs).toBe(150);
      expect(metrics.resultsReturned).toBe(42);
    });

    it('should support zero values', () => {
      const metrics: EventLogQueryMetrics = {
        queryCount: 0,
        responseDurationMs: 0,
        resultsReturned: 0
      };

      expect(metrics.queryCount).toBe(0);
      expect(metrics.responseDurationMs).toBe(0);
      expect(metrics.resultsReturned).toBe(0);
    });

    it('should support large numbers', () => {
      const metrics: EventLogQueryMetrics = {
        queryCount: 1000000,
        responseDurationMs: 999999,
        resultsReturned: 100000
      };

      expect(metrics.queryCount).toBe(1000000);
      expect(metrics.responseDurationMs).toBe(999999);
      expect(metrics.resultsReturned).toBe(100000);
    });
  });

  describe('EventLogResult Interface', () => {
    it('should allow creating a complete result', () => {
      const now = new Date();
      const result: EventLogResult = {
        entries: [
          {
            id: 1,
            timestamp: now,
            level: EventLevel.ERROR,
            source: 'System',
            eventId: 1000,
            message: 'Error event'
          }
        ],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: 0,
          endCursor: 0
        },
        totalCount: 1,
        metrics: {
          queryCount: 1,
          responseDurationMs: 100,
          resultsReturned: 1
        }
      };

      expect(result.entries).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.metrics.queryCount).toBe(1);
    });

    it('should support empty results', () => {
      const result: EventLogResult = {
        entries: [],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: 0,
          endCursor: 0
        },
        totalCount: 0,
        metrics: {
          queryCount: 0,
          responseDurationMs: 50,
          resultsReturned: 0
        }
      };

      expect(result.entries).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('should support multiple entries', () => {
      const now = new Date();
      const result: EventLogResult = {
        entries: [
          {
            id: 1,
            timestamp: now,
            level: EventLevel.WARNING,
            source: 'System',
            eventId: 100,
            message: 'Warning 1'
          },
          {
            id: 2,
            timestamp: new Date(now.getTime() + 1000),
            level: EventLevel.ERROR,
            source: 'System',
            eventId: 200,
            message: 'Error'
          },
          {
            id: 3,
            timestamp: new Date(now.getTime() + 2000),
            level: EventLevel.INFO,
            source: 'Application',
            eventId: 300,
            message: 'Info'
          }
        ],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: 0,
          endCursor: 2
        },
        totalCount: 500,
        metrics: {
          queryCount: 1,
          responseDurationMs: 200,
          resultsReturned: 3
        }
      };

      expect(result.entries).toHaveLength(3);
      expect(result.totalCount).toBe(500);
      expect(result.pageInfo.hasNextPage).toBe(true);
    });
  });

  describe('Type compatibility', () => {
    it('should allow EventLevel in EventLogEntry', () => {
      const entry: EventLogEntry = {
        id: 1,
        timestamp: new Date(),
        level: EventLevel.ERROR,
        source: 'Test',
        eventId: 1,
        message: 'Test'
      };

      expect([EventLevel.ERROR, EventLevel.WARNING].includes(entry.level)).toBe(true);
    });

    it('should allow EventLogEntry in array', () => {
      const entries: EventLogEntry[] = [
        {
          id: 1,
          timestamp: new Date(),
          level: EventLevel.ERROR,
          source: 'Test1',
          eventId: 1,
          message: 'Test1'
        },
        {
          id: 2,
          timestamp: new Date(),
          level: EventLevel.WARNING,
          source: 'Test2',
          eventId: 2,
          message: 'Test2'
        }
      ];

      expect(entries).toHaveLength(2);
      expect(entries[0].level).toBe(EventLevel.ERROR);
    });
  });
});
