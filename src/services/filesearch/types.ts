/**
 * FileSearch service type definitions
 *
 * Defines TypeScript interfaces and enums for the FileSearch MCP service,
 * including queries, responses, pagination, and metrics.
 */

/**
 * Search mode for full-text queries
 */
export enum SearchMode {
  /** Exact match search using CONTAINS */
  CONTAINS = 'CONTAINS',
  /** Natural language search using FREETEXT */
  FREETEXT = 'FREETEXT'
}

/**
 * Query parameters for file searches
 *
 * Defines all supported filtering and pagination options for searching files
 * via the Windows Search Indexer.
 */
export interface FileSearchQueryParams {
  /** Full-text search query applied to filenames and indexed content */
  searchText?: string;

  /** Search mode: CONTAINS for exact match, FREETEXT for natural language */
  searchMode?: SearchMode;

  /** Restrict search to files under this directory path */
  path?: string;

  /** Filter by filename pattern (supports wildcards: *, ?) */
  fileName?: string;

  /** Filter by file extension (e.g., '.docx', '.pdf', '.ts') */
  fileType?: string;

  /** Minimum file size in bytes */
  minSize?: number;

  /** Maximum file size in bytes */
  maxSize?: number;

  /** Files modified after this timestamp */
  modifiedAfter?: Date;

  /** Files modified before this timestamp */
  modifiedBefore?: Date;

  /** Files created after this timestamp */
  createdAfter?: Date;

  /** Files created before this timestamp */
  createdBefore?: Date;

  /** Filter by document author metadata */
  author?: string;

  /** Maximum number of results per page (default 500, max 1000) */
  limit: number;

  /** Pagination offset (default 0) */
  offset: number;
}

/**
 * A single file search result entry
 *
 * Represents a file found by the Windows Search Indexer with all relevant metadata.
 * Path and author fields may contain anonymized PII depending on configuration.
 */
export interface FileSearchEntry {
  /** Full file path (PII-anonymized if configured) */
  path: string;

  /** File name with extension */
  fileName: string;

  /** File extension (normalized: lowercase, with dot) */
  fileType: string;

  /** File size in bytes */
  size: number;

  /** Last modified timestamp */
  dateModified: Date;

  /** Creation timestamp */
  dateCreated: Date;

  /** Document author (PII-anonymized if configured, undefined if not available) */
  author?: string;

  /** Document title (undefined if not available) */
  title?: string;

  /** Document tags/keywords (empty array if not available) */
  tags: string[];
}

/**
 * Pagination metadata for file search results
 *
 * Provides information about the current result set and available pagination.
 * Uses offset-based pagination.
 */
export interface FileSearchPageInfo {
  /** Whether there are more results available after this page */
  hasNextPage: boolean;

  /** Whether there are results available before this page */
  hasPreviousPage: boolean;

  /** Offset of the first result on this page */
  startCursor: number;

  /** Offset of the last result on this page */
  endCursor: number;
}

/**
 * Metrics collected during query execution
 *
 * Tracks performance and usage information for monitoring and debugging.
 */
export interface FileSearchQueryMetrics {
  /** Total number of searches executed by this provider */
  searchCount: number;

  /** Time taken to execute the query in milliseconds */
  responseDurationMs: number;

  /** Number of results returned in this query */
  resultsReturned: number;
}

/**
 * Complete result of a file search query
 *
 * Contains file entries, pagination info, totals, and execution metrics.
 */
export interface FileSearchResult {
  /** List of file entries matching the search */
  files: FileSearchEntry[];

  /** Pagination metadata for navigating results */
  pageInfo: FileSearchPageInfo;

  /** Total number of results across all pages */
  totalCount: number;

  /** Performance and usage metrics for this query */
  metrics: FileSearchQueryMetrics;
}
