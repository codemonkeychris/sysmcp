# Feature 005 — Permission Model: Security Review

**Date**: 2026-02-10
**Reviewer**: Claude Opus 4.6 (security audit)
**Branch**: `feature/005-permission-model`
**Status**: Review complete, fixes pending

---

## CRITICAL

### SEC-001: Permission bypass via unknown permission level values
- **File**: `src/security/permission-checker.ts:75-93`
- **Issue**: `applyPermissionLogic` uses a blacklist pattern. It checks for `'disabled'` and `'read-only'` as special cases, then falls through to `allowed: true` for any other value. If an attacker edits the config file on disk and sets `permissionLevel` to an unrecognized string (e.g. `"admin"`, `"rwx"`, `"foo"`), the logic grants full read+write access.
- **Attack**: Modify `config/sysmcp-config.json` with `"permissionLevel": "anything"` to bypass all permission checks.
- **Fix**: Rewrite as a whitelist. Explicitly allow `'read-write'` for all ops, `'read-only'` for reads only, deny everything else by default.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-002: Admin mutations are completely unauthenticated
- **File**: `src/graphql/permission-middleware.ts:28-45`
- **Issue**: All configuration mutations (`enableService`, `disableService`, `setPermissionLevel`, `setPiiAnonymization`, `resetServiceConfig`) plus service lifecycle mutations (`registerService`, `startService`, `stopService`, `restartService`) are in the `BYPASS_FIELDS` set and require zero authentication. Any client that can reach the GraphQL endpoint can reconfigure the entire permission model.
- **Attack**: `mutation { setPermissionLevel(serviceId: "eventlog", level: READ_WRITE) { permissionLevel } }` followed by `mutation { setPiiAnonymization(serviceId: "eventlog", enabled: false) { enableAnonymization } }` — full compromise.
- **Fix**: Add authentication to admin mutations (API key, token, or localhost-only enforcement). At minimum, gate admin mutations behind a separate auth check.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-003: Middleware fails open on parse error
- **File**: `src/graphql/permission-middleware.ts:50-66`
- **Issue**: `getTopLevelFields` catches all exceptions and returns an empty array `[]`. The middleware loop iterates over an empty array, so no permission checks run. A malformed or unusual GraphQL document that causes field extraction to throw will bypass all permission checks.
- **Attack**: Craft a GraphQL document with unexpected AST structure that triggers an exception in the field parser.
- **Fix**: On parse failure, the middleware must deny the request (fail-closed). Return an error or a sentinel value that triggers denial.
- [x] Fixed
- [x] Test added
- [x] Verified

---

## HIGH

### SEC-004: Defense-in-depth checks silently skipped if checker is null
- **File**: `src/graphql/eventlog.resolver.ts:246`, `src/graphql/filesearch.resolver.ts:122`
- **Issue**: Both resolvers guard with `if (context.permissionChecker)`. If the permission checker fails to initialize or the server context is misconfigured, the defense-in-depth layer is silently bypassed rather than failing safe.
- **Fix**: Make the permission checker mandatory. If it is `null` or `undefined`, throw a hard error and deny the request.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-005: No schema validation on config file load
- **File**: `src/config/config-store.ts:69-89`
- **Issue**: `load()` parses JSON and only checks that `parsed.services` exists, then casts to `PersistedConfig`. No validation of: `version` field, `permissionLevel` values (feeds into SEC-001), `enabled` being actually boolean, extra/unexpected properties, or absurd numeric values. An attacker who can modify the config file can inject arbitrary data trusted by the application.
- **Fix**: Validate all fields on load. Check `permissionLevel` against the known enum. Validate types of `enabled`, `enableAnonymization`, numeric ranges. Reject or sanitize unknown fields.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-006: Config and audit path injection via environment variables
- **File**: `src/config/config-store.ts:53-56`, `src/audit/audit-logger.ts:43-45`
- **Issue**: `SYSMCP_CONFIG_PATH` env var is used without path validation. If an attacker controls environment variables: symlink attack (point to a sensitive file, `save()` overwrites it), path traversal (`../../../../etc/cron.d/malicious`), or read sensitive files (`load()` reads any JSON file). Same issue applies to audit logger path.
- **Fix**: Validate and canonicalize paths. Reject paths outside an expected base directory. Resolve symlinks and check the real path.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-007: Race condition in concurrent config writes
- **File**: `src/config/config-store.ts:108`, `src/graphql/config.resolver.ts`
- **Issue**: Multiple concurrent GraphQL mutations trigger `persistConfig()` -> `configStore.save()` without any locking. Two simultaneous mutations can both read the current state, both write changes, and the second rename overwrites the first (last-write-wins). The temp file name uses millisecond precision, so two writes in the same ms from the same process collide.
- **Fix**: Add a write lock (mutex/semaphore) around `persistConfig` calls, or use an async queue to serialize config writes.
- [x] Fixed
- [x] Test added
- [x] Verified

### SEC-008: GraphQL introspection always enabled
- **File**: `src/server.ts:215`
- **Issue**: `introspection: true` is hardcoded regardless of environment. Attackers can discover the full schema including all mutation names, types, and the exact structure of the permission model. Aids reconnaissance.
- **Fix**: Disable introspection in production. Only enable when `NODE_ENV === 'development'` or via explicit opt-in config.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

