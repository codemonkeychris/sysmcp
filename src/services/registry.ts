/**
 * In-memory Service Registry Implementation
 * Manages service instances and their states
 */

import { Service, ServiceConfig, ServiceRegistry, ServiceState } from './types';
import { Logger } from '../logger';

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ServiceState, ServiceState[]> = {
  disabled: ['starting', 'error'],
  starting: ['ready', 'error'],
  ready: ['stopping', 'error'],
  error: ['starting', 'disabled', 'stopping'],
  stopping: ['disabled', 'error'],
};

/**
 * Service Registry implementation
 */
class ServiceRegistryImpl implements ServiceRegistry {
  private services: Map<string, Service>;
  private logger?: Logger;

  constructor(logger?: Logger) {
    this.services = new Map();
    this.logger = logger;
  }

  register(config: ServiceConfig): void {
    if (this.services.has(config.name)) {
      const error = `Service '${config.name}' is already registered`;
      this.logger?.warn(error);
      throw new Error(error);
    }

    const service: Service = {
      ...config,
      state: 'disabled',
    };

    this.services.set(config.name, service);
    this.logger?.debug(`Registered service: ${config.name}`, { type: config.type });
  }

  get(name: string): Service | undefined {
    return this.services.get(name);
  }

  getAll(): Service[] {
    return Array.from(this.services.values());
  }

  exists(name: string): boolean {
    return this.services.has(name);
  }

  remove(name: string): boolean {
    const existed = this.services.delete(name);
    if (existed) {
      this.logger?.debug(`Removed service: ${name}`);
    }
    return existed;
  }

  updateState(name: string, state: ServiceState, errorMessage?: string): void {
    const service = this.services.get(name);

    if (!service) {
      const error = `Service '${name}' not found`;
      this.logger?.error(error);
      throw new Error(error);
    }

    // Validate state transition
    const validNextStates = VALID_TRANSITIONS[service.state];
    if (!validNextStates.includes(state)) {
      const error = `Invalid state transition: ${service.state} -> ${state}`;
      this.logger?.error(error, {
        currentService: name,
        from: service.state,
        to: state,
      });
      throw new Error(error);
    }

    // Update service
    service.state = state;
    service.errorMessage = errorMessage;

    // Set startedAt when transitioning to READY
    if (state === 'ready') {
      service.startedAt = new Date();
    }

    // Clear error message when transitioning away from ERROR
    if (service.state !== 'error' && !errorMessage) {
      service.errorMessage = undefined;
    }

    this.logger?.debug(`State transition: ${name}`, {
      from: service.state,
      to: state,
      error: errorMessage,
    });
  }
}

/**
 * Create a new service registry
 */
export function createRegistry(logger?: Logger): ServiceRegistry {
  return new ServiceRegistryImpl(logger);
}

export { ServiceRegistry, Service, ServiceConfig, ServiceState } from './types';
