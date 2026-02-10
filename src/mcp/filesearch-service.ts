/**
 * FileSearch MCP Service
 *
 * Wraps the FileSearch GraphQL API and exposes it as MCP tools.
 * Follows the EventLog MCP service pattern.
 */

import { IService, ToolExecutionResult } from '../services/shared/service-interface';
import { ToolDefinition } from './message-types';

export class FileSearchMcpService implements IService {
  readonly id = 'filesearch';
  readonly name = 'FileSearch Service';
  readonly version = '1.0.0';
  readonly enabled = true;

  constructor(private graphqlUrl: string = 'http://localhost:3000/graphql') {}

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'filesearch_query',
        description: 'Search files indexed by Windows Search with full-text search, file type, size, and date filters',
        inputSchema: {
          type: 'object',
          properties: {
            searchText: {
              type: 'string',
              description: 'Full-text search query',
            },
            searchMode: {
              type: 'string',
              enum: ['CONTAINS', 'FREETEXT'],
              description: 'Search mode: CONTAINS (exact phrase) or FREETEXT (natural language). Default: CONTAINS',
            },
            path: {
              type: 'string',
              description: 'Restrict search to a directory path (e.g., C:\\Users\\Documents)',
            },
            fileName: {
              type: 'string',
              description: 'File name pattern with wildcards (* and ?)',
            },
            fileType: {
              type: 'string',
              description: 'File extension filter (e.g., .pdf, .docx, .txt)',
            },
            author: {
              type: 'string',
              description: 'Filter by document author',
            },
            minSize: {
              type: 'number',
              description: 'Minimum file size in bytes',
            },
            maxSize: {
              type: 'number',
              description: 'Maximum file size in bytes',
            },
            modifiedAfter: {
              type: 'string',
              description: 'ISO 8601 timestamp - files modified after this date',
            },
            modifiedBefore: {
              type: 'string',
              description: 'ISO 8601 timestamp - files modified before this date',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 25, max: 1000)',
            },
            offset: {
              type: 'number',
              description: 'Skip first N results for pagination (default: 0)',
            },
          },
        },
      },
    ];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    try {
      if (toolName === 'filesearch_query') {
        return await this.searchFiles(args);
      }

      return {
        success: false,
        error: {
          message: `Unknown tool: ${toolName}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: `Error calling ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  private async searchFiles(args: Record<string, unknown>): Promise<ToolExecutionResult> {
    // Build GraphQL variables from MCP args
    const variables: Record<string, unknown> = {};
    if (args.searchText) variables.searchText = args.searchText;
    if (args.searchMode) variables.searchMode = args.searchMode;
    if (args.path) variables.path = args.path;
    if (args.fileName) variables.fileName = args.fileName;
    if (args.fileType) variables.fileType = args.fileType;
    if (args.author) variables.author = args.author;
    if (args.minSize !== undefined) variables.minSize = Number(args.minSize);
    if (args.maxSize !== undefined) variables.maxSize = Number(args.maxSize);
    if (args.modifiedAfter) variables.modifiedAfter = args.modifiedAfter;
    if (args.modifiedBefore) variables.modifiedBefore = args.modifiedBefore;
    if (args.limit) variables.limit = Number(args.limit);
    if (args.offset) variables.offset = Number(args.offset);

    const query = `
      query SearchFiles(
        $searchText: String
        $searchMode: FileSearchMode
        $path: String
        $fileName: String
        $fileType: String
        $author: String
        $minSize: Int
        $maxSize: Int
        $modifiedAfter: String
        $modifiedBefore: String
        $limit: Int
        $offset: Int
      ) {
        fileSearch(
          searchText: $searchText
          searchMode: $searchMode
          path: $path
          fileName: $fileName
          fileType: $fileType
          author: $author
          minSize: $minSize
          maxSize: $maxSize
          modifiedAfter: $modifiedAfter
          modifiedBefore: $modifiedBefore
          limit: $limit
          offset: $offset
        ) {
          files {
            path
            fileName
            fileType
            size
            dateModified
            dateCreated
            author
            title
            tags
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          totalCount
          metrics {
            queryCount
            responseDurationMs
            resultsReturned
          }
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json() as any;

      if (json.errors) {
        return {
          success: false,
          error: {
            message: `GraphQL error: ${json.errors.map((e: any) => e.message).join(', ')}`,
          },
        };
      }

      const result = json.data?.fileSearch;
      if (!result) {
        return {
          success: false,
          error: { message: 'No data returned from FileSearch API' },
        };
      }

      return {
        success: true,
        data: {
          files: result.files || [],
          totalCount: result.totalCount || 0,
          pageInfo: result.pageInfo,
          metrics: result.metrics,
          returned: result.files?.length || 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to query FileSearch API at ${this.graphqlUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  enable(): void {
    // Already enabled
  }

  disable(): void {
    // Can't disable for now
  }
}
