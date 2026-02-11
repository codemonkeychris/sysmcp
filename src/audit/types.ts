/**
 * Audit Entry Types
 *
 * Types for the audit logging system that tracks all
 * permission and configuration changes.
 */

/**
 * Audit action types
 */
export type AuditAction =
  | 'service.enable'
  | 'service.disable'
  | 'permission.change'
  | 'pii.toggle'
  | 'config.reset';

/**
 * A single audit log entry
 */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Action performed */
  action: AuditAction;
  /** Service affected */
  serviceId: string;
  /** Previous value before change */
  previousValue: unknown;
  /** New value after change */
  newValue: unknown;
  /** Where the change originated */
  source: string;
}
