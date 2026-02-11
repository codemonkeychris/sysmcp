# Feature 005: Permission Model — Implementation Tasks

## Spec Reference
`features/005-permission-model.spec.md`

## Plan Reference
`features/005-permission-model.plan.md`

---

## Phase 1: Security Foundation (Tasks 1.0–1.2)

### Task 1.0: Security Types & PermissionChecker ✅
**FR**: FR-1, FR-9 | **Critical Path**: Yes | **Depends on**: None

**Create**:
- `src/security/types.ts` — Shared security types
- `src/security/permission-checker.ts` — PermissionChecker with test override support
- `src/security/__tests__/permission-checker.test.ts` — Unit tests

**Deliverables**:
- `OperationType` type (`'read' | 'write'`)
- `PermissionCheckResult` interface (`{ allowed, reason? }`)
- `TestOverride` interface (`{ enabled?, permissionLevel? }`)
- `PermissionChecker` interface and `PermissionCheckerImpl` class
- Service-to-config-manager registry (map of serviceId → config getter)
- `check(serviceId, operation)` method with full permission logic
- `setTestOverrides()` — only works when `NODE_ENV === 'test'`, throws otherwise
- `clearTestOverrides()` — resets to normal behavior

**Acceptance Criteria**:
- [ ] `disabled` service denies all operations
- [ ] `read-only` service allows reads, denies writes
- [ ] `read-write` service allows all operations
- [ ] Unknown serviceId returns denied
- [ ] Test overrides take precedence over config manager values
- [ ] `setTestOverrides()` throws when `NODE_ENV !== 'test'`
- [ ] `clearTestOverrides()` restores config-manager-based behavior
- [ ] 100% coverage on permission logic
- [ ] All tests pass

---

### Task 1.1: Test Helpers ✅
**FR**: FR-9 | **Critical Path**: Yes | **Depends on**: Task 1.0

**Create**:
- `src/security/test-helpers.ts` — Test utilities for permission overrides

**Deliverables**:
- `enableAllServicesForTest(checker)` — enables all known services in `read-only` mode
- `enableServiceForTest(checker, serviceId, level?)` — enables specific service with optional level
- `disableServiceForTest(checker, serviceId)` — disables specific service for negative testing
- `resetPermissionsForTest(checker)` — clears all test overrides

**Acceptance Criteria**:
- [ ] `enableAllServicesForTest` enables both `eventlog` and `filesearch`
- [ ] `enableServiceForTest` accepts optional permission level (defaults to `read-only`)
- [ ] `disableServiceForTest` sets service to `disabled`
- [ ] `resetPermissionsForTest` clears all overrides
- [ ] All helpers work within existing test infrastructure
- [ ] Unit tests for all helpers

---

### Task 1.2: ConfigStore (Persistent Configuration) ✅
**FR**: FR-4, FR-5 | **Critical Path**: Yes | **Depends on**: None (parallel with 1.0)

**Create**:
- `src/config/config-store.ts` — JSON config persistence
- `src/config/__tests__/config-store.test.ts` — Unit tests

**Deliverables**:
- `PersistedConfig` interface with version, lastModified, services map
- `ConfigStoreImpl` class with `load()`, `save()`, `exists()` methods
- Atomic write pattern (temp file + rename, matching AnonymizationStore)
- Configurable path via `SYSMCP_CONFIG_PATH` env var
- Auto-create directory if missing
- Corrupt file handling: rename to `.corrupt.{timestamp}`, return null
- File mode `0o600` on Unix

**Acceptance Criteria**:
- [ ] Save + load round-trip preserves all config fields
- [ ] Missing file returns `null` (no error thrown)
- [ ] Corrupted JSON file renamed to `.corrupt.{timestamp}`, returns `null`
- [ ] Directory auto-created when missing
- [ ] Atomic writes (no partial file on crash)
- [ ] Schema version field present in saved files
- [ ] Human-readable JSON (2-space indent)
- [ ] >80% code coverage

---

## Phase 2: Audit & Middleware (Tasks 2.0–2.1)

