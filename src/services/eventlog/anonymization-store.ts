/**
 * Anonymization Mapping Persistence Store
 *
 * Provides storage and retrieval of PII anonymization mappings to ensure consistency
 * across service restarts. Uses file-based storage with atomic writes to prevent
 * corruption.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AnonymizationMapping } from './lib/src/anonymizer';

/**
 * Configuration for anonymization store
 */
export interface AnonymizationStoreConfig {
  /** Path where to store the mapping file */
  storagePath: string;
  /** File permissions mode (Unix-like) - default 0o600 */
  fileMode?: number;
  /** Whether to create directories if they don't exist */
  createDirs?: boolean;
}

/**
 * Anonymization Store - Handles persistence of anonymization mappings
 *
 * Persists PII anonymization mappings to disk using JSON format for human readability
 * and debugging. Implements atomic writes using temp files and rename operations.
 *
 * Usage:
 * ```typescript
 * const store = new AnonymizationStore({
 *   storagePath: '/data/eventlog-anonymization.json'
 * });
 *
 * // Save a mapping
 * await store.save(mapping);
 *
 * // Load a mapping
 * const loaded = await store.load();
 * ```
 */
export class AnonymizationStore {
  private readonly config: Required<AnonymizationStoreConfig>;

  /**
   * Initialize the anonymization store
   *
   * @param config - Configuration for the store
   */
  constructor(config: AnonymizationStoreConfig) {
    this.config = {
      fileMode: 0o600,
      createDirs: true,
      ...config
    };
  }

  /**
   * Save an anonymization mapping to disk
   *
   * Uses atomic write pattern: write to temp file, then rename.
   * This prevents corruption if the process crashes during write.
   *
   * @param mapping - The anonymization mapping to persist
   * @returns Promise that resolves when file is written
   * @throws Error if save fails
   */
  async save(mapping: AnonymizationMapping): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Ensure directory exists
        const dir = path.dirname(this.config.storagePath);
        if (this.config.createDirs && !fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Prepare serializable mapping
        const serializable = this.serializeMapping(mapping);
        const content = JSON.stringify(serializable, null, 2);

        // Write to temp file
        const tmpPath = `${this.config.storagePath}.tmp`;
        fs.writeFile(tmpPath, content, 'utf-8', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Try to set file mode for Unix-like systems
          try {
            fs.chmodSync(tmpPath, this.config.fileMode);
          } catch {
            // Ignore - not critical on Windows
          }

          // Atomic rename
          fs.rename(tmpPath, this.config.storagePath, (renameErr) => {
            if (renameErr) {
              reject(renameErr);
            } else {
              resolve();
            }
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Load an anonymization mapping from disk
   *
   * @returns The loaded anonymization mapping
   * @throws Error if file doesn't exist or is invalid JSON
   */
  async load(): Promise<AnonymizationMapping> {
    return new Promise((resolve, reject) => {
      fs.readFile(this.config.storagePath, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const serialized = JSON.parse(data);
          const mapping = this.deserializeMapping(serialized);
          resolve(mapping);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Check if a mapping file exists
   *
   * @returns True if mapping file exists, false otherwise
   */
  exists(): boolean {
    return fs.existsSync(this.config.storagePath);
  }

  /**
   * Delete the mapping file
   *
   * @returns Promise that resolves when file is deleted
   */
  async delete(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.config.storagePath)) {
        resolve();
        return;
      }

      fs.unlink(this.config.storagePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get file size in bytes
   *
   * @returns Size of mapping file, or 0 if doesn't exist
   */
  getSize(): number {
    try {
      const stat = fs.statSync(this.config.storagePath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  /**
   * Convert Map-based mapping to serializable format
   *
   * @private
   */
  private serializeMapping(mapping: AnonymizationMapping): Record<string, any> {
    return {
      usernames: Object.fromEntries(mapping.usernames),
      computerNames: Object.fromEntries(mapping.computerNames),
      ipAddresses: Object.fromEntries(mapping.ipAddresses),
      emails: Object.fromEntries(mapping.emails),
      paths: Object.fromEntries(mapping.paths),
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
  }

  /**
   * Convert serialized format back to Map-based mapping
   *
   * @private
   */
  private deserializeMapping(serialized: any): AnonymizationMapping {
    return {
      usernames: new Map(Object.entries(serialized.usernames ?? {})),
      computerNames: new Map(Object.entries(serialized.computerNames ?? {})),
      ipAddresses: new Map(Object.entries(serialized.ipAddresses ?? {})),
      emails: new Map(Object.entries(serialized.emails ?? {})),
      paths: new Map(Object.entries(serialized.paths ?? {}))
    };
  }
}
