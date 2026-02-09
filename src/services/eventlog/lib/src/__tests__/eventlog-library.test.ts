/**
 * Unit tests for EventLogLibrary
 */

import { EventLogLibrary } from '../index';
import * as PowerShellModule from '../powershell-executor';

jest.mock('../powershell-executor');

describe('EventLogLibrary', () => {
  let library: EventLogLibrary;

  beforeEach(() => {
    library = new EventLogLibrary();
    jest.clearAllMocks();
  });

  describe('queryEventLog', () => {
    it('should return success with entries for valid query', async () => {
      const mockEvents = [
        {
          RecordId: 1,
          LogName: 'System',
          ProviderName: 'EventLog',
          Id: 100,
          LevelDisplayName: 'Warning',
          Message: 'Test message',
          TimeCreated: '2023-12-10T10:30:00Z',
          MachineName: 'DESKTOP-ABC'
        }
      ];

      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockEvents);

      const result = await library.queryEventLog({ logName: 'System', maxResults: 100 });

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].id).toBe(1);
      expect(result.entries[0].levelDisplayName).toBe('WARNING');
      expect(result.totalCount).toBe(1);
    });

    it('should return empty entries for empty result', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const result = await library.queryEventLog({ logName: 'System' });

      expect(result.success).toBe(true);
      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasNextPage).toBe(false);
    });

    it('should handle null result from PowerShell', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(null);

      const result = await library.queryEventLog({ logName: 'System' });

      expect(result.success).toBe(true);
      expect(result.entries).toEqual([]);
    });

    it('should handle single object result (convert to array)', async () => {
      const mockEvent = {
        RecordId: 1,
        LogName: 'System',
        ProviderName: 'EventLog',
        Id: 100,
        LevelDisplayName: 'Error',
        Message: 'Single event',
        TimeCreated: '2023-12-10T10:30:00Z'
      };

      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockEvent);

      const result = await library.queryEventLog({ logName: 'System' });

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].message).toBe('Single event');
    });

    it('should return error for permission denied', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson')
        .mockRejectedValue(new Error('Access is denied'));

      const result = await library.queryEventLog({ logName: 'Security' });

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
      expect(result.errorMessage).toContain('Permission denied');
    });

    it('should return error for invalid log name', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson')
        .mockRejectedValue(new Error('No logs were found that match the specified selection criteria'));

      const result = await library.queryEventLog({ logName: 'InvalidLog' });

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
      expect(result.errorMessage).toContain('not found');
    });

    it('should return error for timeout', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson')
        .mockRejectedValue(new Error('Query timed out after 30000ms'));

      const result = await library.queryEventLog({ logName: 'System' });

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
      expect(result.errorMessage).toContain('timeout');
    });

    it('should return error for generic failures', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson')
        .mockRejectedValue(new Error('Some other error'));

      const result = await library.queryEventLog({ logName: 'System' });

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
      expect(result.errorMessage).toContain('Query failed');
    });

    it('should use default log name when not specified', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({});

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("-LogName 'System'");
    });

    it('should escape single quotes in log name', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: "Log'Name" });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("-LogName 'Log''Name'");
    });

    it('should include maxResults filter in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', maxResults: 50 });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain('-MaxEvents 50');
    });

    it('should cap maxResults at 10000', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', maxResults: 99999 });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain('-MaxEvents 10000');
    });

    it('should include eventId filter in command', async () => {
      const spy = jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', eventId: 1000 });

      const call = spy.mock.calls[0][0];
      expect(call).toContain('@{ID=1000}');
    });

    it('should include level filter in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', level: 'WARNING' });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain('@{Level=3}');
    });

    it('should include providerId filter in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', providerId: 'MyProvider' });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("-ProviderName 'MyProvider'");
    });

    // Advanced Filter Tests
    it('should include startTime filter in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const startTime = new Date('2023-12-10T00:00:00Z');
      await library.queryEventLog({ logName: 'System', startTime });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("StartTime=[DateTime]'2023-12-10 00:00:00'");
    });

    it('should include endTime filter in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const endTime = new Date('2023-12-11T23:59:59Z');
      await library.queryEventLog({ logName: 'System', endTime });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("EndTime=[DateTime]'2023-12-11 23:59:59'");
    });

    it('should include both startTime and endTime in command', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const startTime = new Date('2023-12-10T10:00:00Z');
      const endTime = new Date('2023-12-10T20:00:00Z');
      await library.queryEventLog({ logName: 'System', startTime, endTime });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("StartTime=[DateTime]'2023-12-10 10:00:00'");
      expect(call).toContain("EndTime=[DateTime]'2023-12-10 20:00:00'");
    });

    it('should include messageContains filter in command with Where-Object', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', messageContains: 'Error' });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("| Where-Object { $_.Message -like '*Error*' }");
    });

    it('should escape special characters in messageContains', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', messageContains: "Message with 'quotes'" });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain("| Where-Object { $_.Message -like '*Message with ''quotes''*' }");
    });

    it('should calculate pagination metadata correctly', async () => {
      const mockEvents = Array(50).fill(null).map((_, i) => ({
        RecordId: i,
        LogName: 'System',
        ProviderName: 'EventLog',
        Id: 100 + i,
        LevelDisplayName: 'Information',
        Message: `Message ${i}`,
        TimeCreated: '2023-12-10T10:30:00Z'
      }));

      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockEvents);

      const result = await library.queryEventLog({ logName: 'System', maxResults: 50 });

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(50);
      expect(result.hasNextPage).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should indicate hasNextPage when results equal maxResults', async () => {
      const mockEvents = Array(100).fill(null).map((_, i) => ({
        RecordId: i,
        LogName: 'System',
        ProviderName: 'EventLog',
        Id: 100 + i,
        LevelDisplayName: 'Information',
        Message: `Message ${i}`,
        TimeCreated: '2023-12-10T10:30:00Z'
      }));

      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockEvents);

      const result = await library.queryEventLog({ logName: 'System', maxResults: 100 });

      expect(result.success).toBe(true);
      expect(result.entries).toHaveLength(100);
      expect(result.hasNextPage).toBe(true);
      expect(result.nextOffset).toBe(100);
    });

    it('should calculate correct nextOffset with existing offset', async () => {
      const mockEvents = Array(50).fill(null).map((_, i) => ({
        RecordId: i + 100,
        LogName: 'System',
        ProviderName: 'EventLog',
        Id: 100 + i,
        LevelDisplayName: 'Information',
        Message: `Message ${i}`,
        TimeCreated: '2023-12-10T10:30:00Z'
      }));

      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockEvents);

      const result = await library.queryEventLog({ logName: 'System', maxResults: 50, offset: 100 });

      expect(result.hasNextPage).toBe(false);
      expect(result.nextOffset).toBeUndefined();
    });

    it('should not throw error on validation failure - should return error result', async () => {
      const result = await library.queryEventLog({ logName: 'System', maxResults: 99999 });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid');
    });
  });

  describe('Advanced Filtering Edge Cases', () => {
    it('should handle multiple filters combined', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const startTime = new Date('2023-12-10T00:00:00Z');
      const endTime = new Date('2023-12-11T00:00:00Z');
      await library.queryEventLog({
        logName: 'System',
        eventId: 1000,
        level: 'ERROR',
        startTime,
        endTime,
        messageContains: 'Critical',
        maxResults: 200
      });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain('ID=1000');
      expect(call).toContain('Level=2');
      expect(call).toContain("StartTime=[DateTime]'2023-12-10 00:00:00'");
      expect(call).toContain("EndTime=[DateTime]'2023-12-11 00:00:00'");
      expect(call).toContain("| Where-Object { $_.Message -like '*Critical*' }");
      expect(call).toContain('-MaxEvents 200');
    });

    it('should handle empty messageContains string validation', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        messageContains: ''
      });

      // Empty string is allowed (should not filter on empty)
      expect(result.success).toBe(true);
    });

    it('should reject messageContains over 1000 chars', async () => {
      const longString = 'a'.repeat(1001);
      const result = await library.queryEventLog({
        logName: 'System',
        messageContains: longString
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('1000 characters');
    });

    it('should validate eventId range', async () => {
      const resultNegative = await library.queryEventLog({
        logName: 'System',
        eventId: -1
      });
      expect(resultNegative.success).toBe(false);
      expect(resultNegative.errorMessage).toContain('0 and 65535');

      const resultTooLarge = await library.queryEventLog({
        logName: 'System',
        eventId: 65536
      });
      expect(resultTooLarge.success).toBe(false);
      expect(resultTooLarge.errorMessage).toContain('0 and 65535');
    });

    it('should validate eventId is integer', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        eventId: 1000.5 as any
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('integer');
    });

    it('should validate time range order', async () => {
      const startTime = new Date('2023-12-11T00:00:00Z');
      const endTime = new Date('2023-12-10T00:00:00Z');

      const result = await library.queryEventLog({
        logName: 'System',
        startTime,
        endTime
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('startTime must be before endTime');
    });

    it('should allow equal startTime and endTime', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const time = new Date('2023-12-10T12:00:00Z');
      await library.queryEventLog({
        logName: 'System',
        startTime: time,
        endTime: time
      });

      // Should not throw validation error, equal times are allowed
      const spy = PowerShellModule.PowerShellExecutor.executeJson as jest.Mock;
      expect(spy).toHaveBeenCalled();
    });

    it('should validate offset is non-negative', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        offset: -1
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('offset: must be >= 0');
    });

    it('should validate offset is integer', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        offset: 10.5 as any
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('offset: must be an integer');
    });

    it('should validate maxResults is integer', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        maxResults: 100.5 as any
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('integer');
    });

    it('should validate messageContains is string', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        messageContains: 123 as any
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('must be a string');
    });
  });

  describe('Level Filter Variations', () => {
    it('should handle various case formats for level', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      const testCases = [
        { level: 'VERBOSE', expected: '5' },
        { level: 'verbose', expected: '5' },
        { level: 'Information', expected: '4' },
        { level: 'CRITICAL', expected: '1' },
        { level: 'critical', expected: '1' }
      ];

      for (const tc of testCases) {
        jest.clearAllMocks();
        jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

        await library.queryEventLog({ logName: 'System', level: tc.level });

        const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
        expect(call).toContain(`Level=${tc.expected}`);
      }
    });

    it('should use default level 4 for invalid level', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue([]);

      await library.queryEventLog({ logName: 'System', level: 'INVALID' });

      const call = (PowerShellModule.PowerShellExecutor.executeJson as jest.Mock).mock.calls[0][0];
      expect(call).toContain('Level=4');
    });
  });

  describe('getAvailableLogs', () => {
    it('should return list of available logs', async () => {
      const mockLogs = ['System', 'Application', 'Security'];
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(mockLogs);

      const logs = await library.getAvailableLogs();

      expect(logs).toEqual(mockLogs);
    });

    it('should return empty array on error', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson')
        .mockRejectedValue(new Error('Error getting logs'));

      const logs = await library.getAvailableLogs();

      expect(logs).toEqual([]);
    });

    it('should handle non-array result', async () => {
      jest.spyOn(PowerShellModule.PowerShellExecutor, 'executeJson').mockResolvedValue(null);

      const logs = await library.getAvailableLogs();

      expect(logs).toEqual([]);
    });
  });

  describe('dispose', () => {
    it('should complete without error', async () => {
      await expect(library.dispose()).resolves.toBeUndefined();
    });
  });

  describe('constructor', () => {
    it('should create library instance', () => {
      const lib = new EventLogLibrary();
      expect(lib).toBeInstanceOf(EventLogLibrary);
    });
  });
});