### Task 2.0: AuditLogger ✅
**FR**: FR-7 | **Critical Path**: No (can parallel with 2.1) | **Depends on**: None

**Create**:
- `src/audit/types.ts` — Audit entry types
- `src/audit/audit-logger.ts` — JSONL audit logging with rotation
- `src/audit/__tests__/audit-logger.test.ts` — Unit tests

**Deliverables**:
- `AuditAction` type (`service.enable`, `service.disable`, `permission.change`, `pii.toggle`, `config.reset`)
- `AuditEntry` interface (timestamp, action, serviceId, previousValue, newValue, source)
- `AuditLoggerImpl` class with `log()` and `getRecentEntries()` methods
- JSONL format (one JSON object per line)
- File rotation when exceeding configurable size (default 10MB)
- Keep last N rotated files (default 5)
- Configurable path (default `./logs/audit.jsonl`)

**Acceptance Criteria**:
- [ ] Log entries appended in JSONL format
- [ ] Timestamp auto-populated as ISO 8601
- [ ] `getRecentEntries(count)` returns correct number of entries
- [ ] Rotation triggers when file exceeds size threshold
- [ ] Old rotated files cleaned up (only keep N)
- [ ] Empty/missing log file handled gracefully
- [ ] >80% code coverage

---

### Task 2.1: Permission Middleware (Apollo Plugin) ✅
**FR**: FR-2 | **Critical Path**: Yes | **Depends on**: Task 1.0

**Create**:
- `src/graphql/permission-middleware.ts` — Apollo Server plugin
- `src/graphql/__tests__/permission-middleware.test.ts` — Unit tests

**Deliverables**:
- Apollo Server 3 plugin using `requestDidStart` lifecycle
- Static resolver-to-service mapping:
  - `eventLogs` → `eventlog`
  - `fileSearch` → `filesearch`
  - `services`, `health`, `service`, `serviceConfig`, `allServiceConfigs` → no check
  - Config mutations → no check (admin operations)
- On denial: throw `GraphQLError` with `extensions: { code: 'PERMISSION_DENIED' }`
- Generic error messages (no system internals exposed)
- Factory function: `createPermissionPlugin(permissionChecker)`

**Acceptance Criteria**:
- [ ] `eventLogs` query checked against `eventlog` service permissions
- [ ] `fileSearch` query checked against `filesearch` service permissions
- [ ] Admin/meta queries (`services`, `health`, `serviceConfig`) bypass checks
- [ ] Config mutations bypass permission checks
- [ ] Denied requests return `PERMISSION_DENIED` error code
- [ ] Error messages do not expose internal details
- [ ] Allowed requests pass through to resolver
- [ ] >80% code coverage

---

## Phase 3: GraphQL API (Tasks 3.0–3.2)

### Task 3.0: GraphQL Schema Extensions ✅
**FR**: FR-6 | **Critical Path**: Yes | **Depends on**: None (parallel with Phase 2)

**Modify**:
- `src/graphql/schema.ts` — Add new types, queries, and mutations
- `src/graphql/types.ts` — Add TypeScript types

**Deliverables**:
- `PermissionLevel` GraphQL enum: `DISABLED`, `READ_ONLY`, `READ_WRITE`
- `ServiceConfig` GraphQL type: `serviceId`, `enabled`, `permissionLevel`, `enableAnonymization`
- New Query fields: `serviceConfig(serviceId)`, `allServiceConfigs`
- New Mutation fields: `enableService`, `disableService`, `setPermissionLevel`, `setPiiAnonymization`, `resetServiceConfig`
- TypeScript types: `GQLServiceConfig`, `GQLPermissionLevel`
- Extended resolver context type with `permissionChecker`, `configStore`, `auditLogger`

**Acceptance Criteria**:
- [ ] Schema compiles without errors (buildSchema validation)
- [ ] All new types have GraphQL descriptions
- [ ] New queries and mutations have parameter descriptions
- [ ] TypeScript types match GraphQL schema
- [ ] Existing schema unchanged (backward compatible)
- [ ] Schema tests pass

