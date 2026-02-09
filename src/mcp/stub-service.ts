/**
 * Stub test service for MCP debugging
 */

import { IService, ToolExecutionResult } from '../services/shared/service-interface';
import { ToolDefinition } from './message-types';

export class StubTestService implements IService {
  readonly id = 'test-service';
  readonly name = 'Test Service';
  readonly version = '1.0.0';
  readonly enabled = true;

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'test_hello',
        description: 'A simple test tool',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name to greet',
            },
          },
          required: ['name'],
        },
      },
    ];
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    if (toolName === 'test_hello') {
      const personName = args.name as string;
      return {
        success: true,
        data: `Hello, ${personName}! This is a test tool from SysMCP MCP server.`,
      };
    }

    return {
      success: false,
      error: {
        message: `Unknown tool: ${toolName}`,
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
