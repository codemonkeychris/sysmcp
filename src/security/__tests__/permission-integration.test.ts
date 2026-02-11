/**
 * Permission Model Integration Tests
 *
 * End-to-end tests verifying that the permission system works correctly
 * across all layers: config managers → permission checker → middleware → resolvers.
 */

import { EventLogConfigManager } from '../../services/eventlog/config';
import { FileSearchConfigManager } from '../../services/filesearch/config';
import { createPermissionChecker, PermissionCheckerImpl } from '../permission-checker';
import { ServiceConfigProvider } from '../types';
import { ConfigStoreImpl } from '../../config/config-store';
import { AuditLoggerImpl } from '../../audit/audit-logger';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Permission Model Integration', () => {
  let eventlogConfig: EventLogConfigManager;
  let filesearchConfig: FileSearchConfigManager;
  let permissionChecker: PermissionCheckerImpl;

  beforeEach(() => {
    eventlogConfig = new EventLogConfigManager();
    filesearchConfig = new FileSearchConfigManager();

    const providers = new Map<string, ServiceConfigProvider>();
    providers.set('eventlog', eventlogConfig);
    providers.set('filesearch', filesearchConfig);

    permissionChecker = createPermissionChecker(providers);
  });

  describe('Secure Defaults', () => {
    it('should allow eventlog reads by default (read-only)', () => {
      const result = permissionChecker.check('eventlog', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should allow filesearch reads by default (read-only)', () => {
      const result = permissionChecker.check('filesearch', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should deny writes for both services by default (read-only)', () => {
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);
      expect(permissionChecker.check('filesearch', 'write').allowed).toBe(false);
    });

    it('should deny unknown services', () => {
      const result = permissionChecker.check('unknown-service', 'read');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown service');
    });
  });

  describe('Enable/Disable Flow', () => {
    it('should allow reads after enabling service with read-only', () => {
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-only');

      const result = permissionChecker.check('eventlog', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should deny writes when service is read-only', () => {
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-only');

      const result = permissionChecker.check('eventlog', 'write');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('should allow reads and writes when service is read-write', () => {
      filesearchConfig.setEnabled(true);
      filesearchConfig.setPermissionLevel('read-write');

      expect(permissionChecker.check('filesearch', 'read').allowed).toBe(true);
      expect(permissionChecker.check('filesearch', 'write').allowed).toBe(true);
    });

    it('should deny all operations after disabling a previously enabled service', () => {
      // Enable
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-write');
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);

      // Disable
      eventlogConfig.setEnabled(false);
      eventlogConfig.setPermissionLevel('disabled');
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(false);
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);
    });

    it('should handle permission downgrade from read-write to read-only', () => {
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-write');
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(true);

      eventlogConfig.setPermissionLevel('read-only');
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
    });
  });

  describe('Independent Service Configuration', () => {
    it('should allow one service while denying another', () => {
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-only');
      // Explicitly disable filesearch
      filesearchConfig.setEnabled(false);
      filesearchConfig.setPermissionLevel('disabled');

      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
      expect(permissionChecker.check('filesearch', 'read').allowed).toBe(false);
    });

    it('should allow different permission levels per service', () => {
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-only');

      filesearchConfig.setEnabled(true);
      filesearchConfig.setPermissionLevel('read-write');

      // eventlog: read OK, write denied
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);

      // filesearch: both OK
      expect(permissionChecker.check('filesearch', 'read').allowed).toBe(true);
      expect(permissionChecker.check('filesearch', 'write').allowed).toBe(true);
    });
  });

  describe('Test Override Mechanism', () => {
    it('should override config manager state for testing', () => {
      // Default is enabled + read-only, so reads are allowed
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);

      // Override to disabled
      permissionChecker.setTestOverrides({
        eventlog: { enabled: false, permissionLevel: 'disabled' },
      });

      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(false);

      // Clear override — back to config manager (read-only)
      permissionChecker.clearTestOverrides();
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
    });

    it('should not allow test overrides outside test environment', () => {
      // SEC-015: Use constructor flag instead of runtime NODE_ENV
      const testProviders = new Map<string, ServiceConfigProvider>();
      testProviders.set('eventlog', eventlogConfig);
      testProviders.set('filesearch', filesearchConfig);
      const prodChecker = new PermissionCheckerImpl(testProviders, false);

      expect(() =>
        prodChecker.setTestOverrides({
          eventlog: { enabled: true },
        })
      ).toThrow('Test overrides can only be set');
    });
  });

  describe('Config Reset Flow', () => {
    it('should return to secure defaults after resetToDefaults()', () => {
      // Enable everything
      eventlogConfig.setEnabled(true);
      eventlogConfig.setPermissionLevel('read-write');
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(true);

      // Reset — back to read-only defaults
      eventlogConfig.resetToDefaults();
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);
    });
  });

  describe('ConfigStore Persistence', () => {
    let configStore: ConfigStoreImpl;
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmcp-integration-'));
      const configPath = path.join(tempDir, 'config.json');
      configStore = new ConfigStoreImpl(configPath);
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should persist and reload config across instances', async () => {
      // Save config
      await configStore.save({
        version: 1,
        lastModified: new Date().toISOString(),
        services: {
          eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true },
          filesearch: { enabled: true, permissionLevel: 'read-write', enableAnonymization: false },
        },
      });

      // Load in new instance
      const loaded = await configStore.load();
      expect(loaded).not.toBeNull();
      expect(loaded!.services.eventlog.enabled).toBe(true);
      expect(loaded!.services.eventlog.permissionLevel).toBe('read-only');
      expect(loaded!.services.filesearch.permissionLevel).toBe('read-write');
    });

    it('should apply loaded config to permission checker', async () => {
      // Persist enabled config
      await configStore.save({
        version: 1,
        lastModified: new Date().toISOString(),
        services: {
          eventlog: { enabled: true, permissionLevel: 'read-only', enableAnonymization: true },
          filesearch: { enabled: false, permissionLevel: 'disabled', enableAnonymization: true },
        },
      });

      // Load and apply
      const loaded = await configStore.load();
      if (loaded?.services.eventlog) {
        eventlogConfig.setEnabled(loaded.services.eventlog.enabled);
        eventlogConfig.setPermissionLevel(loaded.services.eventlog.permissionLevel);
      }
      if (loaded?.services.filesearch) {
        filesearchConfig.setEnabled(loaded.services.filesearch.enabled);
        filesearchConfig.setPermissionLevel(loaded.services.filesearch.permissionLevel);
      }

      // Verify permissions reflect persisted state
      expect(permissionChecker.check('eventlog', 'read').allowed).toBe(true);
      expect(permissionChecker.check('eventlog', 'write').allowed).toBe(false);
      expect(permissionChecker.check('filesearch', 'read').allowed).toBe(false);
    });
  });

  describe('AuditLogger Integration', () => {
    let auditLogger: AuditLoggerImpl;
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sysmcp-audit-'));
      auditLogger = new AuditLoggerImpl({ logPath: path.join(tempDir, 'audit.jsonl') });
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should log permission-related actions', async () => {
      await auditLogger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        source: 'integration-test',
        previousValue: false,
        newValue: true,
      });

      await auditLogger.log({
        action: 'permission.change',
        serviceId: 'eventlog',
        source: 'integration-test',
        previousValue: 'disabled',
        newValue: 'read-only',
      });

      const entries = await auditLogger.getRecentEntries(10);
      expect(entries.length).toBe(2);
      expect(entries[0].action).toBe('service.enable');
      expect(entries[1].action).toBe('permission.change');
    });
  });
});
