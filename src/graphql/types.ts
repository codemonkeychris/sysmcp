/**
 * GraphQL type definitions
 */

/**
 * Service state enum matching backend states
 */
export enum ServiceStateEnum {
  DISABLED = 'disabled',
  STARTING = 'starting',
  READY = 'ready',
  ERROR = 'error',
  STOPPING = 'stopping',
}

/**
 * Service GraphQL type
 */
export interface GQLService {
  name: string;
  type: string;
  state: ServiceStateEnum;
  errorMessage?: string;
  startedAt?: string; // ISO 8601 string
  requiredPermissions?: string[];
}

/**
 * Health status GraphQL type
 */
export interface GQLHealthStatus {
  status: 'ok' | 'degraded';
  uptime: number; // seconds
  services: number; // count of registered services
  timestamp: string; // ISO 8601 string
}

/**
 * Service registration input
 */
export interface RegisterServiceInput {
  name: string;
  type: string;
  requiredPermissions?: string[];
  config?: Record<string, unknown>;
}

/**
 * Service registration result
 */
export interface ServiceRegistrationResult {
  success: boolean;
  service?: GQLService;
  error?: string;
}

/**
 * Service operation result (for start, stop, restart)
 */
export interface ServiceOperationResult {
  success: boolean;
  service?: GQLService;
  error?: string;
}
