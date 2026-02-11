/**
 * Security Test Helpers
 *
 * Convenience functions for tests that need to control service permissions.
 * Uses PermissionChecker test override mechanism to avoid modifying config managers.
 *
 * Usage:
 *   import { enableAllServicesForTest } from '../security/test-helpers';
 *
 *   beforeEach(() => {
 *     enableAllServicesForTest(permissionChecker);
 *   });
 */

import { PermissionCheckerImpl } from './permission-checker';
import { PermissionLevel, KNOWN_SERVICE_IDS, TestOverride } from './types';

/**
 * Enable all known services in read-only mode for testing
 */
export function enableAllServicesForTest(
  checker: PermissionCheckerImpl,
  level: PermissionLevel = 'read-only'
): void {
  const overrides: Record<string, TestOverride> = {};
  for (const serviceId of KNOWN_SERVICE_IDS) {
    overrides[serviceId] = { enabled: true, permissionLevel: level };
  }
  checker.setTestOverrides(overrides);
}

/**
 * Enable a specific service for testing
 */
export function enableServiceForTest(
  checker: PermissionCheckerImpl,
  serviceId: string,
  level: PermissionLevel = 'read-only'
): void {
  // Preserve existing overrides and add/update this one
  const currentOverrides: Record<string, TestOverride> = {};

  // If there are existing overrides, we need to clear and re-set
  // Since we can't read existing overrides, build from known services
  checker.clearTestOverrides();

  currentOverrides[serviceId] = { enabled: true, permissionLevel: level };
  checker.setTestOverrides(currentOverrides);
}

/**
 * Disable a specific service for testing
 */
export function disableServiceForTest(
  checker: PermissionCheckerImpl,
  serviceId: string
): void {
  checker.clearTestOverrides();
  const overrides: Record<string, TestOverride> = {};
  overrides[serviceId] = { enabled: false, permissionLevel: 'disabled' };
  checker.setTestOverrides(overrides);
}

/**
 * Clear all test overrides, restoring normal permission behavior
 */
export function resetPermissionsForTest(checker: PermissionCheckerImpl): void {
  checker.clearTestOverrides();
}
