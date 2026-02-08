/**
 * EventLog Metrics Collector Tests
 *
 * Comprehensive test suite for metrics collection.
 * Tests: recording, retrieval, reset, export, and performance.
 */

import { EventLogMetricsCollector, MetricsSnapshot, MetricsReport } from '../metrics';

describe('EventLogMetricsCollector', () => {
  let collector: EventLogMetricsCollector;

  beforeEach(() => {
    collector = new EventLogMetricsCollector();
  });

  describe('recordQuery', () => {
    it('should record a successful query', () => {
      collector.recordQuery(100, 50);

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(1);
      expect(metrics.successfulQueryCount).toBe(1);
      expect(metrics.failedQueryCount).toBe(0);
      expect(metrics.totalDurationMs).toBe(100);
      expect(metrics.totalResultsReturned).toBe(50);
    });

    it('should record a failed query', () => {
      collector.recordQuery(50, 0, true);

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(1);
      expect(metrics.successfulQueryCount).toBe(0);
      expect(metrics.failedQueryCount).toBe(1);
      expect(metrics.totalDurationMs).toBe(50);
    });

    it('should accumulate multiple queries', () => {
      collector.recordQuery(100, 10);
      collector.recordQuery(150, 20);
      collector.recordQuery(200, 30);

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(3);
      expect(metrics.successfulQueryCount).toBe(3);
      expect(metrics.failedQueryCount).toBe(0);
      expect(metrics.totalDurationMs).toBe(450);
      expect(metrics.totalResultsReturned).toBe(60);
    });

    it('should track min and max durations', () => {
      collector.recordQuery(50, 10);
      collector.recordQuery(200, 20);
      collector.recordQuery(100, 15);

      const metrics = collector.getMetrics();
      expect(metrics.minDurationMs).toBe(50);
      expect(metrics.maxDurationMs).toBe(200);
    });

    it('should calculate average duration correctly', () => {
      collector.recordQuery(100, 10);
      collector.recordQuery(200, 10);
      collector.recordQuery(300, 10);

      const metrics = collector.getMetrics();
      expect(metrics.averageDurationMs).toBe(200);
    });

    it('should handle zero duration', () => {
      collector.recordQuery(0, 100);

      const metrics = collector.getMetrics();
      expect(metrics.totalDurationMs).toBe(0);
      expect(metrics.minDurationMs).toBe(0);
      expect(metrics.maxDurationMs).toBe(0);
    });

    it('should reject negative duration', () => {
      expect(() => collector.recordQuery(-1, 10)).toThrow();
    });

    it('should reject non-numeric duration', () => {
      expect(() => collector.recordQuery(NaN, 10)).toThrow();
    });

    it('should reject negative result count', () => {
      expect(() => collector.recordQuery(100, -1)).toThrow();
    });

    it('should reject non-numeric result count', () => {
      expect(() => collector.recordQuery(100, NaN)).toThrow();
    });

    it('should handle zero results', () => {
      collector.recordQuery(100, 0);

      const metrics = collector.getMetrics();
      expect(metrics.totalResultsReturned).toBe(0);
    });

    it('should perform efficiently (< 1ms per recording)', () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        collector.recordQuery(Math.random() * 100, Math.floor(Math.random() * 100));
      }

      const elapsedMs = Date.now() - startTime;
      // 1000 queries should take much less than 1000ms
      // Allow up to 100ms (0.1ms per query average)
      expect(elapsedMs).toBeLessThan(100);
    });
  });

  describe('getMetrics', () => {
    it('should return initial zero metrics', () => {
      const metrics = collector.getMetrics();

      expect(metrics.totalQueryCount).toBe(0);
      expect(metrics.successfulQueryCount).toBe(0);
      expect(metrics.failedQueryCount).toBe(0);
      expect(metrics.totalDurationMs).toBe(0);
      expect(metrics.minDurationMs).toBe(0);
      expect(metrics.maxDurationMs).toBe(0);
      expect(metrics.averageDurationMs).toBe(0);
      expect(metrics.totalResultsReturned).toBe(0);
    });

    it('should return current snapshot', () => {
      collector.recordQuery(100, 50);
      collector.recordQuery(200, 75);

      const metrics = collector.getMetrics();

      expect(metrics.totalQueryCount).toBe(2);
      expect(metrics.successfulQueryCount).toBe(2);
      expect(metrics.totalDurationMs).toBe(300);
      expect(metrics.totalResultsReturned).toBe(125);
      expect(metrics.averageDurationMs).toBe(150);
    });

    it('should include capturedAt timestamp', () => {
      const beforeCall = new Date();
      const metrics = collector.getMetrics();
      const afterCall = new Date();

      expect(metrics.capturedAt.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime());
      expect(metrics.capturedAt.getTime()).toBeLessThanOrEqual(afterCall.getTime());
    });

    it('should handle division by zero for empty metrics', () => {
      const metrics = collector.getMetrics();

      // Should not throw, averageDurationMs should be 0
      expect(metrics.averageDurationMs).toBe(0);
    });

    it('should round averageDurationMs to 2 decimal places', () => {
      collector.recordQuery(100, 10);
      collector.recordQuery(101, 10);

      const metrics = collector.getMetrics();
      // (100 + 101) / 2 = 100.5
      expect(metrics.averageDurationMs).toBe(100.5);
    });

    it('should track failed queries in snapshot', () => {
      collector.recordQuery(100, 10);
      collector.recordQuery(50, 0, true);
      collector.recordQuery(150, 20);

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(3);
      expect(metrics.successfulQueryCount).toBe(2);
      expect(metrics.failedQueryCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      collector.recordQuery(100, 50);
      collector.recordQuery(200, 75);

      collector.reset();

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(0);
      expect(metrics.successfulQueryCount).toBe(0);
      expect(metrics.failedQueryCount).toBe(0);
      expect(metrics.totalDurationMs).toBe(0);
      expect(metrics.minDurationMs).toBe(0);
      expect(metrics.maxDurationMs).toBe(0);
      expect(metrics.totalResultsReturned).toBe(0);
    });

    it('should allow recording after reset', () => {
      collector.recordQuery(100, 50);
      collector.reset();
      collector.recordQuery(200, 75);

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(1);
      expect(metrics.totalDurationMs).toBe(200);
      expect(metrics.totalResultsReturned).toBe(75);
    });

    it('should reset min/max durations', () => {
      collector.recordQuery(50, 10);
      collector.recordQuery(200, 10);
      collector.reset();
      collector.recordQuery(100, 10);

      const metrics = collector.getMetrics();
      expect(metrics.minDurationMs).toBe(100);
      expect(metrics.maxDurationMs).toBe(100);
    });

    it('should reset uptime for export', async () => {
      collector.recordQuery(100, 50);
      const before = await collector.export();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      collector.reset();
      const after = await collector.export();

      expect(before.uptimeMs).toBeGreaterThan(0);
      expect(after.uptimeMs).toBeLessThan(before.uptimeMs);
    });
  });

  describe('export', () => {
    it('should return a full metrics report', async () => {
      collector.recordQuery(100, 50);

      const report = await collector.export();

      expect(report.totalQueryCount).toBe(1);
      expect(report.successfulQueryCount).toBe(1);
      expect(report.totalResultsReturned).toBe(50);
      expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
      expect(report.queriesPerSecond).toBeGreaterThanOrEqual(0);
      expect(report.averageResultsPerQuery).toBe(50);
    });

    it('should calculate queriesPerSecond', async () => {
      // Record multiple queries
      for (let i = 0; i < 10; i++) {
        collector.recordQuery(10, 5);
      }

      const report = await collector.export();

      // With 10 queries and some uptime, queriesPerSecond should be positive
      expect(report.queriesPerSecond).toBeGreaterThan(0);
      expect(report.queriesPerSecond).toBeLessThanOrEqual(10000); // Sanity check
    });

    it('should calculate averageResultsPerQuery', async () => {
      collector.recordQuery(100, 10);
      collector.recordQuery(200, 20);
      collector.recordQuery(150, 30);

      const report = await collector.export();

      expect(report.averageResultsPerQuery).toBe(20);
    });

    it('should handle empty metrics in export', async () => {
      const report = await collector.export();

      expect(report.totalQueryCount).toBe(0);
      expect(report.queriesPerSecond).toBe(0);
      expect(report.averageResultsPerQuery).toBe(0);
    });

    it('should round queriesPerSecond to 2 decimal places', async () => {
      // Record a query
      collector.recordQuery(100, 10);

      const report = await collector.export();

      // Should be a reasonable number with at most 2 decimal places
      const decimalPlaces = (report.queriesPerSecond.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    it('should include all snapshot fields', async () => {
      collector.recordQuery(100, 50);

      const report = await collector.export();

      // Check all fields from snapshot are present
      expect(report).toHaveProperty('totalQueryCount');
      expect(report).toHaveProperty('successfulQueryCount');
      expect(report).toHaveProperty('failedQueryCount');
      expect(report).toHaveProperty('totalDurationMs');
      expect(report).toHaveProperty('minDurationMs');
      expect(report).toHaveProperty('maxDurationMs');
      expect(report).toHaveProperty('averageDurationMs');
      expect(report).toHaveProperty('totalResultsReturned');
      expect(report).toHaveProperty('capturedAt');

      // Check new fields added by export
      expect(report).toHaveProperty('uptimeMs');
      expect(report).toHaveProperty('queriesPerSecond');
      expect(report).toHaveProperty('averageResultsPerQuery');
    });
  });

  describe('getter methods', () => {
    it('should return total query count', () => {
      collector.recordQuery(100, 50);
      collector.recordQuery(200, 75);

      expect(collector.getTotalQueryCount()).toBe(2);
    });

    it('should return successful query count', () => {
      collector.recordQuery(100, 50);
      collector.recordQuery(200, 0, true);

      expect(collector.getSuccessfulQueryCount()).toBe(1);
    });

    it('should return failed query count', () => {
      collector.recordQuery(100, 50);
      collector.recordQuery(200, 0, true);

      expect(collector.getFailedQueryCount()).toBe(1);
    });
  });

  describe('concurrent operations', () => {
    it('should handle rapid successive recordings', () => {
      for (let i = 0; i < 100; i++) {
        collector.recordQuery(Math.random() * 100, Math.floor(Math.random() * 100));
      }

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(100);
    });

    it('should maintain consistency with mixed successful/failed queries', () => {
      const queries = [
        { duration: 100, results: 10, failed: false },
        { duration: 150, results: 20, failed: false },
        { duration: 50, results: 0, failed: true },
        { duration: 200, results: 30, failed: false },
        { duration: 75, results: 0, failed: true }
      ];

      queries.forEach((q) => {
        collector.recordQuery(q.duration, q.results, q.failed);
      });

      const metrics = collector.getMetrics();
      expect(metrics.totalQueryCount).toBe(5);
      expect(metrics.successfulQueryCount).toBe(3);
      expect(metrics.failedQueryCount).toBe(2);
      expect(metrics.totalDurationMs).toBe(575);
      expect(metrics.totalResultsReturned).toBe(60);
    });
  });

  describe('edge cases', () => {
    it('should handle very large duration values', () => {
      collector.recordQuery(Number.MAX_SAFE_INTEGER - 1, 100);

      const metrics = collector.getMetrics();
      expect(metrics.totalDurationMs).toBe(Number.MAX_SAFE_INTEGER - 1);
    });

    it('should handle very large result counts', () => {
      collector.recordQuery(100, Number.MAX_SAFE_INTEGER - 1);

      const metrics = collector.getMetrics();
      expect(metrics.totalResultsReturned).toBe(Number.MAX_SAFE_INTEGER - 1);
    });

    it('should handle decimal durations', () => {
      collector.recordQuery(100.5, 50);
      collector.recordQuery(99.5, 50);

      const metrics = collector.getMetrics();
      expect(metrics.averageDurationMs).toBe(100);
    });

    it('should handle single query metrics', () => {
      collector.recordQuery(100, 50);

      const metrics = collector.getMetrics();
      expect(metrics.averageDurationMs).toBe(100);
      expect(metrics.minDurationMs).toBe(100);
      expect(metrics.maxDurationMs).toBe(100);
    });
  });
});
