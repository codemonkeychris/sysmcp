/**
 * FileSearch Metrics Collector
 *
 * Thread-safe metrics tracking for FileSearch queries.
 * Tracks: total queries, successful queries, failed queries, durations, and result counts.
 */

/**
 * Snapshot of accumulated metrics
 */
export interface FileSearchMetricsSnapshot {
  totalQueryCount: number;
  successfulQueryCount: number;
  failedQueryCount: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  averageDurationMs: number;
  totalResultsReturned: number;
  capturedAt: Date;
}

/**
 * Detailed report for exporting metrics
 */
export interface FileSearchMetricsReport extends FileSearchMetricsSnapshot {
  uptimeMs: number;
  queriesPerSecond: number;
  averageResultsPerQuery: number;
}

/**
 * FileSearch Metrics Collector
 *
 * Collector for tracking search query metrics.
 * Uses synchronous operations with minimal overhead (<1ms per recording).
 */
export class FileSearchMetricsCollector {
  private totalQueryCount = 0;
  private successfulQueryCount = 0;
  private failedQueryCount = 0;
  private totalDurationMs = 0;
  private minDurationMs = Number.MAX_SAFE_INTEGER;
  private maxDurationMs = 0;
  private totalResultsReturned = 0;
  private startTimeMs: number;

  constructor() {
    this.startTimeMs = Date.now();
  }

  /**
   * Record a completed query
   *
   * @param duration - Query execution duration in milliseconds
   * @param resultCount - Number of results returned
   * @param failed - Whether the query failed (default: false)
   */
  public recordQuery(duration: number, resultCount: number, failed: boolean = false): void {
    if (typeof duration !== 'number' || isNaN(duration) || duration < 0) {
      throw new Error('Duration must be a non-negative number');
    }
    if (typeof resultCount !== 'number' || isNaN(resultCount) || resultCount < 0) {
      throw new Error('Result count must be a non-negative number');
    }

    this.totalQueryCount++;
    if (failed) {
      this.failedQueryCount++;
    } else {
      this.successfulQueryCount++;
    }

    this.totalDurationMs += duration;
    this.minDurationMs = Math.min(this.minDurationMs, duration);
    this.maxDurationMs = Math.max(this.maxDurationMs, duration);
    this.totalResultsReturned += resultCount;
  }

  public getMetrics(): FileSearchMetricsSnapshot {
    const averageDurationMs =
      this.totalQueryCount > 0 ? this.totalDurationMs / this.totalQueryCount : 0;

    return {
      totalQueryCount: this.totalQueryCount,
      successfulQueryCount: this.successfulQueryCount,
      failedQueryCount: this.failedQueryCount,
      totalDurationMs: this.totalDurationMs,
      minDurationMs:
        this.minDurationMs === Number.MAX_SAFE_INTEGER ? 0 : this.minDurationMs,
      maxDurationMs: this.maxDurationMs,
      averageDurationMs: Math.round(averageDurationMs * 100) / 100,
      totalResultsReturned: this.totalResultsReturned,
      capturedAt: new Date()
    };
  }

  public reset(): void {
    this.totalQueryCount = 0;
    this.successfulQueryCount = 0;
    this.failedQueryCount = 0;
    this.totalDurationMs = 0;
    this.minDurationMs = Number.MAX_SAFE_INTEGER;
    this.maxDurationMs = 0;
    this.totalResultsReturned = 0;
    this.startTimeMs = Date.now();
  }

  public async export(): Promise<FileSearchMetricsReport> {
    const snapshot = this.getMetrics();
    const uptimeMs = Date.now() - this.startTimeMs;
    const uptimeSafe = Math.max(1, uptimeMs);
    const queriesPerSecond =
      snapshot.totalQueryCount > 0 && uptimeSafe > 0
        ? (snapshot.totalQueryCount / (uptimeSafe / 1000))
        : 0;

    const averageResultsPerQuery =
      snapshot.totalQueryCount > 0
        ? snapshot.totalResultsReturned / snapshot.totalQueryCount
        : 0;

    return {
      ...snapshot,
      uptimeMs,
      queriesPerSecond: Math.round(queriesPerSecond * 100) / 100,
      averageResultsPerQuery: Math.round(averageResultsPerQuery * 100) / 100
    };
  }

  public getTotalQueryCount(): number {
    return this.totalQueryCount;
  }

  public getSuccessfulQueryCount(): number {
    return this.successfulQueryCount;
  }

  public getFailedQueryCount(): number {
    return this.failedQueryCount;
  }
}
