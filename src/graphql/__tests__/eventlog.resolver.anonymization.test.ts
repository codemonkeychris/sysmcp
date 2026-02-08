/**
 * Tests for EventLog GraphQL Resolver - Anonymization Integration
 */

import { eventLogsResolver } from '../eventlog.resolver';
import { EventLogProvider } from '../../services/eventlog/provider';
import { Logger } from '../../logger/types';
import { PiiAnonymizer } from '../../services/eventlog/lib/src/anonymizer';
import * as fs from 'fs';
import * as path from 'path';

describe('EventLog GraphQL Resolver - Anonymization', () => {
  let mockLogger: Logger;
  let mockProvider: EventLogProvider;
  let context: any;
  let tempMappingPath: string;

  beforeEach(() => {
    tempMappingPath = path.join(__dirname, 'test-mapping.json');

    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      child: jest.fn(() => mockLogger)
    };

    mockProvider = {
      query: jest.fn()
    } as any;

    context = {
      logger: mockLogger,
      eventlogProvider: mockProvider,
      eventlogMappingPath: tempMappingPath
    };

    // Clean up temp file
    if (fs.existsSync(tempMappingPath)) {
      fs.unlinkSync(tempMappingPath);
    }
  });

  afterEach(() => {
    // Clean up temp files
    if (fs.existsSync(tempMappingPath)) {
      fs.unlinkSync(tempMappingPath);
    }
  });

  describe('Anonymous Entry Processing', () => {
    it('should anonymize usernames in entries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'User CONTOSO\\jsmith logged in',
            timeCreated: new Date(),
            userId: 'CONTOSO\\jsmith',
            computerName: 'WORKSTATION1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];
      
      // Username should be anonymized
      expect(entry.username).not.toBe('CONTOSO\\jsmith');
      expect(entry.username).toContain('ANON_USER');
      
      // Message should have anonymized username
      expect(entry.message).not.toContain('jsmith');
      expect(entry.message).toContain('ANON_USER');
    });

    it('should anonymize computer names in entries', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Logon request from WORKSTATION1',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'WORKSTATION1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];
      
      // Computer name should be anonymized
      expect(entry.computername).not.toBe('WORKSTATION1');
      expect(entry.computername).toContain('ANON_COMPUTER');
      
      // Message should have anonymized computer name
      expect(entry.message).not.toContain('WORKSTATION1');
      expect(entry.message).toContain('ANON_COMPUTER');
    });

    it('should anonymize email addresses in messages', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Application',
            providerName: 'MyApp',
            eventId: 5000,
            levelDisplayName: 'Error',
            message: 'Failed to send email to user@company.com',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'Application', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];
      
      // Email should be anonymized in message
      expect(entry.message).not.toContain('user@company.com');
      expect(entry.message).toContain('ANON_EMAIL');
    });

    it('should anonymize IP addresses in messages', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Warning',
            message: 'Connection from 192.168.1.100',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];
      
      // IP should be anonymized
      expect(entry.message).not.toContain('192.168.1.100');
      expect(entry.message).toContain('ANON_IP');
    });

    it('should process multiple entries with consistent anonymization', async () => {
      const username = 'DOMAIN\\testuser';
      
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: `User ${username} logged in`,
            timeCreated: new Date(),
            userId: username,
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          },
          {
            id: 2,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1001,
            levelDisplayName: 'Information',
            message: `User ${username} logged out`,
            timeCreated: new Date(),
            userId: username,
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 2,
        hasMore: false,
        executionTimeMs: 100,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(2);
      
      // Both entries should have same anonymized username
      expect(result.entries[0].username).toBe(result.entries[1].username);
      
      // Both messages should have same anonymized username
      const token1 = result.entries[0].message.match(/ANON_USER_[a-zA-Z0-9]+/);
      const token2 = result.entries[1].message.match(/ANON_USER_[a-zA-Z0-9]+/);
      expect(token1).not.toBeNull();
      expect(token2).not.toBeNull();
      expect(token1![0]).toBe(token2![0]);
    });
  });

  describe('Anonymization Persistence', () => {
    it('should persist anonymization mapping after query', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test message',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user1',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      // Check that mapping file was created
      expect(fs.existsSync(tempMappingPath)).toBe(true);

      // Verify mapping file contains data
      const mappingContent = fs.readFileSync(tempMappingPath, 'utf-8');
      const mapping = JSON.parse(mappingContent);
      expect(mapping.usernames).toBeDefined();
      expect(mapping.computerNames).toBeDefined();
    });

    it('should load persisted mapping for consistency across queries', async () => {
      const username = 'DOMAIN\\jsmith';

      // First query
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'First message',
            timeCreated: new Date(),
            userId: username,
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result1 = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      const anonUser1 = result1.entries[0].username;

      // Second query with fresh resolver context but same mapping path
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 2,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1001,
            levelDisplayName: 'Information',
            message: 'Second message',
            timeCreated: new Date(),
            userId: username,
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      context.eventlogAnonymizer = undefined; // Clear cached anonymizer

      const result2 = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      const anonUser2 = result2.entries[0].username;

      // Same username should produce same anonymized value
      expect(anonUser2).toBe(anonUser1);
    });

    it('should handle missing mapping file gracefully', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      // Mapping path doesn't exist
      context.eventlogMappingPath = path.join(__dirname, 'nonexistent-mapping.json');

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      // Should still return anonymized results
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].username).toContain('ANON_USER');
    });
  });

  describe('Without Anonymization', () => {
    it('should work without anonymization context', async () => {
      const contextNoAnon = {
        logger: mockLogger,
        eventlogProvider: mockProvider
      };

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test message',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        contextNoAnon
      );

      // Should create fresh anonymizer without persisted mapping
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].username).toContain('ANON_USER');
    });
  });

  describe('Error Handling', () => {
    it('should handle anonymizer initialization errors gracefully', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      // Create invalid mapping file
      const dir = path.dirname(tempMappingPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(tempMappingPath, 'invalid json {{{');

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      // Should still work with fresh anonymizer
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].username).toContain('ANON_USER');
    });

    it('should log persistence errors but not fail query', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Test',
            timeCreated: new Date(),
            userId: 'DOMAIN\\user',
            computerName: 'SERVER1',
            executionTimeMs: 50,
            success: true
          }
        ],
        totalCount: 1,
        hasMore: false,
        executionTimeMs: 50,
        success: true
      });

      // Use invalid path that can't be written
      context.eventlogMappingPath = '/dev/null/invalid/path/mapping.json';

      const result = await eventLogsResolver(
        null,
        { logName: 'System', limit: 100, offset: 0 },
        context
      );

      // Query should still succeed despite persistence failure
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].username).toContain('ANON_USER');
    });
  });
});
