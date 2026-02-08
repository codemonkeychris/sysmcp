/**
 * EventLog Library - Main Entry Point
 * 
 * Provides a reusable interface for querying Windows Event Logs using PowerShell's Get-WinEvent.
 */

import { PowerShellExecutor } from './powershell-executor';
import { EventLogAdapter } from './eventlog-adapter';

/**
 * Represents a single Windows Event Log entry
 */
export interface EventLogEntry {
  id: number;
  logName: string;
  providerName: string;
  eventId: number;
  levelDisplayName: string;
  message: string;
  timeCreated: Date;
  userId?: string;
  computerName?: string;
  [key: string]: any;
}

/**
 * Configuration options for EventLog queries
 */
export interface EventLogQueryOptions {
  logName?: string;
  maxResults?: number;
  eventId?: number;
  level?: string;
  providerId?: string;
  startTime?: Date;
  endTime?: Date;
  userId?: string;
  messageContains?: string;
  offset?: number;
}

/**
 * Result of an EventLog query operation
 */
export interface EventLogResult {
  success: boolean;
  entries: EventLogEntry[];
  totalCount?: number;
  errorMessage?: string;
  hasNextPage?: boolean;
  nextOffset?: number;
}

/**
 * EventLog Library - Main class for querying Windows Event Logs
 * 
 * Uses PowerShell's Get-WinEvent as the underlying API.
 * Provides async methods for querying and filtering event logs.
 * 
 * Usage:
 * ```typescript
 * const lib = new EventLogLibrary();
 * const result = await lib.queryEventLog({ logName: 'System', maxResults: 100 });
 * if (result.success) {
 *   console.log(`Found ${result.entries.length} events`);
 * }
 * ```
 */
export class EventLogLibrary {
  /**
   * Initialize the EventLog library
   */
  constructor() {
    // PowerShell executor is stateless, no initialization needed
  }

  /**
   * Query event logs with specified options
   * 
   * Builds and executes a PowerShell Get-WinEvent command with specified filters.
   * Returns normalized EventLogEntry objects with proper error handling.
   * 
   * Supports:
   * - Time range filtering (startTime, endTime)
   * - Full-text message search (messageContains)
   * - Provider/Source filtering (providerId)
   * - Event ID filtering (eventId)
   * - Level filtering (level)
   * - Result limiting and pagination (maxResults, offset)
   * 
   * @param options Query configuration options
   * @returns Promise resolving to EventLogResult with entries or error message
   * @throws Error only for validation failures, all operational errors return EventLogResult.success=false
   * 
   * @example
   * ```typescript
   * const lib = new EventLogLibrary();
   * 
   * // Simple query
   * const result = await lib.queryEventLog({
   *   logName: 'System',
   *   maxResults: 100,
   *   level: 'Warning'
   * });
   * 
   * // Advanced query with filters
   * const result = await lib.queryEventLog({
   *   logName: 'System',
   *   startTime: new Date(Date.now() - 24*60*60*1000), // Last 24 hours
   *   endTime: new Date(),
   *   eventId: 1000,
   *   providerId: 'Microsoft-Windows-EventLog',
   *   messageContains: 'Error',
   *   maxResults: 500,
   *   offset: 0
   * });
   * 
   * if (result.success) {
   *   result.entries.forEach(entry => {
   *     console.log(`[${entry.timeCreated}] ${entry.levelDisplayName}: ${entry.message}`);
   *   });
   *   
   *   if (result.hasNextPage) {
   *     const nextResult = await lib.queryEventLog({
   *       ...options,
   *       offset: result.nextOffset
   *     });
   *   }
   * }
   * ```
   */
  async queryEventLog(options: EventLogQueryOptions = {}): Promise<EventLogResult> {
    try {
      // Validate options
      this.validateQueryOptions(options);
      
      const command = this.buildGetWinEventCommand(options);
      
      // Execute PowerShell command
      const psResult = await PowerShellExecutor.executeJson<any[]>(command);
      
      // Handle empty result
      if (!psResult || psResult.length === 0) {
        return {
          success: true,
          entries: [],
          totalCount: 0,
          hasNextPage: false
        };
      }

      // Ensure we have an array
      const events = Array.isArray(psResult) ? psResult : [psResult];
      
      // Adapt PowerShell objects to EventLogEntry
      const entries = EventLogAdapter.adaptEntries(events);

      // Calculate pagination metadata
      const maxResults = options.maxResults ?? 1000;
      const hasNextPage = entries.length >= maxResults;
      const nextOffset = hasNextPage ? (options.offset ?? 0) + entries.length : undefined;

      return {
        success: true,
        entries,
        totalCount: entries.length,
        hasNextPage,
        nextOffset
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for validation errors - these should be returned, not hidden
      if (errorMessage.includes('Invalid')) {
        return {
          success: false,
          entries: [],
          errorMessage
        };
      }
      
      // Check for permission denied
      if (errorMessage.includes('Permission denied') || errorMessage.includes('Access is denied')) {
        return {
          success: false,
          entries: [],
          errorMessage: `Permission denied accessing event log: ${errorMessage}`
        };
      }

      // Check for invalid log name
      if (errorMessage.includes('No logs were found') || errorMessage.includes('not found')) {
        return {
          success: false,
          entries: [],
          errorMessage: `Event log not found: ${options.logName ?? 'Unknown'}`
        };
      }

      // Check for timeout
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        return {
          success: false,
          entries: [],
          errorMessage: `Query timeout: ${errorMessage}`
        };
      }

      // Generic error
      return {
        success: false,
        entries: [],
        errorMessage: `Query failed: ${errorMessage}`
      };
    }
  }

