# SysMCP Project Plan

## Executive Summary

**SysMCP** is a system service that exposes Windows OS capabilities (EventLog, FileSearch, and future services) via MCP (Model Context Protocol) endpoints, with privacy-preserving PII anonymization and write-operation approval workflows. The system consists of two components: a Node.js MCP host with GraphQL endpoints, and a web-based configuration UI accessible via a systray icon.

**Core Vision**: Users can `git clone` → `npm install` → `npm start`, and the system auto-detects changes, rebuilds, and restarts services. On-device or network-accessible LLMs can query system data with full audit trails and user-controlled privacy settings.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Windows System                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐              ┌──────────────────┐   │
│  │   MCP Host       │  (HTTP/WS)   │  Config UI       │   │
│  │  (Node.js)       │◄────────────►│  (Web-based)     │   │
│  │                  │              │  [Systray Icon]  │   │
│  ├──────────────────┤              └──────────────────┘   │
│  │ • GraphQL Server │              Spawns: Chrome→       │
│  │ • EventLog MCP   │              localhost:5000         │
│  │ • FileSearch MCP │                                     │
│  │ • Permission     │              ┌──────────────────┐   │
│  │   & PII Filtering│              │  Audit Logger    │   │
│  │ • Write Buffer   │              │  Config Storage  │   │
│  └──────────────────┘              └──────────────────┘   │
│          │                                                 │
│          └─────────────────────────────────────────────────┤
│        Queries Windows API                                 │
│        (EventLog, Windows Search, Registry)               │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

**MCP Host (Port 3000, GraphQL)**
- Exposes `/graphql` endpoint
- Hosts EventLog and FileSearch MCPs
- Implements permission checking and PII anonymization
- Buffers write operations (future)
- Maintains audit log
- Auto-detects git changes via file watcher and restarts

**Config UI (Port 5000, Web-based)**
- React/Vue frontend
- Systray icon that opens Chrome to `http://localhost:5000`
- Communicates with MCP Host via HTTP/WebSocket for live updates
- Displays:
  - Service status
  - Configuration panels
  - Write operation approval queue
  - Audit logs
  - Settings (PII filter, permissions)

---

## Feature Set

### Phase 1: MVP (Initial Release)

#### Feature 1: MCP Host Bootstrap
- Node.js server that listens on port 3000
- GraphQL endpoint at `/graphql`
- Service lifecycle management
- File watcher for git changes + auto-restart
- Basic logging

#### Feature 2: EventLog MCP (Read-Only)
- GraphQL queries for Windows Event Logs
- Filtering: time range, severity, event ID, source, message content
- Pagination support (1K results per page)
- All event logs accessible (System, Security, Application, etc.)
- PII anonymization on Username, Computer, IP addresses
- Metrics: query count, response time

#### Feature 3: FileSearch MCP (Read-Only)
- GraphQL queries for Windows Indexed Search
- Filtering: filename patterns (glob), metadata, date/size
- Pagination support (500 results per page)
- Metadata only (no file contents)
- PII anonymization on file paths containing user profiles
- Metrics: search count, response time

#### Feature 4: PII Anonymization Engine ✅ COMPLETE
- ✅ Identifier recognition: usernames, IPs, file paths, domains, emails, computer names (7 PII types)
- ✅ Anonymization strategy: consistent SHA-256 hashing (one-way by design for stronger security)
- ✅ Global toggle in settings: PII-locked vs. PII-exposed (per-service config managers)
- ✅ Per-service audit trail of when PII was accessed (metrics collectors + resolver logging)
- ✅ Centralized engine (`PiiAnonymizer`) shared by EventLog and FileSearch services
- ✅ Persistent mapping for consistency across restarts (`AnonymizationStore`)
- Note: Reversible de-anonymization was deliberately omitted in favor of one-way hashing (stronger security posture)
- Implemented incrementally during Features 2 and 3

#### Feature 5: Permission Model
- Service-level toggle: enabled/disabled
- Operation-level setting: read-only vs. read-write (future-ready, read-only for now)
- Per-service audit log entry
- Persistent configuration storage (JSON or SQLite)

#### Feature 6: Config UI (Web-based)
- Systray icon that spawns Chrome to `http://localhost:5000`
- Dashboard: service status indicators
- Configuration panel: enable/disable services, toggle PII filter
- Permission settings: read-only vs. read-write per service
- Audit log viewer with filtering
- Write operation approval queue (empty for MVP)
- Responsive design (works on 1366x768 and up)

