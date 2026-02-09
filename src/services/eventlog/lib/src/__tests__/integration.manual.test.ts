/**
 * Integration Test: Real EventLog Query
 * 
 * This test demonstrates querying the real Windows System event log.
 * Run with: npx ts-node src/__tests__/integration.manual.ts
 * Or: npm test -- --testNamePattern="Integration"
 * 
 * Note: This is a manual test that requires Windows with EventLog access.
 * It may require elevated privileges for some event logs.
 */

import { EventLogLibrary } from '../index';

describe('Integration Tests - Real EventLog', () => {
  const library = new EventLogLibrary();

  // Skip these tests in CI/automated runs unless ENABLE_INTEGRATION_TESTS is set
  const describeIntegration = process.env.ENABLE_INTEGRATION_TESTS ? describe : describe.skip;

  describeIntegration('EventLogLibrary with real System event log', () => {
    afterAll(async () => {
      await library.dispose();
    });

    it('should query System event log and return events', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        maxResults: 10
      });

      console.log('System Log Query Result:');
      console.log(`  Success: ${result.success}`);
      console.log(`  Total Count: ${result.totalCount}`);
      console.log(`  Entries Found: ${result.entries.length}`);

      if (result.entries.length > 0) {
        console.log('\nFirst Entry:');
        const entry = result.entries[0];
        console.log(`  ID: ${entry.id}`);
        console.log(`  Log Name: ${entry.logName}`);
        console.log(`  Provider: ${entry.providerName}`);
        console.log(`  Event ID: ${entry.eventId}`);
        console.log(`  Level: ${entry.levelDisplayName}`);
        console.log(`  Time: ${entry.timeCreated.toISOString()}`);
        console.log(`  Message: ${entry.message.substring(0, 100)}...`);
      }

      expect(result.success).toBe(true);
      expect(result.entries.length).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should query Application event log', async () => {
      const result = await library.queryEventLog({
        logName: 'Application',
        maxResults: 5
      });

      console.log('\nApplication Log Query Result:');
      console.log(`  Success: ${result.success}`);
      console.log(`  Entries Found: ${result.entries.length}`);

      expect(result.success).toBe(true);
    }, 30000);

    it('should get available event logs', async () => {
      const logs = await library.getAvailableLogs();

      console.log('\nAvailable Event Logs:');
      console.log(`  Total: ${logs.length}`);
      console.log(`  First 5: ${logs.slice(0, 5).join(', ')}`);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle filtered query with level', async () => {
      const result = await library.queryEventLog({
        logName: 'System',
        level: 'ERROR',
        maxResults: 5
      });

      console.log('\nSystem Log - ERROR level query:');
      console.log(`  Success: ${result.success}`);
      console.log(`  Entries Found: ${result.entries.length}`);

      if (result.entries.length > 0) {
        result.entries.forEach((entry, index) => {
          console.log(`  Entry ${index + 1}: ${entry.levelDisplayName} - ${entry.message.substring(0, 50)}`);
        });
      }

      expect(result.success).toBe(true);
      // Note: May have 0 error entries depending on system state
      if (result.entries.length > 0) {
        expect(result.entries.every(e => e.levelDisplayName === 'ERROR' || e.levelDisplayName === 'CRITICAL')).toBe(true);
      }
    }, 30000);

    it('should handle permissions gracefully with Security log', async () => {
      const result = await library.queryEventLog({
        logName: 'Security',
        maxResults: 5
      });

      console.log('\nSecurity Log Query Result:');
      console.log(`  Success: ${result.success}`);
      if (!result.success) {
        console.log(`  Error: ${result.errorMessage}`);
      } else {
        console.log(`  Entries Found: ${result.entries.length}`);
      }

      // Security log requires admin privileges
      // Either success with entries or failed with permission error
      expect(
        result.success || 
        (result.errorMessage && result.errorMessage.includes('Permission'))
      ).toBe(true);
    }, 30000);

    it('should handle non-existent log gracefully', async () => {
      const result = await library.queryEventLog({
        logName: 'NonExistentLogXYZ123',
        maxResults: 5
      });

      console.log('\nNon-existent Log Query Result:');
      console.log(`  Success: ${result.success}`);
      if (!result.success) {
        console.log(`  Error: ${result.errorMessage}`);
      }

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
      expect(result.errorMessage).toBeDefined();
    }, 30000);
  });

  describeIntegration('Performance Tests', () => {
    it('should query 100 events in reasonable time (<2 seconds)', async () => {
      const startTime = Date.now();
      const result = await library.queryEventLog({
        logName: 'System',
        maxResults: 100
      });
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\nQuery 100 events: ${duration}ms`);
      console.log(`  Entries returned: ${result.entries.length}`);

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
    }, 10000);

    it('should perform multiple queries', async () => {
      const startTime = Date.now();
      const queries = [
        library.queryEventLog({ logName: 'System', maxResults: 10 }),
        library.queryEventLog({ logName: 'Application', maxResults: 10 }),
        library.queryEventLog({ logName: 'System', level: 'WARNING', maxResults: 5 })
      ];

      const results = await Promise.all(queries);
      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\n3 queries total: ${duration}ms`);
      results.forEach((result, index) => {
        console.log(`  Query ${index + 1}: ${result.entries.length} entries, success: ${result.success}`);
      });

      expect(results.every(r => r.success)).toBe(true);
    }, 15000);
  });
});
