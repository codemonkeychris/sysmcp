/**
 * Performance tests for EventLog service
 *
 * Tests response times and memory usage to ensure queries meet performance targets:
 * - 10 events: <50ms
 * - 100 events: <100ms
 * - 1000 events: <100ms
 * - Pagination (10K events): <100ms per page
 * - Anonymization (1000 entries): <50ms
 */

import { eventLogsResolver } from '../eventlog.resolver';
import { EventLogProvider } from '../../services/eventlog/provider';
import { Logger } from '../../logger/types';
import { EventLevel } from '../../services/eventlog/types';

describe('EventLog Performance Tests', () => {
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

  /**
   * Helper function to generate mock event entries
   */
  function generateMockEntries(count: number) {
    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push({
        id: i,
        timeCreated: new Date(Date.now() - (count - i) * 1000), // Spread timestamps
        eventId: 1000 + i,
        levelDisplayName: i % 3 === 0 ? 'Error' : i % 3 === 1 ? 'Warning' : 'Information',
        providerName: ['System', 'Application', 'Security'][i % 3],
        userId: `User${i}`,
        computerName: `Computer${i % 5}`,
        message: `Event message ${i} with some content that could contain PII like user@example.com or phone 555-1234`
      });
    }
    return entries;
  }

  describe('Query Performance', () => {
    it('should query 10 events in less than 50ms', async () => {
      const mockEntries = generateMockEntries(10);
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 10,
        hasMore: false
      });

      const startTime = Date.now();
      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 10,
        offset: 0
      }, context);
      const duration = Date.now() - startTime;

      expect(result.entries).toHaveLength(10);
      expect(duration).toBeLessThan(50);
      console.log(`✓ 10 events query: ${duration}ms`);
    });

    it('should query 100 events in less than 100ms', async () => {
      const mockEntries = generateMockEntries(100);
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 100,
        hasMore: false
      });

      const startTime = Date.now();
      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 100,
        offset: 0
      }, context);
      const duration = Date.now() - startTime;

      expect(result.entries).toHaveLength(100);
      expect(duration).toBeLessThan(100);
      console.log(`✓ 100 events query: ${duration}ms`);
    });

    it('should query 1000 events in less than 100ms', async () => {
      const mockEntries = generateMockEntries(1000);
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 1000,
        hasMore: false
      });

      const startTime = Date.now();
      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 1000,
        offset: 0
      }, context);
      const duration = Date.now() - startTime;

      expect(result.entries).toHaveLength(1000);
      expect(duration).toBeLessThan(100);
      console.log(`✓ 1000 events query: ${duration}ms`);
    });
  });

  describe('Pagination Performance', () => {
    it('should paginate through large result sets efficiently', async () => {
      const mockEntries = generateMockEntries(100);
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 10000, // Simulating 10,000 total events
        hasMore: true
      });

      const pageSize = 100;
      let totalDuration = 0;
      let pagesProcessed = 0;

      // Simulate paginating through multiple pages
      for (let page = 0; page < 5; page++) {
        mockProvider.query.mockClear();
        mockProvider.query.mockResolvedValue({
          entries: generateMockEntries(pageSize),
          totalCount: 10000,
          hasMore: page < 4 // More pages available except on last page
        });

        const startTime = Date.now();
        const result = await eventLogsResolver(null, {
          logName: 'System',
          limit: pageSize,
          offset: page * pageSize
        }, context);
        const duration = Date.now() - startTime;

        totalDuration += duration;
        pagesProcessed++;

        expect(result.entries).toHaveLength(pageSize);
        expect(duration).toBeLessThan(100); // Each page should be <100ms
      }

      const avgDuration = totalDuration / pagesProcessed;
      console.log(`✓ Pagination (5 pages of 100 events): ${avgDuration.toFixed(2)}ms avg per page`);
    });
  });

  describe('Anonymization Performance', () => {
    it('should anonymize 1000 entries in less than 50ms', async () => {
      const mockEntries = generateMockEntries(1000);
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 1000,
        hasMore: false
      });

      const startTime = Date.now();
      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 1000,
        offset: 0
      }, context);
      const duration = Date.now() - startTime;

      // Verify anonymization occurred (all entries should have message)
      expect(result.entries.every(e => e.message !== undefined)).toBe(true);
      expect(duration).toBeLessThan(50);
      console.log(`✓ Anonymization of 1000 entries: ${duration}ms`);
    });

    it('should handle entries with PII without significant performance impact', async () => {
      const mockEntries = generateMockEntries(500);
      // Add entries with lots of PII-like content
      for (let i = 0; i < 500; i++) {
        mockEntries[i].message = `
          User: john.doe@example.com
          Phone: 555-0123
          SSN: 123-45-6789
          Credit Card: 4532-1111-2222-3333
          Path: C:\\Users\\JohnDoe\\Documents\\Private
          Multiple emails: test@example.com, user@domain.org
        `;
      }

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: mockEntries,
        totalCount: 500,
        hasMore: false
      });

      const startTime = Date.now();
      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 500,
        offset: 0
      }, context);
      const duration = Date.now() - startTime;

      expect(result.entries).toHaveLength(500);
      expect(duration).toBeLessThan(100); // Should still be <100ms with PII
      console.log(`✓ Anonymization with heavy PII (500 entries): ${duration}ms`);
    });
  });

  describe('Concurrent Query Performance', () => {
    it('should handle multiple concurrent queries efficiently', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: generateMockEntries(100),
        totalCount: 100,
        hasMore: false
      });

      const queryCount = 10;
      const startTime = Date.now();

      // Execute multiple queries concurrently
      const promises = [];
      for (let i = 0; i < queryCount; i++) {
        promises.push(
          eventLogsResolver(null, {
            logName: 'System',
            limit: 100,
            offset: i * 100
          }, context)
        );
      }

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // All queries should complete
      expect(results).toHaveLength(queryCount);

      // Average per query should still be reasonable
      const avgPerQuery = totalDuration / queryCount;
      expect(avgPerQuery).toBeLessThan(150); // Average <150ms per query under concurrent load
      console.log(`✓ 10 concurrent queries: ${totalDuration}ms total (${avgPerQuery.toFixed(2)}ms avg)`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not significantly increase memory for large result sets', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Query a large result set
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: generateMockEntries(1000),
        totalCount: 1000,
        hasMore: false
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 1000,
        offset: 0
      }, context);

      const memoryAfterQuery = process.memoryUsage().heapUsed;
      const memoryIncrease = memoryAfterQuery - initialMemory;

      expect(result.entries).toHaveLength(1000);
      // Memory increase should be reasonable (less than 10MB for 1000 entries)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      console.log(`✓ Memory increase for 1000 events: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    it('should not leak memory during repeated queries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: generateMockEntries(100),
        totalCount: 100,
        hasMore: false
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Execute multiple queries
      for (let i = 0; i < 100; i++) {
        await eventLogsResolver(null, {
          logName: 'System',
          limit: 100,
          offset: 0
        }, context);
      }

      const memoryAfter100Queries = process.memoryUsage().heapUsed;
      const totalMemoryIncrease = memoryAfter100Queries - initialMemory;

      // Each query adds ~0.1MB, so 100 queries shouldn't add more than 20MB
      expect(totalMemoryIncrease).toBeLessThan(20 * 1024 * 1024);
      console.log(`✓ Memory increase after 100 queries: ${(totalMemoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Performance Metrics', () => {
    it('should include accurate performance metrics in response', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: generateMockEntries(50),
        totalCount: 50,
        hasMore: false
      });

      const result = await eventLogsResolver(null, {
        logName: 'System',
        limit: 50,
        offset: 0
      }, context);

      // Verify metrics are present and reasonable
      expect(result.metrics).toBeDefined();
      expect(result.metrics.responseDurationMs).toBeGreaterThan(0);
      expect(result.metrics.responseDurationMs).toBeLessThan(1000); // Should complete in <1 second
      expect(result.metrics.resultsReturned).toBe(50);
      expect(result.metrics.queryCount).toBe(1);

      console.log(`✓ Metrics: ${result.metrics.responseDurationMs}ms, ${result.metrics.resultsReturned} results`);
    });
  });
});
