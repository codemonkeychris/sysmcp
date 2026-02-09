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

  constructor(private graphqlUrl: string = 'http://localhost:4000/graphql') {}

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
    const query = `
      query QueryEventLog(
        $logName: String!
        $limit: Int
        $offset: Int
        $minLevel: String
        $source: String
        $startTime: DateTime
        $endTime: DateTime
      ) {
        eventLog {
          query(
            logName: $logName
            limit: $limit
            offset: $offset
            minLevel: $minLevel
            source: $source
            startTime: $startTime
            endTime: $endTime
          ) {
            success
            events {
              id
              logName
              level
              source
              eventId
              timeGenerated
              message
              computerName
              userName
            }
            total
            hasMore
            errors {
              code
              message
            }
          }
        }
      }
    `;

    const variables = {
      logName: args.logName,
      limit: args.limit || 100,
      offset: args.offset || 0,
      minLevel: args.minLevel,
      source: args.source,
      startTime: args.startTime,
      endTime: args.endTime,
    };

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
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

      const result = json.data?.eventLog?.query;
      if (!result) {
        return {
          success: false,
          error: {
            message: 'No data returned from EventLog API',
          },
        };
      }

      if (!result.success) {
        return {
          success: false,
          error: {
            message: result.errors?.[0]?.message || 'EventLog query failed',
          },
        };
      }

      return {
        success: true,
        data: {
          logName: args.logName,
          events: result.events,
          total: result.total,
          hasMore: result.hasMore,
          returned: result.events?.length || 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to query EventLog API at ${this.graphqlUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async listEventLogs(): Promise<ToolExecutionResult> {
    const query = `
      query ListEventLogs {
        eventLog {
          listLogs {
            success
            logs {
              name
              recordCount
              maximumSize
              retention
            }
            errors {
              code
              message
            }
          }
        }
      }
    `;

    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
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

      const result = json.data?.eventLog?.listLogs;
      if (!result) {
        return {
          success: false,
          error: {
            message: 'No data returned from EventLog API',
          },
        };
      }

      if (!result.success) {
        return {
          success: false,
          error: {
            message: result.errors?.[0]?.message || 'EventLog list failed',
          },
        };
      }

      return {
        success: true,
        data: {
          logs: result.logs,
          count: result.logs?.length || 0,
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to query EventLog API at ${this.graphqlUrl}: ${error instanceof Error ? error.message : String(error)}`
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
