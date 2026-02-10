# Feature 005: Permission Model — Technical Implementation Plan

## Spec Reference

`features/005-permission-model.spec.md`

---

## Architecture Overview

This feature adds four new modules and modifies several existing ones to wire up permission enforcement, persistent configuration, and audit logging. The architecture follows the existing codebase patterns: singleton managers, atomic file I/O, and GraphQL resolver composition.

```
┌─────────────────────────────────────────────────────────────────┐
│  GraphQL Request                                                │
│                                                                 │
│  ┌────────────────────────────────────┐                        │
│  │  Permission Middleware (Apollo)     │  ← NEW                │
│  │  Intercepts all resolver calls      │                        │
│  │  Maps resolver → serviceId          │                        │
│  │  Calls PermissionChecker            │                        │
│  └──────────────┬─────────────────────┘                        │
│                 │ allowed                                        │
│                 ▼                                                │
│  ┌────────────────────────────────────┐                        │
│  │  Resolvers (eventlog, filesearch)   │                        │
│  │  Per-service validation (defense)   │  ← MODIFIED           │
│  │  Uses same PermissionChecker        │                        │
│  └──────────────┬─────────────────────┘                        │
│                 │                                                │
│                 ▼                                                │
│  ┌────────────────────────────────────┐                        │
│  │  Providers (eventlog, filesearch)   │                        │
│  │  Execute operations                 │  (unchanged)           │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  ┌────────────────────────────────────┐                         │
│  │  Config Mutations (GraphQL)         │  ← NEW                │
│  │  enableService, disableService      │                        │
│  │  setPermissionLevel, setPiiAnon     │                        │
│  └──────────────┬─────────────────────┘                        │
│                 │                                                │
│                 ▼                                                │
│  ┌────────────────────────────────────┐                        │
│  │  ConfigStore (persistence)          │  ← NEW                │
│  │  JSON file, atomic writes           │                        │
│  │  Loads on startup, saves on change  │                        │
│  └──────────────┬─────────────────────┘                        │
│                 │                                                │
│                 ▼                                                │
│  ┌────────────────────────────────────┐                        │
│  │  AuditLogger                        │  ← NEW                │
│  │  JSONL file, rotation               │                        │
│  │  Logs permission & config changes   │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components to Create

### 1. PermissionChecker (`src/security/permission-checker.ts`)

**Purpose**: Centralized, stateless permission enforcement logic.

**Design**:
```typescript
export type OperationType = 'read' | 'write';

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface PermissionChecker {
  check(serviceId: string, operation: OperationType): PermissionCheckResult;
}
```

**Logic**:
- Reads current config from the appropriate config manager (looked up by serviceId)
- `disabled` → deny all, reason: `"Service is disabled"`
- `read-only` → allow reads, deny writes with reason: `"Service is read-only"`
- `read-write` → allow all
- Unknown serviceId → deny with reason: `"Unknown service"`

**Implementation notes**:
- Stateless — no internal state, reads from config managers on every call
- Needs a service-to-config-manager mapping (registry pattern)
- Pure function logic, easily testable with no file system dependencies
- Export both the class and a factory: `createPermissionChecker(configRegistry)`

**Types file**: `src/security/types.ts` for shared types.

### 2. ConfigStore (`src/config/config-store.ts`)

**Purpose**: Persist all service configurations to a JSON file, load on startup.

**Design**:
```typescript
export interface PersistedConfig {
  version: number;           // Schema version for migration
  lastModified: string;      // ISO 8601
  services: {
    [serviceId: string]: {
      enabled: boolean;
      permissionLevel: PermissionLevel;
      enableAnonymization: boolean;
      // Service-specific fields stored as-is
      [key: string]: unknown;
    };
  };
}

