/**
 * Tests for EventLog Configuration Manager
 *
 * Tests the MVP configuration system with hardcoded values.
 */

import {
  EventLogConfigManager,
  EventLogConfig,
  PermissionLevel,
  getConfigManager,
  setConfigManager,
  resetConfigManager
} from '../config';

describe('EventLogConfigManager', () => {
  let manager: EventLogConfigManager;

  beforeEach(() => {
    manager = new EventLogConfigManager();
  });

  describe('Initialization', () => {
    it('should initialize with default MVP values', () => {
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('disabled');
      expect(manager.getMaxResults()).toBe(10000);
      expect(manager.getTimeoutMs()).toBe(30000);
      expect(manager.isAnonymizationEnabled()).toBe(true);
      expect(manager.getLogLevel()).toBe('info');
    });

    it('should initialize with custom values', () => {
      const customConfig: EventLogConfig = {
        enabled: false,
        permissionLevel: 'read-write',
        maxResults: 5000,
        timeoutMs: 15000,
        enableAnonymization: false,
        logLevel: 'debug'
      };

      const customManager = new EventLogConfigManager(customConfig);

      expect(customManager.isEnabled()).toBe(false);
      expect(customManager.getPermissionLevel()).toBe('read-write');
      expect(customManager.getMaxResults()).toBe(5000);
      expect(customManager.getTimeoutMs()).toBe(15000);
      expect(customManager.isAnonymizationEnabled()).toBe(false);
      expect(customManager.getLogLevel()).toBe('debug');
    });

    it('should handle partial custom config', () => {
      const partialConfig: Partial<EventLogConfig> = {
        enabled: false,
        permissionLevel: 'disabled'
      };

      const customManager = new EventLogConfigManager(partialConfig as EventLogConfig);

      expect(customManager.isEnabled()).toBe(false);
      expect(customManager.getPermissionLevel()).toBe('disabled');
      // Other values should have defaults
      expect(customManager.getMaxResults()).toBe(10000);
    });
  });

  describe('Getter Methods', () => {
    it('should return enabled status', () => {
      expect(manager.isEnabled()).toBe(false);
    });

    it('should return permission level', () => {
      expect(manager.getPermissionLevel()).toBe('disabled');
    });

    it('should return max results', () => {
      expect(manager.getMaxResults()).toBe(10000);
    });

    it('should return timeout', () => {
      expect(manager.getTimeoutMs()).toBe(30000);
    });

    it('should return anonymization status', () => {
      expect(manager.isAnonymizationEnabled()).toBe(true);
    });

    it('should return log level', () => {
      expect(manager.getLogLevel()).toBe('info');
    });

    it('should return complete config object', () => {
      const config = manager.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.permissionLevel).toBe('disabled');
      expect(config.maxResults).toBe(10000);
      expect(config.timeoutMs).toBe(30000);
      expect(config.enableAnonymization).toBe(true);
      expect(config.logLevel).toBe('info');
    });

    it('should return config object that is a copy', () => {
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different object instances
    });
  });

  describe('Setter Methods', () => {
    it('should set enabled status', () => {
      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);

      manager.setEnabled(true);
      expect(manager.isEnabled()).toBe(true);
    });

    it('should set permission level to read-only', () => {
      manager.setPermissionLevel('read-only');
      expect(manager.getPermissionLevel()).toBe('read-only');
    });

    it('should set permission level to read-write', () => {
      manager.setPermissionLevel('read-write');
      expect(manager.getPermissionLevel()).toBe('read-write');
    });

    it('should set permission level to disabled', () => {
      manager.setPermissionLevel('disabled');
      expect(manager.getPermissionLevel()).toBe('disabled');
    });

    it('should reject invalid permission level', () => {
      expect(() => manager.setPermissionLevel('invalid' as PermissionLevel)).toThrow(
        'Invalid permission level'
      );
    });

    it('should set max results', () => {
      manager.setMaxResults(5000);
      expect(manager.getMaxResults()).toBe(5000);

      manager.setMaxResults(1000000);
      expect(manager.getMaxResults()).toBe(1000000);
    });

    it('should reject invalid max results', () => {
      expect(() => manager.setMaxResults(0)).toThrow('maxResults must be a positive integer');
      expect(() => manager.setMaxResults(-100)).toThrow('maxResults must be a positive integer');
      expect(() => manager.setMaxResults(100.5)).toThrow('maxResults must be a positive integer');
      expect(() => manager.setMaxResults(NaN)).toThrow('maxResults must be a positive integer');
    });

    it('should set timeout', () => {
      manager.setTimeoutMs(15000);
      expect(manager.getTimeoutMs()).toBe(15000);

      manager.setTimeoutMs(60000);
      expect(manager.getTimeoutMs()).toBe(60000);
    });

    it('should reject invalid timeout', () => {
      expect(() => manager.setTimeoutMs(500)).toThrow('timeoutMs must be >= 1000');
      expect(() => manager.setTimeoutMs(0)).toThrow('timeoutMs must be >= 1000');
      expect(() => manager.setTimeoutMs(-5000)).toThrow('timeoutMs must be >= 1000');
      expect(() => manager.setTimeoutMs(5000.5)).toThrow('timeoutMs must be >= 1000');
    });

    it('should set anonymization enabled', () => {
      manager.setAnonymizationEnabled(false);
      expect(manager.isAnonymizationEnabled()).toBe(false);

      manager.setAnonymizationEnabled(true);
      expect(manager.isAnonymizationEnabled()).toBe(true);
    });

    it('should set log level', () => {
      const levels = ['debug', 'info', 'warn', 'error'];

      levels.forEach((level) => {
        manager.setLogLevel(level);
        expect(manager.getLogLevel()).toBe(level);
      });
    });

    it('should reject invalid log level', () => {
      expect(() => manager.setLogLevel('invalid')).toThrow('Invalid log level');
      expect(() => manager.setLogLevel('trace')).toThrow('Invalid log level');
      expect(() => manager.setLogLevel('critical')).toThrow('Invalid log level');
    });
  });

  describe('Reset to Defaults', () => {
    it('should reset all values to defaults', () => {
      // Change everything
      manager.setEnabled(false);
      manager.setPermissionLevel('disabled');
      manager.setMaxResults(500);
      manager.setTimeoutMs(5000);
      manager.setAnonymizationEnabled(false);
      manager.setLogLevel('debug');

      // Verify changes
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('disabled');

      // Reset
      manager.resetToDefaults();

      // Verify defaults restored
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('disabled');
      expect(manager.getMaxResults()).toBe(10000);
      expect(manager.getTimeoutMs()).toBe(30000);
      expect(manager.isAnonymizationEnabled()).toBe(true);
      expect(manager.getLogLevel()).toBe('info');
    });
  });

  describe('Configuration Persistence (MVP Note)', () => {
    it('should support multiple managers with independent state', () => {
      const manager1 = new EventLogConfigManager();
      const manager2 = new EventLogConfigManager();

      manager1.setPermissionLevel('read-write');
      manager2.setPermissionLevel('disabled');

      expect(manager1.getPermissionLevel()).toBe('read-write');
      expect(manager2.getPermissionLevel()).toBe('disabled');
    });

    it('should maintain state across multiple operations', () => {
      manager.setEnabled(false);
      manager.setPermissionLevel('read-write');
      manager.setMaxResults(5000);

      // Verify all changes persisted in memory
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('read-write');
      expect(manager.getMaxResults()).toBe(5000);

      // Further changes
      manager.setLogLevel('debug');

      // All should still be present
      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('read-write');
      expect(manager.getMaxResults()).toBe(5000);
      expect(manager.getLogLevel()).toBe('debug');
    });
  });

  describe('Global Configuration Manager', () => {
    afterEach(() => {
      resetConfigManager();
    });

    it('should create and return global instance', () => {
      resetConfigManager();
      const manager1 = getConfigManager();
      const manager2 = getConfigManager();

      expect(manager1).toBe(manager2);
    });

    it('should initialize global manager with defaults on first call', () => {
      resetConfigManager();
      const manager = getConfigManager();

      expect(manager.isEnabled()).toBe(false);
      expect(manager.getPermissionLevel()).toBe('disabled');
    });

    it('should allow setting global manager', () => {
      resetConfigManager();
      const customManager = new EventLogConfigManager({
        enabled: false,
        permissionLevel: 'disabled'
      });

      setConfigManager(customManager);
      const retrieved = getConfigManager();

      expect(retrieved).toBe(customManager);
      expect(retrieved.isEnabled()).toBe(false);
    });

    it('should reset global manager', () => {
      const manager1 = getConfigManager();
      manager1.setEnabled(false);

      resetConfigManager();

      const manager2 = getConfigManager();
      expect(manager2).not.toBe(manager1);
      expect(manager2.isEnabled()).toBe(false); // New instance with defaults
    });
  });

  describe('Configuration Scenarios (Future UI Integration)', () => {
    it('should support workflow: initial state to disabled', () => {
      expect(manager.isEnabled()).toBe(false);

      // User enables service via System Tray UI
      manager.setEnabled(true);

      expect(manager.isEnabled()).toBe(true);
    });

    it('should support workflow: permission level change', () => {
      expect(manager.getPermissionLevel()).toBe('disabled');

      // User upgrades to read-write via System Tray UI
      manager.setPermissionLevel('read-write');

      expect(manager.getPermissionLevel()).toBe('read-write');
    });

    it('should support workflow: full reconfiguration', () => {
      // User opens System Tray UI and reconfigures everything
      manager.setPermissionLevel('read-write');
      manager.setMaxResults(50000);
      manager.setTimeoutMs(60000);
      manager.setAnonymizationEnabled(false);
      manager.setLogLevel('debug');

      // All settings should reflect the new configuration
      expect(manager.getPermissionLevel()).toBe('read-write');
      expect(manager.getMaxResults()).toBe(50000);
      expect(manager.getTimeoutMs()).toBe(60000);
      expect(manager.isAnonymizationEnabled()).toBe(false);
      expect(manager.getLogLevel()).toBe('debug');
    });

    it('should support workflow: reset via UI', () => {
      // User has customized settings
      manager.setPermissionLevel('read-write');
      manager.setMaxResults(2000);

      // User clicks "Reset to Defaults" in System Tray UI
      manager.resetToDefaults();

      // Settings should be back to defaults
      expect(manager.getPermissionLevel()).toBe('disabled');
      expect(manager.getMaxResults()).toBe(10000);
    });
  });

  describe('Edge Cases', () => {
    it('should handle setting same value multiple times', () => {
      manager.setPermissionLevel('read-write');
      manager.setPermissionLevel('read-write');
      manager.setPermissionLevel('read-write');

      expect(manager.getPermissionLevel()).toBe('read-write');
    });

    it('should handle setting to minimum timeout', () => {
      manager.setTimeoutMs(1000); // Minimum allowed
      expect(manager.getTimeoutMs()).toBe(1000);
    });

    it('should handle setting to maximum safe integer for results', () => {
      const maxSafe = Number.MAX_SAFE_INTEGER;
      manager.setMaxResults(maxSafe);
      expect(manager.getMaxResults()).toBe(maxSafe);
    });

    it('should preserve other settings when one is changed', () => {
      manager.setLogLevel('debug');
      expect(manager.getPermissionLevel()).toBe('disabled'); // Unchanged

      manager.setPermissionLevel('read-write');
      expect(manager.getLogLevel()).toBe('debug'); // Unchanged
    });
  });
});
