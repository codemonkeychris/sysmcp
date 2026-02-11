/**
 * AuditLogger — JSONL Audit Logging with Rotation
 *
 * Append-only JSONL audit log for configuration and permission changes.
 * Supports log rotation when file exceeds configurable size.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { AuditEntry } from './types';
import { validateStoragePath } from '../config/config-store';

/**
 * AuditLogger configuration
 */
export interface AuditLoggerConfig {
  /** Path to the audit log file */
  logPath?: string;
  /** Maximum file size in bytes before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Number of rotated files to keep (default: 5) */
  maxFiles?: number;
}

/**
 * AuditLogger interface
 */
export interface AuditLogger {
  log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>;
  getRecentEntries(count: number): Promise<AuditEntry[]>;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;

/**
 * AuditLogger implementation
 */
export class AuditLoggerImpl implements AuditLogger {
  private logPath: string;
  private maxFileSize: number;
  private maxFiles: number;

  constructor(config?: AuditLoggerConfig) {
    const rawPath =
      config?.logPath || path.join(process.cwd(), 'logs', 'audit.jsonl');
    // SECURITY: Validate path to prevent traversal/injection (SEC-006)
    this.logPath = validateStoragePath(rawPath, 'audit log path');
    this.maxFileSize = config?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.maxFiles = config?.maxFiles ?? DEFAULT_MAX_FILES;
  }

  /**
   * Compute SHA-256 hash for chain integrity (SEC-010)
   */
  private computeEntryHash(entryJson: string, previousHash: string): string {
    return crypto
      .createHash('sha256')
      .update(previousHash + entryJson)
      .digest('hex');
  }

  /**
   * Get the hash of the last entry in the log file
   */
  private async getLastEntryHash(): Promise<string> {
    if (!fs.existsSync(this.logPath)) {
      return '0'.repeat(64); // genesis hash
    }
    try {
      const content = await fs.promises.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);
      if (lines.length === 0) {
        return '0'.repeat(64);
      }
      const lastEntry = JSON.parse(lines[lines.length - 1]);
      return lastEntry._hash || '0'.repeat(64);
    } catch {
      return '0'.repeat(64);
    }
  }

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.logPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Check rotation before writing
    await this.rotateIfNeeded();

    // SECURITY: Chain hash for tamper detection (SEC-010)
    const previousHash = await this.getLastEntryHash();
    const entryJson = JSON.stringify(fullEntry);
    const hash = this.computeEntryHash(entryJson, previousHash);
    const hashedEntry = { ...fullEntry, _previousHash: previousHash, _hash: hash };

    // Append entry as JSONL (one JSON object per line)
    const line = JSON.stringify(hashedEntry) + '\n';
    await fs.promises.appendFile(this.logPath, line, 'utf-8');
  }

  /**
   * Get the most recent audit entries
   */
  async getRecentEntries(count: number): Promise<AuditEntry[]> {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    try {
      const content = await fs.promises.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);

      // Take last N entries
      const recentLines = lines.slice(-count);

      return recentLines.map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  /**
   * Rotate log file if it exceeds the size threshold
   */
  private async rotateIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.logPath)) {
      return;
    }

    try {
      const stats = await fs.promises.stat(this.logPath);
      if (stats.size < this.maxFileSize) {
        return;
      }

      // Rotate: shift existing numbered files up
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldPath = this.getRotatedPath(i);
        const newPath = this.getRotatedPath(i + 1);
        if (fs.existsSync(oldPath)) {
          if (i + 1 > this.maxFiles) {
            // Delete files beyond maxFiles
            await fs.promises.unlink(oldPath);
          } else {
            await fs.promises.rename(oldPath, newPath);
          }
        }
      }

      // Rename current file to .1
      await fs.promises.rename(this.logPath, this.getRotatedPath(1));

      // Clean up any files beyond maxFiles
      await this.cleanupOldFiles();
    } catch {
      // If rotation fails, continue writing to current file
    }
  }

  /**
   * Get the path for a rotated file
   */
  private getRotatedPath(n: number): string {
    const ext = path.extname(this.logPath);
    const base = this.logPath.slice(0, -ext.length);
    return `${base}.${n}${ext}`;
  }

  /**
   * Remove rotated files beyond maxFiles
   */
  private async cleanupOldFiles(): Promise<void> {
    for (let i = this.maxFiles + 1; i <= this.maxFiles + 5; i++) {
      const filePath = this.getRotatedPath(i);
      if (fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch {
          // Ignore cleanup failures
        }
      }
    }
  }

  /**
   * Get the log path (for testing)
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * SECURITY: Verify chain hash integrity of audit log (SEC-010)
   * Returns true if all entries form a valid hash chain, false if tampered.
   */
  async verifyIntegrity(): Promise<{ valid: boolean; entries: number; error?: string }> {
    if (!fs.existsSync(this.logPath)) {
      return { valid: true, entries: 0 };
    }

    try {
      const content = await fs.promises.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l.length > 0);

      if (lines.length === 0) {
        return { valid: true, entries: 0 };
      }

      let expectedPreviousHash = '0'.repeat(64);

      for (let i = 0; i < lines.length; i++) {
        const parsed = JSON.parse(lines[i]);
        const { _hash, _previousHash, ...entryData } = parsed;

        if (!_hash || !_previousHash) {
          return { valid: false, entries: lines.length, error: `Entry ${i} missing hash fields` };
        }

        if (_previousHash !== expectedPreviousHash) {
          return { valid: false, entries: lines.length, error: `Entry ${i} has broken previous hash chain` };
        }

        const entryJson = JSON.stringify(entryData);
        const computedHash = this.computeEntryHash(entryJson, _previousHash);

        if (computedHash !== _hash) {
          return { valid: false, entries: lines.length, error: `Entry ${i} has invalid hash (tampered)` };
        }

        expectedPreviousHash = _hash;
      }

      return { valid: true, entries: lines.length };
    } catch (err) {
      return { valid: false, entries: 0, error: `Failed to read log: ${err}` };
    }
  }
}