  /**
   * Get available event log names
   * 
   * @returns Promise resolving to list of available logs
   */
  async getAvailableLogs(): Promise<string[]> {
    try {
      const command = 'Get-WinEvent -ListLog * | Select-Object -ExpandProperty LogName | ConvertTo-Json';
      const logs = await PowerShellExecutor.executeJson<string[]>(command);
      return Array.isArray(logs) ? logs : [];
    } catch {
      return [];
    }
  }

  /**
   * Clear an event log (requires admin)
   * 
   * @param _logName Name of the log to clear
   * @returns Promise resolving when log is cleared
   * 
   * @throws Error if not running as admin or log doesn't exist
   */
  async clearEventLog(_logName: string): Promise<void> {
    // Phase 1+ - Implement with write permission handling
    throw new Error('Not yet implemented - Phase 1+');
  }

  /**
   * Cleanup resources and close connections
   */
  async dispose(): Promise<void> {
    // PowerShell executor is stateless, no cleanup needed
  }

  /**
   * Build a Get-WinEvent PowerShell command from query options
   * 
   * Constructs a PowerShell command with proper filter syntax:
   * - Simple parameters: -LogName, -MaxEvents, -ProviderName
   * - FilterHashtable for complex filters: ID, Level, StartTime, EndTime
   * - Where-Object for message text search
   * 
   * @param options Query configuration
   * @returns PowerShell command string
   * @private
   */
  private buildGetWinEventCommand(options: EventLogQueryOptions): string {
    const params: string[] = [];

    // Required: LogName with default to System
    if (options.logName) {
      params.push(`-LogName '${options.logName.replace(/'/g, "''")}'`);
    } else {
      params.push("-LogName 'System'");
    }

    // Optional: maxResults - handle both MaxEvents parameter and offset-based pagination
    let maxEvents = options.maxResults ?? 1000;
    maxEvents = Math.min(Math.max(maxEvents, 1), 10000); // Clamp between 1-10000
    params.push(`-MaxEvents ${maxEvents}`);

    // Build FilterHashtable for complex filters
    const filterParts: string[] = [];
    
    if (options.eventId && options.eventId > 0) {
      filterParts.push(`ID=${options.eventId}`);
    }
    
    if (options.level) {
      const levelMap: Record<string, number> = {
        'VERBOSE': 5,
        'INFORMATION': 4,
        'WARNING': 3,
        'ERROR': 2,
        'CRITICAL': 1
      };
      const levelValue = levelMap[options.level.toUpperCase()] ?? 4;
      filterParts.push(`Level=${levelValue}`);
    }

    // Add time range filters to FilterHashtable
    if (options.startTime) {
      const startTimeStr = this.formatPowerShellDate(options.startTime);
      filterParts.push(`StartTime=[DateTime]'${startTimeStr}'`);
    }

    if (options.endTime) {
      const endTimeStr = this.formatPowerShellDate(options.endTime);
      filterParts.push(`EndTime=[DateTime]'${endTimeStr}'`);
    }

    // Add FilterHashtable if we have filters
    if (filterParts.length > 0) {
      params.push(`-FilterHashtable @{${filterParts.join('; ')}}`);
    }

    // Optional: ProviderName (only if not already in FilterHashtable)
    if (options.providerId && filterParts.length === 0) {
      params.push(`-ProviderName '${options.providerId.replace(/'/g, "''")}'`);
    } else if (options.providerId && filterParts.length > 0) {
      // If we have a FilterHashtable, add provider as a filter part
      params[params.length - 1] = params[params.length - 1].replace(
        '@{',
        `@{Provider='${options.providerId.replace(/'/g, "''")}'; `
      );
    }

    // Build base command: Get-WinEvent with filters
    let cmdPart = params.join(' ');
    let fullCommand = `Get-WinEvent ${cmdPart}`;

    // Add message filter with Where-Object if messageContains is specified
    if (options.messageContains) {
      const searchText = options.messageContains.replace(/'/g, "''");
      fullCommand += ` | Where-Object { $_.Message -like '*${searchText}*' }`;
    }

    // Add Select-Object to return specific fields, then convert to JSON
    fullCommand += ` | Select-Object RecordId,LogName,ProviderName,Id,LevelDisplayName,Message,TimeCreated,UserId,MachineName | ConvertTo-Json`;

    return fullCommand;
  }

  /**
   * Validate query options for correctness
   * 
   * Checks:
   * - maxResults is between 1-1000
   * - offset is >= 0
   * - startTime is before endTime (if both provided)
   * - messageContains is a non-empty string
   * 
   * @param options Query options to validate
   * @throws Error with descriptive message if validation fails
   * @private
   */
  private validateQueryOptions(options: EventLogQueryOptions): void {
    // Validate maxResults
    if (options.maxResults !== undefined) {
      if (options.maxResults < 1 || options.maxResults > 10000) {
        throw new Error('Invalid maxResults: must be between 1 and 10000');
      }
      if (!Number.isInteger(options.maxResults)) {
        throw new Error('Invalid maxResults: must be an integer');
      }
    }

    // Validate offset
    if (options.offset !== undefined) {
      if (options.offset < 0) {
        throw new Error('Invalid offset: must be >= 0');
      }
      if (!Number.isInteger(options.offset)) {
        throw new Error('Invalid offset: must be an integer');
      }
    }

    // Validate time range
    if (options.startTime && options.endTime) {
      if (options.startTime > options.endTime) {
        throw new Error('Invalid time range: startTime must be before endTime');
      }
    }

    // Validate messageContains
    if (options.messageContains !== undefined) {
      if (typeof options.messageContains !== 'string') {
        throw new Error('Invalid messageContains: must be a string');
      }
      if (options.messageContains.length > 1000) {
        throw new Error('Invalid messageContains: must be <= 1000 characters');
      }
    }

    // Validate eventId
    if (options.eventId !== undefined) {
      if (options.eventId < 0 || options.eventId > 65535) {
        throw new Error('Invalid eventId: must be between 0 and 65535');
      }
      if (!Number.isInteger(options.eventId)) {
        throw new Error('Invalid eventId: must be an integer');
      }
    }
  }

  /**
   * Format a Date object to PowerShell DateTime string format
   * 
   * PowerShell expects format: "yyyy-MM-dd HH:mm:ss"
   * Uses UTC time to ensure consistent results across timezones
   * 
   * @param date Date to format
   * @returns Formatted date string for PowerShell
   * @private
   */
  private formatPowerShellDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

// Export adapters, executor, and anonymizer for direct use if needed
export { PowerShellExecutor } from './powershell-executor';
export { EventLogAdapter } from './eventlog-adapter';
export { 
  PiiAnonymizer, 
  type RawEventLogEntry, 
  type AnonymizedEventLogEntry, 
  type AnonymizationMapping 
} from './anonymizer';
