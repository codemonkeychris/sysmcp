/**
 * Service Manager
 *
 * Manages registration, discovery, and lifecycle of MCP services
 */

import { IService, ToolExecutionResult } from '../services/shared/service-interface';
import { ToolDefinition } from './message-types';

/**
 * Service Manager
 *
 * SECURITY: All services must implement IService interface for proper isolation
 */
export class ServiceManager {
  private services: Map<string, IService> = new Map();

  /**
   * Register a service with the manager
   *
   * @param service Service instance to register
   * @throws Error if service ID already registered
   */
  registerService(service: IService): void {
    if (!service || !service.id) {
      throw new Error('Service must have a valid id');
    }

    if (this.services.has(service.id)) {
      throw new Error(`Service with id '${service.id}' already registered`);
    }

    if (
      !service.name ||
      !service.version ||
      typeof service.enabled === 'undefined'
    ) {
      throw new Error('Service missing required fields: name, version, enabled');
    }

    this.services.set(service.id, service);
  }

  /**
   * Get a service by ID
   *
   * @param serviceId Service ID
   * @returns Service instance or undefined if not found
   */
  getService(serviceId: string): IService | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all registered services
   *
   * @returns Array of all registered services
   */
  getAllServices(): IService[] {
    return Array.from(this.services.values());
  }

  /**
   * Get all tools from all enabled services
   *
   * @returns Array of tool definitions
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const service of this.services.values()) {
      if (service.enabled) {
        const serviceTools = service.getTools();
        tools.push(...serviceTools);
      }
    }

    return tools;
  }

  /**
   * Route a tool call to the appropriate service
   *
   * Tool names should follow the pattern: "service_toolName" to enable routing.
   * If no service is found with that prefix, searches all services for a tool
   * with that exact name.
   *
   * @param toolName Name of the tool to call
   * @param args Tool arguments
   * @returns Promise resolving to execution result
   * @throws Error if tool not found or service disabled
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    // Try to extract service ID from tool name (format: service_toolName)
    const parts = toolName.split('_');
    const possibleServiceId = parts[0];

    // First, try exact service ID match
    if (possibleServiceId && this.services.has(possibleServiceId)) {
      const service = this.services.get(possibleServiceId)!;

      if (!service.enabled) {
        return {
          success: false,
          error: {
            message: `Service '${service.id}' is disabled`,
          },
        };
      }

      try {
        return await service.callTool(toolName, args);
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: this.extractErrorMessage(err),
            code: this.extractErrorCode(err),
          },
        };
      }
    }

    // Fallback: search all enabled services for matching tool
    for (const service of this.services.values()) {
      if (!service.enabled) {
        continue;
      }

      const tools = service.getTools();
      if (tools.some((t) => t.name === toolName)) {
        try {
          return await service.callTool(toolName, args);
        } catch (err: unknown) {
          return {
            success: false,
            error: {
              message: this.extractErrorMessage(err),
              code: this.extractErrorCode(err),
            },
          };
        }
      }
    }

    // Tool not found in any service
    return {
      success: false,
      error: {
        message: `Tool '${toolName}' not found`,
      },
    };
  }

  /**
   * Enable a service
   *
   * @param serviceId Service ID to enable
   * @throws Error if service not found
   */
  enableService(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service '${serviceId}' not found`);
    }
    service.enable();
  }

  /**
   * Disable a service
   *
   * @param serviceId Service ID to disable
   * @throws Error if service not found
   */
  disableService(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service '${serviceId}' not found`);
    }
    service.disable();
  }

  /**
   * Check if a service is enabled
   *
   * @param serviceId Service ID
   * @returns true if service exists and is enabled
   */
  isServiceEnabled(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    return service ? service.enabled : false;
  }

  /**
   * Extract error message from unknown error
   */
  private extractErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message || 'Unknown error';
    }
    if (typeof err === 'string') {
      return err;
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const msg = (err as { message: unknown }).message;
      if (typeof msg === 'string') {
        return msg;
      }
    }
    return 'Unknown error';
  }

  /**
   * Extract error code from unknown error
   */
  private extractErrorCode(err: unknown): number | undefined {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code: unknown }).code === 'number'
    ) {
      return (err as { code: number }).code;
    }
    return undefined;
  }
}
