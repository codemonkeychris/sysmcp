/**
 * Tool Executor
 *
 * Validates and executes tools through the service manager
 */

import { ServiceManager } from './service-manager';
import { SchemaValidator } from './schema-validator';
import { ToolDefinition, ToolCallRequest, ToolCallResponse, ToolResult } from './message-types';
import { ToolExecutionError, ValidationError } from './error-handler';

/**
 * Tool Executor
 *
 * Handles tool discovery, validation, and execution
 */
export class ToolExecutor {
  constructor(private serviceManager: ServiceManager) {}

  /**
   * Get all available tools
   */
  getTools(): ToolDefinition[] {
    return this.serviceManager.getAllTools();
  }

  /**
   * Get a tool by name
   */
  getTool(toolName: string): ToolDefinition | undefined {
    const tools = this.getTools();
    return tools.find((t) => t.name === toolName);
  }

  /**
   * Execute a tool with validation
   *
   * @param request Tool call request
   * @returns Promise resolving to tool response
   * @throws ToolExecutionError, ValidationError, or other MCP errors
   */
  async executeTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    // Validate tool exists
    const toolDef = this.getTool(request.name);
    if (!toolDef) {
      throw new ToolExecutionError(`Tool '${request.name}' not found`, request.name);
    }

    // Validate arguments against schema
    const validation = SchemaValidator.validate(
      request.arguments,
      toolDef.inputSchema
    );

    if (!validation.valid) {
      throw new ValidationError('Invalid tool arguments', 
        validation.errors.map((e) => ({
          field: e.path,
          message: e.message,
        }))
      );
    }

    // Execute tool through service manager
    const startTime = Date.now();
    const result = await this.serviceManager.callTool(
      request.name,
      request.arguments
    );
    const duration = Date.now() - startTime;

    // Format response
    if (!result.success) {
      throw new ToolExecutionError(
        result.error?.message || 'Tool execution failed',
        request.name,
        { duration }
      );
    }

    // Format successful result
    const content: ToolResult[] = [
      {
        type: 'text',
        text: JSON.stringify(result.data),
      },
    ];

    return {
      content,
      isError: false,
    };
  }
}
