# Feature 005: Permission Model

## Overview

Implement a complete permission enforcement system that makes the existing permission levels (`read-only`, `read-write`, `disabled`) actually block unauthorized operations, persists all service configuration to a JSON file so settings survive restarts, and creates an audit trail of all permission and configuration changes. This feature bridges the gap between the permission framework already defined in the codebase and actual enforcement, completing the MVP security model.

## Goals

- **Enforce permissions at runtime** — the existing `PermissionLevel` types (`disabled`, `read-only`, `read-write`) must actually block operations at both a unified middleware layer and per-service validation (defense-in-depth)
- **Persist configuration** — all service settings (enabled/disabled, permission level, PII toggle, etc.) saved to a JSON config file and loaded on startup
- **Audit configuration changes** — every permission-relevant change (service enable/disable, permission level change, PII toggle change, config reset) logged to a rotating JSON audit log file
- **Expose GraphQL API** — mutations for changing service permissions and configuration, preparing for the Config UI feature
- **Secure by default** — on first run with no config file, all services start disabled and require explicit opt-in

## User Stories

- **As an administrator**, I want services to start disabled by default so that no data is exposed without my explicit consent.
- **As an administrator**, I want to enable a service and set its permission level (read-only or read-write) so that I can control what operations are allowed.
- **As an administrator**, I want my configuration changes to persist across service restarts so that I don't have to reconfigure every time.
- **As an administrator**, I want to see an audit trail of all permission changes so that I can review who changed what and when.
- **As a developer**, I want a unified permission checker that enforces permissions consistently across all services so that I don't have to implement enforcement separately in every resolver.
- **As a developer**, I want GraphQL mutations for permission changes so that the Config UI can be built on top of them.
- **As a system**, I want to deny operations on disabled services and block write operations on read-only services so that the security model is enforced.

## Functional Requirements

### FR-1: Unified Permission Checker

- Create a centralized `PermissionChecker` module in `src/security/`
- Accepts: `(serviceId, operationType)` and checks against current config
- Returns: `{ allowed: boolean, reason?: string }`
- Operation types: `read` and `write`
- Permission logic:
  - `disabled` → deny all operations
  - `read-only` → allow reads, deny writes
  - `read-write` → allow all operations
- Stateless: reads current permission from config managers
- Throws `PermissionDeniedException` with reason code on denial

### FR-2: Middleware Enforcement (GraphQL)

- Create a GraphQL middleware/plugin that intercepts all resolver calls
- Before resolver execution: check service permissions via `PermissionChecker`
- On denial: return structured GraphQL error with code `PERMISSION_DENIED`
- Error messages must be generic (no system internals leaked)
- Must identify which service a resolver belongs to (service mapping)

### FR-3: Per-Service Validation (Defense-in-Depth)

- Each service provider adds permission checks inside its `execute`/`query` method
- Uses the same `PermissionChecker` module (not duplicate logic)
- Acts as a safety net if middleware is bypassed or misconfigured
- Existing `PermissionDeniedException` classes in providers should be used

### FR-4: Persistent Configuration Storage

- Create a `ConfigStore` module in `src/config/`
- Storage format: single JSON file (e.g., `sysmcp-config.json`)
- Location: configurable via environment variable, defaults to application data directory
- Stores per-service configuration:
  - `enabled`: boolean
  - `permissionLevel`: `read-only` | `read-write` | `disabled`
  - `enableAnonymization`: boolean
  - Service-specific settings (maxResults, timeoutMs, allowedPaths, etc.)
- Load on startup: populate config managers from persisted file
- Save on change: persist immediately when any configuration changes
- Atomic writes: use temp-file + rename pattern (same as `AnonymizationStore`)
- Handle missing file gracefully: use secure defaults (all services disabled)
- Handle corrupted file: log error, use secure defaults, don't overwrite corrupted file (rename to `.corrupt`)
- Human-readable JSON with indentation

### FR-5: Secure Defaults

- On first run (no config file): all services start `disabled`
- Default permission level: `disabled` (not `read-only`)
- Default PII anonymization: `enabled` (true)
- Config file is only created after the first explicit configuration change
- Defaults documented in code and configuration schema

### FR-6: GraphQL Mutations for Configuration

- Add GraphQL mutations:
  - `enableService(serviceId: String!): ServiceConfig!`
  - `disableService(serviceId: String!): ServiceConfig!`
  - `setPermissionLevel(serviceId: String!, level: PermissionLevel!): ServiceConfig!`
  - `setPiiAnonymization(serviceId: String!, enabled: Boolean!): ServiceConfig!`
  - `resetServiceConfig(serviceId: String!): ServiceConfig!`
