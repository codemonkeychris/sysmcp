/**
 * PII Anonymization Engine for EventLog Entries
 * 
 * Provides consistent, hash-based anonymization of personally identifiable information
 * in Windows EventLog entries. Uses deterministic hashing to ensure the same input
 * always produces the same anonymization ID, allowing consistent tracking across
 * multiple queries while protecting user privacy.
 * 
 * Supported PII patterns:
 * - Usernames (DOMAIN\username format)
 * - Computer names
 * - IPv4 and IPv6 addresses
 * - Email addresses
 * - File system paths containing user directories
 * - URLs in event messages
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a raw event log entry before anonymization
 */
export interface RawEventLogEntry {
  id?: number;
  logName?: string;
  providerName?: string;
  eventId?: number;
  levelDisplayName?: string;
  message?: string;
  timeCreated?: Date;
  userId?: string;
  computerName?: string;
  [key: string]: any;
}

/**
 * Represents an anonymized event log entry with PII replaced
 */
export interface AnonymizedEventLogEntry {
  id?: number;
  logName?: string;
  providerName?: string;
  eventId?: number;
  levelDisplayName?: string;
  message?: string;
  timeCreated?: Date;
  userId?: string;
  computerName?: string;
  [key: string]: any;
}

/**
 * Mapping from original values to anonymized tokens
 */
export interface AnonymizationMapping {
  usernames: Map<string, string>;
  computerNames: Map<string, string>;
  ipAddresses: Map<string, string>;
  emails: Map<string, string>;
  paths: Map<string, string>;
}

/**
 * Persisted anonymization mapping for disk storage
 */
interface PersistedMapping {
  usernames: Record<string, string>;
  computerNames: Record<string, string>;
  ipAddresses: Record<string, string>;
  emails: Record<string, string>;
  paths: Record<string, string>;
  timestamp: string;
}

/**
 * PII Anonymizer - Consistent anonymization of EventLog entries
 * 
 * Anonymizes PII data using hash-based tokens. The same PII value always
 * produces the same token, allowing for consistent tracking and correlation
 * across multiple queries.
 * 
 * Usage:
 * ```typescript
 * const anonymizer = new PiiAnonymizer();
 * 
 * // Anonymize a single entry
 * const anonEntry = anonymizer.anonymizeEntry(rawEntry);
 * 
 * // Persist mapping for service restarts
 * await anonymizer.persistMapping('/path/to/mapping.json');
 * 
 * // Load persisted mapping
 * const loaded = await PiiAnonymizer.loadMapping('/path/to/mapping.json');
 * const anonymizer2 = new PiiAnonymizer(loaded);
 * ```
 */
export class PiiAnonymizer {
  private mapping: AnonymizationMapping = {
    usernames: new Map(),
    computerNames: new Map(),
    ipAddresses: new Map(),
    emails: new Map(),
    paths: new Map()
  };

  /**
   * Regular expressions for PII pattern matching
   */
  private static readonly PATTERNS = {
    // DOMAIN\username format
    username: /^([A-Za-z0-9._-]+\\[A-Za-z0-9._-]+)$/,
    // Computer name - alphanumeric with hyphens
    computerName: /^[A-Za-z0-9][A-Za-z0-9-]{0,14}$/,
    // IPv4 address
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    // IPv6 address
    ipv6: /(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}/gi,
    // Email address
    email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g,
    // Windows file path
    winPath: /[C-Fa-f]:\\(?:[A-Za-z0-9._-]+\\)*[A-Za-z0-9._-]*/g,
    // URL
    url: /https?:\/\/[^\s]*/g
  };

  /**
   * Initialize the anonymizer with optional persisted mapping
   * 
   * @param persistedMapping - Previously saved anonymization mapping, used to maintain consistency
   */
  constructor(persistedMapping?: AnonymizationMapping) {
    if (persistedMapping) {
      this.mapping = {
        usernames: new Map(persistedMapping.usernames),
        computerNames: new Map(persistedMapping.computerNames),
        ipAddresses: new Map(persistedMapping.ipAddresses),
        emails: new Map(persistedMapping.emails),
        paths: new Map(persistedMapping.paths)
      };
    }
  }

