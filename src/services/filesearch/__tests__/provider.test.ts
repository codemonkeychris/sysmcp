/**
 * Tests for FileSearch Provider
 *
 * Tests the main provider orchestration with mocked OLE DB executor.
 */

import { FileSearchProvider, PermissionDeniedException, ValidationException, ScopeViolationException, OperationFailedException } from '../provider';
import { FileSearchQueryParams } from '../types';
import { Logger } from '../../../logger';

// Mock OLE DB executor
const mockExecute = jest.fn();
const mockCheckAvailability = jest.fn();

jest.mock('../oledb-executor', () => ({
  OleDbExecutor: jest.fn().mockImplementation(() => ({
    execute: mockExecute,
    checkAvailability: mockCheckAvailability
  }))
}));

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

function makeParams(overrides: Partial<FileSearchQueryParams> = {}): FileSearchQueryParams {
  return {
    searchText: 'test',
    limit: 25,
    offset: 0,
    ...overrides
  };
}

// Helper to make mock rows
function makeMockRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    'System.ItemPathDisplay': `C:\\test\\file${i}.txt`,
    'System.FileName': `file${i}.txt`,
    'System.FileExtension': '.txt',
    'System.Size': 100 * (i + 1),
    'System.DateModified': '2024-01-15T10:30:00Z',
    'System.DateCreated': '2024-01-01T00:00:00Z',
    'System.Author': null,
    'System.Title': null,
    'System.Keywords': null
  }));
}