---

## MEDIUM

### SEC-009: No rate limiting on any endpoint
- **File**: `src/server.ts`
- **Issue**: No rate limiting on GraphQL queries or mutations. An attacker can spam `enableService`/`disableService` to cause disk I/O exhaustion (each writes config + audit), rapidly toggle PII anonymization to create timing windows where data is exposed, or flood audit logs to trigger rotation and potentially hide entries.
- **Fix**: Add rate limiting middleware (e.g. `express-rate-limit`) for GraphQL endpoint. Consider separate, stricter limits for admin mutations.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-010: Audit log has no integrity protection
- **File**: `src/audit/audit-logger.ts`
- **Issue**: The JSONL audit log is plain text with no checksums, MACs, chain hashing, or tamper detection. An attacker with filesystem access can silently modify, delete, or insert fake audit entries.
- **Fix**: Add per-entry HMAC or chain hashing (each entry includes hash of previous entry). At minimum, document this as a known limitation and recommend external log forwarding.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-011: File permissions silently ignored on Windows
- **File**: `src/config/config-store.ts:114-117`
- **Issue**: `chmod(0o600)` is caught and silently ignored on Windows. The security-sensitive config file is created with default ACLs, potentially readable by other users on the system. This is the primary target platform.
- **Fix**: Use Windows ACL APIs (e.g. `icacls` or a native module) to restrict file access, or document as a known limitation with mitigation guidance.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-012: User input reflected in error messages
- **File**: `src/graphql/config.resolver.ts:140`, `src/security/permission-checker.ts:61`
- **Issue**: `serviceId` is user-controlled input reflected directly into error messages (`Unknown service: ${serviceId}`). While the middleware doesn't expose `reason` in GraphQL responses, if these errors are ever rendered in a web UI without escaping, this becomes an XSS vector.
- **Fix**: Sanitize or truncate `serviceId` in error messages. Consider using a generic message and logging the specific value separately.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-013: Non-atomic enable + permission level change
- **File**: `src/graphql/config.resolver.ts:199-200`
- **Issue**: `enableService` hardcodes permission level to `'read-only'`. There is no way to enable a service at a different level atomically. Between `enableService` and a subsequent `setPermissionLevel` call, the service is active at `read-only` — creating a brief window where the intended state hasn't been applied.
- **Fix**: Allow `enableService` to accept an optional `level` parameter, or provide a combined `configureService` mutation that sets all fields atomically.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-014: Mutable global config singletons
- **File**: `src/services/eventlog/config.ts:296`, `src/services/filesearch/config.ts:168`
- **Issue**: `setConfigManager()` is exported and callable by any code in the process. An attacker (or compromised dependency) could replace the config manager with one that returns `enabled: true, permissionLevel: 'read-write'` to bypass all permission checks.
- **Fix**: Remove or restrict the global setters. Use dependency injection exclusively. If globals are needed for backward compat, freeze after initialization.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

---

## LOW

### SEC-015: NODE_ENV is a weak security boundary for test overrides
- **File**: `src/security/permission-checker.ts:102`
- **Issue**: `process.env.NODE_ENV` is modifiable at runtime by any code in the process. If production code or a dependency sets `NODE_ENV=test`, the test override mechanism becomes available, allowing full permission bypass via `setTestOverrides`.
- **Fix**: Use a compile-time flag or a constructor-injected boolean instead of a runtime env check. Alternatively, strip test override code from production builds entirely.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-016: Inconsistent NODE_ENV guards on test override methods
- **File**: `src/security/permission-checker.ts:111`
- **Issue**: `setTestOverrides` checks `NODE_ENV`, but `clearTestOverrides` does not. While not directly exploitable, this inconsistency suggests the boundary isn't well-enforced.
- **Fix**: Apply the same guard to all test-related methods, or remove the guard entirely and rely on build-time stripping.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

### SEC-017: No CORS configuration
- **File**: `src/server.ts`
- **Issue**: No CORS middleware or headers are configured. If the GraphQL endpoint is accessible from a browser, cross-origin requests could interact with the unauthenticated admin mutations (SEC-002), allowing a malicious website to reconfigure the server.
- **Fix**: Add CORS middleware restricting origins. At minimum, restrict to `localhost` origins only.
- [ ] Fixed
- [ ] Test added
- [ ] Verified

---

## Fix Priority Order

1. **SEC-001** — Permission bypass via unknown levels (critical logic flaw, simple fix)
2. **SEC-003** — Middleware fail-open (critical, simple fix)
3. **SEC-005** — Config file validation (prevents SEC-001 at the load boundary)
4. **SEC-004** — Mandatory permission checker (simple null guard change)
5. **SEC-002** — Admin mutation authentication (larger architectural change, most impactful)
6. **SEC-006** — Path validation (moderate effort)
7. **SEC-007** — Write lock for config persistence (moderate effort)
8. **SEC-008** — Disable introspection in production (one-line change)
9. **SEC-009 through SEC-017** — Remaining medium/low items
