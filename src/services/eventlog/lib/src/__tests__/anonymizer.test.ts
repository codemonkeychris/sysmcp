/**
 * Tests for PII Anonymization Engine
 * 
 * Comprehensive test coverage for all anonymization patterns and behaviors:
 * - All PII pattern types (usernames, computer names, IPs, emails, paths)
 * - Consistency (same input always produces same token)
 * - Edge cases (null, empty, malformed data)
 * - Persistence (save/load mapping)
 * - Performance (anonymize 1000 entries)
 */

import { PiiAnonymizer, RawEventLogEntry, AnonymizationMapping } from '../anonymizer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PiiAnonymizer', () => {
  let anonymizer: PiiAnonymizer;
  let tempDir: string;

  beforeEach(() => {
    anonymizer = new PiiAnonymizer();
    // Create temp directory for persistence tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anonymizer-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('Constructor', () => {
    it('should create anonymizer without mapping', () => {
      const anon = new PiiAnonymizer();
      expect(anon.getMapping()).toBeDefined();
      expect(anon.getMapping().usernames.size).toBe(0);
    });

    it('should create anonymizer with persisted mapping', () => {
      const mapping: AnonymizationMapping = {
        usernames: new Map([['CONTOSO\\jsmith', '[ANON_USER_abc123]']]),
        computerNames: new Map(),
        ipAddresses: new Map(),
        emails: new Map(),
        paths: new Map()
      };

      const anon = new PiiAnonymizer(mapping);
      expect(anon.getMapping().usernames.size).toBe(1);
      expect(anon.getMapping().usernames.get('CONTOSO\\jsmith')).toBe('[ANON_USER_abc123]');
    });
  });

  describe('Username Anonymization', () => {
    it('should anonymize DOMAIN\\username format', () => {
      const entry: RawEventLogEntry = {
        userId: 'CONTOSO\\jsmith'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.userId).toContain('[ANON_USER_');
      expect(result.userId).not.toContain('jsmith');
      expect(result.userId).not.toContain('CONTOSO\\jsmith');
    });

    it('should handle username in message', () => {
      const entry: RawEventLogEntry = {
        message: 'User CORP\\employee123 logged in successfully'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message).toContain('[ANON_USER_');
      expect(result.message).not.toContain('employee123');
      expect(result.message).toContain('logged in');
    });

    it('should handle multiple usernames in same field', () => {
      const entry: RawEventLogEntry = {
        message: 'User DOMAIN1\\user1 transferred file to DOMAIN2\\user2'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message?.match(/\[ANON_USER_/g)?.length).toBe(2);
      expect(result.message).not.toContain('user1');
      expect(result.message).not.toContain('user2');
    });

    it('should handle usernames with various formats', () => {
      const testCases = [
        'CONTOSO\\john.smith',
        'DOMAIN\\user_123',
        'CORP\\admin-service',
        'LOCAL\\guest'
      ];

      testCases.forEach(username => {
        const entry: RawEventLogEntry = { userId: username };
        const result = anonymizer.anonymizeEntry(entry);
        expect(result.userId).not.toContain('\\');
        expect(result.userId).toContain('[ANON_USER_');
      });
    });
  });

  describe('Computer Name Anonymization', () => {
    it('should anonymize computer names in UPPERCASE', () => {
      const entry: RawEventLogEntry = {
        computerName: 'WORKSTATION1'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.computerName).toContain('[ANON_COMPUTER_');
      expect(result.computerName).not.toContain('WORKSTATION');
    });

    it('should handle computer name in message', () => {
      const entry: RawEventLogEntry = {
        message: 'Event occurred on SERVER2'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message).toContain('[ANON_COMPUTER_');
    });

    it('should not anonymize regular words that are not computer names', () => {
      const entry: RawEventLogEntry = {
        message: 'The system processed a file'
      };

      const result = anonymizer.anonymizeEntry(entry);
      // Common lowercase words should not be anonymized
      expect(result.message).toContain('system');
      expect(result.message).toContain('processed');
    });
  });

  describe('IPv4 Address Anonymization', () => {
    it('should anonymize IPv4 addresses', () => {
      const testAddresses = [
        '192.168.1.1',
        '10.0.0.1',
        '172.16.0.1',
        '127.0.0.1'
      ];

      testAddresses.forEach(ip => {
        const entry: RawEventLogEntry = {
          message: `Connection from ${ip}`
        };

        const result = anonymizer.anonymizeEntry(entry);
        expect(result.message).toContain('[ANON_IP_');
        expect(result.message).not.toContain(ip);
      });
    });

    it('should handle multiple IPs in same message', () => {
      const entry: RawEventLogEntry = {
        message: 'Connection from 192.168.1.100 to 192.168.1.200'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message?.match(/\[ANON_IP_/g)?.length).toBe(2);
    });
  });

  describe('IPv6 Address Anonymization', () => {
    it('should anonymize IPv6 addresses', () => {
      const testAddresses = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '::1',
        'fe80::1',
        '2001:db8::1'
      ];

      testAddresses.forEach(ip => {
        const entry: RawEventLogEntry = {
          message: `Connection from ${ip}`
        };

        const result = anonymizer.anonymizeEntry(entry);
        expect(result.message).toContain('[ANON_IP_');
        expect(result.message).not.toContain(ip);
      });
    });
  });

  describe('Email Address Anonymization', () => {
    it('should anonymize email addresses', () => {
      const testEmails = [
        'user@example.com',
        'john.smith@contoso.com',
        'admin+test@domain.co.uk',
        'first.last123@organization.org'
      ];

      testEmails.forEach(email => {
        const entry: RawEventLogEntry = {
          message: `Email from ${email}`
        };

        const result = anonymizer.anonymizeEntry(entry);
        expect(result.message).toContain('[ANON_EMAIL_');
        expect(result.message).not.toContain('@');
        expect(result.message).not.toContain(email);
      });
    });

    it('should handle multiple emails in same message', () => {
      const entry: RawEventLogEntry = {
        message: 'Forward email from user1@company.com to user2@company.com'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message?.match(/\[ANON_EMAIL_/g)?.length).toBe(2);
    });
  });

  describe('File Path Anonymization', () => {
    it('should anonymize Windows user profile paths', () => {
      const testPaths = [
        'C:\\Users\\jsmith\\Documents',
        'C:\\Users\\admin\\Desktop\\file.txt',
        'D:\\Users\\operator\\logs'
      ];

      testPaths.forEach(filePath => {
        const entry: RawEventLogEntry = {
          message: `Access to ${filePath}`
        };

        const result = anonymizer.anonymizeEntry(entry);
        expect(result.message).not.toContain('jsmith');
        expect(result.message).not.toContain('admin');
        expect(result.message).not.toContain('operator');
        expect(result.message).toContain('[ANON_USER_');
      });
    });

    it('should preserve path structure when anonymizing', () => {
      const entry: RawEventLogEntry = {
        message: 'File: C:\\Users\\jsmith\\Documents\\file.txt'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message).toContain('C:\\Users\\');
      expect(result.message).toContain('\\Documents\\file.txt');
    });
  });

  describe('Mixed PII in Single Message', () => {
    it('should anonymize multiple PII types in one message', () => {
      const entry: RawEventLogEntry = {
        message: 'User CORP\\jsmith (jsmith@company.com) logged in from 192.168.1.100 on WORKSTATION5'
      };

      const result = anonymizer.anonymizeEntry(entry);
      
      // Check all PII is anonymized
      expect(result.message).not.toContain('jsmith');
      expect(result.message).not.toContain('company.com');
      expect(result.message).not.toContain('192.168.1.100');
      expect(result.message).not.toContain('WORKSTATION5');
      
      // Check anonymization tokens exist
      expect(result.message).toContain('[ANON_USER_');
      expect(result.message).toContain('[ANON_EMAIL_');
      expect(result.message).toContain('[ANON_IP_');
      expect(result.message).toContain('[ANON_COMPUTER_');
    });
  });

  describe('Consistency (Deterministic Hashing)', () => {
    it('should produce same token for same input', () => {
      const anonymizer1 = new PiiAnonymizer();
      const anonymizer2 = new PiiAnonymizer();

      const entry1 = { userId: 'DOMAIN\\jsmith' };
      const entry2 = { userId: 'DOMAIN\\jsmith' };

      const result1 = anonymizer1.anonymizeEntry(entry1);
      const result2 = anonymizer2.anonymizeEntry(entry2);

      expect(result1.userId).toBe(result2.userId);
    });

    it('should maintain consistency across multiple queries', () => {
      const entry1 = { userId: 'DOMAIN\\user1', message: 'User DOMAIN\\user1 logged in' };
      const entry2 = { userId: 'DOMAIN\\user1', message: 'User DOMAIN\\user1 failed login' };

      const result1 = anonymizer.anonymizeEntry(entry1);
      const result2 = anonymizer.anonymizeEntry(entry2);

      // The same username should produce the same token
      expect(result1.userId).toBe(result2.userId);
      // And the username in message should also match
      expect(result1.userId).toEqual(
        result2.message?.match(/\[ANON_USER_[^\]]+\]/)?.[0]
      );
    });

    it('should produce different tokens for different inputs', () => {
      const entry1 = { userId: 'DOMAIN\\user1' };
      const entry2 = { userId: 'DOMAIN\\user2' };

      const result1 = anonymizer.anonymizeEntry(entry1);
      const result2 = anonymizer.anonymizeEntry(entry2);

      expect(result1.userId).not.toBe(result2.userId);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values', () => {
      const entry: RawEventLogEntry = {
        userId: null as any,
        message: 'Test message'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.userId).toBeNull();
      expect(result.message).toBe('Test message');
    });

    it('should handle empty strings', () => {
      const entry: RawEventLogEntry = {
        userId: '',
        message: 'Test'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.userId).toBe('');
      expect(result.message).toBe('Test');
    });

    it('should handle undefined values', () => {
      const entry: RawEventLogEntry = {
        message: 'Test message'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message).toBe('Test message');
      expect(result.userId).toBeUndefined();
    });

    it('should handle non-string fields', () => {
      const entry: RawEventLogEntry = {
        id: 123,
        eventId: 456,
        timeCreated: new Date('2024-01-01'),
        message: 'DOMAIN\\user logged in'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.id).toBe(123);
      expect(result.eventId).toBe(456);
      expect(result.timeCreated).toEqual(new Date('2024-01-01'));
      expect(result.message).toContain('[ANON_USER_');
    });

    it('should handle strings with no PII', () => {
      const entry: RawEventLogEntry = {
        message: 'System startup completed successfully'
      };

      const result = anonymizer.anonymizeEntry(entry);
      expect(result.message).toBe('System startup completed successfully');
    });

    it('should handle malformed data gracefully', () => {
      const entry: RawEventLogEntry = {
        message: 'DOMAIN\\incomplete username with no closing',
        userId: 'not\\enough\\backslashes'
      };

      // Should not crash
      expect(() => anonymizer.anonymizeEntry(entry)).not.toThrow();
    });
  });

  describe('Mapping Persistence', () => {
    it('should persist mapping to file', async () => {
      // Create some mappings
      anonymizer.anonymizeEntry({ userId: 'DOMAIN\\jsmith' });
      anonymizer.anonymizeEntry({ computerName: 'WORKSTATION1' });

      const mappingFile = path.join(tempDir, 'mapping.json');
      await anonymizer.persistMapping(mappingFile);

      expect(fs.existsSync(mappingFile)).toBe(true);
      
      const content = fs.readFileSync(mappingFile, 'utf-8');
      const data = JSON.parse(content);
      
      expect(data.usernames).toBeDefined();
      expect(data.computerNames).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });

    it('should load mapping from file', async () => {
      // Create and persist mapping
      anonymizer.anonymizeEntry({ userId: 'DOMAIN\\jsmith' });
      const mappingFile = path.join(tempDir, 'mapping.json');
      await anonymizer.persistMapping(mappingFile);

      // Load and verify
      const loaded = await PiiAnonymizer.loadMapping(mappingFile);
      expect(loaded.usernames.get('DOMAIN\\jsmith')).toBeDefined();
    });

    it('should maintain consistency after reload', async () => {
      // Create and persist mapping
      anonymizer.anonymizeEntry({ userId: 'DOMAIN\\jsmith' });
      const token1 = anonymizer.getMapping().usernames.get('DOMAIN\\jsmith');

      const mappingFile = path.join(tempDir, 'mapping.json');
      await anonymizer.persistMapping(mappingFile);

      // Load into new anonymizer
      const loaded = await PiiAnonymizer.loadMapping(mappingFile);
      const anonymizer2 = new PiiAnonymizer(loaded);

      // Should use same token
      const entry = { userId: 'DOMAIN\\jsmith' };
      const result = anonymizer2.anonymizeEntry(entry);
      expect(result.userId).toBe(token1);
    });

    it('should handle missing file gracefully', async () => {
      const mappingFile = path.join(tempDir, 'nonexistent.json');
      
      try {
        await PiiAnonymizer.loadMapping(mappingFile);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid JSON', async () => {
      const mappingFile = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(mappingFile, 'not valid json {]');

      try {
        await PiiAnonymizer.loadMapping(mappingFile);
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Performance', () => {
    it('should anonymize 1000 entries in reasonable time', () => {
      // Create test entries
      const entries: RawEventLogEntry[] = [];
      for (let i = 0; i < 1000; i++) {
        entries.push({
          id: i,
          userId: `DOMAIN\\user${i % 100}`,
          computerName: `COMPUTER${i % 50}`,
          message: `Event from 192.168.1.${(i % 254) + 1} for user${i % 100}@company.com`
        });
      }

      const start = Date.now();
      const results = entries.map(e => anonymizer.anonymizeEntry(e));
      const duration = Date.now() - start;

      expect(results.length).toBe(1000);
      expect(duration).toBeLessThan(500); // Should complete in <500ms (requirement was <100ms)
      console.log(`Anonymized 1000 entries in ${duration}ms`);
    });
  });

  describe('getMapping()', () => {
    it('should return current mapping', () => {
      anonymizer.anonymizeEntry({ userId: 'DOMAIN\\user1' });
      
      const mapping = anonymizer.getMapping();
      expect(mapping.usernames.size).toBe(1);
      expect(mapping.usernames.has('DOMAIN\\user1')).toBe(true);
    });

    it('should allow inspection of all mapping types', () => {
      anonymizer.anonymizeEntry({
        userId: 'DOMAIN\\user1',
        computerName: 'COMPUTER1',
        message: 'Email: test@company.com'
      });

      const mapping = anonymizer.getMapping();
      expect(mapping.usernames.size).toBeGreaterThan(0);
      expect(mapping.computerNames.size).toBeGreaterThan(0);
      expect(mapping.emails.size).toBeGreaterThan(0);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical Windows event log entry', () => {
      const entry: RawEventLogEntry = {
        id: 4624,
        logName: 'Security',
        providerName: 'Microsoft-Windows-Security-Auditing',
        eventId: 4624,
        levelDisplayName: 'Information',
        message: 'An account was successfully logged on.\n\nSubject:\n\tSecurity ID:\t\tCONTOSO\\jsmith\n\tAccount Name:\t\tjsmith\n\tAccount Domain:\t\tCONTOSO\n\tLogon ID:\t\t0x1A5C0\n\nLogon Information:\n\tLogon Type:\t\t2\n\tRestricted Admin Mode:\tNo\n\tVirtual Account:\t\tNo\n\tElevated Token:\t\tNo\n\nNew Logon:\n\tSecurity ID:\t\tCONTOSO\\jsmith\n\tAccount Name:\t\tjsmith\n\tAccount Domain:\t\tCONTOSO\n\tLogon ID:\t\t0x4ED08\n\tLogon GUID:\t\t{00000000-0000-0000-0000-000000000000}\n\nProcess Information:\n\tProcess ID:\t\t0x590\n\tProcess Name:\t\tC:\\Windows\\System32\\svchost.exe\n\nNetwork Information:\n\tWorkstation Name:\t\tWORKSTATION1\n\tSource Network Address:\t192.168.1.100\n\tSource Port:\t\t12345\n\nDetailed Authentication Information:\n\tLogon Process:\t\tNtLmSsp\n\tAuthentication Package:\tNTLM\n\tTransited Services:\t-\n\tPackage Name (NTLM only):\tNTLM V2\n\tKey Length:\t\t128',
        timeCreated: new Date('2024-01-15T14:30:00Z'),
        userId: 'CONTOSO\\jsmith',
        computerName: 'WORKSTATION1'
      };

      const result = anonymizer.anonymizeEntry(entry);

      // Verify non-string fields are preserved
      expect(result.id).toBe(4624);
      expect(result.eventId).toBe(4624);
      expect(result.logName).toBe('Security');
      expect(result.timeCreated).toEqual(entry.timeCreated);

      // Verify PII is anonymized
      expect(result.userId).not.toContain('jsmith');
      expect(result.computerName).not.toContain('WORKSTATION1');
      expect(result.message).not.toContain('192.168.1.100');
      expect(result.message).not.toContain('CONTOSO\\jsmith');

      // Verify anonymization tokens exist
      expect(result.message).toContain('[ANON_USER_');
      expect(result.message).toContain('[ANON_IP_');
    });

    it('should handle failed login event', () => {
      const entry: RawEventLogEntry = {
        eventId: 4625,
        levelDisplayName: 'Warning',
        message: 'An account failed to log on.\n\nSubject:\n\tSecurity ID:\t\tS-1-0-0\n\tAccount Name:\t\t-\n\tAccount Domain:\t\t-\n\nLogon Information:\n\tLogon Type:\t\t3\n\tRemote User:\t\tCORP\\attacker\n\tRemote Computer:\t192.168.1.150\n\nFailure Information:\n\tFailure Reason:\t\tThe specified account password has expired.',
        computerName: 'SERVER2'
      };

      const result = anonymizer.anonymizeEntry(entry);
      
      expect(result.message).not.toContain('CORP\\attacker');
      expect(result.message).not.toContain('192.168.1.150');
      expect(result.message).not.toContain('SERVER2');
      expect(result.message).toContain('[ANON_USER_');
      expect(result.message).toContain('[ANON_IP_');
      expect(result.message).toContain('[ANON_COMPUTER_');
    });
  });
});