describe('FileSearchProvider', () => {
  let provider: FileSearchProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new FileSearchProvider(mockLogger, {
      enabled: true,
      maxResults: 10000,
      timeoutMs: 30000,
      anonymize: true,
      allowedPaths: []
    });
  });

  describe('start', () => {
    it('should start and report healthy when Windows Search available', async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });

      await provider.start();

      const state = provider.getState();
      expect(state.started).toBe(true);
      expect(state.healthy).toBe(true);
    });

    it('should start with degraded status when Windows Search unavailable', async () => {
      mockCheckAvailability.mockResolvedValue({ available: false, message: 'WSearch not running' });

      await provider.start();

      const state = provider.getState();
      expect(state.started).toBe(true);
      expect(state.healthy).toBe(false);
    });
  });

  describe('stop', () => {
    it('should mark provider as stopped', async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });
      await provider.start();
      await provider.stop();

      const state = provider.getState();
      expect(state.started).toBe(false);
      expect(state.healthy).toBe(false);
    });
  });

  describe('healthcheck', () => {
    it('should return false when not started', async () => {
      expect(await provider.healthcheck()).toBe(false);
    });

    it('should return true when Windows Search available', async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });
      await provider.start();

      const healthy = await provider.healthcheck();
      expect(healthy).toBe(true);
    });

    it('should return false when Windows Search unavailable', async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });
      await provider.start();

      mockCheckAvailability.mockResolvedValue({ available: false, message: 'Down' });
      const healthy = await provider.healthcheck();
      expect(healthy).toBe(false);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });
      await provider.start();
    });

    it('should return search results', async () => {
      const mockRows = makeMockRows(5);
      mockExecute
        .mockResolvedValueOnce({ success: true, rows: mockRows, executionTimeMs: 10 })
        .mockResolvedValueOnce({ success: true, rows: [{ 'COUNT(*)': 5 }], executionTimeMs: 5 });

      const result = await provider.search(makeParams());

      expect(result.files).toHaveLength(5);
      expect(result.totalCount).toBe(5);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should apply client-side offset', async () => {
      // For offset=2, limit=3: TOP = 2+3+1=6, then skip first 2
      const mockRows = makeMockRows(6);
      mockExecute
        .mockResolvedValueOnce({ success: true, rows: mockRows, executionTimeMs: 10 })
        .mockResolvedValueOnce({ success: true, rows: [{ 'COUNT(*)': 10 }], executionTimeMs: 5 });

      const result = await provider.search(makeParams({ offset: 2, limit: 3 }));

      expect(result.files).toHaveLength(3);
      // Should start from file2 (index 2)
      expect(result.files[0].fileName).toBe('file2.txt');
    });

    it('should detect hasMore when extra row exists', async () => {
      // limit=3, offset=0: TOP=4, return 4 rows → hasMore = true, return 3
      const mockRows = makeMockRows(4);
      mockExecute
        .mockResolvedValueOnce({ success: true, rows: mockRows, executionTimeMs: 10 })
        .mockResolvedValueOnce({ success: true, rows: [{ 'COUNT(*)': 10 }], executionTimeMs: 5 });

      const result = await provider.search(makeParams({ limit: 3 }));

      expect(result.files).toHaveLength(3);
      expect(result.hasMore).toBe(true);
    });

    it('should set hasMore=false when no extra row', async () => {
      const mockRows = makeMockRows(3);
      mockExecute
        .mockResolvedValueOnce({ success: true, rows: mockRows, executionTimeMs: 10 })
        .mockResolvedValueOnce({ success: true, rows: [{ 'COUNT(*)': 3 }], executionTimeMs: 5 });

      const result = await provider.search(makeParams({ limit: 5 }));

      expect(result.hasMore).toBe(false);
    });

    it('should throw PermissionDeniedException when disabled', async () => {
      const disabledProvider = new FileSearchProvider(mockLogger, { enabled: false });

      await expect(disabledProvider.search(makeParams()))
        .rejects.toThrow(PermissionDeniedException);
    });

    it('should throw OperationFailedException when not started', async () => {
      const freshProvider = new FileSearchProvider(mockLogger, { enabled: true });

      await expect(freshProvider.search(makeParams()))
        .rejects.toThrow(OperationFailedException);
    });

    it('should throw OperationFailedException on query failure', async () => {
      mockExecute.mockResolvedValue({
        success: false,
        rows: [],
        errorMessage: 'Search query failed',
        executionTimeMs: 10
      });

      await expect(provider.search(makeParams()))
        .rejects.toThrow(OperationFailedException);
    });

    it('should throw ScopeViolationException for UNC paths', async () => {
      await expect(provider.search(makeParams({ path: '\\\\server\\share' })))
        .rejects.toThrow(ScopeViolationException);
    });

    it('should throw ScopeViolationException for path traversal', async () => {
      await expect(provider.search(makeParams({ path: 'C:\\Users\\..\\..\\Windows' })))
        .rejects.toThrow(ScopeViolationException);
    });

    // Parameter validation tests
    describe('parameter validation', () => {
      it('should reject limit < 1', async () => {
        await expect(provider.search(makeParams({ limit: 0 })))
          .rejects.toThrow(ValidationException);
      });

      it('should reject limit > 1000', async () => {
        await expect(provider.search(makeParams({ limit: 1001 })))
          .rejects.toThrow(ValidationException);
      });

      it('should reject negative offset', async () => {
        await expect(provider.search(makeParams({ offset: -1 })))
          .rejects.toThrow(ValidationException);
      });

      it('should reject negative minSize', async () => {
        await expect(provider.search(makeParams({ minSize: -1 })))
          .rejects.toThrow(ValidationException);
      });

      it('should reject maxSize < minSize', async () => {
        await expect(provider.search(makeParams({ minSize: 1000, maxSize: 500 })))
          .rejects.toThrow(ValidationException);
      });

      it('should reject modifiedAfter > modifiedBefore', async () => {
        await expect(provider.search(makeParams({
          modifiedAfter: new Date('2025-01-01'),
          modifiedBefore: new Date('2024-01-01')
        }))).rejects.toThrow(ValidationException);
      });

      it('should reject createdAfter > createdBefore', async () => {
        await expect(provider.search(makeParams({
          createdAfter: new Date('2025-01-01'),
          createdBefore: new Date('2024-01-01')
        }))).rejects.toThrow(ValidationException);
      });
    });
  });

  describe('getMetrics', () => {
    it('should return metrics', () => {
      const metrics = provider.getMetrics();
      expect(metrics.totalQueryCount).toBe(0);
      expect(metrics.successfulQueryCount).toBe(0);
      expect(metrics.failedQueryCount).toBe(0);
    });

    it('should update metrics after queries', async () => {
      mockCheckAvailability.mockResolvedValue({ available: true, message: 'OK' });
      await provider.start();

      mockExecute
        .mockResolvedValueOnce({ success: true, rows: [], executionTimeMs: 10 })
        .mockResolvedValueOnce({ success: true, rows: [{ 'COUNT(*)': 0 }], executionTimeMs: 5 });

      await provider.search(makeParams());

      const metrics = provider.getMetrics();
      expect(metrics.totalQueryCount).toBe(1);
      expect(metrics.successfulQueryCount).toBe(1);
    });
  });

  describe('getState', () => {
    it('should return initial state', () => {
      const state = provider.getState();
      expect(state.started).toBe(false);
      expect(state.healthy).toBe(false);
      expect(state.enabled).toBe(true);
    });
  });
});
