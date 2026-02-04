/**
 * PII Filtering and JSON formatting for log entries
 */

import { LogEntry, LogLevel } from './types';

/**
 * PII filter patterns and masking functions
 */
const PII_PATTERNS = {
  // Password/token patterns
  password: /password\s*[:=]\s*["']([^"']+)["']/gi,
  token: /token\s*[:=]\s*["']([^"']+)["']/gi,
  secret: /secret\s*[:=]\s*["']([^"']+)["']/gi,
  apiKey: /api[_-]?key\s*[:=]\s*["']([^"']+)["']/gi,
  
  // Email pattern
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone number patterns (various formats)
  phone: /(\+?1?\s*)?(\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g,
  
  // SSN pattern
  ssn: /\d{3}-\d{2}-\d{4}/g,
};

/**
 * Check if a string contains a value that matches PII patterns
 */
function containsPII(value: string): boolean {
  if (typeof value !== 'string') return false;
  
  return (
    PII_PATTERNS.password.test(value) ||
    PII_PATTERNS.token.test(value) ||
    PII_PATTERNS.secret.test(value) ||
    PII_PATTERNS.apiKey.test(value) ||
    PII_PATTERNS.email.test(value) ||
    PII_PATTERNS.phone.test(value) ||
    PII_PATTERNS.ssn.test(value)
  );
}

/**
 * Mask an email address to show only domain
 */
function maskEmail(email: string): string {
  const match = email.match(/(.*)@(.*)/);
  if (match) {
    return `***@${match[2]}`;
  }
  return '[email]';
}

/**
 * Mask a phone number to show only last 4 digits
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 4) {
    return `***-****-${digits.slice(-4)}`;
  }
  return '[phone]';
}

/**
 * Mask an SSN
 */
function maskSSN(ssn: string): string {
  return '***-**-' + ssn.slice(-4);
}

/**
 * Recursively filter PII from an object
 */
export function filterPII(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    let filtered = value;
    
    // Mask passwords/tokens
    filtered = filtered.replace(PII_PATTERNS.password, 'password=[REDACTED]');
    filtered = filtered.replace(PII_PATTERNS.token, 'token=[REDACTED]');
    filtered = filtered.replace(PII_PATTERNS.secret, 'secret=[REDACTED]');
    filtered = filtered.replace(PII_PATTERNS.apiKey, 'api_key=[REDACTED]');
    
    // Mask emails
    const emails = filtered.match(PII_PATTERNS.email);
    if (emails) {
      emails.forEach((email) => {
        filtered = filtered.replace(email, maskEmail(email));
      });
    }
    
    // Mask phone numbers
    const phones = filtered.match(PII_PATTERNS.phone);
    if (phones) {
      phones.forEach((phone) => {
        filtered = filtered.replace(phone, maskPhone(phone));
      });
    }
    
    // Mask SSNs
    const ssns = filtered.match(PII_PATTERNS.ssn);
    if (ssns) {
      ssns.forEach((ssn) => {
        filtered = filtered.replace(ssn, maskSSN(ssn));
      });
    }
    
    return filtered;
  }

  if (Array.isArray(value)) {
    return value.map(filterPII);
  }

  if (typeof value === 'object') {
    const filtered: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      filtered[key] = filterPII(val);
    }
    return filtered;
  }

  return value;
}

/**
 * Format a log entry as JSON with PII filtering
 */
export function formatLogEntry(entry: LogEntry): string {
  // Filter context for PII
  const filteredEntry = {
    ...entry,
    context: entry.context ? filterPII(entry.context) : undefined,
  };

  // Remove undefined fields
  if (filteredEntry.context === undefined) {
    delete filteredEntry.context;
  }
  if (filteredEntry.stack === undefined) {
    delete filteredEntry.stack;
  }

  return JSON.stringify(filteredEntry);
}

/**
 * Check if log level should be output (level ordering: error < warn < info < debug)
 */
export function shouldLog(configuredLevel: LogLevel, messageLevel: LogLevel): boolean {
  const levelOrder: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
  };
  return levelOrder[messageLevel] <= levelOrder[configuredLevel];
}
