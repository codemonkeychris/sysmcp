/**
 * Tests for cursor utilities
 */

import { encodeCursor, decodeCursor, isValidCursor, CursorPosition } from '../cursor';

describe('Cursor Utilities', () => {
  describe('encodeCursor', () => {
    it('should encode a cursor position to base64', () => {
      const position: CursorPosition = {
        logName: 'System',
        eventId: 1000,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);

      expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64
      expect(cursor).toContain('System'); // Decoded should contain logName
    });

    it('should handle special characters in logName', () => {
      const position: CursorPosition = {
        logName: 'Application (Event)',
        eventId: 1000,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);

      expect(cursor).toMatch(/^[A-Za-z0-9+/=]+$/); // Valid base64
    });

    it('should encode large event IDs', () => {
      const position: CursorPosition = {
        logName: 'System',
        eventId: 999999999,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor(cursor);

      expect(decoded.eventId).toBe(999999999);
    });
  });

  describe('decodeCursor', () => {
    it('should decode a valid base64 cursor', () => {
      const position: CursorPosition = {
        logName: 'System',
        eventId: 1000,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual(position);
    });

    it('should reject invalid base64', () => {
      expect(() => decodeCursor('not-valid-base64!!!')).toThrow('Invalid cursor');
    });

    it('should reject cursor with missing components', () => {
      const invalidCursor = Buffer.from('System:1000').toString('base64'); // Missing timestamp
      expect(() => decodeCursor(invalidCursor)).toThrow('Invalid cursor');
    });

    it('should reject cursor with invalid eventId', () => {
      const invalidCursor = Buffer.from('System:notanumber:2024-02-01T10:00:00Z').toString('base64');
      expect(() => decodeCursor(invalidCursor)).toThrow('Invalid cursor');
    });

    it('should reject cursor with invalid timestamp', () => {
      const invalidCursor = Buffer.from('System:1000:not-a-date').toString('base64');
      expect(() => decodeCursor(invalidCursor)).toThrow('Invalid cursor');
    });

    it('should handle cursor with special characters', () => {
      const position: CursorPosition = {
        logName: 'Application (Event)',
        eventId: 1000,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);
      const decoded = decodeCursor(cursor);

      expect(decoded.logName).toBe('Application (Event)');
    });
  });

  describe('isValidCursor', () => {
    it('should return true for valid cursor', () => {
      const position: CursorPosition = {
        logName: 'System',
        eventId: 1000,
        timestamp: '2024-02-01T10:00:00Z'
      };

      const cursor = encodeCursor(position);

      expect(isValidCursor(cursor)).toBe(true);
    });

    it('should return false for invalid base64', () => {
      expect(isValidCursor('not-valid!!!')).toBe(false);
    });

    it('should return false for malformed cursor', () => {
      const invalidCursor = Buffer.from('System:1000').toString('base64'); // Missing timestamp
      expect(isValidCursor(invalidCursor)).toBe(false);
    });

    it('should return false for cursor with invalid eventId', () => {
      const invalidCursor = Buffer.from('System:notanumber:2024-02-01T10:00:00Z').toString('base64');
      expect(isValidCursor(invalidCursor)).toBe(false);
    });

    it('should not throw when validating invalid cursor', () => {
      expect(() => isValidCursor('invalid!!!')).not.toThrow();
    });
  });

  describe('Round-trip encoding/decoding', () => {
    it('should maintain data through encode/decode cycle', () => {
      const testPositions: CursorPosition[] = [
        { logName: 'System', eventId: 0, timestamp: '2024-01-01T00:00:00Z' },
        { logName: 'Application', eventId: 999999, timestamp: '2024-12-31T23:59:59Z' },
        { logName: 'Security', eventId: 42, timestamp: '2024-06-15T12:30:45Z' },
        { logName: 'Windows PowerShell', eventId: 400, timestamp: '2024-02-01T10:00:00Z' }
      ];

      for (const position of testPositions) {
        const cursor = encodeCursor(position);
        const decoded = decodeCursor(cursor);
        expect(decoded).toEqual(position);
      }
    });
  });
});
