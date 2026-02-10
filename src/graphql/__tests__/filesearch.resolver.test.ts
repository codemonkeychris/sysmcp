/**
 * Tests for FileSearch GraphQL Resolver
 */

import {
  fileSearchResolver,
  FileSearchGraphQLError,
  FileSearchErrorCode
} from '../filesearch.resolver';

// Mock provider
const mockSearch = jest.fn();
const mockGetMetrics = jest.fn().mockReturnValue({ totalQueryCount: 5 });

const mockProvider = {
  search: mockSearch,
  getMetrics: mockGetMetrics
};

// Mock anonymizer
const mockAnonymizeEntries = jest.fn((entries: any[]) =>
  entries.map(e => ({
    ...e,
    path: e.path.replace(/\\Users\\[^\\]+/, '\\Users\\[ANON]'),
    author: e.author ? '[ANON]' : undefined
  }))
);

const mockAnonymizer = {
  anonymizeEntries: mockAnonymizeEntries
};

// Mock logger
const mockLogger = {
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('fileSearchResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeContext = (overrides: any = {}) => ({
    logger: mockLogger as any,
    fileSearchProvider: mockProvider as any,
    fileSearchAnonymizer: mockAnonymizer as any,
    ...overrides
  });

  const makeMockResult = (count: number = 3) => ({
    files: Array.from({ length: count }, (_, i) => ({
      path: `C:\\Users\\john\\Documents\\file${i}.txt`,
      fileName: `file${i}.txt`,
      fileType: '.txt',
      size: 100 * (i + 1),
      dateModified: new Date('2024-01-15'),
      dateCreated: new Date('2024-01-01'),
      author: 'John Doe',
      title: `File ${i}`,
      tags: ['test']
    })),
    totalCount: 10,
    hasMore: true,
    executionTimeMs: 50
  });

  it('should return search results', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(
      null,
      { searchText: 'test', limit: 25, offset: 0 },
      makeContext()
    );

    expect(result.files).toHaveLength(3);
    expect(result.totalCount).toBe(10);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.metrics.resultsReturned).toBe(3);
  });

  it('should apply anonymization', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(
      null,
      { searchText: 'test' },
      makeContext()
    );

    expect(mockAnonymizeEntries).toHaveBeenCalled();
    // Verify paths are anonymized
    result.files.forEach((f: any) => {
      expect(f.path).toContain('[ANON]');
      expect(f.path).not.toContain('john');
    });
  });

  it('should skip anonymization when no anonymizer', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(
      null,
      { searchText: 'test' },
      makeContext({ fileSearchAnonymizer: undefined })
    );

    // Raw paths should be preserved
    result.files.forEach((f: any) => {
      expect(f.path).toContain('john');
    });
  });

  it('should use default limit and offset', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    await fileSearchResolver(null, {}, makeContext());

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 })
    );
  });

  it('should pass search parameters to provider', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    await fileSearchResolver(
      null,
      {
        searchText: 'budget',
        searchMode: 'FREETEXT',
        path: 'C:\\Users\\Documents',
        fileName: '*.pdf',
        fileType: '.pdf',
        minSize: 1024,
        maxSize: 10240,
        limit: 10,
        offset: 5
      },
      makeContext()
    );

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        searchText: 'budget',
        searchMode: 'FREETEXT',
        path: 'C:\\Users\\Documents',
        fileName: '*.pdf',
        fileType: '.pdf',
        minSize: 1024,
        maxSize: 10240,
        limit: 10,
        offset: 5
      })
    );
  });

  it('should parse date parameters', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    await fileSearchResolver(
      null,
      {
        modifiedAfter: '2024-01-01T00:00:00Z',
        modifiedBefore: '2024-12-31T23:59:59Z'
      },
      makeContext()
    );

    const callArgs = mockSearch.mock.calls[0][0];
    expect(callArgs.modifiedAfter).toBeInstanceOf(Date);
    expect(callArgs.modifiedBefore).toBeInstanceOf(Date);
  });

  // Error handling tests
  it('should throw SERVICE_DISABLED when no provider', async () => {
    await expect(
      fileSearchResolver(null, {}, makeContext({ fileSearchProvider: undefined }))
    ).rejects.toThrow(FileSearchGraphQLError);

    try {
      await fileSearchResolver(null, {}, makeContext({ fileSearchProvider: undefined }));
    } catch (error) {
      expect((error as FileSearchGraphQLError).code).toBe(FileSearchErrorCode.ServiceDisabled);
    }
  });

  it('should throw INVALID_LIMIT for limit > 1000', async () => {
    await expect(
      fileSearchResolver(null, { limit: 1001 }, makeContext())
    ).rejects.toThrow(FileSearchGraphQLError);
  });

  it('should throw INVALID_LIMIT for limit < 1', async () => {
    await expect(
      fileSearchResolver(null, { limit: 0 }, makeContext())
    ).rejects.toThrow(FileSearchGraphQLError);
  });

  it('should throw INVALID_OFFSET for negative offset', async () => {
    await expect(
      fileSearchResolver(null, { offset: -1 }, makeContext())
    ).rejects.toThrow(FileSearchGraphQLError);
  });

  it('should throw INVALID_DATE_RANGE for bad date', async () => {
    await expect(
      fileSearchResolver(null, { modifiedAfter: 'not-a-date' }, makeContext())
    ).rejects.toThrow(FileSearchGraphQLError);
  });

  it('should include metrics in response', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(null, { searchText: 'test' }, makeContext());

    expect(result.metrics).toBeDefined();
    expect(result.metrics.queryCount).toBe(5);
    expect(result.metrics.responseDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.resultsReturned).toBe(3);
  });

  it('should include pageInfo in response', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(
      null,
      { searchText: 'test', offset: 10 },
      makeContext()
    );

    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.hasPreviousPage).toBe(true);
    expect(result.pageInfo.startCursor).toBe(10);
  });

  it('should format dates as ISO strings', async () => {
    mockSearch.mockResolvedValue(makeMockResult());

    const result = await fileSearchResolver(null, {}, makeContext());

    result.files.forEach((f: any) => {
      expect(typeof f.dateModified).toBe('string');
      expect(typeof f.dateCreated).toBe('string');
      // Should be valid ISO strings
      expect(new Date(f.dateModified).toISOString()).toBe(f.dateModified);
    });
  });
});
