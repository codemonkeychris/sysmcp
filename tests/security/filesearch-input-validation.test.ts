/**
 * Input Validation Completeness Tests (Task 3.5)
 *
 * Verifies that every input field is properly validated at the resolver level.
 */

import {
  fileSearchResolver,
  FileSearchGraphQLError,
  FileSearchErrorCode
} from '../../src/graphql/filesearch.resolver';

// Minimal mock provider
const mockSearch = jest.fn().mockResolvedValue({
  files: [],
  totalCount: 0,
  hasMore: false,
  executionTimeMs: 10
});

const mockGetMetrics = jest.fn().mockReturnValue({ totalQueryCount: 0 });

const mockProvider = { search: mockSearch, getMetrics: mockGetMetrics };

const mockLogger = {
  child: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
  }),
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
};

const makeContext = (overrides: any = {}) => ({
  logger: mockLogger as any,
  fileSearchProvider: mockProvider as any,
  ...overrides
});

describe('Input Validation Completeness', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('Limit Validation', () => {
    it('should reject limit = 0', async () => {
      await expect(
        fileSearchResolver(null, { limit: 0 }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should reject limit = -1', async () => {
      await expect(
        fileSearchResolver(null, { limit: -1 }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should reject limit = 1001', async () => {
      await expect(
        fileSearchResolver(null, { limit: 1001 }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should accept limit = 1', async () => {
      await fileSearchResolver(null, { limit: 1 }, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should accept limit = 1000', async () => {
      await fileSearchResolver(null, { limit: 1000 }, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should default limit to 25', async () => {
      await fileSearchResolver(null, {}, makeContext());
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25 })
      );
    });
  });

  describe('Offset Validation', () => {
    it('should reject offset = -1', async () => {
      await expect(
        fileSearchResolver(null, { offset: -1 }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should accept offset = 0', async () => {
      await fileSearchResolver(null, { offset: 0 }, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should accept large offset', async () => {
      await fileSearchResolver(null, { offset: 100000 }, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should default offset to 0', async () => {
      await fileSearchResolver(null, {}, makeContext());
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0 })
      );
    });
  });

  describe('Date Validation', () => {
    it('should reject invalid modifiedAfter', async () => {
      await expect(
        fileSearchResolver(null, { modifiedAfter: 'not-a-date' }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should reject invalid modifiedBefore', async () => {
      await expect(
        fileSearchResolver(null, { modifiedBefore: 'not-a-date' }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should reject invalid createdAfter', async () => {
      await expect(
        fileSearchResolver(null, { createdAfter: 'bad' }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should reject invalid createdBefore', async () => {
      await expect(
        fileSearchResolver(null, { createdBefore: 'bad' }, makeContext())
      ).rejects.toThrow(FileSearchGraphQLError);
    });

    it('should accept valid ISO dates', async () => {
      await fileSearchResolver(null, {
        modifiedAfter: '2024-01-01T00:00:00Z',
        modifiedBefore: '2024-12-31T23:59:59Z'
      }, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });
  });

  describe('Search Mode Validation', () => {
    it('should default to CONTAINS', async () => {
      await fileSearchResolver(null, {}, makeContext());
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ searchMode: 'CONTAINS' })
      );
    });

    it('should accept FREETEXT', async () => {
      await fileSearchResolver(null, { searchMode: 'FREETEXT' }, makeContext());
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ searchMode: 'FREETEXT' })
      );
    });

    it('should handle unknown mode by defaulting to CONTAINS', async () => {
      await fileSearchResolver(null, { searchMode: 'INVALID' }, makeContext());
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({ searchMode: 'CONTAINS' })
      );
    });
  });

  describe('Service Availability', () => {
    it('should throw SERVICE_DISABLED when no provider', async () => {
      try {
        await fileSearchResolver(null, {}, makeContext({ fileSearchProvider: undefined }));
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(FileSearchGraphQLError);
        expect((error as FileSearchGraphQLError).code).toBe(FileSearchErrorCode.ServiceDisabled);
      }
    });

    it('should throw SERVICE_DISABLED when provider is null', async () => {
      try {
        await fileSearchResolver(null, {}, makeContext({ fileSearchProvider: null }));
        fail('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(FileSearchGraphQLError);
      }
    });
  });

  describe('Optional Parameters', () => {
    it('should work with no parameters at all', async () => {
      await fileSearchResolver(null, {}, makeContext());
      expect(mockSearch).toHaveBeenCalled();
    });

    it('should pass optional string parameters correctly', async () => {
      await fileSearchResolver(null, {
        searchText: 'test',
        fileName: '*.txt',
        fileType: '.txt',
        author: 'Test Author'
      }, makeContext());

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          searchText: 'test',
          fileName: '*.txt',
          fileType: '.txt',
          author: 'Test Author'
        })
      );
    });

    it('should pass optional numeric parameters correctly', async () => {
      await fileSearchResolver(null, {
        minSize: 1024,
        maxSize: 10240
      }, makeContext());

      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          minSize: 1024,
          maxSize: 10240
        })
      );
    });
  });
});
