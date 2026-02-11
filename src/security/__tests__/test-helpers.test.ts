/**
 * Test Helpers Unit Tests
 */

import { PermissionCheckerImpl, createPermissionChecker } from '../permission-checker';
import { ServiceConfigProvider, PermissionLevel } from '../types';
import {
  enableAllServicesForTest,
  enableServiceForTest,
  disableServiceForTest,
  resetPermissionsForTest,
} from '../test-helpers';

function createMockProvider(
  enabled: boolean = true,
  permissionLevel: PermissionLevel = 'read-only'
): ServiceConfigProvider {
  return {
    isEnabled: jest.fn(() => enabled),
    getPermissionLevel: jest.fn(() => permissionLevel),
  };
}

describe('Security Test Helpers', () => {
  let checker: PermissionCheckerImpl;
  let providers: Map<string, ServiceConfigProvider>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    providers = new Map();
    providers.set('eventlog', createMockProvider(false, 'disabled'));
    providers.set('filesearch', createMockProvider(false, 'disabled'));
    checker = createPermissionChecker(providers);
  });

  describe('enableAllServicesForTest', () => {
    it('should enable both eventlog and filesearch', () => {
      enableAllServicesForTest(checker);

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('filesearch', 'read').allowed).toBe(true);
    });

    it('should default to read-only permission level', () => {
      enableAllServicesForTest(checker);

      expect(checker.check('eventlog', 'write').allowed).toBe(false);
      expect(checker.check('filesearch', 'write').allowed).toBe(false);
    });

    it('should accept a custom permission level', () => {
      enableAllServicesForTest(checker, 'read-write');

      expect(checker.check('eventlog', 'write').allowed).toBe(true);
      expect(checker.check('filesearch', 'write').allowed).toBe(true);
    });
  });

  describe('enableServiceForTest', () => {
    it('should enable a specific service', () => {
      enableServiceForTest(checker, 'eventlog');

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
    });

    it('should default to read-only', () => {
      enableServiceForTest(checker, 'eventlog');

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('eventlog', 'write').allowed).toBe(false);
    });

    it('should accept optional permission level', () => {
      enableServiceForTest(checker, 'eventlog', 'read-write');

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('eventlog', 'write').allowed).toBe(true);
    });
  });

  describe('disableServiceForTest', () => {
    it('should disable a specific service', () => {
      // First enable
      enableAllServicesForTest(checker);
      expect(checker.check('eventlog', 'read').allowed).toBe(true);

      // Then disable
      disableServiceForTest(checker, 'eventlog');
      expect(checker.check('eventlog', 'read').allowed).toBe(false);
    });
  });

  describe('resetPermissionsForTest', () => {
    it('should clear all overrides', () => {
      enableAllServicesForTest(checker);
      expect(checker.hasTestOverrides()).toBe(true);

      resetPermissionsForTest(checker);
      expect(checker.hasTestOverrides()).toBe(false);
    });

    it('should restore config-manager-based behavior', () => {
      enableAllServicesForTest(checker);
      expect(checker.check('eventlog', 'read').allowed).toBe(true);

      resetPermissionsForTest(checker);
      // Config manager has disabled, so should be denied
      expect(checker.check('eventlog', 'read').allowed).toBe(false);
    });
  });
});