#### Feature 7: Authentication & TLS
- TLS support for GraphQL endpoint
- API key or OAuth token-based authentication
- Configuration for network-accessible deployments
- Secure credential storage (environment variables or encrypted config)

#### Feature 8: Audit Logging
- Comprehensive audit log: all queries, permission changes, PII access
- Timestamped entries with user context (if applicable)
- Persistent storage (SQLite or JSON file)
- Queryable via Config UI

---

## Data Models & API Contracts

### EventLog MCP GraphQL Schema (Draft)

```graphql
type EventLogEntry {
  id: String!
  timestamp: DateTime!
  level: EventLevel!
  source: String!
  eventId: Int!
  username: String!  # Anonymized if PII-locked
  computername: String!  # Anonymized if PII-locked
  message: String!
}

type EventLogResult {
  entries: [EventLogEntry!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Query {
  eventLogs(
    limit: Int = 1000
    offset: Int = 0
    logName: String
    minLevel: EventLevel
    source: String
    startTime: DateTime
    endTime: DateTime
    messageContains: String
  ): EventLogResult!
}

enum EventLevel {
  ERROR
  WARNING
  INFO
  VERBOSE
  DEBUG
}
```

### FileSearch MCP GraphQL Schema (Draft)

```graphql
type FileSearchResult {
  path: String!  # Anonymized if PII-locked
  size: Int!
  modifiedTime: DateTime!
  createdTime: DateTime!
  fileType: String!
}

type FileSearchResults {
  files: [FileSearchResult!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type Query {
  fileSearch(
    query: String!  # Windows search syntax
    limit: Int = 500
    offset: Int = 0
    fileType: String
    minSize: Int
    maxSize: Int
    modifiedAfter: DateTime
    modifiedBefore: DateTime
  ): FileSearchResults!
}
```

### Config UI API (HTTP/WebSocket)

```
GET /api/services
  → List of services with status and configuration

POST /api/services/{id}/toggle
  → Enable/disable a service

POST /api/settings/pii-filter
  → Toggle PII filter on/off

GET /api/audit-log
  → Fetch audit log entries with filtering

WS /api/live-updates
  → WebSocket for real-time status updates
```

---

## Implementation Workplan

### Phase 1: MVP

- [ ] **Task 1.1**: Project scaffolding (Node.js + TypeScript)
  - Initialize npm project
  - Set up TypeScript configuration
  - Create directory structure (/src/host, /src/ui, /src/services, /tests)
  - Add build and start scripts

- [ ] **Task 1.2**: MCP Host bootstrap
  - Create Express server on port 3000
  - Set up Apollo GraphQL endpoint at /graphql
  - Implement basic service lifecycle (start/stop/restart)
  - Add logging and error handling

- [ ] **Task 1.3**: EventLog MCP service
  - Implement EventLog query logic using Windows EventLog API
  - Create GraphQL schema (draft above)
  - Add filtering: time, level, source, message
  - Implement pagination

- [ ] **Task 1.4**: FileSearch MCP service
  - Implement Windows Search integration
  - Create GraphQL schema (draft above)
  - Add filtering: file type, size, date
  - Implement pagination

- [x] **Task 1.5**: PII Anonymization engine ✅ (completed during Features 2 & 3)
  - ✅ Identifier recognition patterns (username, IP, file path, domain, email, computer name)
  - ✅ Consistent SHA-256 hashing anonymization
  - ✅ Global PII-filter toggle (per-service config managers)
  - ✅ Persistent mapping via AnonymizationStore
  - Note: De-anonymization omitted by design (one-way hashing for stronger security)

- [ ] **Task 1.6**: Permission model
  - Implement service enable/disable toggle
  - Create permission checker (defer write-level checks to Phase 2)
  - Persistent configuration storage (JSON file)

- [ ] **Task 1.7**: Audit logging system
  - Create audit log schema
  - Log all queries, permission changes, PII access
  - Implement persistent storage (SQLite or JSON)
  - Add timestamps and metadata

- [ ] **Task 1.8**: Authentication & TLS
  - Add TLS certificate support
  - Implement API key or OAuth token validation
  - Secure credential storage (environment variables)

- [ ] **Task 1.9**: Config UI backend (Node server)
  - Expose /api/services, /api/settings, /api/audit-log
  - Implement WebSocket for live updates
  - Connect to MCP Host for configuration changes

