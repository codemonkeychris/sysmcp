/**
 * EventLog MCP Service
 *
 * Wraps the EventLog GraphQL API and exposes it as MCP tools
 */

import { IService, ToolExecutionResult } from '../services/shared/service-interface';
import { ToolDefinition } from './message-types';

export class EventLogMcpService implements IService {
  readonly id = 'eventlog';
  readonly name = 'EventLog Service';
  readonly version = '1.0.0';
  readonly enabled = true;

  constructor(private graphqlUrl: string = 'http://localhost:3000/graphql') {}

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'eventlog_query',
        description: 'Query Windows Event Logs with filters',
        inputSchema: {
          type: 'object',
          properties: {
            logName: {
              type: 'string',
              description: 'Event log name (System, Application, Security, etc.)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of events to return (default: 100)',
            },
            offset: {
              type: 'number',
              description: 'Skip first N events (default: 0)',
            },
            minLevel: {
              type: 'string',
              enum: ['Information', 'Warning', 'Error', 'Critical'],
              description: 'Minimum event level to return',
            },
            source: {
              type: 'string',
              description: 'Filter by event source name',
            },
            startTime: {
              type: 'string',
              description: 'ISO 8601 timestamp for start of time range',
            },
            endTime: {
              type: 'string',
              description: 'ISO 8601 timestamp for end of time range',
            },
          },
          required: ['logName'],
        },
      },
      {
        name: 'eventlog_list_logs',
        description: 'List available event logs',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    try {
      if (toolName === 'eventlog_query') {
        return await this.queryEventLog(args);
      } else if (toolName === 'eventlog_list_logs') {
        return await this.listEventLogs();
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

  private async queryEventLog(args: Record<string, unknown>): Promise<ToolExecutionResult> {
    // Build query dynamically to avoid null parameters
    const hasFilters = args.minLevel || args.source || args.startTime || args.endTime || args.messageContains;
    
    const query = hasFilters ? `
      query QueryEventLog(
        $logName: String!
        $limit: Int
        $offset: Int
        $minLevel: EventLevel
        $source: String
        $startTime: String
        $endTime: String
        $messageContains: String
      ) {
        eventLogs(
          logName: $logName
          limit: $limit
          offset: $offset
          minLevel: $minLevel
          source: $source
          startTime: $startTime
          endTime: $endTime
          messageContains: $messageContains
        ) {
          entries {
            id
            level
            source
            eventId
            timestamp
            message
            computername
            username
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
    ` : `
      query QueryEventLog($logName: String!, $limit: Int, $offset: Int) {
        eventLogs(logName: $logName, limit: $limit, offset: $offset) {
          entries {
            id
            level
            source
            eventId
            timestamp
            message
            computername
            username
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

    const variables: Record<string, unknown> = {
      logName: args.logName,
      limit: args.limit ? Number(args.limit) : 100,
      offset: args.offset ? Number(args.offset) : 0,
    };
    if (args.minLevel) variables.minLevel = args.minLevel;
    if (args.source) variables.source = args.source;
    if (args.startTime) variables.startTime = args.startTime;
    if (args.endTime) variables.endTime = args.endTime;
    if (args.messageContains) variables.messageContains = args.messageContains;

    try {
      const requestBody = {
        query,
        variables,
      };
      console.error('[EventLog MCP] Sending GraphQL request:', {
        url: this.graphqlUrl,
        variables,
      });

      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json() as any;

      if (json.errors) {
        console.error('GraphQL errors:', json.errors);
        return {
          success: false,
          error: {
            message: `GraphQL error: ${json.errors.map((e: any) => e.message).join(', ')}`,
          },
        };
      }

      const result = json.data?.eventLogs;
      if (!result) {
        return {
          success: false,
          error: {
            message: 'No data returned from EventLog API',
          },
        };
      }

      return {
        success: true,
        data: {
          logName: args.logName,
          entries: result.entries || [],
          totalCount: result.totalCount || 0,
          pageInfo: result.pageInfo,
          metrics: result.metrics,
          returned: result.entries?.length || 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to query EventLog API at ${this.graphqlUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async listEventLogs(): Promise<ToolExecutionResult> {
    // Return information about common Windows event logs
    return {
      success: true,
      data: {
        logs: [
          { name: 'System', description: 'System events' },
          { name: 'Application', description: 'Application events' },
          { name: 'Security', description: 'Security events (requires admin)' },
        ],
        message: 'Use eventlog_query with one of these log names to query events',
      },
    };
  }

  enable(): void {
    // Already enabled
  }

  disable(): void {
    // Can't disable for now
  }
}