---

### Task 3.1: Config Resolver ✅
**FR**: FR-6, FR-7, FR-8 | **Critical Path**: Yes | **Depends on**: Tasks 1.0, 1.2, 2.0, 3.0

**Create**:
- `src/graphql/config.resolver.ts` — Config query and mutation resolvers
- `src/graphql/__tests__/config.resolver.test.ts` — Unit tests

**Deliverables**:
- Query: `serviceConfig(serviceId)` → reads from config manager, returns `ServiceConfig`
- Query: `allServiceConfigs` → returns configs for all known services
- Mutation: `enableService` → sets enabled=true, permission=read-only, persists, audits
- Mutation: `disableService` → sets enabled=false, permission=disabled, persists, audits
- Mutation: `setPermissionLevel` → validates level, updates config, persists, audits
- Mutation: `setPiiAnonymization` → updates anonymization toggle, persists, audits
- Mutation: `resetServiceConfig` → resets to secure defaults, persists, audits
- Each mutation: validate serviceId → read current → apply → persist → audit → return
- Error handling: invalid serviceId, invalid permission level

**Acceptance Criteria**:
- [ ] Each mutation updates the correct config manager
- [ ] Each mutation calls `ConfigStore.save()`
- [ ] Each mutation calls `AuditLogger.log()` with correct action, previousValue, newValue
- [ ] `enableService` sets `enabled=true` and `permissionLevel='read-only'`
- [ ] `disableService` sets `enabled=false` and `permissionLevel='disabled'`
- [ ] Invalid serviceId returns descriptive error
- [ ] Invalid permission level returns descriptive error
- [ ] `serviceConfig` query returns current config for known service
- [ ] `allServiceConfigs` returns all known services
- [ ] `resetServiceConfig` restores secure defaults
- [ ] >80% code coverage

---

### Task 3.2: Resolver Composition ✅
**FR**: FR-6 | **Critical Path**: Yes | **Depends on**: Task 3.1

**Modify**:
- `src/graphql/resolvers.ts` — Compose config resolver into main resolvers

**Deliverables**:
- Import `configResolver` from `./config.resolver`
- Spread `configResolver.Query` into `Query` object
- Spread `configResolver.Mutation` into `Mutation` object

**Acceptance Criteria**:
- [ ] `serviceConfig` query accessible via GraphQL
- [ ] `allServiceConfigs` query accessible via GraphQL
- [ ] All 5 config mutations accessible via GraphQL
- [ ] Existing queries and mutations unchanged
- [ ] No TypeScript compilation errors

---

## Phase 4: Defense-in-Depth & Server Integration (Tasks 4.0–4.1)

### Task 4.0: Per-Resolver Permission Checks ✅
**FR**: FR-3 | **Critical Path**: Yes | **Depends on**: Task 1.0

**Modify**:
- `src/graphql/eventlog.resolver.ts` — Add permission check at resolver entry
- `src/graphql/filesearch.resolver.ts` — Add permission check at resolver entry

**Deliverables**:
- At start of `eventLogs` resolver: `permissionChecker.check('eventlog', 'read')`
- At start of `fileSearch` resolver: `permissionChecker.check('filesearch', 'read')`
- On denied: throw service-specific GraphQL error with `PERMISSION_DENIED` code
- Use existing `EventLogGraphQLError` / `FileSearchGraphQLError` classes
- Read `permissionChecker` from resolver context

**Acceptance Criteria**:
- [ ] Disabled eventlog service returns `PERMISSION_DENIED` from resolver
- [ ] Disabled filesearch service returns `PERMISSION_DENIED` from resolver
- [ ] Enabled services pass through to normal execution
- [ ] Error uses existing error code enum values
- [ ] Permission check is first operation in resolver (before validation)
- [ ] Existing resolver tests updated or still pass

---

### Task 4.1: Server Integration ✅
**FR**: FR-4, FR-5, FR-8 | **Critical Path**: Yes | **Depends on**: Tasks 1.0, 1.2, 2.0, 2.1, 3.2, 4.0