- [ ] **Task 1.10**: Config UI frontend (React/Vue)
  - Build dashboard component (service status)
  - Build configuration panel
  - Build audit log viewer
  - Build settings panel
  - Add systray integration (spawn Chrome)

- [ ] **Task 1.11**: Auto-restart on git changes
  - File watcher on repository
  - Trigger rebuild when files change
  - Graceful service restart

- [ ] **Task 1.12**: Testing & Documentation
  - Unit tests for EventLog, FileSearch, PII filtering
  - Integration tests for GraphQL queries
  - API documentation
  - User guide for deployment

---

## Key Design Decisions

### 1. Anonymization Strategy
**Decision**: Consistent hashing with opt-in de-anonymization
- **Why**: Allows LLMs to correlate data (e.g., "User1" appears in multiple logs) while protecting PII
- **Trade-off**: Requires client-side storage of hashes; can't perfectly hide PII if client is compromised
- **Alternative considered**: Full redaction (less useful for analysis)

### 2. Process Architecture
**Decision**: Separate MCP Host and Config UI processes
- **Why**: Isolation, resilience, easier testing
- **Trade-off**: Slightly more complex IPC
- **Alternative considered**: Single process (simpler, but shared memory)

### 3. Technology Stack
**Decision**: Node.js + Apollo GraphQL + React/Vue + Express
- **Why**: Fast development, good ecosystem, web-native for UI
- **Trade-off**: Not as performant as Rust/C++; requires Node runtime
- **Alternative considered**: C# for MCP Host (better Windows integration)

### 4. Network Access
**Decision**: TLS + API key authentication, network-accessible
- **Why**: Flexible deployment, cloud LLMs can query
- **Trade-off**: Higher security responsibility
- **Alternative considered**: Localhost-only (more secure but less flexible)

---

## Deployment & DevOps

### Local Development
```
git clone <repo>
npm install
npm start
```

### Auto-Update
1. Git file watcher detects changes
2. Rebuilds services
3. Gracefully restarts processes
4. LLM clients auto-reconnect

### Production Deployment
- systemd service (Linux) or Windows Service (Windows)
- TLS certificates (Let's Encrypt or self-signed)
- API key configuration via environment variables
- Audit log stored in SQLite for persistence

---

## Security Considerations

### Current Threats & Mitigations
1. **Unauthorized Access**: TLS + API key authentication
2. **PII Exposure**: Anonymization engine + audit trail
3. **Injection Attacks**: Input validation on all GraphQL queries
4. **Privilege Escalation**: Runs as user (not elevated) by default
5. **Data Breaches**: Audit log for forensics; reversible hashing for client-side de-anonymization

### Future Enhancements
1. **Write Operation Buffering**: User approval workflow
2. **Rate Limiting**: Prevent abuse
3. **IP Whitelisting**: For network-accessible deployments
4. **Fine-grained Permissions**: Per-service, per-operation controls

---

## Success Criteria (MVP)

- [ ] User can `git clone` → `npm install` → `npm start` with zero config
- [ ] EventLog queries return anonymized results with PII toggle
- [ ] FileSearch queries work with pagination
- [ ] Config UI accessible via systray icon
- [ ] Service auto-restarts on git changes
- [ ] Audit log captures all relevant events
- [ ] >80% test coverage on security-critical code
- [ ] TLS + authentication working end-to-end
- [ ] Documentation sufficient for contributors

---

## Open Questions / Future Phases

### Phase 2: Write Operations
- Write buffer and approval workflow
- Per-operation permission model (yes/deny/allow-for-1hr)
- Registry and file modification MCPs

### Phase 3: Advanced Features
- Custom MCP services (user-provided plugins)
- Performance metrics dashboard
- Machine learning integration for threat detection
- Multi-user approval workflows

### Phase 4: Production
- Docker containerization
- Kubernetes deployment
- Advanced RBAC (Role-Based Access Control)
- Encryption at rest for audit logs

---

## Next Steps

1. **Validate this plan** with stakeholders
2. **Create feature specifications** using the `feature-spec` skill for each Phase 1 task
3. **Begin implementation** with Task 1.1 (Project Scaffolding)
4. **Establish test coverage** goals and CI/CD pipeline

---

## Document Metadata

- **Created**: 2026-02-02
- **Version**: 0.1 (Draft)
- **Status**: Ready for validation
- **Owner**: Project Lead
- **Last Updated**: 2026-02-02
