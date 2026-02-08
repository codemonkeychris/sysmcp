/**
 * Unit tests for EventLog Adapter
 */

import { EventLogAdapter } from '../eventlog-adapter';

describe('EventLogAdapter', () => {
  describe('mapEventLevel', () => {
    it('should map Information to INFORMATION', () => {
      expect(EventLogAdapter.mapEventLevel('Information')).toBe('INFORMATION');
    });

    it('should map Warning to WARNING', () => {
      expect(EventLogAdapter.mapEventLevel('Warning')).toBe('WARNING');
    });

    it('should map Error to ERROR', () => {
      expect(EventLogAdapter.mapEventLevel('Error')).toBe('ERROR');
    });

    it('should map Critical to CRITICAL', () => {
      expect(EventLogAdapter.mapEventLevel('Critical')).toBe('CRITICAL');
    });

    it('should map Verbose to VERBOSE', () => {
      expect(EventLogAdapter.mapEventLevel('Verbose')).toBe('VERBOSE');
    });

    it('should handle lowercase levels', () => {
      expect(EventLogAdapter.mapEventLevel('warning')).toBe('WARNING');
      expect(EventLogAdapter.mapEventLevel('error')).toBe('ERROR');
    });

    it('should handle null/undefined with default', () => {
      expect(EventLogAdapter.mapEventLevel(null)).toBe('INFORMATION');
      expect(EventLogAdapter.mapEventLevel(undefined)).toBe('INFORMATION');
    });

    it('should handle unknown levels with default', () => {
      expect(EventLogAdapter.mapEventLevel('UnknownLevel')).toBe('INFORMATION');
    });

    it('should handle whitespace in levels', () => {
      expect(EventLogAdapter.mapEventLevel('  Warning  ')).toBe('WARNING');
    });
  });

  describe('adaptEntry', () => {
    const createBasePsObject = () => ({
      RecordId: 12345,
      LogName: 'System',
      ProviderName: 'EventLog',
      Id: 1000,
      LevelDisplayName: 'Warning',
      Message: 'Test event message',
      TimeCreated: '2023-12-10T10:30:00Z',
      UserId: 'DOMAIN\\User',
      MachineName: 'DESKTOP-ABC'
    });

    it('should adapt a complete PowerShell event object', () => {
      const psObject = createBasePsObject();
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.id).toBe(12345);
      expect(entry.logName).toBe('System');
      expect(entry.providerName).toBe('EventLog');
      expect(entry.eventId).toBe(1000);
      expect(entry.levelDisplayName).toBe('WARNING');
      expect(entry.message).toBe('Test event message');
      expect(entry.userId).toBe('DOMAIN\\User');
      expect(entry.computerName).toBe('DESKTOP-ABC');
    });

    it('should handle Date object for TimeCreated', () => {
      const now = new Date();
      const psObject = {
        ...createBasePsObject(),
        TimeCreated: now
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.timeCreated).toEqual(now);
    });

    it('should handle string timestamp', () => {
      const psObject = {
        ...createBasePsObject(),
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.timeCreated).toBeInstanceOf(Date);
      expect(entry.timeCreated.getFullYear()).toBe(2023);
    });

    it('should handle missing optional fields', () => {
      const psObject = {
        RecordId: 100,
        LogName: 'Application',
        ProviderName: 'MyApp',
        Id: 500,
        LevelDisplayName: 'Error',
        Message: 'Error message',
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.userId).toBeUndefined();
      expect(entry.computerName).toBeUndefined();
    });

    it('should provide defaults for null/undefined fields', () => {
      const psObject = {
        RecordId: null,
        LogName: null,
        ProviderName: null,
        Id: null,
        LevelDisplayName: null,
        Message: null,
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.id).toBe(0);
      expect(entry.logName).toBe('Unknown');
      expect(entry.providerName).toBe('Unknown');
      expect(entry.eventId).toBe(0);
      expect(entry.levelDisplayName).toBe('INFORMATION');
      expect(entry.message).toBe('');
    });

    it('should throw error for null object', () => {
      expect(() => EventLogAdapter.adaptEntry(null)).toThrow();
    });

    it('should throw error for undefined object', () => {
      expect(() => EventLogAdapter.adaptEntry(undefined)).toThrow();
    });

    it('should handle invalid timestamp with default', () => {
      const psObject = {
        ...createBasePsObject(),
        TimeCreated: 'invalid-date-string'
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.timeCreated).toBeInstanceOf(Date);
    });

    it('should map event level in adapted entry', () => {
      const psObject = {
        ...createBasePsObject(),
        LevelDisplayName: 'Information'
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect(entry.levelDisplayName).toBe('INFORMATION');
    });

    it('should preserve extra properties', () => {
      const psObject = {
        ...createBasePsObject(),
        ExtraField: 'extra value',
        AnotherField: 123
      };
      const entry = EventLogAdapter.adaptEntry(psObject);

      expect((entry as any).ExtraField).toBe('extra value');
      expect((entry as any).AnotherField).toBe(123);
    });
  });

  describe('adaptEntries', () => {
    it('should adapt array of PowerShell objects', () => {
      const psObjects = [
        {
          RecordId: 1,
          LogName: 'System',
          ProviderName: 'EventLog',
          Id: 100,
          LevelDisplayName: 'Warning',
          Message: 'Message 1',
          TimeCreated: '2023-12-10T10:30:00Z'
        },
        {
          RecordId: 2,
          LogName: 'System',
          ProviderName: 'EventLog',
          Id: 101,
          LevelDisplayName: 'Error',
          Message: 'Message 2',
          TimeCreated: '2023-12-10T10:31:00Z'
        }
      ];

      const entries = EventLogAdapter.adaptEntries(psObjects);

      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe(1);
      expect(entries[0].levelDisplayName).toBe('WARNING');
      expect(entries[1].id).toBe(2);
      expect(entries[1].levelDisplayName).toBe('ERROR');
    });

    it('should return empty array for null input', () => {
      const entries = EventLogAdapter.adaptEntries(null as any);
      expect(entries).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      const entries = EventLogAdapter.adaptEntries(undefined as any);
      expect(entries).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      const entries = EventLogAdapter.adaptEntries({ data: 'not array' } as any);
      expect(entries).toEqual([]);
    });

    it('should adapt empty array', () => {
      const entries = EventLogAdapter.adaptEntries([]);
      expect(entries).toEqual([]);
    });
  });

  describe('isValidEventObject', () => {
    it('should return true for valid event object', () => {
      const psObject = {
        RecordId: 123,
        LogName: 'System',
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(true);
    });

    it('should return false for null object', () => {
      expect(EventLogAdapter.isValidEventObject(null)).toBe(false);
    });

    it('should return false for missing RecordId', () => {
      const psObject = {
        LogName: 'System',
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(false);
    });

    it('should return false for missing LogName', () => {
      const psObject = {
        RecordId: 123,
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(false);
    });

    it('should return false for missing TimeCreated', () => {
      const psObject = {
        RecordId: 123,
        LogName: 'System'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(false);
    });

    it('should return false for null RecordId', () => {
      const psObject = {
        RecordId: null,
        LogName: 'System',
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(false);
    });

    it('should return false for undefined LogName', () => {
      const psObject = {
        RecordId: 123,
        LogName: undefined,
        TimeCreated: '2023-12-10T10:30:00Z'
      };
      expect(EventLogAdapter.isValidEventObject(psObject)).toBe(false);
    });
  });
});
