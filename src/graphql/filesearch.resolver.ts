/**
 * FileSearch GraphQL Resolver
 *
 * Implements the fileSearch query resolver for searching files via the
 * Windows Search Indexer through GraphQL. Handles input validation,
 * service availability, error handling, metrics, and PII anonymization.
 */

import { GraphQLError } from 'graphql';
import { Logger } from '../logger/types';
import { FileSearchProvider, PermissionDeniedException, ValidationException, ScopeViolationException, OperationFailedException } from '../services/filesearch/provider';
import { PathAnonymizer } from '../services/filesearch/path-anonymizer';
import { FileSearchQueryParams, SearchMode } from '../services/filesearch/types';

/**
 * Custom GraphQL error codes for FileSearch operations
 */
export enum FileSearchErrorCode {
  InvalidLimit = 'INVALID_LIMIT',
  InvalidOffset = 'INVALID_OFFSET',
  InvalidDateRange = 'INVALID_DATE_RANGE',
  InvalidSearchMode = 'INVALID_SEARCH_MODE',
  InvalidFileType = 'INVALID_FILE_TYPE',
  InvalidSizeRange = 'INVALID_SIZE_RANGE',
  ServiceDisabled = 'SERVICE_DISABLED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  PermissionDenied = 'PERMISSION_DENIED',
  ScopeViolation = 'SCOPE_VIOLATION',
  SearchFailed = 'SEARCH_FAILED',
  UnknownError = 'UNKNOWN_ERROR'
}

/**
 * Custom GraphQL error for FileSearch
 */
export class FileSearchGraphQLError extends GraphQLError {
  code: FileSearchErrorCode;
  timestamp: Date;

  constructor(message: string, code: FileSearchErrorCode) {
    super(message, {
      extensions: {
        code,
        timestamp: new Date().toISOString()
      }
    });
    this.code = code;
    this.timestamp = new Date();
  }
}

/**
 * Arguments for the fileSearch GraphQL query
 */
interface FileSearchArgs {
  searchText?: string;
  searchMode?: string;
  path?: string;
  fileName?: string;
  fileType?: string;
  author?: string;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: string;
  modifiedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}

/**
 * GraphQL context for FileSearch resolvers
 */
interface ResolverContext {
  logger: Logger;
  fileSearchProvider?: FileSearchProvider;
  fileSearchAnonymizer?: PathAnonymizer;
}

/**
 * Parse a search mode string to the SearchMode enum
 */
function parseSearchMode(mode?: string): SearchMode | undefined {
  if (!mode) return undefined;
  const upper = mode.toUpperCase();
  if (upper === 'CONTAINS') return SearchMode.CONTAINS;
  if (upper === 'FREETEXT') return SearchMode.FREETEXT;
  return undefined;
}

/**
 * Parse an ISO date string to a Date, or return undefined
 */
function parseOptionalDate(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new FileSearchGraphQLError(
      `Invalid date format: ${dateStr}. Use ISO 8601 format.`,
      FileSearchErrorCode.InvalidDateRange
    );
  }
  return date;
}

/**
 * FileSearch query resolver
 */
export async function fileSearchResolver(
  _parent: any,
  args: FileSearchArgs,
  context: ResolverContext
): Promise<any> {
  const startTime = Date.now();
  const logger = context.logger.child('filesearch-resolver');

  try {
    // Check service availability
    if (!context.fileSearchProvider) {
      throw new FileSearchGraphQLError(
        'FileSearch service not available',
        FileSearchErrorCode.ServiceDisabled
      );
    }

    // Parse and validate args
    const limit = args.limit ?? 25;
    const offset = args.offset ?? 0;

    if (limit < 1 || limit > 1000) {
      throw new FileSearchGraphQLError(
        'limit must be between 1 and 1000',
        FileSearchErrorCode.InvalidLimit
      );
    }

    if (offset < 0) {
      throw new FileSearchGraphQLError(
        'offset must be >= 0',
        FileSearchErrorCode.InvalidOffset
      );
    }

    const searchMode = parseSearchMode(args.searchMode) ?? SearchMode.CONTAINS;

    // Build query params
    const params: FileSearchQueryParams = {
      searchText: args.searchText || '',
      searchMode,
      path: args.path,
      fileName: args.fileName,
      fileType: args.fileType,
      author: args.author,
      minSize: args.minSize ?? undefined,
      maxSize: args.maxSize ?? undefined,
      modifiedAfter: parseOptionalDate(args.modifiedAfter),
      modifiedBefore: parseOptionalDate(args.modifiedBefore),
      createdAfter: parseOptionalDate(args.createdAfter),
      createdBefore: parseOptionalDate(args.createdBefore),
      limit,
      offset
    };

    logger.debug('Processing fileSearch query', {
      hasSearchText: !!args.searchText,
      hasPath: !!args.path,
      limit,
      offset
    });

    // Execute search
    const result = await context.fileSearchProvider.search(params);

    // Apply PII anonymization if anonymizer is available
    let files = result.files;
    if (context.fileSearchAnonymizer) {
      files = context.fileSearchAnonymizer.anonymizeEntries(files);
    }

    const responseDurationMs = Date.now() - startTime;

    // Map to GraphQL result
    const gqlResult = {
      files: files.map(f => ({
        path: f.path,
        fileName: f.fileName,
        fileType: f.fileType,
        size: f.size,
        dateModified: f.dateModified.toISOString(),
        dateCreated: f.dateCreated.toISOString(),
        author: f.author || null,
        title: f.title || null,
        tags: f.tags || []
      })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: offset > 0,
        startCursor: offset,
        endCursor: offset + files.length - 1
      },
      totalCount: result.totalCount,
      metrics: {
        queryCount: context.fileSearchProvider.getMetrics().totalQueryCount,
        responseDurationMs,
        resultsReturned: files.length
      }
    };

    logger.info('FileSearch query completed', {
      resultCount: files.length,
      totalCount: result.totalCount,
      durationMs: responseDurationMs
    });

    return gqlResult;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Re-throw GraphQL errors
    if (error instanceof FileSearchGraphQLError) {
      logger.warn('FileSearch validation error', {
        code: error.code,
        message: error.message,
        durationMs
      });
      throw error;
    }

    // Map provider exceptions to GraphQL errors
    if (error instanceof PermissionDeniedException) {
      throw new FileSearchGraphQLError(
        'FileSearch service is disabled',
        FileSearchErrorCode.ServiceDisabled
      );
    }

    if (error instanceof ValidationException) {
      throw new FileSearchGraphQLError(
        error.message,
        FileSearchErrorCode.InvalidLimit
      );
    }

    if (error instanceof ScopeViolationException) {
      throw new FileSearchGraphQLError(
        'Search path is outside allowed scope',
        FileSearchErrorCode.ScopeViolation
      );
    }

    if (error instanceof OperationFailedException) {
      logger.error('FileSearch operation failed', {
        error: error.message,
        durationMs
      });
      throw new FileSearchGraphQLError(
        'File search failed',
        FileSearchErrorCode.SearchFailed
      );
    }

    // Unknown error
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Unknown FileSearch error', { error: message, durationMs });
    throw new FileSearchGraphQLError(
      'File search failed',
      FileSearchErrorCode.UnknownError
    );
  }
}

/**
 * Export resolver compatible with Apollo Server
 */
export const filesearchResolver = {
  Query: {
    fileSearch: fileSearchResolver
  }
};
