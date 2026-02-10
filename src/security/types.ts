/**
 * Shared Security Types
 *
 * Types used across the security layer for permission checking,
 * configuration, and audit logging.
 */

import { PermissionLevel } from '../services/eventlog/config';

// Re-export PermissionLevel for centralized access
export { PermissionLevel };

/**
 * Operation types for permission checking
 */
export type OperationType = 'read' | 'write';

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  /** Whether the operation is allowed */
  allowed: boolean;
  /** Reason for denial (only present when denied) */
  reason?: string;
}

/**
 * Test override for permission checking
 * Allows tests to force permission state without modifying config managers
 */
export interface TestOverride {
  /** Override the enabled state */
  enabled?: boolean;
  /** Override the permission level */
  permissionLevel?: PermissionLevel;
}

/**
 * Interface for retrieving service configuration
 * Config managers must implement this to integrate with PermissionChecker
 */
export interface ServiceConfigProvider {
  isEnabled(): boolean;
  getPermissionLevel(): PermissionLevel;
}

/**
 * Known service IDs in the system
 */
export const KNOWN_SERVICE_IDS = ['eventlog', 'filesearch'] as const;
export type KnownServiceId = typeof KNOWN_SERVICE_IDS[number];
