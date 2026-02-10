/**
 * FileSearch Metrics Collector Tests
 */

import { FileSearchMetricsCollector } from '../metrics';

describe('FileSearchMetricsCollector', () => {
  let metrics: FileSearchMetricsCollector;

  beforeEach(() => {
    metrics = new FileSearchMetricsCollector();
  });

  describe('initial state', () => {
    it('should start with zero queries', () => {
      expect(metrics.getTotalQueryCount()).toBe(0);
    });

    it('should start with zero successful queries', () => {
      expect(metrics.getSuccessfulQueryCount()).toBe(0);
    });

    it('should start with zero failed queries', () => {
      expect(metrics.getFailedQueryCount()).toBe(0);
    });

    it('should return zero metrics snapshot', () => {
      const snapshot = metrics.getMetrics();
      expect(snapshot.totalQueryCount).toBe(0);
      expect(snapshot.totalDurationMs).toBe(0);
      expect(snapshot.minDurationMs).toBe(0);
      expect(snapshot.maxDurationMs).toBe(0);
      expect(snapshot.averageDurationMs).toBe(0);
      expect(snapshot.totalResultsReturned).toBe(0);
    });
  });

  describe('recordQuery', () => {
    it('should record a successful query', () => {
      metrics.recordQuery(100, 50);
      expect(metrics.getTotalQueryCount()).toBe(1);
      expect(metrics.getSuccessfulQueryCount()).toBe(1);
      expect(metrics.getFailedQueryCount()).toBe(0);
    });

    it('should record a failed query', () => {
      metrics.recordQuery(200, 0, true);
      expect(metrics.getTotalQueryCount()).toBe(1);
      expect(metrics.getSuccessfulQueryCount()).toBe(0);
      expect(metrics.getFailedQueryCount()).toBe(1);
    });

    it('should track min and max durations', () => {
      metrics.recordQuery(50, 10);
      metrics.recordQuery(200, 20);
      metrics.recordQuery(100, 15);
      const snapshot = metrics.getMetrics();
      expect(snapshot.minDurationMs).toBe(50);
      expect(snapshot.maxDurationMs).toBe(200);
    });

    it('should calculate average duration', () => {
      metrics.recordQuery(100, 10);
      metrics.recordQuery(200, 20);
      const snapshot = metrics.getMetrics();
      expect(snapshot.averageDurationMs).toBe(150);
    });

    it('should accumulate results returned', () => {
      metrics.recordQuery(10, 50);
      metrics.recordQuery(10, 100);
      expect(metrics.getMetrics().totalResultsReturned).toBe(150);
    });

    it('should throw on negative duration', () => {
      expect(() => metrics.recordQuery(-1, 0)).toThrow('Duration must be a non-negative number');
    });

    it('should throw on NaN duration', () => {
      expect(() => metrics.recordQuery(NaN, 0)).toThrow('Duration must be a non-negative number');
    });

    it('should throw on negative result count', () => {
      expect(() => metrics.recordQuery(10, -1)).toThrow('Result count must be a non-negative number');
    });

    it('should accept zero duration', () => {
      expect(() => metrics.recordQuery(0, 0)).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metrics.recordQuery(100, 50);
      metrics.recordQuery(200, 0, true);
      metrics.reset();
      expect(metrics.getTotalQueryCount()).toBe(0);
      expect(metrics.getSuccessfulQueryCount()).toBe(0);
      expect(metrics.getFailedQueryCount()).toBe(0);
      const snapshot = metrics.getMetrics();
      expect(snapshot.totalDurationMs).toBe(0);
      expect(snapshot.totalResultsReturned).toBe(0);
    });
  });

  describe('export', () => {
    it('should export report with uptime', async () => {
      metrics.recordQuery(100, 50);
      const report = await metrics.export();
      expect(report.uptimeMs).toBeGreaterThanOrEqual(0);
      expect(report.totalQueryCount).toBe(1);
    });

    it('should calculate queries per second', async () => {
      metrics.recordQuery(10, 5);
      const report = await metrics.export();
      expect(report.queriesPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should calculate average results per query', async () => {
      metrics.recordQuery(10, 50);
      metrics.recordQuery(10, 100);
      const report = await metrics.export();
      expect(report.averageResultsPerQuery).toBe(75);
    });

    it('should handle zero queries in export', async () => {
      const report = await metrics.export();
      expect(report.queriesPerSecond).toBe(0);
      expect(report.averageResultsPerQuery).toBe(0);
    });
  });

  describe('getMetrics snapshot', () => {
    it('should include capturedAt timestamp', () => {
      const before = new Date();
      const snapshot = metrics.getMetrics();
      const after = new Date();
      expect(snapshot.capturedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.capturedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
