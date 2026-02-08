/**
 * EventLog Adapter Module
 * 
 * Converts raw PowerShell Get-WinEvent objects to normalized EventLogEntry format.
 * Handles timestamp normalization, level mapping, and missing field graceful handling.
 */

import { EventLogEntry } from './index';

export type EventLevel = 'VERBOSE' | 'INFORMATION' | 'WARNING' | 'ERROR' | 'CRITICAL';

/**
 * Adapter for converting PowerShell event objects to EventLogEntry format
 */
export class EventLogAdapter {
  /**
   * Map PowerShell event levels to standard levels
   * 
   * @param psLevel PowerShell level name (e.g., "Warning", "Error", "Information")
   * @returns Normalized event level
   * 
   * @example
   * ```typescript
   * const level = EventLogAdapter.mapEventLevel("Warning");
   * // Returns: "WARNING"
   * ```
   */
  static mapEventLevel(psLevel: string | null | undefined): string {
    if (!psLevel) return 'INFORMATION';

    const normalized = psLevel.toLowerCase().trim();
    const levelMap: Record<string, string> = {
      'verbose': 'VERBOSE',
      'information': 'INFORMATION',
      'warning': 'WARNING',
      'error': 'ERROR',
      'critical': 'CRITICAL'
    };

    return levelMap[normalized] ?? 'INFORMATION';
  }

  /**
   * Adapt a PowerShell event object to EventLogEntry format
   * 
   * Handles null/missing fields gracefully, provides defaults for required fields.
   * Normalizes timestamps to ISO 8601 format.
   * 
   * @param psObject Raw PowerShell Get-WinEvent object
   * @returns Normalized EventLogEntry
   * @throws Error if object is null or missing required fields
   * 
   * @example
   * ```typescript
   * const psObject = {
   *   RecordId: 12345,
   *   LogName: "System",
   *   ProviderName: "EventLog",
   *   Id: 1000,
   *   LevelDisplayName: "Warning",
   *   Message: "Some event message",
   *   TimeCreated: "2023-12-10T10:30:00",
   *   UserId: "DOMAIN\\User",
   *   MachineName: "DESKTOP-ABC"
   * };
   * const entry = EventLogAdapter.adaptEntry(psObject);
   * ```
   */
  static adaptEntry(psObject: any): EventLogEntry {
    if (!psObject) {
      throw new Error('Cannot adapt null or undefined event object');
    }

    // Parse timestamp - handle both string and Date objects
    let timeCreated: Date;
    if (psObject.TimeCreated instanceof Date) {
      timeCreated = psObject.TimeCreated;
    } else if (typeof psObject.TimeCreated === 'string') {
      timeCreated = new Date(psObject.TimeCreated);
    } else {
      timeCreated = new Date();
    }

    if (isNaN(timeCreated.getTime())) {
      timeCreated = new Date();
    }

    // Map level display name
    const levelDisplayName = EventLogAdapter.mapEventLevel(psObject.LevelDisplayName);

    const entry: EventLogEntry = {
      id: psObject.RecordId ?? 0,
      logName: psObject.LogName ?? 'Unknown',
      providerName: psObject.ProviderName ?? 'Unknown',
      eventId: psObject.Id ?? 0,
      levelDisplayName,
      message: psObject.Message ?? '',
      timeCreated,
      userId: psObject.UserId ?? undefined,
      computerName: psObject.MachineName ?? undefined
    };

    // Preserve extra properties from the original object
    for (const key in psObject) {
      if (!(key in entry) && Object.prototype.hasOwnProperty.call(psObject, key)) {
        (entry as any)[key] = psObject[key];
      }
    }

    return entry;
  }

  /**
   * Adapt multiple PowerShell event objects to EventLogEntry array
   * 
   * @param psObjects Array of raw PowerShell Get-WinEvent objects
   * @returns Array of normalized EventLogEntry objects
   * 
   * @example
   * ```typescript
   * const entries = EventLogAdapter.adaptEntries(psObjects);
   * ```
   */
  static adaptEntries(psObjects: any[]): EventLogEntry[] {
    if (!Array.isArray(psObjects)) {
      return [];
    }

    return psObjects.map(obj => EventLogAdapter.adaptEntry(obj));
  }

  /**
   * Validate that a PowerShell event object has required fields
   * 
   * @param psObject Object to validate
   * @returns true if object has minimum required fields, false otherwise
   */
  static isValidEventObject(psObject: any): boolean {
    if (!psObject) {
      return false;
    }
    return (
      (psObject.RecordId !== null && psObject.RecordId !== undefined) &&
      (psObject.LogName !== null && psObject.LogName !== undefined) &&
      (psObject.TimeCreated !== null && psObject.TimeCreated !== undefined)
    );
  }
}