export interface ConfigStore {
  load(): Promise<PersistedConfig | null>;
  save(config: PersistedConfig): Promise<void>;
  exists(): boolean;
}
```

**Implementation notes**:
- Follows the `AnonymizationStore` atomic write pattern: temp file + `fs.rename()`
- Default path: `./config/sysmcp-config.json` (configurable via `SYSMCP_CONFIG_PATH` env var)
- Creates directory if missing
- On corrupt file: rename to `.corrupt.{timestamp}`, log error, return null (caller uses defaults)
- File mode `0o600` on Unix (ignored on Windows)
- Human-readable JSON with 2-space indentation

**Startup integration** (in `src/server.ts`):
1. Create `ConfigStore` instance
2. Call `load()` — if null, use secure defaults (all disabled)
3. Populate config managers from loaded data
4. Pass `ConfigStore` reference into Apollo context

### 3. AuditLogger (`src/audit/audit-logger.ts`)

**Purpose**: Append-only JSONL audit log for configuration and permission changes.

**Design**:
```typescript
export interface AuditEntry {
  timestamp: string;         // ISO 8601
  action: AuditAction;       // e.g., 'service.enable', 'permission.change'
  serviceId: string;
  previousValue: unknown;
  newValue: unknown;
  source: string;            // e.g., 'graphql-mutation', 'startup-defaults'
}

export type AuditAction =
  | 'service.enable'
  | 'service.disable'
  | 'permission.change'
  | 'pii.toggle'
  | 'config.reset';

export interface AuditLogger {
  log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void>;
  getRecentEntries(count: number): Promise<AuditEntry[]>;
}
```

**Implementation notes**:
- JSONL format: one JSON object per line, appended with `fs.appendFile()`
- Default path: `./logs/audit.jsonl`
- Rotation: when file exceeds 10MB (configurable), rename to `audit.{n}.jsonl`, keep last 5
- `getRecentEntries()`: read file, parse last N lines (for future Config UI)
- Types file: `src/audit/types.ts`

### 4. Permission Middleware (`src/graphql/permission-middleware.ts`)

**Purpose**: Apollo Server plugin that intercepts resolver execution and checks permissions.

**Design**:
- Apollo Server 3 plugin using `requestDidStart` → `willResolveField` lifecycle
- Maps resolver field names to service IDs:
  - `eventLogs` → `eventlog`
  - `fileSearch` → `filesearch`
  - Service management queries (`services`, `health`, `service`) → no permission check (always allowed)
  - Config mutations (`enableService`, `setPermissionLevel`, etc.) → no permission check (admin operations)
- On denial: throw `GraphQLError` with `extensions: { code: 'PERMISSION_DENIED' }`

**Implementation notes**:
- Uses Apollo Server 3 plugin API (`ApolloServerPlugin`)
- Resolver-to-service mapping defined as a static config object
- Only checks data-access resolvers (eventLogs, fileSearch), not admin/meta queries
- Must be registered in Apollo Server constructor: `plugins: [permissionPlugin]`

### 5. Config Resolver (`src/graphql/config.resolver.ts`)

**Purpose**: GraphQL mutations and queries for service configuration management.

**Queries**:
- `serviceConfig(serviceId: String!): ServiceConfig!`
- `allServiceConfigs: [ServiceConfig!]!`

**Mutations**:
- `enableService(serviceId: String!): ServiceConfig!`
- `disableService(serviceId: String!): ServiceConfig!`
- `setPermissionLevel(serviceId: String!, level: PermissionLevel!): ServiceConfig!`
- `setPiiAnonymization(serviceId: String!, enabled: Boolean!): ServiceConfig!`
- `resetServiceConfig(serviceId: String!): ServiceConfig!`

**Each mutation**:
1. Validate serviceId exists
2. Read current value (for audit)
3. Apply change to config manager
4. Persist via ConfigStore
5. Log via AuditLogger
6. Return updated ServiceConfig

---

## Components to Modify

### 1. GraphQL Schema (`src/graphql/schema.ts`)

**Add types**:
```graphql
enum PermissionLevel {
  DISABLED
  READ_ONLY
  READ_WRITE
}

type ServiceConfig {
  serviceId: String!
  enabled: Boolean!
  permissionLevel: PermissionLevel!
  enableAnonymization: Boolean!
}
```

**Add to Query**:
```graphql
serviceConfig(serviceId: String!): ServiceConfig!
allServiceConfigs: [ServiceConfig!]!
```

**Add to Mutation**:
```graphql
enableService(serviceId: String!): ServiceConfig!     # Note: shadows existing startService
disableService(serviceId: String!): ServiceConfig!
setPermissionLevel(serviceId: String!, level: PermissionLevel!): ServiceConfig!
setPiiAnonymization(serviceId: String!, enabled: Boolean!): ServiceConfig!
resetServiceConfig(serviceId: String!): ServiceConfig!
```

**Note**: The existing `startService`/`stopService` mutations handle lifecycle (starting/stopping processes). The new `enableService`/`disableService` mutations handle permissions (allowing/blocking operations). These are distinct concepts — a service can be running but disabled from a permissions perspective.

### 2. Resolvers (`src/graphql/resolvers.ts`)

**Add config resolver composition**:
```typescript
import { configResolver } from './config.resolver';

