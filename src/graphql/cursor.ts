/**
 * Cursor utilities for pagination
 *
 * Provides encoding and decoding of base64 cursors for stateless pagination.
 * Cursor format: base64(logName:eventId:timestamp)
 */

/**
 * Represents the position in a paginated result set
 */
export interface CursorPosition {
  logName: string;
  eventId: number;
  timestamp: string; // ISO 8601 format
}

/**
 * Encodes a cursor position to a base64 string
 *
 * @param position - The position to encode
 * @returns Base64-encoded cursor string
 *
 * @example
 * const cursor = encodeCursor({ logName: 'System', eventId: 1000, timestamp: '2024-02-01T10:00:00Z' });
 * // Returns something like "U3lzdGVtOjEwMDA6MjAyNC0wMi0wMVQxMDowMDowMFo="
 */
export function encodeCursor(position: CursorPosition): string {
  const cursorData = `${position.logName}:${position.eventId}:${position.timestamp}`;
  return Buffer.from(cursorData).toString('base64');
}

/**
 * Decodes a base64 cursor string to a cursor position
 *
 * @param cursor - The base64-encoded cursor string
 * @returns The decoded cursor position
 * @throws Error if cursor is invalid or malformed
 *
 * @example
 * const position = decodeCursor("U3lzdGVtOjEwMDA6MjAyNC0wMi0wMVQxMDowMDowMFo=");
 * // Returns { logName: 'System', eventId: 1000, timestamp: '2024-02-01T10:00:00Z' }
 */
export function decodeCursor(cursor: string): CursorPosition {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const firstColon = decoded.indexOf(':');
    const secondColon = decoded.indexOf(':', firstColon + 1);

    if (firstColon === -1 || secondColon === -1) {
      throw new Error('Cursor missing required components');
    }

    const logName = decoded.substring(0, firstColon);
    const eventIdStr = decoded.substring(firstColon + 1, secondColon);
    const timestamp = decoded.substring(secondColon + 1);

    if (!logName || !eventIdStr || !timestamp) {
      throw new Error('Cursor missing required components');
    }

    const eventId = parseInt(eventIdStr, 10);
    if (isNaN(eventId)) {
      throw new Error('Cursor contains invalid eventId');
    }

    // Validate timestamp is ISO 8601 format
    const timestampDate = new Date(timestamp);
    if (isNaN(timestampDate.getTime())) {
      throw new Error('Cursor contains invalid timestamp');
    }

    return { logName, eventId, timestamp };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid cursor: ${message}`);
  }
}

/**
 * Validates a cursor string without decoding it
 *
 * @param cursor - The cursor string to validate
 * @returns true if cursor is valid, false otherwise
 */
export function isValidCursor(cursor: string): boolean {
  try {
    decodeCursor(cursor);
    return true;
  } catch {
    return false;
  }
}
