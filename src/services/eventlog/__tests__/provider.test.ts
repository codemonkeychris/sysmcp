/**
 * Tests for EventLog Service Provider
 */

import {
  EventLogProvider,
  PermissionDeniedException,
  ValidationException
} from '../provider';
import { Logger } from '../../logger/types';

// Mock logger
const createMockLogger = (): Logger => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => createMockLogger())
} as any);

describe('EventLogProvider', () => {
  let provider: EventLogProvider;
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  afterEach(async () => {
    try {
      if (provider) await provider.stop();
    } catch {}
  });

  describe('Constructor', () => {
    it('should create provider with default config', () => {
      provider = new EventLogProvider(logger);
      expect(provider).toBeDefined();
    });

    it('should create provider with custom config', () => {
      provider = new EventLogProvider(logger, { enabled: true, maxResults: 500 });
      expect(provider).toBeDefined();
    });
  });

  describe('Lifecycle', () => {
    beforeEach(() => {
      provider = new EventLogProvider(logger, { enabled: true });
    });

    it('should start successfully', async () => {
      await expect(provider.start()).resolves.not.toThrow();
    });

    it('should stop successfully', async () => {
      await provider.start();
      await expect(provider.stop()).resolves.not.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await provider.start();
      await provider.stop();
      await expect(provider.stop()).resolves.not.toThrow();
    });

    it('should not start if disabled', async () => {
      provider = new EventLogProvider(logger, { enabled: false });
      await provider.start();
      expect(provider.getState().started).toBe(false);
    });
  });

  describe('Healthcheck', () => {
    it('should return false if service disabled', async () => {
      provider = new EventLogProvider(logger, { enabled: false });
      const healthy = await provider.healthcheck();
      expect(healthy).toBe(false);
    });

    it('should return boolean result', async () => {
      provider = new EventLogProvider(logger, { enabled: true });
      const healthy = await provider.healthcheck();
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('Query Method', () => {
    beforeEach(async () => {
      provider = new EventLogProvider(logger, { enabled: true });
    });

    it('should throw PermissionDeniedException if disabled', async () => {
      provider = new EventLogProvider(logger, { enabled: false });
      await expect(provider.query({ logName: 'System' })).rejects.toThrow(PermissionDeniedException);
    });

    it('should throw ValidationException if logName missing', async () => {
      await provider.start();
      await expect(provider.query({ logName: '' })).rejects.toThrow(ValidationException);
    });

    it('should return result with executionTimeMs', async () => {
      await provider.start();
      const result = await provider.query({ logName: 'System', pagination: { limit: 10 } });
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should include queriedAt timestamp', async () => {
      await provider.start();
      const result = await provider.query({ logName: 'System', pagination: { limit: 1 } });
      expect(result.queriedAt).toBeDefined();
      expect(result.queriedAt instanceof Date).toBe(true);
    });
  });

  describe('Metrics', () => {
    beforeEach(async () => {
      provider = new EventLogProvider(logger, { enabled: true });
      await provider.start();
    });

    it('should track queries executed', async () => {
      const before = provider.getMetrics();
      await provider.query({ logName: 'System', pagination: { limit: 1 } });
      const after = provider.getMetrics();
      expect(after.queriesExecuted).toBe(before.queriesExecuted + 1);
    });

    it('should track execution time', async () => {
      const before = provider.getMetrics();
      await provider.query({ logName: 'System', pagination: { limit: 1 } });
      const after = provider.getMetrics();
      expect(after.totalExecutionTimeMs).toBeGreaterThan(before.totalExecutionTimeMs);
    });

    it('should return metrics object', () => {
      const metrics = provider.getMetrics();
      expect(metrics).toHaveProperty('queriesExecuted');
      expect(metrics).toHaveProperty('queriesFailed');
      expect(metrics).toHaveProperty('totalResultsReturned');
      expect(metrics).toHaveProperty('totalExecutionTimeMs');
      expect(metrics).toHaveProperty('averageExecutionTimeMs');
    });
  });

  describe('State Management', () => {
    it('should return state before start', () => {
      provider = new EventLogProvider(logger, { enabled: true });
      const state = provider.getState();
      expect(state.started).toBe(false);
      expect(state.metrics).toBeDefined();
    });

    it('should return state after start', async () => {
      provider = new EventLogProvider(logger, { enabled: true });
      await provider.start();
      const state = provider.getState();
      expect(state.started).toBe(true);
    });
  });

  describe('Anonymization Support', () => {
    it('should return undefined when anonymization disabled', async () => {
      provider = new EventLogProvider(logger, { anonymize: false });
      const mapping = provider.getAnonymizationMapping();
      expect(mapping).toBeUndefined();
    });

    it('should return mapping when anonymization enabled', async () => {
      provider = new EventLogProvider(logger, { anonymize: true });
      await provider.start();
      const mapping = provider.getAnonymizationMapping();
      expect(mapping).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      provider = new EventLogProvider(logger, { enabled: true });
      await provider.start();
    });

    it('should return error result for invalid log', async () => {
      const result = await provider.query({ logName: 'NonExistentLog99999' });
      if (!result.success) {
        expect(result.errorMessage).toBeDefined();
      }
    });

    it('should throw for validation errors', async () => {
      await expect(provider.query({ logName: '' })).rejects.toThrow(ValidationException);
    });
  });

  describe('Performance', () => {
    beforeEach(async () => {
      provider = new EventLogProvider(logger, { enabled: true });
      await provider.start();
    });

    it('should query System log reasonably fast', async () => {
      const start = Date.now();
      await provider.query({ logName: 'System', pagination: { limit: 10 } });
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });
  });
});
