/**
 * MCP Protocol Message Types (JSON-RPC 2.0 over stdio)
 *
 * Defines all message structures for the Model Context Protocol,
 * including requests, responses, notifications, and errors.
 */

/**
 * JSON-RPC 2.0 Base Message
 */
export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
}

/**
 * JSON-RPC Request Message
 */
export interface JsonRpcRequest extends JsonRpcMessage {
  method: string;
  params?: unknown;
  id: string | number | null;
}

/**
 * JSON-RPC Notification (no response expected)
 */
export interface JsonRpcNotification extends JsonRpcMessage {
  method: string;
  params?: unknown;
  id?: undefined;
}

/**
 * JSON-RPC Success Response
 */
export interface JsonRpcSuccessResponse extends JsonRpcMessage {
  result: unknown;
  id: string | number | null;
}

/**
 * JSON-RPC Error Response
 */
export interface JsonRpcErrorResponse extends JsonRpcMessage {
  error: JsonRpcError;
  id: string | number | null;
}

/**
 * JSON-RPC Error Object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Any JSON-RPC Message
 */
export type JsonRpcAnyMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccessResponse
  | JsonRpcErrorResponse;

/**
 * MCP Initialization Request
 */
export interface InitializeRequest {
  protocolVersion: string;
  capabilities: {
    tools?: { listChanged: boolean };
    resources?: { subscribe: boolean };
    [key: string]: unknown;
  };
  clientInfo: {
    name: string;
    version: string;
  };
}

/**
 * MCP Initialization Response
 */
export interface InitializeResponse {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools?: { listChanged: boolean };
    resources?: { subscribe: boolean };
    [key: string]: unknown;
  };
}

/**
 * MCP Initialized Notification (sent by client)
 */
export interface InitializedNotification {
  // No parameters
}

/**
 * Tool Definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * JSON Schema (simplified)
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Tools List Request
 */
export interface ToolsListRequest {
  // No parameters
}

/**
 * Tools List Response
 */
export interface ToolsListResponse {
  tools: ToolDefinition[];
}

/**
 * Tool Call Request
 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool Execution Result
 */
export interface ToolResult {
  type: 'text' | 'image' | 'blob';
  text?: string;
  mimeType?: string;
  blob?: string; // base64
}

/**
 * Tool Call Response
 */
export interface ToolCallResponse {
  content: ToolResult[];
  isError?: boolean;
}

/**
 * Request Context (internal tracking)
 */
export interface RequestContext {
  requestId: string | number | null;
  method: string;
  startTime: number;
  isNotification: boolean;
}

/**
 * Handler function type for MCP methods
 */
export type MessageHandler = (
  params: unknown,
  requestId: string | number | null
) => Promise<unknown>;

/**
 * Handler registry
 */
export type HandlerRegistry = Map<string, MessageHandler>;
