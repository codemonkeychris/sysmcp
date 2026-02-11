/**
 * PermissionChecker Unit Tests
 *
 * Tests all permission level × operation type combinations,
 * test override mechanism, and edge cases.
 */

import { PermissionCheckerImpl, createPermissionChecker } from '../permission-checker';
import { ServiceConfigProvider, OperationType, PermissionLevel } from '../types';

/**
 * Mock config provider for testing
 */
function createMockProvider(
  enabled: boolean = true,
  permissionLevel: PermissionLevel = 'read-only'
): ServiceConfigProvider {
  return {
    isEnabled: jest.fn(() => enabled),
    getPermissionLevel: jest.fn(() => permissionLevel),
  };
}

describe('PermissionChecker', () => {
  let checker: PermissionCheckerImpl;
  let providers: Map<string, ServiceConfigProvider>;

  beforeEach(() => {
    providers = new Map();
    providers.set('eventlog', createMockProvider(true, 'read-only'));
    providers.set('filesearch', createMockProvider(true, 'read-only'));
    checker = createPermissionChecker(providers);
  });

  describe('Permission Logic', () => {
    describe('disabled service', () => {
      beforeEach(() => {
        providers.set('eventlog', createMockProvider(false, 'disabled'));
        checker = createPermissionChecker(providers);
      });

      it('should deny read operations', () => {
        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });

      it('should deny write operations', () => {
        const result = checker.check('eventlog', 'write');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });
    });

    describe('disabled permission level with enabled=true', () => {
      beforeEach(() => {
        providers.set('eventlog', createMockProvider(true, 'disabled'));
        checker = createPermissionChecker(providers);
      });

      it('should deny read operations when permission level is disabled', () => {
        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });

      it('should deny write operations when permission level is disabled', () => {
        const result = checker.check('eventlog', 'write');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('disabled');
      });
    });

    describe('read-only service', () => {
      beforeEach(() => {
        providers.set('eventlog', createMockProvider(true, 'read-only'));
        checker = createPermissionChecker(providers);
      });

      it('should allow read operations', () => {
        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should deny write operations', () => {
        const result = checker.check('eventlog', 'write');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('read-only');
      });
    });

    describe('read-write service', () => {
      beforeEach(() => {
        providers.set('eventlog', createMockProvider(true, 'read-write'));
        checker = createPermissionChecker(providers);
      });

      it('should allow read operations', () => {
        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should allow write operations', () => {
        const result = checker.check('eventlog', 'write');
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });
    });

    describe('all permission level × operation combinations', () => {
      const cases: Array<[PermissionLevel, OperationType, boolean]> = [
        ['disabled', 'read', false],
        ['disabled', 'write', false],
        ['read-only', 'read', true],
        ['read-only', 'write', false],
        ['read-write', 'read', true],
        ['read-write', 'write', true],
      ];

      it.each(cases)(
        'permission=%s operation=%s → allowed=%s',
        (permLevel, operation, expectedAllowed) => {
          providers.set('eventlog', createMockProvider(true, permLevel));
          checker = createPermissionChecker(providers);

          const result = checker.check('eventlog', operation);
          expect(result.allowed).toBe(expectedAllowed);
        }
      );
    });

    describe('enabled=false overrides permission level', () => {
      it('should deny read even if permission level is read-write', () => {
        providers.set('eventlog', createMockProvider(false, 'read-write'));
        checker = createPermissionChecker(providers);

        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(false);
      });
    });
  });

  describe('Unknown Service', () => {
    it('should deny unknown service IDs', () => {
      const result = checker.check('unknown-service', 'read');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown service');
    });

    it('should deny empty string service ID', () => {
      const result = checker.check('', 'read');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown service');
    });
  });

  describe('Multiple Services', () => {
    it('should check each service independently', () => {
      providers.set('eventlog', createMockProvider(true, 'read-only'));
      providers.set('filesearch', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('filesearch', 'read').allowed).toBe(false);
    });
  });

  describe('Test Overrides', () => {
    beforeEach(() => {
      // Ensure NODE_ENV is 'test' for these tests
      process.env.NODE_ENV = 'test';
    });

    it('should override config manager values', () => {
      // Config manager says disabled
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      // Without override: denied
      expect(checker.check('eventlog', 'read').allowed).toBe(false);

      // Set override: enabled
      checker.setTestOverrides({ eventlog: { enabled: true, permissionLevel: 'read-only' } });
      expect(checker.check('eventlog', 'read').allowed).toBe(true);
    });

    it('should override only specified fields', () => {
      providers.set('eventlog', createMockProvider(true, 'read-write'));
      checker = createPermissionChecker(providers);

      // Override only permissionLevel
      checker.setTestOverrides({ eventlog: { permissionLevel: 'read-only' } });

      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('eventlog', 'write').allowed).toBe(false);
    });

    it('should override specific services without affecting others', () => {
      providers.set('eventlog', createMockProvider(true, 'read-only'));
      providers.set('filesearch', createMockProvider(true, 'read-only'));
      checker = createPermissionChecker(providers);

      checker.setTestOverrides({ eventlog: { enabled: false } });

      expect(checker.check('eventlog', 'read').allowed).toBe(false);
      expect(checker.check('filesearch', 'read').allowed).toBe(true);
    });

    it('should allow overriding unknown services', () => {
      checker.setTestOverrides({ 'custom-service': { enabled: true, permissionLevel: 'read-write' } });

      // Unknown service with override should work
      const result = checker.check('custom-service', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should clear overrides and restore normal behavior', () => {
      providers.set('eventlog', createMockProvider(false, 'disabled'));
      checker = createPermissionChecker(providers);

      checker.setTestOverrides({ eventlog: { enabled: true, permissionLevel: 'read-only' } });
      expect(checker.check('eventlog', 'read').allowed).toBe(true);

      checker.clearTestOverrides();
      expect(checker.check('eventlog', 'read').allowed).toBe(false);
    });

    it('should report hasTestOverrides correctly', () => {
      expect(checker.hasTestOverrides()).toBe(false);

      checker.setTestOverrides({ eventlog: { enabled: true } });
      expect(checker.hasTestOverrides()).toBe(true);

      checker.clearTestOverrides();
      expect(checker.hasTestOverrides()).toBe(false);
    });

    it('should throw when setting overrides outside test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => {
        checker.setTestOverrides({ eventlog: { enabled: true } });
      }).toThrow('Test overrides can only be set when NODE_ENV is "test"');

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw when setting overrides in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => {
        checker.setTestOverrides({ eventlog: { enabled: true } });
      }).toThrow('Test overrides can only be set when NODE_ENV is "test"');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('SEC-001: Unknown permission levels denied (whitelist)', () => {
    const unknownLevels = ['admin', 'rwx', 'foo', 'READWRITE', 'read_write', 'superuser', '', ' '];

    it.each(unknownLevels)(
      'should deny read for unknown permission level "%s"',
      (level) => {
        providers.set('eventlog', {
          isEnabled: jest.fn(() => true),
          getPermissionLevel: jest.fn(() => level as PermissionLevel),
        });
        checker = createPermissionChecker(providers);

        const result = checker.check('eventlog', 'read');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Unknown permission level');
      }
    );

    it.each(unknownLevels)(
      'should deny write for unknown permission level "%s"',
      (level) => {
        providers.set('eventlog', {
          isEnabled: jest.fn(() => true),
          getPermissionLevel: jest.fn(() => level as PermissionLevel),
        });
        checker = createPermissionChecker(providers);

        const result = checker.check('eventlog', 'write');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Unknown permission level');
      }
    );

    it('should still allow read-only reads (positive case)', () => {
      providers.set('eventlog', createMockProvider(true, 'read-only'));
      checker = createPermissionChecker(providers);
      expect(checker.check('eventlog', 'read').allowed).toBe(true);
    });

    it('should still allow read-write for both ops (positive case)', () => {
      providers.set('eventlog', createMockProvider(true, 'read-write'));
      checker = createPermissionChecker(providers);
      expect(checker.check('eventlog', 'read').allowed).toBe(true);
      expect(checker.check('eventlog', 'write').allowed).toBe(true);
    });
  });

  describe('Factory Function', () => {
    it('should create a working PermissionChecker', () => {
      const pc = createPermissionChecker(providers);
      expect(pc).toBeInstanceOf(PermissionCheckerImpl);
      expect(pc.check('eventlog', 'read').allowed).toBe(true);
    });
  });
});