**Modify**:
- `src/server.ts` — Wire all new components into startup sequence

**Deliverables**:
- Create `ConfigStore` instance in `setupRoutes()`
- Call `ConfigStore.load()` on startup
- Apply loaded config to `EventLogConfigManager` and `FileSearchConfigManager` (or use secure defaults if null)
- Create `AuditLogger` instance
- Create `PermissionCheckerImpl` with config manager registry
- Add permission plugin to Apollo Server constructor: `plugins: [createPermissionPlugin(permissionChecker)]`
- Add `permissionChecker`, `configStore`, `auditLogger` to Apollo context factory
- Log startup config source (persisted file vs secure defaults)

**Acceptance Criteria**:
- [ ] Server starts successfully with no config file (secure defaults)
- [ ] Server starts successfully with valid config file (loaded correctly)
- [ ] Server starts successfully with corrupted config file (secure defaults, file renamed)
- [ ] Config managers populated from persisted config on startup
- [ ] Permission middleware active for all GraphQL requests
- [ ] Context includes `permissionChecker`, `configStore`, `auditLogger`
- [ ] Build succeeds (`npm run build`)

---

## Phase 5: Secure Defaults & Test Updates (Tasks 5.0–5.1)

### Task 5.0: Change Config Manager Defaults ✅
**FR**: FR-5 | **Critical Path**: Yes | **Depends on**: Tasks 1.1, 4.1

**Modify**:
- `src/services/eventlog/config.ts` — Change defaults to disabled
- `src/services/filesearch/config.ts` — Change defaults to disabled

**Deliverables**:
- `EventLogConfigManager` default `enabled`: `true` → `false`
- `EventLogConfigManager` default `permissionLevel`: `'read-only'` → `'disabled'`
- `FileSearchConfigManager` default `enabled`: `true` → `false`
- `FileSearchConfigManager` default `permissionLevel`: `'read-only'` → `'disabled'`

**Acceptance Criteria**:
- [ ] New `EventLogConfigManager()` has `enabled === false`
- [ ] New `EventLogConfigManager()` has `permissionLevel === 'disabled'`
- [ ] New `FileSearchConfigManager()` has `enabled === false`
- [ ] New `FileSearchConfigManager()` has `permissionLevel === 'disabled'`
- [ ] Config manager unit tests updated to reflect new defaults

---

### Task 5.1: Update Existing Tests ✅
**FR**: FR-9 | **Critical Path**: Yes | **Depends on**: Tasks 1.1, 5.0

**Modify**:
- Existing test files that assume services are enabled by default

**Deliverables**:
- Survey all test files that rely on services being enabled
- Add `enableAllServicesForTest()` or `enableServiceForTest()` in `beforeEach` or test setup
- Update config manager tests to reflect new disabled defaults
- Verify all 383+ existing tests pass

**Acceptance Criteria**:
- [ ] All existing tests pass with new disabled defaults
- [ ] Test helpers used consistently (no ad-hoc config manager manipulation)
- [ ] No test relies on implicit enabled-by-default behavior
- [ ] `npm test` passes with 0 failures
- [ ] Code coverage does not decrease

---

## Phase 6: Integration Testing (Task 6.0)

### Task 6.0: Integration Tests ✅
**FR**: All | **Critical Path**: No | **Depends on**: All previous tasks

**Create**:
- `src/security/__tests__/permission-integration.test.ts` — End-to-end integration tests

**Deliverables**:
- **Permission enforcement**: disable service → query → get `PERMISSION_DENIED`
- **Permission grant**: enable service → query → get results
- **Config persistence**: change config via mutation → verify file written → reload → config preserved
- **Audit trail**: make multiple changes → verify all entries in audit log
- **Defense-in-depth**: verify both middleware and resolver-level checks deny disabled services
- **Secure startup**: no config file → all services disabled
- **Corrupt recovery**: corrupt config file → server starts with defaults → file renamed

