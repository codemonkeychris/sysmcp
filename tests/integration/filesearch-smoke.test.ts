/**
 * Windows Search Integration Smoke Test
 *
 * Validates the FileSearch OLE DB executor against a real Windows Search Index.
 * Requires Windows 10/11 with WSearch service running.
 *
 * Run: npx jest --no-coverage tests/integration/filesearch-smoke.test.ts
 * Skipped in CI (no Windows Search available).
 */

import { OleDbExecutor } from '../../src/services/filesearch/oledb-executor';

const isWindows = process.platform === 'win32';
const isCI = process.env.CI === 'true';
const describeIfWindows = isWindows && !isCI ? describe : describe.skip;

describeIfWindows('FileSearch Windows Integration', () => {
  let executor: OleDbExecutor;

  beforeAll(() => {
    executor = new OleDbExecutor({ timeoutMs: 10000 });
  });

  it('should connect to Windows Search and return results', async () => {
    const result = await executor.execute(
      "SELECT TOP 3 System.ItemPathDisplay, System.FileName, System.Size FROM SystemIndex"
    );

    expect(result.success).toBe(true);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.executionTimeMs).toBeLessThan(5000);

    // Verify uppercase keys from OLE DB
    const firstRow = result.rows[0];
    const keys = Object.keys(firstRow);
    expect(keys.some(k => k.toUpperCase() === 'SYSTEM.ITEMPATHDISPLAY')).toBe(true);
  });

  it('should handle CONTAINS search', async () => {
    const result = await executor.execute(
      "SELECT TOP 3 System.ItemPathDisplay, System.FileName FROM SystemIndex WHERE CONTAINS('windows')"
    );
    expect(result.success).toBe(true);
    expect(result.rows).toBeDefined();
  });

  it('should handle file type filter', async () => {
    const result = await executor.execute(
      "SELECT TOP 5 System.ItemPathDisplay, System.FileName FROM SystemIndex WHERE System.FileExtension = '.txt'"
    );
    expect(result.success).toBe(true);
  });

  it('should handle SCOPE clause', async () => {
    const scopePath = process.cwd().replace(/\\/g, '/');
    const result = await executor.execute(
      `SELECT TOP 5 System.ItemPathDisplay, System.FileName FROM SystemIndex WHERE SCOPE='file:${scopePath}'`
    );
    expect(result.success).toBe(true);
  });

  it('should handle size filter', async () => {
    const result = await executor.execute(
      "SELECT TOP 3 System.ItemPathDisplay, System.Size FROM SystemIndex WHERE System.Size > 1048576"
    );
    expect(result.success).toBe(true);
  });

  it('should handle date filter', async () => {
    const result = await executor.execute(
      "SELECT TOP 3 System.ItemPathDisplay, System.DateModified FROM SystemIndex WHERE System.DateModified > '2024-01-01'"
    );
    expect(result.success).toBe(true);
  });

  it('should handle empty result set gracefully', async () => {
    const result = await executor.execute(
      "SELECT TOP 1 System.ItemPathDisplay FROM SystemIndex WHERE System.FileName = 'this_file_definitely_does_not_exist_xyz123.qwerty'"
    );
    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(0);
  });

  it('should complete queries within performance targets', async () => {
    const start = Date.now();
    const result = await executor.execute(
      "SELECT TOP 25 System.ItemPathDisplay, System.FileName, System.Size, System.DateModified FROM SystemIndex WHERE System.FileName LIKE '%.ts'"
    );
    const duration = Date.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(1000);
    console.log(`  Query completed in ${duration}ms with ${result.rows.length} results`);
  });
});
