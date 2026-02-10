/**
 * FileSearch Config Manager Tests
 */

import {
  FileSearchConfigManager,
  getConfigManager,
  setConfigManager,
  resetConfigManager
} from '../config';

describe('FileSearchConfigManager', () => {
  let configManager: FileSearchConfigManager;

  beforeEach(() => {
    configManager = new FileSearchConfigManager();
    resetConfigManager();
  });

  describe('default values', () => {
    it('should have enabled=false by default (secure default)', () => {
      expect(configManager.isEnabled()).toBe(false);
    });

    it('should have disabled permission by default (secure default)', () => {
      expect(configManager.getPermissionLevel()).toBe('disabled');
    });

    it('should have maxResults=10000 by default', () => {
      expect(configManager.getMaxResults()).toBe(10000);
    });

    it('should have timeoutMs=30000 by default', () => {
      expect(configManager.getTimeoutMs()).toBe(30000);
    });

    it('should have anonymization enabled by default', () => {
      expect(configManager.isAnonymizationEnabled()).toBe(true);
    });

    it('should have empty allowedPaths by default', () => {
      expect(configManager.getAllowedPaths()).toEqual([]);
    });

    it('should have logLevel=info by default', () => {
      expect(configManager.getLogLevel()).toBe('info');
    });
  });

  describe('custom initial config', () => {
    it('should accept custom initial config', () => {
      const custom = new FileSearchConfigManager({
        enabled: false,
        permissionLevel: 'disabled',
        maxResults: 500,
        timeoutMs: 5000,
        enableAnonymization: false,
        allowedPaths: ['C:\\Users'],
        logLevel: 'debug'
      });
      expect(custom.isEnabled()).toBe(false);
      expect(custom.getPermissionLevel()).toBe('disabled');
      expect(custom.getMaxResults()).toBe(500);
      expect(custom.getTimeoutMs()).toBe(5000);
      expect(custom.isAnonymizationEnabled()).toBe(false);
      expect(custom.getAllowedPaths()).toEqual(['C:\\Users']);
      expect(custom.getLogLevel()).toBe('debug');
    });
  });

  describe('setters with validation', () => {
    it('should set enabled', () => {
      configManager.setEnabled(false);
      expect(configManager.isEnabled()).toBe(false);
    });

    it('should set valid permission level', () => {
      configManager.setPermissionLevel('read-write');
      expect(configManager.getPermissionLevel()).toBe('read-write');
    });

    it('should throw on invalid permission level', () => {
      expect(() => configManager.setPermissionLevel('invalid' as any)).toThrow('Invalid permission level');
    });

    it('should set maxResults', () => {
      configManager.setMaxResults(500);
      expect(configManager.getMaxResults()).toBe(500);
    });

    it('should throw on invalid maxResults (zero)', () => {
      expect(() => configManager.setMaxResults(0)).toThrow('maxResults must be a positive integer');
    });

    it('should throw on invalid maxResults (negative)', () => {
      expect(() => configManager.setMaxResults(-1)).toThrow('maxResults must be a positive integer');
    });

    it('should throw on non-integer maxResults', () => {
      expect(() => configManager.setMaxResults(1.5)).toThrow('maxResults must be a positive integer');
    });

    it('should set timeoutMs', () => {
      configManager.setTimeoutMs(5000);
      expect(configManager.getTimeoutMs()).toBe(5000);
    });

    it('should throw on timeoutMs < 1000', () => {
      expect(() => configManager.setTimeoutMs(999)).toThrow('timeoutMs must be >= 1000');
    });

    it('should set anonymization', () => {
      configManager.setAnonymizationEnabled(false);
      expect(configManager.isAnonymizationEnabled()).toBe(false);
    });

    it('should set allowedPaths', () => {
      configManager.setAllowedPaths(['C:\\Users', 'D:\\Data']);
      expect(configManager.getAllowedPaths()).toEqual(['C:\\Users', 'D:\\Data']);
    });

    it('should throw on non-array allowedPaths', () => {
      expect(() => configManager.setAllowedPaths('invalid' as any)).toThrow('allowedPaths must be an array');
    });

    it('should set valid log level', () => {
      configManager.setLogLevel('debug');
      expect(configManager.getLogLevel()).toBe('debug');
    });

    it('should throw on invalid log level', () => {
      expect(() => configManager.setLogLevel('invalid')).toThrow('Invalid log level');
    });
  });

  describe('getConfig', () => {
    it('should return copy of config', () => {
      const config = configManager.getConfig();
      config.enabled = true;
      expect(configManager.isEnabled()).toBe(false);
    });
  });

  describe('resetToDefaults', () => {
    it('should reset all values to defaults', () => {
      configManager.setEnabled(true);
      configManager.setMaxResults(500);
      configManager.setAllowedPaths(['C:\\test']);
      configManager.resetToDefaults();
      expect(configManager.isEnabled()).toBe(false);
      expect(configManager.getMaxResults()).toBe(10000);
      expect(configManager.getAllowedPaths()).toEqual([]);
    });
  });

  describe('global config manager', () => {
    it('should get or create global config manager', () => {
      const mgr = getConfigManager();
      expect(mgr).toBeInstanceOf(FileSearchConfigManager);
    });

    it('should return same instance on multiple calls', () => {
      const mgr1 = getConfigManager();
      const mgr2 = getConfigManager();
      expect(mgr1).toBe(mgr2);
    });

    it('should allow setting custom global manager', () => {
      const custom = new FileSearchConfigManager({ enabled: false, permissionLevel: 'disabled' });
      setConfigManager(custom);
      expect(getConfigManager().isEnabled()).toBe(false);
    });

    it('should reset global manager', () => {
      setConfigManager(new FileSearchConfigManager({ enabled: true, permissionLevel: 'read-only' }));
      resetConfigManager();
      expect(getConfigManager().isEnabled()).toBe(false);
    });
  });
});
