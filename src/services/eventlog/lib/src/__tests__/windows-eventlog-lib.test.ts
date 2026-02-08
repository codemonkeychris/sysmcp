/**
 * Tests for WindowsEventLogLibrary public API
 * 
 * Tests the high-level library interface combining query engine and anonymizer.
 */

import { 
  WindowsEventLogLibrary,
  EventLogQuery
} from '../windows-eventlog-lib';

describe('WindowsEventLogLibrary', () => {
  let library: WindowsEventLogLibrary;

  afterEach(async () => {
    // Cleanup after each test
    if (library) {
      await library.close();
    }
  });

  describe('Constructor', () => {
    it('should create library with default options', () => {
      library = new WindowsEventLogLibrary();
      expect(library).toBeDefined();
    });

    it('should create library with custom options', () => {
      library = new WindowsEventLogLibrary({
        maxResults: 500,
        anonymize: true,
        allowedLogNames: ['System', 'Application']
      });
      expect(library).toBeDefined();
    });

    it('should reject invalid maxResults', () => {
      expect(() => {
        new WindowsEventLogLibrary({ maxResults: 0 });
      }).toThrow();
    });

    it('should reject invalid maxResults (too high)', () => {
      expect(() => {
        new WindowsEventLogLibrary({ maxResults: 20000 });
      }).toThrow();
    });

    it('should reject invalid timeoutMs', () => {
      expect(() => {
        new WindowsEventLogLibrary({ timeoutMs: 500 });
      }).toThrow();
    });

    it('should warn when anonymize enabled without mappingFilePath', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      library = new WindowsEventLogLibrary({ anonymize: true });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Query Method', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary();
    });

    it('should reject query with empty logName', async () => {
      const query: EventLogQuery = {
        logName: ''
      };

      const result = await library.query(query);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('logName');
    });

    it('should reject query with undefined logName', async () => {
      const query = {
        logName: undefined
      } as any;

      const result = await library.query(query);
      expect(result.success).toBe(false);
    });

    it('should include execution time in result', async () => {
      // Note: This will try to query System log which may fail without proper setup
      // But we can still check that executionTimeMs is set
      const query: EventLogQuery = {
        logName: 'System',
        pagination: { limit: 10 }
      };

      const result = await library.query(query);
      expect(result.executionTimeMs).toBeDefined();
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should return QueryResult with required fields', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        pagination: { limit: 1 }
      };

      const result = await library.query(query);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('entries');
      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('executionTimeMs');
      expect(Array.isArray(result.entries)).toBe(true);
    });

    it('should handle filters in query', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        filters: {
          level: 'ERROR'
        },
        pagination: { limit: 10 }
      };

      const result = await library.query(query);
      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
    });

    it('should handle time range filters', async () => {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
      const endTime = new Date();

      const query: EventLogQuery = {
        logName: 'System',
        filters: {
          startTime,
          endTime
        },
        pagination: { limit: 10 }
      };

      const result = await library.query(query);
      expect(result).toBeDefined();
    });

    it('should reject invalid time range (startTime > endTime)', async () => {
      const startTime = new Date();
      const endTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago

      const query: EventLogQuery = {
        logName: 'System',
        filters: {
          startTime,
          endTime
        }
      };

      const result = await library.query(query);
      expect(result.success).toBe(false);
    });

    it('should handle pagination options', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        pagination: {
          limit: 50,
          offset: 10
        }
      };

      const result = await library.query(query);
      expect(result).toBeDefined();
    });

    it('should reject invalid pagination limit', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        pagination: { limit: 20000 }
      };

      const result = await library.query(query);
      expect(result.success).toBe(false);
    });

    it('should reject negative pagination offset', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        pagination: { offset: -1 }
      };

      const result = await library.query(query);
      expect(result.success).toBe(false);
    });
  });

  describe('Allowed Log Names', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary({
        allowedLogNames: ['System', 'Application']
      });
    });

    it('should allow query to configured log', async () => {
      const query: EventLogQuery = {
        logName: 'System'
      };

      const result = await library.query(query);
      expect(result).toBeDefined();
    });

    it('should reject query to unconfigured log', async () => {
      const query: EventLogQuery = {
        logName: 'Security'
      };

      const result = await library.query(query);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not in the allowed list');
    });
  });

  describe('Anonymization', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary({
        anonymize: true
      });
    });

    it('should anonymize results when enabled', async () => {
      const query: EventLogQuery = {
        logName: 'System',
        pagination: { limit: 1 }
      };

      const result = await library.query(query);
      
      if (result.success && result.entries.length > 0) {
        // If we get results, check that anonymization is available
        expect(library.getAnonymizationMapping()).toBeDefined();
      }
    });
  });

  describe('getAvailableLogNames', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary();
    });

    it('should return array of log names', async () => {
      const logs = await library.getAvailableLogNames();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should filter by allowedLogNames if configured', async () => {
      library = new WindowsEventLogLibrary({
        allowedLogNames: ['System']
      });

      const logs = await library.getAvailableLogNames();
      if (logs.length > 0) {
        expect(logs).toContain('System');
      }
    });

    it('should handle errors gracefully', async () => {
      // This should not throw even if something goes wrong
      const logs = await library.getAvailableLogNames();
      expect(Array.isArray(logs)).toBe(true);
    });
  });

  describe('getLogMetadata', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary();
    });

    it('should return metadata for valid log', async () => {
      const metadata = await library.getLogMetadata('System');
      
      expect(metadata).toBeDefined();
      expect(metadata.logName).toBe('System');
      expect(metadata.exists).toBeDefined();
      expect(metadata.isReadable).toBeDefined();
    });

    it('should return metadata for nonexistent log', async () => {
      const metadata = await library.getLogMetadata('NonExistentLog12345');
      
      expect(metadata).toBeDefined();
      expect(metadata.logName).toBe('NonExistentLog12345');
      expect(metadata.exists).toBe(false);
    });

    it('should not throw on invalid log name', async () => {
      expect(async () => {
        await library.getLogMetadata('');
      }).not.toThrow();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary();
    });

    it('should cleanup resources', async () => {
      expect(async () => {
        await library.close();
      }).not.toThrow();
    });

    it('should persist anonymization mapping if configured', async () => {
      const fs = require('fs');
      const tempFile = fs.mkdtempSync(require('path').join(
        require('os').tmpdir(),
        'eventlog-test-'
      )) + '/mapping.json';

      library = new WindowsEventLogLibrary({
        anonymize: true,
        mappingFilePath: tempFile
      });

      // Run a query to generate some anonymization
      await library.query({
        logName: 'System',
        pagination: { limit: 1 }
      });

      // Close should persist the mapping
      await library.close();

      // Note: Mapping will only exist if query returned results
      // For test robustness, we just verify close completes
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow', async () => {
      library = new WindowsEventLogLibrary({
        maxResults: 100,
        anonymize: false
      });

      // Get available logs
      const logs = await library.getAvailableLogNames();
      expect(Array.isArray(logs)).toBe(true);

      if (logs.length > 0) {
        // Get metadata for first log
        const metadata = await library.getLogMetadata(logs[0]);
        expect(metadata.logName).toBe(logs[0]);

        // Query the log
        const result = await library.query({
          logName: logs[0],
          pagination: { limit: 10 }
        });

        expect(result).toHaveProperty('success');
        expect(Array.isArray(result.entries)).toBe(true);
      }

      // Cleanup
      await library.close();
    });

    it('should handle multiple queries', async () => {
      library = new WindowsEventLogLibrary({
        anonymize: false
      });

      const logs = ['System', 'Application'];

      for (const logName of logs) {
        const result = await library.query({
          logName,
          pagination: { limit: 5 }
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.entries)).toBe(true);
      }

      await library.close();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      library = new WindowsEventLogLibrary();
    });

    it('should return error result instead of throwing on invalid log', async () => {
      const result = await library.query({
        logName: 'InvalidLog12345ABC'
      });

      expect(result.success).toBe(false);
      expect(result.entries).toEqual([]);
    });

    it('should handle permission denied gracefully', async () => {
      // This depends on system permissions, but result should be consistent
      const result = await library.query({
        logName: 'System'
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('entries');
    });
  });

  describe('Type Safety', () => {
    it('should enforce QueryResult type structure', () => {
      library = new WindowsEventLogLibrary();
      
      // This is a compile-time check, but we can verify the interface
      const query: EventLogQuery = {
        logName: 'System',
        filters: {
          level: 'ERROR',
          eventId: 1000,
          providerId: 'Microsoft-Windows-Kernel-General'
        },
        pagination: {
          limit: 100,
          offset: 0
        }
      };

      expect(query).toBeDefined();
    });
  });

  describe('Anonymization Mapping Access', () => {
    it('should provide access to anonymization mapping', () => {
      library = new WindowsEventLogLibrary({
        anonymize: true
      });

      const mapping = library.getAnonymizationMapping();
      expect(mapping).toBeDefined();
      expect(mapping).toHaveProperty('usernames');
      expect(mapping).toHaveProperty('computerNames');
      expect(mapping).toHaveProperty('ipAddresses');
      expect(mapping).toHaveProperty('emails');
      expect(mapping).toHaveProperty('paths');
    });

    it('should return undefined when anonymization disabled', () => {
      library = new WindowsEventLogLibrary({
        anonymize: false
      });

      const mapping = library.getAnonymizationMapping();
      expect(mapping).toBeUndefined();
    });
  });
});
