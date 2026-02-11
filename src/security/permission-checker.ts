/**
 * Permission Checker
 *
 * Centralized, stateless permission enforcement logic.
 * Reads current config from service config managers and applies permission rules.
 * Supports test overrides for isolated testing without modifying config managers.
 *
 * SECURITY: This is the primary permission enforcement point.
 * Both the GraphQL middleware and per-resolver checks use this module.
 */

import {
  OperationType,
  PermissionCheckResult,
  TestOverride,
  ServiceConfigProvider,
} from './types';

/**
 * Permission checker interface
 */
export interface PermissionChecker {
  check(serviceId: string, operation: OperationType): PermissionCheckResult;
}

/**
 * Permission checker implementation with test override support
 */
export class PermissionCheckerImpl implements PermissionChecker {
  private configProviders: Map<string, ServiceConfigProvider>;
  private testOverrides: Map<string, TestOverride> | null = null;

  constructor(configProviders: Map<string, ServiceConfigProvider>) {
    this.configProviders = configProviders;
  }

  /**
   * Check if an operation is allowed for a service
   *
   * Permission logic:
   * - disabled → deny all operations
   * - read-only → allow reads, deny writes
   * - read-write → allow all operations
   * - unknown service → deny with reason
   */
  check(serviceId: string, operation: OperationType): PermissionCheckResult {
    // Check test overrides first
    if (this.testOverrides?.has(serviceId)) {
      const override = this.testOverrides.get(serviceId)!;
      return this.applyPermissionLogic(
        override.enabled ?? true,
        override.permissionLevel ?? 'read-only',
        serviceId,
        operation
      );
    }

    // Look up config provider for service
    const provider = this.configProviders.get(serviceId);
    if (!provider) {
      // SECURITY: Sanitize serviceId in error messages (SEC-012)
      const safeId = String(serviceId).slice(0, 50).replace(/[^a-zA-Z0-9_\-]/g, '');
      return { allowed: false, reason: `Unknown service: ${safeId}` };
    }

    return this.applyPermissionLogic(
      provider.isEnabled(),
      provider.getPermissionLevel(),
      serviceId,
      operation
    );
  }

  /**
   * Apply permission logic based on enabled state and permission level.
   * SECURITY: Uses whitelist pattern — only explicitly recognized levels are allowed.
   * Unknown levels are denied by default.
   */
  private applyPermissionLogic(
    enabled: boolean,
    permissionLevel: string,
    serviceId: string,
    operation: OperationType
  ): PermissionCheckResult {
    // Disabled services deny all operations
    if (!enabled || permissionLevel === 'disabled') {
      return { allowed: false, reason: `Service '${serviceId}' is disabled` };
    }

    // SECURITY: Whitelist pattern — explicitly match known levels
    if (permissionLevel === 'read-only') {
      if (operation === 'write') {
        return { allowed: false, reason: `Service '${serviceId}' is read-only` };
      }
      return { allowed: true };
    }

    if (permissionLevel === 'read-write') {
      return { allowed: true };
    }

    // SECURITY: Unknown permission level — deny by default (fail-closed)
    return { allowed: false, reason: `Unknown permission level for service '${serviceId}'` };
  }

  /**
   * Set test overrides for permission checking
   * Only works when NODE_ENV === 'test'
   *
   * @throws Error if NODE_ENV is not 'test'
   */
  setTestOverrides(overrides: Record<string, TestOverride>): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Test overrides can only be set when NODE_ENV is "test"');
    }
    this.testOverrides = new Map(Object.entries(overrides));
  }

  /**
   * Clear all test overrides, restoring config-manager-based behavior
   */
  clearTestOverrides(): void {
    this.testOverrides = null;
  }

  /**
   * Check if test overrides are active
   */
  hasTestOverrides(): boolean {
    return this.testOverrides !== null && this.testOverrides.size > 0;
  }
}

/**
 * Factory function to create a PermissionChecker
 */
export function createPermissionChecker(
  configProviders: Map<string, ServiceConfigProvider>
): PermissionCheckerImpl {
  return new PermissionCheckerImpl(configProviders);
}
