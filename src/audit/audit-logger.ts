/**
 * AuditLogger — JSONL Audit Logging with Rotation
 *
 * Append-only JSONL audit log for configuration and permission changes.
 * Supports log rotation when file exceeds configurable size.
 */

import * as fs from 'fs';
import * as path from 'path';
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

    // Append entry as JSONL (one JSON object per line)
    const line = JSON.stringify(fullEntry) + '\n';
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
}