- Add GraphQL queries:
  - `serviceConfig(serviceId: String!): ServiceConfig!`
  - `allServiceConfigs: [ServiceConfig!]!`
- `ServiceConfig` type includes: serviceId, enabled, permissionLevel, enableAnonymization, and service-specific fields
- `PermissionLevel` GraphQL enum: `DISABLED`, `READ_ONLY`, `READ_WRITE`
- All mutations trigger config persistence and audit logging

### FR-7: Audit Logging for Configuration Changes

- Create an `AuditLogger` module in `src/audit/`
- Log entries for:
  - Service enabled/disabled
  - Permission level changes
  - PII anonymization toggle changes
  - Configuration resets
- Each log entry includes:
  - `timestamp`: ISO 8601
  - `action`: string describing the change (e.g., `service.enable`, `permission.change`, `pii.toggle`, `config.reset`)
  - `serviceId`: which service was affected
  - `previousValue`: the old setting value
  - `newValue`: the new setting value
  - `source`: where the change originated (e.g., `graphql-mutation`, `startup-defaults`)
- Storage: JSON log file, one JSON object per line (JSONL format)
- Rotation: rotate when file exceeds configurable size (default 10MB), keep last N files (default 5)
- Location: configurable, defaults to `logs/` directory
- Read API: `AuditLogger.getRecentEntries(count)` for Config UI integration

### FR-8: Integration with Existing Config Managers

- `EventLogConfigManager` and `FileSearchConfigManager` remain the source of truth for in-memory config
- `ConfigStore` loads persisted config → populates config managers on startup
- Config managers emit change events (or call a hook) when settings change → `ConfigStore` persists
- Config managers' default values change from `enabled: true` to `enabled: false` (secure defaults)

## Non-Functional Requirements

- **Performance**: Permission checks must complete in <1ms (in-memory lookups)
- **Reliability**: Config file corruption must not crash the service; fall back to secure defaults
- **Security**: Permission enforcement must be non-bypassable — middleware + per-service checks
- **Testability**: Permission checker must be testable in isolation with no file system dependencies
- **Backward compatibility**: Existing GraphQL queries continue to work (just subject to permission checks)
- **Test coverage**: >80% code coverage on all new modules; 100% on permission enforcement logic

## Constraints & Limitations

- Single-user system — no per-user permissions or authentication (deferred)
- No write operations exist yet — `read-write` permission level is defined but has no write operations to gate
- No encryption of config file — config file is human-readable JSON (security through file system permissions)
- No network-level permission enforcement — this feature covers application-layer permissions only
- Audit log is local only — no remote log shipping

## Out of Scope

- Per-user or role-based access control (RBAC)
- Network authentication or authorization (Feature 7)
- Config UI frontend (Feature 6)
- Write operation buffering and approval workflow
- Encryption at rest for configuration or audit files
- Remote audit log shipping or aggregation
- Time-limited or temporary permission grants
- Per-operation granular permissions (beyond read/write)

## Success Criteria

- [ ] Services start disabled on first run with no config file
- [ ] Enabling a service via GraphQL mutation persists to config file
- [ ] Disabling a service blocks all GraphQL queries to that service
- [ ] Setting a service to `read-only` blocks write operations (when they exist)
- [ ] Configuration survives service restart (persisted and reloaded)
- [ ] All permission/config changes appear in the audit log
- [ ] Audit log rotates at configured size threshold
- [ ] GraphQL mutations return updated `ServiceConfig` objects
- [ ] GraphQL queries for service configuration work correctly
- [ ] Permission denied errors return structured GraphQL errors (no system info leaked)
- [ ] Corrupted config file handled gracefully (renamed, secure defaults used)
- [ ] >80% test coverage on all new code; 100% on permission enforcement
- [ ] All existing tests continue to pass
- [ ] Defense-in-depth: both middleware and per-service checks block unauthorized operations

## Questions for Design Review

1. Should the config file path be relative to the project root or use an OS-specific app data directory (e.g., `%APPDATA%\SysMCP\`)?
2. Should audit log entries include a request ID or session ID for correlation with query logs?
3. Should the GraphQL mutations require any form of authentication token, or is that deferred entirely to Feature 7?

## Next Steps

1. Run **feature-plan** skill to create a technical implementation plan
2. Run **feature-tasks** skill to break the plan into ordered tasks
3. Begin implementation starting with the permission checker and config store

---

## Document Metadata

- **Feature ID**: 005
- **Title**: Permission Model
- **Created**: 2026-02-10
- **Status**: Specification Complete
- **Branch**: `feature/005-permission-model`
- **Plan Reference**: `features/plan.md` → Feature 5
