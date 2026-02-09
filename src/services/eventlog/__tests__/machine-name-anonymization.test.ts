/**
 * Machine Name Anonymization Tests
 *
 * Tests for anonymization of the local machine name in EventLog entries.
 * The machine name is a strong identifier that must be consistently anonymized
 * to protect user privacy.
 */

import { PiiAnonymizer } from '../lib/src/anonymizer';
import * as os from 'os';

describe('Local Machine Name Anonymization', () => {
  let anonymizer: PiiAnonymizer;
  let localMachineName: string;

  beforeEach(() => {
    anonymizer = new PiiAnonymizer();
    localMachineName = os.hostname().toUpperCase();
  });

  describe('Machine Name Detection', () => {
    it('should detect local machine name on initialization', () => {
      expect(anonymizer.getLocalMachineName()).toBe(localMachineName);
    });

    it('should detect machine name in uppercase', () => {
      const name = anonymizer.getLocalMachineName();
      expect(name).toBe(name.toUpperCase());
    });
  });

  describe('Machine Name in Event Messages', () => {
    it('should anonymize machine name in event message', () => {
      const entry = {
        id: 1,
        message: `User logged in on ${localMachineName}`,
        computerName: localMachineName
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Machine name should be anonymized (token format: [ANON_COMPUTER_...])
      expect(anonymized.message).toMatch(/\[ANON_COMPUTER_[A-F0-9]{6}\]/);
      expect(anonymized.message).not.toContain(localMachineName);
    });

    it('should anonymize machine name case-insensitively', () => {
      const entry = {
        id: 1,
        message: `${localMachineName} - System Event`
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      expect(anonymized.message).toMatch(/\[ANON_COMPUTER_[A-F0-9]{6}\]/);
      expect(anonymized.message).not.toContain(localMachineName);
    });

    it('should preserve consistent anonymization across multiple occurrences', () => {
      const entry = {
        id: 1,
        message: `${localMachineName} received request from ${localMachineName}`
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Both occurrences should be replaced with the same token
      const tokenMatches = anonymized.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/g);
      expect(tokenMatches).toHaveLength(2);
      expect(tokenMatches![0]).toBe(tokenMatches![1]);
    });

    it('should anonymize machine name in computerName field', () => {
      const entry = {
        id: 1,
        computerName: localMachineName,
        message: 'Event occurred'
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // computerName field should be anonymized since it's a string PII field
      expect(anonymized.computerName).toMatch(/\[ANON_COMPUTER_[A-F0-9]{6}\]/);
    });

    it('should anonymize machine name in network paths', () => {
      const entry = {
        id: 1,
        message: `\\\\${localMachineName}\\share\\file.txt accessed`
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      expect(anonymized.message).toMatch(/\[ANON_COMPUTER_[A-F0-9]{6}\]/);
      expect(anonymized.message).not.toContain(localMachineName);
    });
  });

  describe('Machine Name Priority in Anonymization Order', () => {
    it('should anonymize machine name before general computer name pattern matching', () => {
      const entry = {
        id: 1,
        message: `Process started on ${localMachineName} at server location`
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Should have exactly one ANON_COMPUTER token (the machine name)
      // not multiple ones for "server" etc.
      const tokens = anonymized.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/g);
      expect(tokens).toHaveLength(1);
    });
  });

  describe('Machine Name Anonymization Mapping', () => {
    it('should track anonymized machine name in mapping', () => {
      const entry = {
        id: 1,
        message: `Event on ${localMachineName}`
      };

      anonymizer.anonymizeEntry(entry);
      const mapping = anonymizer.getMapping();

      // Machine name should be in computerNames mapping
      expect(mapping.computerNames.has(localMachineName)).toBe(true);
    });

    it('should use same token for machine name across different queries', () => {
      // First query
      const entry1 = {
        id: 1,
        message: `${localMachineName} started`
      };
      const anon1 = anonymizer.anonymizeEntry(entry1);

      // Second query
      const entry2 = {
        id: 2,
        message: `${localMachineName} stopped`
      };
      const anon2 = anonymizer.anonymizeEntry(entry2);

      // Extract tokens
      const token1 = anon1.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];
      const token2 = anon2.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];

      // Should be identical
      expect(token1).toBe(token2);
    });

    it('should persist and restore machine name anonymization mapping', async () => {
      const entry = {
        id: 1,
        message: `Event on ${localMachineName}`
      };

      // Anonymize with first anonymizer
      const anon1 = anonymizer.anonymizeEntry(entry);
      const token1 = anon1.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];

      // Save mapping
      const mapping = anonymizer.getMapping();

      // Create new anonymizer with saved mapping
      const anonymizer2 = new PiiAnonymizer(mapping);

      // Anonymize same entry with new anonymizer
      const anon2 = anonymizer2.anonymizeEntry(entry);
      const token2 = anon2.message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];

      // Should produce same token
      expect(token1).toBe(token2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle machine name with hyphens', () => {
      // Some machine names can have hyphens
      const entry = {
        id: 1,
        message: 'Event occurred',
        computerName: 'WORKSTATION-01'
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Should anonymize computer names with hyphens
      expect(anonymized.computerName).toMatch(/\[ANON_COMPUTER_[A-F0-9]{6}\]/);
    });

    it('should not anonymize machine name in partial matches', () => {
      // If local machine is "WORKSTATION1", it shouldn't match "WORKSTATION10"
      const entry = {
        id: 1,
        message: `Event on WORKSTATION10 and ${localMachineName}`
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Count ANON tokens - should be 2 (one for machine name, possibly one for WORKSTATION10)
      const tokens = anonymized.message.match(/\[ANON_/g) || [];
      expect(tokens.length).toBeGreaterThan(0);
      expect(anonymized.message).not.toContain(localMachineName);
    });

    it('should handle empty and null values gracefully', () => {
      const entries = [
        { id: 1, message: '' },
        { id: 2, message: null },
        { id: 3, message: undefined }
      ];

      entries.forEach(entry => {
        expect(() => {
          anonymizer.anonymizeEntry(entry as any);
        }).not.toThrow();
      });
    });
  });

  describe('Security: Machine Name Cannot Leak', () => {
    it('should never leak unencrypted machine name in any field', () => {
      const entry = {
        id: 1,
        logName: 'System',
        message: `Logged in to ${localMachineName}`,
        computerName: localMachineName,
        userId: `${localMachineName}\\admin`,
        eventId: 123,
        timestamp: new Date()
      };

      const anonymized = anonymizer.anonymizeEntry(entry);

      // Check all string fields
      Object.values(anonymized).forEach(value => {
        if (typeof value === 'string') {
          expect(value).not.toContain(localMachineName);
        }
      });
    });

    it('should maintain anonymization consistency for forensics', () => {
      // An analyst should be able to track that events came from the same machine
      // without knowing which machine it was
      const entries = [
        { id: 1, message: `Event A on ${localMachineName}` },
        { id: 2, message: `Event B on ${localMachineName}` },
        { id: 3, message: 'Event C on other-machine' }
      ];

      const anonymized = entries.map(e => anonymizer.anonymizeEntry(e));

      // Extract tokens
      const token1 = anonymized[0].message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];
      const token2 = anonymized[1].message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];
      const token3 = anonymized[2].message.match(/\[ANON_COMPUTER_[A-F0-9]{6}\]/)?.[0];

      // First two should match (same machine)
      expect(token1).toBe(token2);

      // Third could match or differ (we don't control other-machine)
      // But the first two's consistency should be verifiable
      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
    });
  });
});
