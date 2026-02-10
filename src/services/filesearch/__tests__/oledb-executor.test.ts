/**
 * Tests for OLE DB Executor
 *
 * All tests use mocked node-adodb - no real Windows Search connections needed.
 */

import { OleDbExecutor } from '../oledb-executor';

// Mock node-adodb
const mockQuery = jest.fn();
const mockOpen = jest.fn().mockReturnValue({
  query: mockQuery
});

jest.mock('node-adodb', () => ({
  open: (connStr: string) => (mockOpen as jest.Mock)(connStr)
}));

describe('OleDbExecutor', () => {
  let executor: OleDbExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new OleDbExecutor({ timeoutMs: 5000 });
  });

  describe('constructor', () => {
    it('should use default timeout when not specified', () => {
      const defaultExecutor = new OleDbExecutor();
      expect(defaultExecutor).toBeDefined();
    });

    it('should accept custom timeout', () => {
      const customExecutor = new OleDbExecutor({ timeoutMs: 10000 });
      expect(customExecutor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should return rows on success', async () => {
      const mockRows = [
        { 'System.FileName': 'test.txt', 'System.Size': 1024 },
        { 'System.FileName': 'doc.pdf', 'System.Size': 2048 }
      ];
      mockQuery.mockResolvedValue(mockRows);

      const result = await executor.execute('SELECT TOP 10 System.FileName FROM SystemIndex');

      expect(result.success).toBe(true);
      expect(result.rows).toEqual(mockRows);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.errorMessage).toBeUndefined();
    });

    it('should handle empty result set', async () => {
      mockQuery.mockResolvedValue([]);

      const result = await executor.execute('SELECT TOP 10 System.FileName FROM SystemIndex WHERE System.FileName = \'nonexistent\'');

      expect(result.success).toBe(true);
      expect(result.rows).toEqual([]);
    });

    it('should handle non-array result', async () => {
      mockQuery.mockResolvedValue(null);

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(true);
      expect(result.rows).toEqual([]);
    });

    it('should classify timeout errors', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('timed out');
    });

    it('should classify service not running errors', async () => {
      mockQuery.mockRejectedValue(new Error('Error 0x80040E37: provider not available'));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Windows Search service is not running');
    });

    it('should classify access denied errors', async () => {
      mockQuery.mockRejectedValue(new Error('Error 0x80070005: Access denied'));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Access denied');
    });

    it('should classify syntax errors generically', async () => {
      mockQuery.mockRejectedValue(new Error('Error 0x80040E14: syntax error at position 42'));

      const result = await executor.execute('BAD SQL');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Search query failed');
      // SECURITY: Should not leak the actual syntax error details
      expect(result.errorMessage).not.toContain('position 42');
    });

    it('should classify node-adodb errors', async () => {
      mockQuery.mockRejectedValue(new Error('ADODB connection failed'));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('OLE DB provider');
    });

    it('should classify unknown errors generically', async () => {
      mockQuery.mockRejectedValue(new Error('Something unexpected happened'));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Search query failed');
    });

    it('should handle non-Error thrown values', async () => {
      mockQuery.mockRejectedValue('string error');

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Search query failed');
    });

    it('should track execution time', async () => {
      mockQuery.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([]), 50)));

      const result = await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(40); // Allow some margin
    });

    it('should pass SQL to connection query', async () => {
      mockQuery.mockResolvedValue([]);

      const sql = 'SELECT TOP 10 System.FileName FROM SystemIndex';
      await executor.execute(sql);

      expect(mockQuery).toHaveBeenCalledWith(sql);
    });

    it('should open connection with Windows Search provider string', async () => {
      mockQuery.mockResolvedValue([]);

      await executor.execute('SELECT TOP 1 System.FileName FROM SystemIndex');

      expect(mockOpen).toHaveBeenCalledWith(
        expect.stringContaining('Search.CollatorDSO')
      );
    });
  });

  describe('checkAvailability', () => {
    it('should return available when query succeeds', async () => {
      mockQuery.mockResolvedValue([{ 'System.FileName': 'test.txt' }]);

      const availability = await executor.checkAvailability();

      expect(availability.available).toBe(true);
      expect(availability.message).toContain('available');
    });

    it('should return unavailable when query fails', async () => {
      mockQuery.mockRejectedValue(new Error('Error 0x80040E37: provider not found'));

      const availability = await executor.checkAvailability();

      expect(availability.available).toBe(false);
      expect(availability.message).toBeTruthy();
    });

    it('should use a lightweight test query', async () => {
      mockQuery.mockResolvedValue([]);

      await executor.checkAvailability();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT TOP 1')
      );
    });
  });
});
