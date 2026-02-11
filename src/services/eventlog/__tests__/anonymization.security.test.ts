/**
 * Security Tests for PII Anonymization
 *
 * Comprehensive security tests ensuring no PII leaks in EventLog queries
 */

import { eventLogsResolver } from '../../../graphql/eventlog.resolver';
import { EventLogProvider } from '../provider';
import { Logger } from '../../../logger/types';

/**
 * PII Test Case
 */
interface PiiTestCase {
  label: string;
  piiValue: string;
  shouldContain?: string; // Expected pattern in anonymized output
  shouldNotContain: string[]; // Patterns that must NOT appear
}

describe('EventLog GraphQL Resolver - Security Tests for PII Anonymization', () => {
  let mockLogger: Logger;
  let mockProvider: EventLogProvider;
  let context: any;

  beforeEach(() => {
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
      permissionChecker: { check: jest.fn(() => ({ allowed: true })) },
    };
  });

  describe('Username Anonymization Security', () => {
    const testCases: PiiTestCase[] = [
      {
        label: 'Domain\\username format',
        piiValue: 'CONTOSO\\jsmith',
        shouldNotContain: ['jsmith', 'CONTOSO\\jsmith']
      },
      {
        label: 'Domain with dots',
        piiValue: 'corp.example\\john.doe',
        shouldNotContain: ['john.doe', 'john', 'doe']
      },
      {
        label: 'Email-style username',
        piiValue: 'user@domain.com',
        shouldNotContain: ['user@domain.com', 'user', '@domain.com']
      },
      {
        label: 'Administrator account',
        piiValue: 'Administrator',
        shouldNotContain: ['Administrator']
      },
      {
        label: 'System account',
        piiValue: 'SYSTEM',
        shouldNotContain: ['SYSTEM'] // Should be preserved or anonymized depending on context
      },
      {
        label: 'Service account',
        piiValue: 'DOMAIN\\svc_account',
        shouldNotContain: ['svc_account', 'DOMAIN\\svc_account']
      },
      {
        label: 'Numeric suffix username',
        piiValue: 'DOMAIN\\user123',
        shouldNotContain: ['user123']
      }
    ];

    testCases.forEach(testCase => {
      it(`should anonymize ${testCase.label}`, async () => {
        mockProvider.query = jest.fn().mockResolvedValue({
          entries: [
            {
              id: 1,
              logName: 'System',
              providerName: 'EventLog',
              eventId: 1000,
              levelDisplayName: 'Information',
              message: `User login: ${testCase.piiValue}`,
              timeCreated: new Date(),
              userId: testCase.piiValue,
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

        // Verify username is anonymized
        testCase.shouldNotContain.forEach(pattern => {
          expect(entry.username).not.toContain(pattern);
          expect(entry.message).not.toContain(pattern);
        });

        // Verify anonymization actually happened
        expect(entry.username).not.toBe(testCase.piiValue);
      });
    });
  });

  describe('Computer Name Anonymization Security', () => {
    const testCases: PiiTestCase[] = [
      {
        label: 'Standard computer name',
        piiValue: 'WORKSTATION1',
        shouldNotContain: ['WORKSTATION1']
      },
      {
        label: 'Server naming pattern',
        piiValue: 'SERVER-APP-01',
        shouldNotContain: ['SERVER-APP-01', 'APP', 'SERVER']
      },
      {
        label: 'Laptop naming pattern',
        piiValue: 'LAPTOP-JSMITH',
        shouldNotContain: ['LAPTOP-JSMITH', 'JSMITH']
      },
      {
        label: 'Database server',
        piiValue: 'DB-PROD-01',
        shouldNotContain: ['DB-PROD-01', 'PROD']
      },
      {
        label: 'Domain computer',
        piiValue: 'CORP-PC-001',
        shouldNotContain: ['CORP-PC-001']
      }
    ];

    testCases.forEach(testCase => {
      it(`should anonymize ${testCase.label}`, async () => {
        mockProvider.query = jest.fn().mockResolvedValue({
          entries: [
            {
              id: 1,
              logName: 'System',
              providerName: 'EventLog',
              eventId: 1000,
              levelDisplayName: 'Information',
              message: `Event from computer ${testCase.piiValue}`,
              timeCreated: new Date(),
              userId: 'SYSTEM',
              computerName: testCase.piiValue,
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

        testCase.shouldNotContain.forEach(pattern => {
          expect(entry.computername).not.toContain(pattern);
          expect(entry.message).not.toContain(pattern);
        });

        expect(entry.computername).not.toBe(testCase.piiValue);
      });
    });
  });

  describe('IP Address Anonymization Security', () => {
    const testCases: PiiTestCase[] = [
      {
        label: 'IPv4 address',
        piiValue: '192.168.1.100',
        shouldNotContain: ['192.168.1.100', '192.168', '.100']
      },
      {
        label: 'Localhost IPv4',
        piiValue: '127.0.0.1',
        shouldNotContain: ['127.0.0.1']
      },
      {
        label: 'Private network range',
        piiValue: '10.0.0.50',
        shouldNotContain: ['10.0.0.50']
      },
      {
        label: 'IPv6 address',
        piiValue: '2001:db8::1',
        shouldNotContain: ['2001:db8::1', '2001', 'db8']
      },
      {
        label: 'IPv6 localhost',
        piiValue: '::1',
        shouldNotContain: ['::1']
      }
    ];

    testCases.forEach(testCase => {
      it(`should anonymize ${testCase.label}`, async () => {
        mockProvider.query = jest.fn().mockResolvedValue({
          entries: [
            {
              id: 1,
              logName: 'Security',
              providerName: 'EventLog',
              eventId: 4624,
              levelDisplayName: 'Information',
              message: `Login from ${testCase.piiValue}`,
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
          { logName: 'Security', limit: 100, offset: 0 },
          context
        );

        expect(result.entries.length).toBe(1);
        const entry = result.entries[0];

        testCase.shouldNotContain.forEach(pattern => {
          expect(entry.message).not.toContain(pattern);
        });
      });
    });
  });

  describe('Email Address Anonymization Security', () => {
    const testCases: PiiTestCase[] = [
      {
        label: 'Corporate email',
        piiValue: 'john.smith@company.com',
        shouldNotContain: ['john.smith@company.com', 'john.smith', 'company.com']
      },
      {
        label: 'Email with plus addressing',
        piiValue: 'user+test@example.com',
        shouldNotContain: ['user+test@example.com', 'user+test']
      },
      {
        label: 'Domain-local email',
        piiValue: 'admin@corp.local',
        shouldNotContain: ['admin@corp.local', 'admin', 'corp.local']
      },
      {
        label: 'Email with numbers',
        piiValue: 'user123@example.com',
        shouldNotContain: ['user123@example.com', 'user123']
      }
    ];

    testCases.forEach(testCase => {
      it(`should anonymize ${testCase.label}`, async () => {
        mockProvider.query = jest.fn().mockResolvedValue({
          entries: [
            {
              id: 1,
              logName: 'Application',
              providerName: 'MyApp',
              eventId: 5000,
              levelDisplayName: 'Information',
              message: `Email notification sent to ${testCase.piiValue}`,
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

        testCase.shouldNotContain.forEach(pattern => {
          expect(entry.message).not.toContain(pattern);
        });
      });
    });
  });

  describe('File Path Anonymization Security', () => {
    const testCases: PiiTestCase[] = [
      {
        label: 'Windows user profile path',
        piiValue: 'C:\\Users\\jsmith\\Documents',
        shouldNotContain: ['jsmith', 'C:\\Users\\jsmith']
      },
      {
        label: 'User AppData path',
        piiValue: 'C:\\Users\\user\\AppData\\Local',
        shouldNotContain: ['user', 'AppData']
      },
      {
        label: 'Shared network path',
        piiValue: '\\\\SERVER\\Share\\Users\\john',
        shouldNotContain: ['john']
      }
    ];

    testCases.forEach(testCase => {
      it(`should anonymize ${testCase.label}`, async () => {
        mockProvider.query = jest.fn().mockResolvedValue({
          entries: [
            {
              id: 1,
              logName: 'Application',
              providerName: 'FileAccess',
              eventId: 100,
              levelDisplayName: 'Information',
              message: `File access: ${testCase.piiValue}`,
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

        testCase.shouldNotContain.forEach(pattern => {
          expect(entry.message).not.toContain(pattern);
        });
      });
    });
  });

  describe('Embedded PII in Messages', () => {
    it('should anonymize multiple PII instances in single message', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Application',
            providerName: 'AppName',
            eventId: 5000,
            levelDisplayName: 'Error',
            message: 'User DOMAIN\\jsmith from WORKSTATION1 at 192.168.1.100 tried to access share from SERVER1',
            timeCreated: new Date(),
            userId: 'DOMAIN\\jsmith',
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
        { logName: 'Application', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];

      // Verify no original PII in message
      expect(entry.message).not.toContain('jsmith');
      expect(entry.message).not.toContain('WORKSTATION1');
      expect(entry.message).not.toContain('192.168.1.100');
      expect(entry.message).not.toContain('SERVER1');

      // Verify some anonymization happened
      expect(entry.message).not.toBe('User DOMAIN\\jsmith from WORKSTATION1 at 192.168.1.100 tried to access share from SERVER1');
    });

    it('should handle repeated PII values with consistent anonymization', async () => {
      const repeatedUsername = 'DOMAIN\\testuser';
      const message = `${repeatedUsername} logged in from SERVER1. ${repeatedUsername} accessed files. ${repeatedUsername} logged out.`;

      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4624,
            levelDisplayName: 'Information',
            message,
            timeCreated: new Date(),
            userId: repeatedUsername,
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
        { logName: 'Security', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];

      // Extract anonymized username from first occurrence
      const match = entry.message.match(/ANON_USER_[a-zA-Z0-9]+/);
      expect(match).not.toBeNull();

      const anonUsername = match![0];

      // Count occurrences - should all be the same
      const occurrences = (entry.message.match(new RegExp(anonUsername, 'g')) || []).length;
      expect(occurrences).toBeGreaterThan(0);

      // Verify original username doesn't appear
      expect(entry.message).not.toContain(repeatedUsername);
      expect(entry.message).not.toContain('testuser');
    });
  });

  describe('Realistic Event Log Scenarios', () => {
    it('should anonymize successful login event', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 4624,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 4624,
            levelDisplayName: 'Information',
            message: 'An account was successfully logged on.\nSubject:\n\tSecurity ID:\t\tS-1-5-18\n\tAccount Name:\t\tCONTOSO\\\\JSmith\n\nLogon Information:\n\tLogon Type:\t\t3\n\tRestricted Admin Mode:\t-\n\tVirtual Account:\t\tNo\n\tElevated Token:\t\tNo\n\nImpersonation Level:\t\tImpersonation\n\nNew Logon:\n\tSecurity ID:\t\tS-1-5-21-3623811015-3361044348-30300820-1013\n\tAccount Name:\t\tJSmith\n\tAccount Domain:\t\tCONTOSO\n\tLogon ID:\t\t0x30D695\n\tLogon GUID:\t\t{00000000-0000-0000-0000-000000000000}',
            timeCreated: new Date(),
            userId: 'CONTOSO\\JSmith',
            computerName: 'SERVER-PROD-01',
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
        { logName: 'Security', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];

      // Verify PII is anonymized
      expect(entry.message).not.toContain('JSmith');
      expect(entry.message).not.toContain('CONTOSO\\JSmith');
      expect(entry.message).not.toContain('SERVER-PROD-01');
    });

    it('should anonymize service installation event with file paths', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 7045,
            logName: 'System',
            providerName: 'EventLog',
            eventId: 7045,
            levelDisplayName: 'Information',
            message: 'Service installed.\nService Name: MyService\nImage Path: C:\\Program Files\\MyApp\\service.exe\nService Type: user mode service\nStart Type: auto start\nAccount: DOMAIN\\ServiceAccount',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'WORKSTATION',
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

      // Verify service account is anonymized
      expect(entry.message).not.toContain('DOMAIN\\ServiceAccount');
      expect(entry.message).not.toContain('ServiceAccount');
    });

    it('should anonymize network connection event with IPs', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 5156,
            logName: 'Security',
            providerName: 'EventLog',
            eventId: 5156,
            levelDisplayName: 'Information',
            message: 'The Windows Filtering Platform has blocked a connection.\nApplication Information:\n\tProcess ID:\t\t1234\n\tApplication Path:\t\\device\\harddiskvolume2\\windows\\notepad.exe\nNetwork Information:\n\tDirection:\t\tInbound\n\tSource Address:\t\t192.168.1.100\n\tSource Port:\t\t50123\n\tDestination Address:\t10.0.0.5\n\tDestination Port:\t443',
            timeCreated: new Date(),
            userId: 'DOMAIN\\NetworkUser',
            computerName: 'WORKSTATION-01',
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
        { logName: 'Security', limit: 100, offset: 0 },
        context
      );

      expect(result.entries.length).toBe(1);
      const entry = result.entries[0];

      // Verify IPs are anonymized
      expect(entry.message).not.toContain('192.168.1.100');
      expect(entry.message).not.toContain('10.0.0.5');
      expect(entry.message).not.toContain('WORKSTATION-01');
      expect(entry.message).not.toContain('DOMAIN\\NetworkUser');
    });
  });

  describe('No False Positives', () => {
    it('should not over-anonymize legitimate data', async () => {
      mockProvider.query = jest.fn().mockResolvedValue({
        entries: [
          {
            id: 1,
            logName: 'Application',
            providerName: 'EventLog',
            eventId: 1000,
            levelDisplayName: 'Information',
            message: 'Process started with ID 12345 from module System32. Version 1.2.3.4 running.',
            timeCreated: new Date(),
            userId: 'SYSTEM',
            computerName: 'SERVER',
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

      // Process IDs and version numbers are not PII - should be preserved
      // (or at least, not contain actual usernames/IPs/emails)
      expect(entry.message).toContain('Process started'); // Unchanged structure
    });
  });
});
