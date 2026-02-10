/**
 * EventLog Metrics Collector
 *
 * Thread-safe metrics tracking for EventLog queries.
 * Tracks: total queries, successful queries, failed queries, durations, and result counts.
 */

/**
 * Snapshot of accumulated metrics
 */
export interface MetricsSnapshot {
  /** Total number of queries executed */
  totalQueryCount: number;

  /** Total number of successful queries */
  successfulQueryCount: number;

  /** Total number of failed queries */
  failedQueryCount: number;

  /** Sum of all query durations in milliseconds */
  totalDurationMs: number;

  /** Minimum duration of any query in milliseconds */
  minDurationMs: number;

  /** Maximum duration of any query in milliseconds */
  maxDurationMs: number;

  /** Average duration per query in milliseconds */
  averageDurationMs: number;

  /** Total events/results returned across all queries */
  totalResultsReturned: number;

  /** Timestamp when metrics were captured */
  capturedAt: Date;
}

/**
 * Detailed report for exporting metrics
 */
export interface MetricsReport extends MetricsSnapshot {
  /** Service uptime in milliseconds */
  uptimeMs: number;

  /** Queries per second */
  queriesPerSecond: number;

  /** Average results per query */
  averageResultsPerQuery: number;
}

/**
 * EventLog Metrics Collector
 *
 * Thread-safe collector for tracking query metrics.
 * Uses synchronous operations with minimal overhead (<1ms per recording).
 *
 * Example:
 * ```typescript
 * const metrics = new EventLogMetricsCollector();
 * 
 * const startTime = Date.now();
 * // ... execute query ...
 * const duration = Date.now() - startTime;
 * 
 * metrics.recordQuery(duration, resultCount);
 * const snapshot = metrics.getMetrics();
 * ```
 */
export class EventLogMetricsCollector {
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
    // Validate inputs
    if (typeof duration !== 'number' || isNaN(duration) || duration < 0) {
      throw new Error('Duration must be a non-negative number');
    }
    if (typeof resultCount !== 'number' || isNaN(resultCount) || resultCount < 0) {
      throw new Error('Result count must be a non-negative number');
    }

    // Increment counters
    this.totalQueryCount++;
    if (failed) {
      this.failedQueryCount++;
    } else {
      this.successfulQueryCount++;
    }

    // Update duration stats
    this.totalDurationMs += duration;
    this.minDurationMs = Math.min(this.minDurationMs, duration);
    this.maxDurationMs = Math.max(this.maxDurationMs, duration);

    // Track results
    this.totalResultsReturned += resultCount;
  }

  /**
   * Get current metrics snapshot
   *
   * @returns Current accumulated metrics
   */
  public getMetrics(): MetricsSnapshot {
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

  /**
   * Reset all metrics
   *
   * Clears all accumulated metrics and resets start time.
   */
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

  /**
   * Export metrics as a detailed report
   *
   * @returns Promise resolving to detailed metrics report
   */
  public async export(): Promise<MetricsReport> {
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

  /**
   * Get total query count
   *
   * @returns Total number of queries executed
   */
  public getTotalQueryCount(): number {
    return this.totalQueryCount;
  }

  /**
   * Get successful query count
   *
   * @returns Number of successful queries
   */
  public getSuccessfulQueryCount(): number {
    return this.successfulQueryCount;
  }

  /**
   * Get failed query count
   *
   * @returns Number of failed queries
   */
  public getFailedQueryCount(): number {
    return this.failedQueryCount;
  }
}
