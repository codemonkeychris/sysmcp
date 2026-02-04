/**
 * Service types and interfaces
 */

/**
 * Service state machine states
 */
export type ServiceState = 'disabled' | 'starting' | 'ready' | 'error' | 'stopping';

/**
 * Service configuration
 */
export interface ServiceConfig {
  name: string;
  type: string;
  requiredPermissions?: string[];
  config?: Record<string, unknown>;
}

/**
 * Service instance with state tracking
 */
export interface Service extends ServiceConfig {
  state: ServiceState;
  errorMessage?: string;
  startedAt?: Date;
}

/**
 * Registry interface
 */
export interface ServiceRegistry {
  register(config: ServiceConfig): void;
  get(name: string): Service | undefined;
  getAll(): Service[];
  exists(name: string): boolean;
  remove(name: string): boolean;
  updateState(name: string, state: ServiceState, errorMessage?: string): void;
}