// In createResolvers():
Query: {
  ...resolvers.Query,
  ...configResolver.Query,    // ADD
},
Mutation: {
  ...resolvers.Mutation,
  ...configResolver.Mutation, // ADD
},
```

### 3. EventLog Resolver (`src/graphql/eventlog.resolver.ts`)

**Add defense-in-depth check** at the start of the `eventLogs` resolver:
```typescript
const permCheck = context.permissionChecker.check('eventlog', 'read');
if (!permCheck.allowed) {
  throw new EventLogGraphQLError(
    'Permission denied',
    EventLogErrorCode.PermissionDenied,
    permCheck.reason
  );
}
```

### 4. FileSearch Resolver (`src/graphql/filesearch.resolver.ts`)

**Same pattern** as EventLog — add permission check at resolver entry.

### 5. EventLog ConfigManager (`src/services/eventlog/config.ts`)

**Change defaults**:
- `enabled`: `true` → `false` (secure by default)
- `permissionLevel`: `'read-only'` → `'disabled'` (secure by default)

### 6. FileSearch ConfigManager (`src/services/filesearch/config.ts`)

**Same default changes** as EventLog.

### 7. Server Setup (`src/server.ts`)

**Add to initialization sequence**:
1. Create `ConfigStore` and load persisted config
2. Apply loaded config to config managers (or use secure defaults)
3. Create `AuditLogger` instance
4. Create `PermissionChecker` with config manager registry
5. Add permission plugin to Apollo Server config
6. Add `permissionChecker`, `configStore`, `auditLogger` to Apollo context

### 8. GraphQL Types (`src/graphql/types.ts`)

**Add TypeScript types** for new GraphQL types and resolver context additions:
- `GQLServiceConfig`, `GQLPermissionLevel`
- Extend resolver context type with `permissionChecker`, `configStore`, `auditLogger`

---

## Data Flow

### Query with Permission Check

```
Client → GraphQL query (eventLogs)
  → Permission Middleware: check('eventlog', 'read')
    → PermissionChecker reads EventLogConfigManager
    → allowed: true (if enabled + read-only or read-write)
  → EventLog Resolver: defense-in-depth check (same PermissionChecker)
  → EventLog Provider: execute query
  → PII Anonymizer: filter results
  → Response to client
```

### Configuration Change

```
Client → GraphQL mutation (setPermissionLevel)
  → Config Resolver:
    1. Read current value from ConfigManager
    2. Validate new value
    3. Update ConfigManager
    4. ConfigStore.save() → atomic write to JSON file
    5. AuditLogger.log() → append to JSONL file
    6. Return updated ServiceConfig
```

### Startup Sequence

```
Server start
  → ConfigStore.load() → read JSON file (or null if missing)
  → If null: secure defaults (all services disabled)
  → Apply config to EventLogConfigManager
  → Apply config to FileSearchConfigManager
  → AuditLogger.log(action: 'startup', source: 'startup-defaults')
  → Create PermissionChecker with config manager references
  → Create Apollo Server with permission plugin
  → Server ready
