/**
 * MCP Service Interface
 *
 * Standard interface that all MCP services must implement
 */

import { ToolDefinition } from '../../mcp/message-types';

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: {
    code?: number;
    message: string;
  };
}

/**
 * MCP Service Interface
 *
 * All services that participate in the MCP protocol must implement this interface.
 * Services are discoverable through the service manager and provide tools
 * that can be called via the MCP protocol.
 */
export interface IService {
  /**
   * Unique identifier for this service
   * Used to route tool calls (format: "service_name")
   */
  readonly id: string;

  /**
   * Human-readable name of the service
   */
  readonly name: string;

  /**
   * Service version
   */
  readonly version: string;

  /**
   * Whether this service is currently enabled
   * Services can be temporarily disabled
   */
  readonly enabled: boolean;

  /**
   * Get all tools provided by this service
   * Called during tools/list to discover available tools
   *
   * @returns Array of tool definitions
   */
  getTools(): ToolDefinition[];

  /**
   * Execute a tool provided by this service
   *
   * @param toolName Name of the tool to execute (must match a tool from getTools())
   * @param args Tool arguments as an object
   * @returns Promise resolving to execution result
   */
  callTool(toolName: string, args: Record<string, unknown>): Promise<ToolExecutionResult>;

  /**
   * Enable this service
   */
  enable(): void;

  /**
   * Disable this service
   */
  disable(): void;
}
