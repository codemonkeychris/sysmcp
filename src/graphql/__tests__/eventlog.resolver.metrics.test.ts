/**
 * Tests for EventLog Metrics Integration with GraphQL Resolver
 *
 * Tests that metrics are properly collected and exposed in GraphQL responses.
 */

import { eventLogsResolver } from '../eventlog.resolver';
import { EventLogProvider, EventLogProviderResult } from '../../services/eventlog/provider';
import { EventLogMetricsCollector } from '../../services/eventlog/metrics';
import { Logger } from '../../logger/types';

describe('EventLog GraphQL Resolver - Metrics Integration', () => {
  function mockResult(overrides: Partial<EventLogProviderResult> & { entries: any[]; totalCount: number; hasMore: boolean }): EventLogProviderResult {
    return {
      success: true,
      executionTimeMs: 1,
      queriedAt: new Date(),
      ...overrides
    };
  }

  let mockLogger: Logger;
  let mockProvider: jest.Mocked<EventLogProvider>;
  let metricsCollector: EventLogMetricsCollector;
  let context: any;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => mockLogger)
    };

    metricsCollector = new EventLogMetricsCollector();

    mockProvider = {
      query: jest.fn()
    } as unknown as jest.Mocked<EventLogProvider>;

    context = {
      logger: mockLogger,
      eventlogProvider: mockProvider,
      eventlogMetricsCollector: metricsCollector,
      permissionChecker: { check: jest.fn(() => ({ allowed: true })) },
    };
  });

  describe('Metrics Recording', () => {
    it('should record successful queries in metrics', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          {
            id: 1,
            timeCreated: new Date(),
            levelDisplayName: 'Information',
            providerName: 'System',
            eventId: 100,
            message: 'Test event'
          }
        ],
        totalCount: 1,
        hasMore: false
      }));

      const initialCount = metricsCollector.getTotalQueryCount();
      expect(initialCount).toBe(0);

      await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      const finalCount = metricsCollector.getTotalQueryCount();
      expect(finalCount).toBe(1);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.successfulQueryCount).toBe(1);
      expect(metrics.failedQueryCount).toBe(0);
    });

    it('should record failed queries in metrics', async () => {
      mockProvider.query.mockRejectedValue(new Error('Query failed'));

      const initialCount = metricsCollector.getTotalQueryCount();
      expect(initialCount).toBe(0);

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
      } catch (e) {
        // Expected to fail
      }

      const finalCount = metricsCollector.getTotalQueryCount();
      expect(finalCount).toBe(1);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.failedQueryCount).toBe(1);
      expect(metrics.successfulQueryCount).toBe(0);
    });

    it('should record result count in metrics', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          {
            id: 1,
            timeCreated: new Date(),
            levelDisplayName: 'Information',
            providerName: 'System',
            eventId: 100,
            message: 'Event 1'
          },
          {
            id: 2,
            timeCreated: new Date(),
            levelDisplayName: 'Warning',
            providerName: 'System',
            eventId: 101,
            message: 'Event 2'
          },
          {
            id: 3,
            timeCreated: new Date(),
            levelDisplayName: 'Error',
            providerName: 'System',
            eventId: 102,
            message: 'Event 3'
          }
        ],
        totalCount: 3,
        hasMore: false
      }));

      await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.totalResultsReturned).toBe(3);
    });

    it('should accumulate metrics across multiple queries', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          {
            id: 1,
            timeCreated: new Date(),
            levelDisplayName: 'Information',
            providerName: 'System',
            eventId: 100,
            message: 'Event'
          }
        ],
        totalCount: 1,
        hasMore: false
      }));

      // First query
      await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, context);
      expect(metricsCollector.getTotalQueryCount()).toBe(1);

      // Second query
      await eventLogsResolver(null, { logName: 'Application', offset: 0, limit: 100 }, context);
      expect(metricsCollector.getTotalQueryCount()).toBe(2);

      // Third query
      await eventLogsResolver(null, { logName: 'System', offset: 100, limit: 100 }, context);
      expect(metricsCollector.getTotalQueryCount()).toBe(3);

      const metrics = metricsCollector.getMetrics();
      expect(metrics.successfulQueryCount).toBe(3);
    });
  });

  describe('Metrics in GraphQL Response', () => {
    it('should include metrics in response', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          {
            id: 1,
            timeCreated: new Date(),
            levelDisplayName: 'Information',
            providerName: 'System',
            eventId: 100,
            message: 'Test event'
          }
        ],
        totalCount: 1,
        hasMore: false
      }));

      const result = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        context
      );

      expect(result.metrics).toBeDefined();
      expect(result.metrics.queryCount).toBeDefined();
      expect(result.metrics.responseDurationMs).toBeDefined();
      expect(result.metrics.resultsReturned).toBeDefined();
    });

    it('should reflect cumulative queryCount in response', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [],
        totalCount: 0,
        hasMore: false
      }));

      // First query
      const result1 = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        context
      );
      expect(result1.metrics.queryCount).toBe(1);

      // Second query
      const result2 = await eventLogsResolver(
        null,
        { logName: 'System', offset: 100, limit: 100 },
        context
      );
      expect(result2.metrics.queryCount).toBe(2);

      // Third query
      const result3 = await eventLogsResolver(
        null,
        { logName: 'Application', offset: 0, limit: 100 },
        context
      );
      expect(result3.metrics.queryCount).toBe(3);
    });

    it('should show correct resultsReturned', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          { id: 1, timeCreated: new Date(), levelDisplayName: 'Info', providerName: 'System', eventId: 100, message: 'E1' },
          { id: 2, timeCreated: new Date(), levelDisplayName: 'Info', providerName: 'System', eventId: 101, message: 'E2' }
        ],
        totalCount: 2,
        hasMore: false
      }));

      const result = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        context
      );

      expect(result.metrics.resultsReturned).toBe(2);
    });

    it('should show correct responseDurationMs', async () => {
      mockProvider.query.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(mockResult({
                entries: [],
                totalCount: 0,
                hasMore: false
              }));
            }, 50); // 50ms delay
          })
      );

      const result = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        context
      );

      // responseDurationMs should be at least 50ms
      expect(result.metrics.responseDurationMs).toBeGreaterThanOrEqual(50);
    });

    it('should include empty results in metrics', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [],
        totalCount: 0,
        hasMore: false
      }));

      const result = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        context
      );

      expect(result.metrics.queryCount).toBe(1);
      expect(result.metrics.resultsReturned).toBe(0);
    });

    it('should handle metrics when metricsCollector is not provided', async () => {
      const contextWithoutMetrics = {
        ...context,
        eventlogMetricsCollector: undefined
      };

      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          {
            id: 1,
            timeCreated: new Date(),
            levelDisplayName: 'Information',
            providerName: 'System',
            eventId: 100,
            message: 'Test'
          }
        ],
        totalCount: 1,
        hasMore: false
      }));

      const result = await eventLogsResolver(
        null,
        { logName: 'System', offset: 0, limit: 100 },
        contextWithoutMetrics
      );

      // Should still return metrics, but queryCount should be 0
      expect(result.metrics).toBeDefined();
      expect(result.metrics.queryCount).toBe(0);
      expect(result.metrics.resultsReturned).toBe(1);
    });
  });

  describe('Metrics with Validation Errors', () => {
    it('should record validation errors in metrics', async () => {
      const initialCount = metricsCollector.getTotalQueryCount();

      try {
        await eventLogsResolver(null, { logName: '', offset: 0, limit: 100 }, context);
      } catch {
        // Expected validation error
      }

      // Validation errors are caught and recorded as failed queries
      const finalCount = metricsCollector.getTotalQueryCount();
      expect(finalCount).toBe(initialCount + 1);
    });

    it('should record metrics when provider is missing', async () => {
      const contextWithoutProvider = {
        ...context,
        eventlogProvider: undefined
      };

      const initialCount = metricsCollector.getTotalQueryCount();

      try {
        await eventLogsResolver(null, { logName: 'System', offset: 0, limit: 100 }, contextWithoutProvider);
      } catch {
        // Expected error
      }

      // Provider errors are caught and recorded as failed queries
      const finalCount = metricsCollector.getTotalQueryCount();
      expect(finalCount).toBe(initialCount + 1);
    });
  });

  describe('Metrics Export and Reporting', () => {
    it('should be able to export metrics from integration', async () => {
      mockProvider.query.mockResolvedValue(mockResult({
        entries: [
          { id: 1, timeCreated: new Date(), levelDisplayName: 'Info', providerName: 'System', eventId: 100, message: 'E1' }
        ],
        totalCount: 1,
        hasMore: false
      }));

      // Run a few queries
      for (let i = 0; i < 3; i++) {
        await eventLogsResolver(null, { logName: 'System', offset: i * 100, limit: 100 }, context);
      }

      const report = await metricsCollector.export();

      expect(report.totalQueryCount).toBe(3);
      expect(report.successfulQueryCount).toBe(3);
      expect(report.failedQueryCount).toBe(0);
      expect(report.queriesPerSecond).toBeGreaterThan(0);
      expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