**Acceptance Criteria**:
- [ ] All integration test scenarios pass
- [ ] Tests exercise full stack (GraphQL → middleware → resolver → provider)
- [ ] Tests verify persistence (write file, read back)
- [ ] Tests verify audit log entries
- [ ] Tests verify secure defaults on first run
- [ ] >80% overall coverage maintained

---

## Task Dependencies

```
Task 1.0 (PermissionChecker) ─┬─→ Task 1.1 (Test Helpers) ─→ Task 5.0 (Default Changes) ─→ Task 5.1 (Test Updates)
                               ├─→ Task 2.1 (Middleware)
                               ├─→ Task 4.0 (Defense-in-Depth)
                               └─→ Task 3.1 (Config Resolver)

Task 1.2 (ConfigStore) ────────┬─→ Task 3.1 (Config Resolver)
                                └─→ Task 4.1 (Server Integration)

Task 2.0 (AuditLogger) ────────┬─→ Task 3.1 (Config Resolver)
                                └─→ Task 4.1 (Server Integration)

Task 3.0 (Schema) ─────────────→ Task 3.1 (Config Resolver) ─→ Task 3.2 (Composition) ─→ Task 4.1 (Server Integration)

Task 4.0 (Defense-in-Depth) ───→ Task 4.1 (Server Integration)

Task 4.1 (Server Integration) ─→ Task 5.0 (Default Changes)

Task 5.1 (Test Updates) ───────→ Task 6.0 (Integration Tests)
```

---

## Critical Path

```
Task 1.0 → Task 1.1 → Task 3.1 → Task 3.2 → Task 4.1 → Task 5.0 → Task 5.1 → Task 6.0
```

This is the longest dependency chain. Tasks 1.2, 2.0, 2.1, 3.0, and 4.0 can be done in parallel to reduce wall-clock time.

---

## Parallel Work Opportunities

| Parallel Group | Tasks | Notes |
|---|---|---|
| **Group A** (Foundation) | 1.0 + 1.2 + 2.0 + 3.0 | All independent, can be done simultaneously |
| **Group B** (Middleware) | 2.1 + 4.0 | Both depend only on 1.0 |
| **Group C** (API) | 3.1 | Depends on 1.0, 1.2, 2.0, 3.0 — wait for Group A |
| **Group D** (Wiring) | 3.2, 4.1 | Sequential after Group C |
| **Group E** (Defaults) | 5.0, 5.1 | Sequential, must be last code changes |
| **Group F** (Validation) | 6.0 | Final step |

---

## Risk Mitigation

| Risk | Task(s) Affected | Mitigation |
|---|---|---|
| Existing tests break from default change | 5.0, 5.1 | Test helpers (1.1) built early; defaults changed last |
| Apollo plugin API doesn't support field-level interception | 2.1 | Fallback: check at request level using operation name parsing |
| Config file race conditions | 1.2, 3.1 | Atomic writes + last-write-wins (acceptable for single-user) |
| Audit log grows unbounded | 2.0 | Rotation built into initial implementation |
| New mutations conflict with existing `startService`/`stopService` | 3.0, 3.1 | Different names, different concepts (permissions vs lifecycle) |

---

## Notes

- **No new npm dependencies** required — all functionality uses Node.js built-ins + existing Apollo Server 3 APIs
- **Estimated total new code**: ~1,100 lines source + ~1,750 lines tests = ~2,850 lines
- **Estimated modified files**: 8 existing files with surgical changes
- **Test mode (FR-9)** is the key enabler for the default change — build it early, use it everywhere
- The `enableService`/`disableService` mutations are about **permissions** (can this service respond to queries?), distinct from `startService`/`stopService` which are about **lifecycle** (is the service process running?)

---

## Document Metadata

- **Feature ID**: 005
- **Title**: Permission Model
- **Created**: 2026-02-10
- **Status**: Tasks Defined
- **Total Tasks**: 12 (Tasks 1.0–6.0)
- **Spec**: `features/005-permission-model.spec.md`
- **Plan**: `features/005-permission-model.plan.md`
- **Branch**: `feature/005-permission-model`
