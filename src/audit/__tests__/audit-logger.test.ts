/**
 * AuditLogger Unit Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuditLoggerImpl } from '../audit-logger';
import { AuditEntry } from '../types';

describe('AuditLogger', () => {
  let tmpDir: string;
  let logPath: string;
  let logger: AuditLoggerImpl;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sysmcp-audit-'));
    logPath = path.join(tmpDir, 'audit.jsonl');
    logger = new AuditLoggerImpl({ logPath });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Cleanup may fail on Windows
    }
  });

  describe('log', () => {
    it('should append entry in JSONL format', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'graphql-mutation',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]) as AuditEntry;
      expect(entry.action).toBe('service.enable');
      expect(entry.serviceId).toBe('eventlog');
      expect(entry.previousValue).toBe(false);
      expect(entry.newValue).toBe(true);
      expect(entry.source).toBe('graphql-mutation');
    });

    it('should auto-populate timestamp as ISO 8601', async () => {
      const before = new Date().toISOString();

      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const entry = JSON.parse(content.trim()) as AuditEntry;

      expect(entry.timestamp).toBeDefined();
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
      expect(entry.timestamp >= before).toBe(true);
    });

    it('should append multiple entries', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });
      await logger.log({
        action: 'permission.change',
        serviceId: 'filesearch',
        previousValue: 'disabled',
        newValue: 'read-only',
        source: 'test',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
    });

    it('should create directory if missing', async () => {
      const nestedPath = path.join(tmpDir, 'nested', 'logs', 'audit.jsonl');
      const nestedLogger = new AuditLoggerImpl({ logPath: nestedPath });

      await nestedLogger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe('getRecentEntries', () => {
    it('should return correct number of entries', async () => {
      for (let i = 0; i < 5; i++) {
        await logger.log({
          action: 'service.enable',
          serviceId: `service-${i}`,
          previousValue: false,
          newValue: true,
          source: 'test',
        });
      }

      const entries = await logger.getRecentEntries(3);
      expect(entries.length).toBe(3);
      expect(entries[0].serviceId).toBe('service-2');
      expect(entries[2].serviceId).toBe('service-4');
    });

    it('should return all entries if count exceeds total', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      const entries = await logger.getRecentEntries(100);
      expect(entries.length).toBe(1);
    });

    it('should return empty array for missing file', async () => {
      const entries = await logger.getRecentEntries(10);
      expect(entries).toEqual([]);
    });

    it('should return empty array for empty file', async () => {
      await fs.promises.writeFile(logPath, '', 'utf-8');

      const entries = await logger.getRecentEntries(10);
      expect(entries).toEqual([]);
    });
  });

  describe('rotation', () => {
    it('should rotate when file exceeds size threshold', async () => {
      // Use tiny max size to trigger rotation
      const smallLogger = new AuditLoggerImpl({
        logPath,
        maxFileSize: 100, // 100 bytes
        maxFiles: 3,
      });

      // Write enough to exceed threshold
      for (let i = 0; i < 5; i++) {
        await smallLogger.log({
          action: 'service.enable',
          serviceId: `service-${i}`,
          previousValue: false,
          newValue: true,
          source: 'test',
        });
      }

      // Rotated files should exist
      const files = await fs.promises.readdir(tmpDir);
      const auditFiles = files.filter((f) => f.startsWith('audit'));
      expect(auditFiles.length).toBeGreaterThan(1);
    });

    it('should keep only maxFiles rotated files', async () => {
      const smallLogger = new AuditLoggerImpl({
        logPath,
        maxFileSize: 50,
        maxFiles: 2,
      });

      // Write many entries to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        await smallLogger.log({
          action: 'service.enable',
          serviceId: `service-${i}`,
          previousValue: false,
          newValue: true,
          source: 'test',
        });
      }

      const files = await fs.promises.readdir(tmpDir);
      const auditFiles = files.filter((f) => f.startsWith('audit'));
      // Should have at most maxFiles + 1 (current + rotated)
      expect(auditFiles.length).toBeLessThanOrEqual(4);
    });
  });

  describe('all audit actions', () => {
    const actions = [
      'service.enable',
      'service.disable',
      'permission.change',
      'pii.toggle',
      'config.reset',
    ] as const;

    it.each(actions)('should log %s action', async (action) => {
      await logger.log({
        action,
        serviceId: 'eventlog',
        previousValue: 'old',
        newValue: 'new',
        source: 'test',
      });

      const entries = await logger.getRecentEntries(1);
      expect(entries[0].action).toBe(action);
    });
  });

  describe('SEC-006: Path validation for audit logger', () => {
    it('should reject path traversal in constructor', () => {
      expect(
        () => new AuditLoggerImpl({ logPath: '../../../etc/cron.d/malicious.jsonl' })
      ).toThrow('path traversal detected');
    });

    it('should reject path with invalid extension', () => {
      expect(
        () => new AuditLoggerImpl({ logPath: path.join(tmpDir, 'log.txt') })
      ).toThrow('must end with .json or .jsonl extension');
    });

    it('should accept valid .jsonl path', () => {
      const validPath = path.join(tmpDir, 'valid-audit.jsonl');
      const auditLogger = new AuditLoggerImpl({ logPath: validPath });
      expect(auditLogger.getLogPath()).toBe(path.resolve(validPath));
    });
  });

  describe('SEC-010: Audit log integrity protection', () => {
    it('should include _hash and _previousHash in each entry', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry._hash).toBeDefined();
      expect(entry._previousHash).toBeDefined();
      expect(entry._hash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry._previousHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should use genesis hash for first entry previousHash', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry._previousHash).toBe('0'.repeat(64));
    });

    it('should chain hashes across entries', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });
      await logger.log({
        action: 'permission.change',
        serviceId: 'eventlog',
        previousValue: 'read-only',
        newValue: 'read-write',
        source: 'test',
      });

      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      // Second entry's previousHash should be first entry's hash
      expect(entry2._previousHash).toBe(entry1._hash);
    });

    it('should verify valid chain with verifyIntegrity()', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });
      await logger.log({
        action: 'service.disable',
        serviceId: 'eventlog',
        previousValue: true,
        newValue: false,
        source: 'test',
      });

      const result = await logger.verifyIntegrity();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(2);
    });

    it('should detect tampered entry content', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });

      // Tamper with the log file: change serviceId
      const content = await fs.promises.readFile(logPath, 'utf-8');
      const tampered = content.replace('"eventlog"', '"filesearch"');
      await fs.promises.writeFile(logPath, tampered, 'utf-8');

      const result = await logger.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid hash');
    });

    it('should detect deleted entries in chain', async () => {
      await logger.log({
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });
      await logger.log({
        action: 'service.disable',
        serviceId: 'eventlog',
        previousValue: true,
        newValue: false,
        source: 'test',
      });
      await logger.log({
        action: 'permission.change',
        serviceId: 'eventlog',
        previousValue: 'read-only',
        newValue: 'read-write',
        source: 'test',
      });

      // Delete the middle entry
      const content = await fs.promises.readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      const tamperedContent = lines[0] + '\n' + lines[2] + '\n';
      await fs.promises.writeFile(logPath, tamperedContent, 'utf-8');

      const result = await logger.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('broken previous hash chain');
    });

    it('should verify empty log as valid', async () => {
      const result = await logger.verifyIntegrity();
      expect(result.valid).toBe(true);
      expect(result.entries).toBe(0);
    });

    it('should detect entry with missing hash fields', async () => {
      // Write an entry without hash fields
      const fakeEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'service.enable',
        serviceId: 'eventlog',
        previousValue: false,
        newValue: true,
        source: 'test',
      });
      await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
      await fs.promises.writeFile(logPath, fakeEntry + '\n', 'utf-8');

      const result = await logger.verifyIntegrity();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing hash fields');
    });
  });
});