```

---

## API Changes

### New GraphQL Types

| Type | Fields |
|------|--------|
| `PermissionLevel` (enum) | `DISABLED`, `READ_ONLY`, `READ_WRITE` |
| `ServiceConfig` (type) | `serviceId`, `enabled`, `permissionLevel`, `enableAnonymization` |

### New GraphQL Queries

| Query | Args | Returns |
|-------|------|---------|
| `serviceConfig` | `serviceId: String!` | `ServiceConfig!` |
| `allServiceConfigs` | — | `[ServiceConfig!]!` |

### New GraphQL Mutations

| Mutation | Args | Returns |
|----------|------|---------|
| `enableService` | `serviceId: String!` | `ServiceConfig!` |
| `disableService` | `serviceId: String!` | `ServiceConfig!` |
| `setPermissionLevel` | `serviceId: String!, level: PermissionLevel!` | `ServiceConfig!` |
| `setPiiAnonymization` | `serviceId: String!, enabled: Boolean!` | `ServiceConfig!` |
| `resetServiceConfig` | `serviceId: String!` | `ServiceConfig!` |

### Existing Mutations (unchanged)

`startService`, `stopService`, `restartService`, `registerService` remain unchanged. These manage service lifecycle (process start/stop), not permissions.

---

## File System Changes

### New Files

| File | Purpose | Est. Lines |
|------|---------|------------|
| `src/security/permission-checker.ts` | Permission enforcement logic | ~80 |
| `src/security/types.ts` | Shared security types | ~30 |
| `src/security/__tests__/permission-checker.test.ts` | Unit tests | ~250 |
| `src/config/config-store.ts` | JSON config persistence | ~150 |
| `src/config/__tests__/config-store.test.ts` | Unit tests | ~300 |
| `src/audit/audit-logger.ts` | JSONL audit logging with rotation | ~180 |
| `src/audit/types.ts` | Audit entry types | ~30 |
| `src/audit/__tests__/audit-logger.test.ts` | Unit tests | ~250 |
| `src/graphql/permission-middleware.ts` | Apollo plugin for permission checks | ~80 |
| `src/graphql/__tests__/permission-middleware.test.ts` | Unit tests | ~200 |
| `src/graphql/config.resolver.ts` | Config query/mutation resolvers | ~200 |
| `src/graphql/__tests__/config.resolver.test.ts` | Unit tests | ~350 |

### Modified Files

| File | Changes |
|------|---------|
| `src/graphql/schema.ts` | Add PermissionLevel enum, ServiceConfig type, config queries/mutations |
| `src/graphql/resolvers.ts` | Compose config resolver |
| `src/graphql/eventlog.resolver.ts` | Add defense-in-depth permission check |
| `src/graphql/filesearch.resolver.ts` | Add defense-in-depth permission check |
| `src/graphql/types.ts` | Add GQL types, extend resolver context |
| `src/services/eventlog/config.ts` | Change defaults to disabled |
| `src/services/filesearch/config.ts` | Change defaults to disabled |
| `src/server.ts` | Add ConfigStore, AuditLogger, PermissionChecker init; add plugin |

### New Directories

| Directory | Purpose |
|-----------|---------|
| `src/security/` | Permission checking module |
| `src/security/__tests__/` | Tests |
| `src/audit/` | Audit logging module |
| `src/audit/__tests__/` | Tests |

---

## Security Considerations

1. **Defense-in-depth**: Permissions checked at two layers (middleware + resolver). If middleware is bypassed (e.g., resolver called directly in tests), per-service checks still enforce.

2. **Secure defaults**: All services disabled on first run. Config file absence = maximum security.

3. **Error message sanitization**: Permission denied errors return generic messages. Internal reasons logged but not exposed to GraphQL clients.

4. **Config file permissions**: File mode `0o600` attempted on Unix. On Windows, rely on NTFS ACLs (outside our control).

5. **Corrupt file handling**: Corrupted config file renamed (not deleted), secure defaults applied. Prevents attacker from crafting a corrupt file to unlock services.

6. **Audit trail integrity**: Audit log is append-only JSONL. Rotation preserves history. No delete API exposed.

7. **No authentication on mutations**: Config mutations are not authenticated (deferred to Feature 7). For MVP, this is acceptable since the server is localhost-only.

---

## Testing Strategy

### Unit Tests (~1,350 lines estimated)

**PermissionChecker** (~250 lines):
- All permission level × operation type combinations (6 cases)
- Unknown service ID → denied
- Config manager returns each permission level correctly
- Edge cases: null/undefined service, empty string

**ConfigStore** (~300 lines):
- Save and load round-trip
- Atomic write (verify temp file pattern)
- Missing file → returns null
- Corrupted file → renamed to `.corrupt`, returns null
- Directory creation
- Concurrent saves (last-write-wins)
- Schema version field present

**AuditLogger** (~250 lines):
- Log entry appended correctly (JSONL format)
- Timestamp auto-populated
- Rotation triggered at size threshold
- Old files cleaned up (keep N)
- `getRecentEntries()` returns correct count
- Empty log file handling

**Permission Middleware** (~200 lines):
- Data queries checked (eventLogs, fileSearch)
- Admin queries not checked (services, health, serviceConfig)
- Permission denied returns correct GraphQL error code
- Allowed requests pass through

**Config Resolver** (~350 lines):
- Each mutation updates config manager
- Each mutation triggers ConfigStore.save()
- Each mutation triggers AuditLogger.log()
- Invalid serviceId returns error
- Invalid permission level returns error
- Query returns current config
- allServiceConfigs returns all services

### Integration Tests

- End-to-end: disable service → query → get PERMISSION_DENIED
- End-to-end: enable service → query → get results
- Config persistence: change config → restart → config preserved
- Audit trail: make changes → verify audit entries logged

### Existing Test Updates

- Tests that assume services are enabled by default may need to explicitly enable services
- Add `beforeEach` setup to enable services in existing resolver tests

---

## Dependencies

### No New Dependencies Required

All functionality uses Node.js built-in modules:
- `fs` / `fs/promises` — file I/O (already used by AnonymizationStore)
- `path` — path manipulation (already used)
- `os` — for temp directory fallback (already used)
- `crypto` — not needed (no encryption)

Apollo Server 3 plugin API is already available via `apollo-server-express@^3.13.0`.

---

## Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing tests break due to default change (enabled→disabled) | High | Medium | Update test setup to explicitly enable services; do this change last |
| Apollo Server 3 plugin API limitations | Low | Medium | Plugin API is well-documented; fallback: use Express middleware |
| Config file race condition on concurrent mutations | Low | Low | Atomic writes prevent corruption; last-write-wins is acceptable for single-user |
| Audit log file grows unbounded | Low | Low | Rotation with size limit and max file count |
| Performance impact of permission checks | Very Low | Low | In-memory lookups, <1ms overhead |

---

## Rollout Strategy

### Implementation Order

1. **Security types + PermissionChecker** — foundational, no side effects
2. **ConfigStore** — persistence layer, no side effects until wired in
3. **AuditLogger** — logging layer, no side effects until wired in
4. **Permission Middleware** — Apollo plugin, adds enforcement
5. **Config Resolver** — GraphQL API for config changes
6. **Schema + resolver composition** — wire everything into GraphQL
7. **Defense-in-depth checks** — add per-resolver permission checks
8. **Server integration** — wire ConfigStore, AuditLogger, PermissionChecker into startup
9. **Default changes** — change config manager defaults to disabled (breaking change for tests)
10. **Test updates** — fix existing tests that assume enabled-by-default
11. **Integration tests** — end-to-end validation

### Backward Compatibility

- Existing GraphQL queries continue to work (subject to permission checks)
- Existing mutations (`startService`, `stopService`) unchanged
- New mutations use different names to avoid conflicts
- Config file is optional — system works without it (secure defaults)

---

## Success Metrics

- [ ] All 6 permission level × operation combinations tested
- [ ] Config file survives restart (round-trip test)
- [ ] Disabled service returns `PERMISSION_DENIED` error
- [ ] Audit log contains entries for all config changes
- [ ] >80% code coverage on all new modules
- [ ] 100% coverage on PermissionChecker logic
- [ ] No existing tests broken (or updated to pass)
- [ ] <1ms overhead for permission checks (benchmark test)

---

## Open Questions

1. **Mutation naming**: The new `enableService`/`disableService` mutations shadow the concept of the existing `startService`/`stopService`. Should we rename the new ones to `enableServicePermissions`/`disableServicePermissions` for clarity?

2. **Config file location**: Default to `./config/sysmcp-config.json` (project-relative) or `%APPDATA%\SysMCP\config.json` (user-specific)?

3. **Existing test impact**: There are 383+ existing tests. How many assume services are enabled by default? A survey is needed before changing defaults.

---

## Next Steps

1. Run **feature-tasks** skill to break this plan into ordered implementation tasks
2. Survey existing tests for enabled-by-default assumptions
3. Begin implementation with PermissionChecker (no side effects, easy to test)

---

## Document Metadata

- **Feature ID**: 005
- **Title**: Permission Model
- **Created**: 2026-02-10
- **Status**: Plan Complete
- **Spec Reference**: `features/005-permission-model.spec.md`
- **Branch**: `feature/005-permission-model`
