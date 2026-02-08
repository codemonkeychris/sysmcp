/**
 * Unit tests for PowerShell Executor
 */

import { PowerShellExecutor } from '../powershell-executor';

describe('PowerShellExecutor', () => {
  describe('execute', () => {
    it('should execute a simple PowerShell command', async () => {
      const output = await PowerShellExecutor.execute('Write-Output "test"');
      expect(output.trim()).toBe('test');
    });

    it('should handle command with multiple outputs', async () => {
      const output = await PowerShellExecutor.execute('Write-Output "line1"; Write-Output "line2"');
      expect(output.trim()).toContain('line1');
      expect(output.trim()).toContain('line2');
    });

    it('should reject with error on PowerShell failure', async () => {
      try {
        await PowerShellExecutor.execute('throw "test error"');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should timeout after default timeout period', async () => {
      // Note: This test uses a short timeout to avoid waiting 30 seconds
      try {
        await PowerShellExecutor.execute('Start-Sleep -Seconds 10', { timeout: 500 });
        fail('Should have timed out');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('timed out');
      }
    }, 10000);

    it('should return non-zero exit code as error', async () => {
      try {
        await PowerShellExecutor.execute('exit 1');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('exited with code');
      }
    });
  });

  describe('executeJson', () => {
    it('should parse valid JSON output', async () => {
      const output = await PowerShellExecutor.executeJson<{ test: string }>(
        'Write-Output \'{"test": "value"}\''
      );
      expect(output).toEqual({ test: 'value' });
    });

    it('should parse JSON array', async () => {
      const output = await PowerShellExecutor.executeJson<Array<{ id: number }>>(
        'Write-Output \'[{"id": 1}, {"id": 2}]\''
      );
      expect(Array.isArray(output)).toBe(true);
      expect(output).toHaveLength(2);
      expect(output[0].id).toBe(1);
    });

    it('should return empty array for empty output', async () => {
      const output = await PowerShellExecutor.executeJson<any[]>(
        'Write-Output ""'
      );
      expect(Array.isArray(output) && output.length === 0).toBe(true);
    });

    it('should reject with error on invalid JSON', async () => {
      try {
        await PowerShellExecutor.executeJson(
          'Write-Output "not valid json"'
        );
        fail('Should have thrown a JSON parse error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Failed to parse PowerShell JSON output');
      }
    });

    it('should reject if PowerShell command fails', async () => {
      try {
        await PowerShellExecutor.executeJson(
          'throw "command failed"'
        );
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should handle nested JSON objects', async () => {
      const output = await PowerShellExecutor.executeJson<{
        name: string;
        nested: { value: number };
      }>(
        'Write-Output \'{"name": "test", "nested": {"value": 42}}\''
      );
      expect(output.name).toBe('test');
      expect(output.nested.value).toBe(42);
    });
  });

  describe('command safety', () => {
    it('should handle PowerShell special characters in simple output', async () => {
      const output = await PowerShellExecutor.execute(
        'Write-Output "Special: $null, [array], {object}"'
      );
      expect(output).toContain('Special');
    });

    it('should handle escaped quotes properly', async () => {
      const output = await PowerShellExecutor.execute(
        'Write-Output "He said `"hello`""'
      );
      expect(output).toContain('hello');
    });
  });
});
