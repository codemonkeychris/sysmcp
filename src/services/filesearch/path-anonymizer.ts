/**
 * Path Anonymizer
 *
 * File-path-specific PII anonymization that integrates with the shared PiiAnonymizer.
 * Anonymizes user profile path segments and author metadata.
 */

import { PiiAnonymizer } from '../eventlog/lib/src/anonymizer';
import { FileSearchEntry } from './types';

/**
 * Regex to detect user profile paths on Windows (any drive letter)
 * Captures: drive letter, username, and rest of path
 */
const USER_PATH_REGEX = /^([A-Za-z]):\\Users\\([^\\]+)(\\.*)?$/i;

/**
 * Regex to detect Unix-style user paths (future-proofing)
 */
const UNIX_USER_PATH_REGEX = /^\/home\/([^/]+)(\/.*)?$/;

/**
 * PathAnonymizer - Anonymizes file paths and author metadata
 *
 * Uses the shared PiiAnonymizer for consistent anonymization across
 * EventLog and FileSearch services.
 */
export class PathAnonymizer {
  constructor(private anonymizer: PiiAnonymizer) {}

  /**
   * Anonymize a file path by replacing user profile segments
   *
   * C:\Users\john.doe\Documents\report.docx → C:\Users\[ANON_USER_ABC123]\Documents\report.docx
   *
   * @param filePath - Full file path
   * @returns Anonymized path
   */
  public anonymizePath(filePath: string): string {
    if (!filePath) return filePath;

    // Check Windows user profile path pattern
    const winMatch = filePath.match(USER_PATH_REGEX);
    if (winMatch) {
      const drive = winMatch[1];
      const username = winMatch[2];
      const rest = winMatch[3] || '';

      // Skip system accounts
      if (['Public', 'Default', 'Default User', 'All Users'].includes(username)) {
        return filePath;
      }

      // Use the shared anonymizer to get consistent token
      const anonEntry = this.anonymizer.anonymizeEntry({
        userId: username,
        message: ''
      });
      // Extract the anonymized token from userId
      const anonToken = anonEntry.userId || `[ANON_USER]`;

      return `${drive}:\\Users\\${anonToken}${rest}`;
    }

    // Check Unix user path pattern (future-proofing)
    const unixMatch = filePath.match(UNIX_USER_PATH_REGEX);
    if (unixMatch) {
      const username = unixMatch[1];
      const rest = unixMatch[2] || '';

      const anonEntry = this.anonymizer.anonymizeEntry({
        userId: username,
        message: ''
      });
      const anonToken = anonEntry.userId || `[ANON_USER]`;

      return `/home/${anonToken}${rest}`;
    }

    return filePath;
  }

  /**
   * Anonymize an author name
   *
   * @param author - Author name string
   * @returns Anonymized author string
   */
  public anonymizeAuthor(author: string): string {
    if (!author) return author;

    const anonEntry = this.anonymizer.anonymizeEntry({
      userId: author,
      message: ''
    });
    return anonEntry.userId || '[ANON_USER]';
  }

  /**
   * Anonymize all PII fields in a FileSearchEntry
   *
   * @param entry - File search entry to anonymize
   * @returns New entry with anonymized path and author
   */
  public anonymizeEntry(entry: FileSearchEntry): FileSearchEntry {
    return {
      ...entry,
      path: this.anonymizePath(entry.path),
      author: entry.author ? this.anonymizeAuthor(entry.author) : undefined
    };
  }

  /**
   * Anonymize all PII fields in an array of FileSearchEntry objects
   *
   * @param entries - Array of entries to anonymize
   * @returns New array with anonymized entries
   */
  public anonymizeEntries(entries: FileSearchEntry[]): FileSearchEntry[] {
    return entries.map(entry => this.anonymizeEntry(entry));
  }
}