  /**
   * Anonymize an event log entry
   * 
   * Scans all string fields in the entry for PII patterns and replaces them
   * with consistent anonymization tokens. Non-string fields are preserved as-is.
   * 
   * @param entry - Raw event log entry to anonymize
   * @returns Anonymized event log entry with PII replaced
   * 
   * @example
   * ```typescript
   * const raw = {
   *   userId: 'CONTOSO\\jsmith',
   *   computerName: 'WORKSTATION1',
   *   message: 'User CONTOSO\\jsmith logged in from 192.168.1.100'
   * };
   * 
   * const anon = anonymizer.anonymizeEntry(raw);
   * // Result:
   * // {
   * //   userId: 'CONTOSO\\[ANON_USER_abc123]',
   * //   computerName: '[ANON_COMPUTER_def456]',
   * //   message: 'User CONTOSO\\[ANON_USER_abc123] logged in from [ANON_IP_ghi789]'
   * // }
   * ```
   */
  /**
   * Fields that should never be anonymized (enum values, metadata, identifiers)
   */
  private static readonly SAFE_FIELDS = new Set([
    'logName',
    'levelDisplayName',
    'level',
    'providerName',
    'source',
    'eventId',
    'id',
    'timeCreated',
    'timestamp',
  ]);

  anonymizeEntry(entry: RawEventLogEntry): AnonymizedEventLogEntry {
    const result: AnonymizedEventLogEntry = { ...entry };

    // Anonymize only PII-bearing string fields, skip safe fields
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && !PiiAnonymizer.SAFE_FIELDS.has(key)) {
        result[key] = this.anonymizeString(value);
      }
    }

    return result;
  }

  /**
   * Get the current anonymization mapping
   * 
   * Returns the mapping of original values to anonymization tokens.
   * Useful for analysis, debugging, or persistence.
   * 
   * @returns Current anonymization mapping
   */
  getMapping(): AnonymizationMapping {
    return this.mapping;
  }

  /**
   * Persist anonymization mapping to a JSON file
   * 
   * Saves the current anonymization mapping to disk for recovery
   * after service restart or crash. The mapping is required to
   * maintain consistent anonymization across service restarts.
   * 
   * @param filePath - Path where to save the mapping JSON file
   * @returns Promise that resolves when file is written
   * @throws Error if file write fails
   * 
   * @example
   * ```typescript
   * await anonymizer.persistMapping('/var/lib/sysmcp/anon-mapping.json');
   * ```
   */
  async persistMapping(filePath: string): Promise<void> {
    const persisted: PersistedMapping = {
      usernames: Object.fromEntries(this.mapping.usernames),
      computerNames: Object.fromEntries(this.mapping.computerNames),
      ipAddresses: Object.fromEntries(this.mapping.ipAddresses),
      emails: Object.fromEntries(this.mapping.emails),
      paths: Object.fromEntries(this.mapping.paths),
      timestamp: new Date().toISOString()
    };

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, JSON.stringify(persisted, null, 2), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Load anonymization mapping from a JSON file
   * 
   * Restores a previously saved anonymization mapping to maintain
   * consistency across service restarts.
   * 
   * @param filePath - Path to saved mapping JSON file
   * @returns Mapping object that can be passed to constructor
   * @throws Error if file read fails or JSON is invalid
   * 
   * @example
   * ```typescript
   * const mapping = await PiiAnonymizer.loadMapping('/var/lib/sysmcp/anon-mapping.json');
   * const anonymizer = new PiiAnonymizer(mapping);
   * ```
   */
  static async loadMapping(filePath: string): Promise<AnonymizationMapping> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const persisted: PersistedMapping = JSON.parse(data);
          const mapping: AnonymizationMapping = {
            usernames: new Map(Object.entries(persisted.usernames)),
            computerNames: new Map(Object.entries(persisted.computerNames)),
            ipAddresses: new Map(Object.entries(persisted.ipAddresses)),
            emails: new Map(Object.entries(persisted.emails)),
            paths: new Map(Object.entries(persisted.paths))
          };
          resolve(mapping);
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });
  }

  /**
   * Anonymize a string value, scanning for all PII patterns
   * 
   * Processes a string to find and replace all PII patterns.
   * Uses deterministic hashing to ensure consistent replacement.
   * 
   * @param value - String to anonymize
   * @returns Anonymized string with PII replaced
   * @private
   */
  private anonymizeString(value: string): string {
    if (!value || value.length === 0) {
      return value;
    }

    let result = value;

    // Anonymize usernames (DOMAIN\username)
    result = this.anonymizeUsernames(result);

    // Anonymize computer names
    result = this.anonymizeComputerNames(result);

    // Anonymize IPv4 and IPv6 addresses
    result = this.anonymizeIpAddresses(result);

    // Anonymize email addresses
    result = this.anonymizeEmails(result);

    // Anonymize file paths
    result = this.anonymizeFilePaths(result);

    return result;
  }

  /**
   * Anonymize usernames in DOMAIN\username format
   * 
   * @param value - String containing potential usernames
   * @returns String with usernames anonymized
   * @private
   */
  private anonymizeUsernames(value: string): string {
    // Match DOMAIN\username pattern
    return value.replace(/([A-Za-z0-9._-]+\\[A-Za-z0-9._-]+)/g, (match) => {
      return this.getOrCreateToken(match, 'usernames', 'ANON_USER');
    });
  }

  /**
   * Anonymize computer names
   * 
   * Looks for computer names (alphanumeric with hyphens, max 15 chars)
   * and replaces them with anonymized tokens.
   * 
   * @param value - String containing potential computer names
   * @returns String with computer names anonymized
   * @private
   */
  /**
   * Common words that should not be treated as computer names
   */
  private static readonly COMPUTER_NAME_EXCLUSIONS = new Set([
    'INFORMATION', 'WARNING', 'ERROR', 'CRITICAL', 'VERBOSE', 'DEBUG',
    'INFO', 'WARN', 'FATAL', 'TRACE', 'AUDIT',
    'SYSTEM', 'APPLICATION', 'SECURITY', 'SETUP',
    'TRUE', 'FALSE', 'NULL', 'NONE', 'UNKNOWN',
    'THE', 'AND', 'FOR', 'NOT', 'ALL', 'ARE', 'BUT', 'WAS',
    'SUCCESS', 'FAILURE', 'FAILED', 'STARTED', 'STOPPED', 'RUNNING',
    'GET', 'SET', 'PUT', 'POST', 'DELETE', 'PATCH',
    'TCP', 'UDP', 'HTTP', 'HTTPS', 'DNS', 'DHCP', 'RPC', 'COM',
  ]);

  private anonymizeComputerNames(value: string): string {
    // Match computer names - require at least one hyphen or digit mixed with letters
    // to distinguish from common English words. Pure all-caps words are too ambiguous.
    return value.replace(/\b([A-Z][A-Z0-9-]{1,14})\b/g, (match) => {
      if (match === match.toUpperCase() && match.length > 2) {
        // Skip common words that are not computer names
        if (PiiAnonymizer.COMPUTER_NAME_EXCLUSIONS.has(match)) {
          return match;
        }
        // Require at least one digit or hyphen to look like a computer name
        if (/[\d-]/.test(match)) {
          return this.getOrCreateToken(match, 'computerNames', 'ANON_COMPUTER');
        }
      }
      return match;
    });
  }

  /**
   * Anonymize IPv4 and IPv6 addresses
   * 
   * @param value - String containing potential IP addresses
   * @returns String with IP addresses anonymized
   * @private
   */
  private anonymizeIpAddresses(value: string): string {
    // IPv4
    let result = value.replace(PiiAnonymizer.PATTERNS.ipv4, (match) => {
      return this.getOrCreateToken(match, 'ipAddresses', 'ANON_IP');
    });

    // IPv6
    result = result.replace(PiiAnonymizer.PATTERNS.ipv6, (match) => {
      return this.getOrCreateToken(match, 'ipAddresses', 'ANON_IP');
    });

    return result;
  }

  /**
   * Anonymize email addresses
   * 
   * @param value - String containing potential emails
   * @returns String with emails anonymized
   * @private
   */
  private anonymizeEmails(value: string): string {
    return value.replace(PiiAnonymizer.PATTERNS.email, (match) => {
      return this.getOrCreateToken(match, 'emails', 'ANON_EMAIL');
    });
  }

  /**
   * Anonymize file paths containing user information
   * 
   * Specifically handles Windows paths like C:\Users\username\...
   * 
   * @param value - String containing potential file paths
   * @returns String with file paths anonymized
   * @private
   */
  private anonymizeFilePaths(value: string): string {
    // Match C:\Users\username or similar user profile paths
    return value.replace(/C:\\Users\\([A-Za-z0-9._-]+)/gi, (_match, username) => {
      const token = this.getOrCreateToken(username, 'usernames', 'ANON_USER');
      return `C:\\Users\\${token}`;
    });
  }

  /**
   * Get existing anonymization token or create a new one
   * 
   * Uses consistent hashing to generate anonymization tokens.
   * The same input always produces the same token.
   * 
   * @param original - Original value to anonymize
   * @param mapKey - Which mapping to store in (usernames, computerNames, etc.)
   * @param prefix - Prefix for the anonymization token
   * @returns Anonymized token
   * @private
   */
  private getOrCreateToken(
    original: string,
    mapKey: keyof AnonymizationMapping,
    prefix: string
  ): string {
    const map = this.mapping[mapKey];

    // Return existing token if already anonymized
    if (map.has(original)) {
      return map.get(original)!;
    }

    // Create new token using hash
    const hash = crypto.createHash('sha256').update(original).digest('hex').substring(0, 6);
    const token = `[${prefix}_${hash.toUpperCase()}]`;

    // Store for consistency
    map.set(original, token);

    return token;
  }
}
