# Feature 002: EventLog MCP (Read-Only) - Specification

**Feature ID**: 002-eventlog-mcp  
**Status**: Specification Complete  
**Created**: 2026-02-02  
**Owner**: Development Team

---

## Overview

Feature 002 enables querying Windows Event Logs through a read-only GraphQL interface, providing end users and system administrators with programmatic access to system events. The feature supports flexible filtering (time range, severity, event ID, source, message content), pagination for large result sets, and privacy-preserving PII anonymization to prevent sensitive user information from appearing in LLM logs.

---

## Goals

- Expose Windows Event Logs as queryable GraphQL resources
- Enable end users and administrators to understand what's happening on their system
- Provide consistent, privacy-preserving anonymization of PII (usernames, computer names, IP addresses)
- Support efficient querying of large event sets through pagination (1K results per page)
- Ensure all standard Windows event logs (System, Security, Application, etc.) are accessible
- Track usage metrics (query count, response time) for monitoring and debugging
- Maintain >80% test coverage with unit, integration, security, and performance tests

---

## User Stories

### Story 1: Query Recent System Events
**As a** system administrator  
**I want to** query recent error events from the System event log  
**So that** I can identify what caused a system issue

### Story 2: Search Events by Message Content
**As a** developer troubleshooting an issue  
**I want to** search event logs for messages containing specific error codes  
**So that** I can correlate system events with application behavior

### Story 3: Filter Events by Time Range
**As an** end user reviewing what happened during a specific timeframe  
**I want to** query events that occurred between two timestamps  
**So that** I can understand system behavior during a particular incident

### Story 4: Paginate Large Result Sets
**As a** developer building a reporting tool  
**I want to** retrieve events 1000 at a time with cursor-based pagination  
**So that** I can efficiently process large event sets without overwhelming memory

### Story 5: Access Different Event Logs
**As a** security analyst  
**I want to** query both Security and System event logs in the same interface  
**So that** I can correlate security events with system behavior

### Story 6: Protect PII in Event Logs
**As a** privacy-conscious user  
**I want to** retrieve event logs without sensitive information (usernames, computer names) being exposed  
**So that** I can share event logs with others or use them in LLM systems without privacy leaks

### Story 7: Monitor Query Performance
**As a** system owner  
**I want to** see metrics about how many queries are being executed and how long they take  
**So that** I can identify performance issues or unusual access patterns

---

## Functional Requirements

### FR-1: GraphQL Query Interface
- Implement a GraphQL query type `eventLogs` that accepts the following arguments:
  - `limit` (Int, default 1000, max 1000): Maximum number of results per page
  - `offset` (Int, default 0): Pagination offset
  - `logName` (String, optional): Filter by event log name (e.g., "System", "Application", "Security")
  - `minLevel` (EventLevel enum, optional): Minimum event severity (ERROR, WARNING, INFO, VERBOSE, DEBUG)
  - `source` (String, optional): Filter by event source
  - `startTime` (DateTime, optional): Start of time range
  - `endTime` (DateTime, optional): End of time range
  - `messageContains` (String, optional): Full-text search in event message

### FR-2: Event Log Entry Data Model
- Return EventLogEntry objects with the following fields (all anonymized if configured):
  - `id` (String): Unique event identifier
  - `timestamp` (DateTime): When the event occurred
  - `level` (EventLevel): Severity level (ERROR, WARNING, INFO, VERBOSE, DEBUG)
  - `source` (String): Source of the event (e.g., "Application", "EventLog")
  - `eventId` (Int): Windows event ID
  - `username` (String): User account associated with event (PII-anonymized)
  - `computername` (String): Computer name (PII-anonymized)
  - `message` (String): Event message text (PII-anonymized)

### FR-3: Pagination Support
- Implement cursor-based pagination with:
  - `pageInfo` object containing:
    - `hasNextPage` (Boolean): Whether more results exist
    - `hasPreviousPage` (Boolean): Whether previous results exist
    - `startCursor` (String): Cursor for start of current page
    - `endCursor` (String): Cursor for end of current page
  - `totalCount` (Int): Total number of results matching query
  - Support offset-based pagination as fallback (via limit/offset parameters)

### FR-4: Event Log Access
- Support querying all standard Windows event logs:
  - System
  - Application
  - Security (if accessible)
  - And any other standard logs available on the system
- If a log is inaccessible due to permissions:
  - Log the permission denial for audit trail
  - If the permission denial results in an empty set: return an error
  - Otherwise: return partial results with additional information about the error
  - Do not fail catastrophically

### FR-5: Filtering
- Support filtering by:
  - **Time Range**: `startTime` and `endTime` (inclusive)
  - **Severity/Level**: `minLevel` filters to events >= specified level
  - **Event ID**: Return events matching specified event ID
  - **Source**: Exact match on event source
  - **Message Content**: Case-insensitive substring search in message
- Filters are AND-ed together (all must match)
- If a filter matches nothing, return empty results (not an error)

### FR-6: PII Anonymization
- Implement consistent PII anonymization for the following fields:
  - **Username**: Replace domain\username with domain\[ANON_USER_1], [ANON_USER_2], etc. (consistent across queries)
  - **Computer Name**: Replace with [ANON_COMPUTER_1], [ANON_COMPUTER_2], etc.
  - **IP Addresses**: Replace with [ANON_IP_1], [ANON_IP_2], etc. (both IPv4 and IPv6)
  - **Message Content**: Scan message for embedded PII patterns (usernames, IPs, email addresses) and anonymize
- Use consistent hashing to ensure the same PII token always maps to the same identifier
- This consistency allows users to reverse-engineer anonymization on their side for reporting

### FR-7: Configuration State
- Support configuration state to enable/disable the EventLog service:
  - **Hardcoded for MVP**: Service is always enabled
  - **Design for Future**: Architecture should support future Config UI disabling via configuration
  - Store configuration state in persistent configuration storage (Future Feature 5)

### FR-8: Metrics Tracking
- Track and report the following metrics:
  - Query count: Total number of eventLog queries executed
  - Response time: Measured execution time for each query (start to finish)
  - Results returned: Number of results returned for each query
  - Store metrics in a way that supports batch reporting
  - Include metric data in response metadata (if possible)

### FR-9: Error Handling & Validation
- Validate all input parameters:
  - `limit` must be between 1 and 1000
  - `offset` must be >= 0
  - `startTime` must be <= `endTime` (if both provided)
  - Return clear GraphQL errors for invalid inputs
- Handle Windows API errors gracefully:
  - Log detailed error information internally
  - Return generic error messages to clients (no system details leaked)
  - Never throw unhandled exceptions; always return valid GraphQL response

---

## Non-Functional Requirements

### NFR-1: Performance
- EventLog queries should complete in <100ms for typical result sets (100-1000 results)
- Pagination should not require re-querying from the beginning
- Support efficient filtering at the Windows API level (not post-filtering if possible)

### NFR-2: Scalability
- Handle event logs with millions of entries
- Memory usage should not exceed 500MB for typical queries
- Support pagination to prevent loading entire result sets into memory

### NFR-3: Reliability
- Handle Windows API failures gracefully (permission denied, log not found, service unavailable)
- Never crash or cause unhandled exceptions to propagate to GraphQL clients
- Log all errors for debugging and audit purposes

### NFR-4: Security
- All inputs validated before use
- No SQL injection or command injection vulnerabilities
- PII anonymization applied consistently before returning to client
- Audit trail of all queries (timestamp, parameters, results count)

### NFR-5: Testability
- Minimum 80% code coverage (line and branch)
- All components mockable for unit testing
- Integration tests for GraphQL queries
- Security-focused tests for PII anonymization
- Performance tests for large result sets

### NFR-6: Maintainability
- Code organized into logical modules:
  - EventLog query provider
  - PII anonymization engine
  - GraphQL schema and resolvers
  - Error handling and validation
- Each module <300 lines
- Clear separation of concerns
- Comprehensive inline documentation for non-obvious logic

---

## Constraints & Limitations

### C-1: Windows API Limitations
- Windows EventLog API has specific capabilities and limitations (to be investigated during planning)
- Some event logs may not be accessible depending on user permissions
- Event log size can be very large; efficiency depends on API filtering capabilities

### C-2: PII Anonymization Consistency
- To support user-side de-anonymization, all queries must use the same anonymization mapping
- This requires maintaining state of previously anonymized PII tokens across queries
- Implementation must ensure consistency even if service restarts

### C-3: Permission Boundaries
- The service runs with the permissions of the user who started it
- Some event logs (especially Security) may require elevated privileges
- Graceful degradation required when logs are inaccessible

### C-4: MVP Scope
- Configuration state is hardcoded to "enabled" for MVP
- Future Config UI integration will allow users to disable the service
- Write operations (clearing, archiving logs) explicitly out of scope

---

## Out of Scope

The following items are explicitly out of scope for Feature 002:

- **Write Operations**: Clearing, archiving, or modifying event logs
- **Real-Time Streaming**: WebSocket-based event streaming as events occur
- **Custom Event Log Channels**: Support limited to standard Windows event logs
- **Complex Analytics**: Aggregations, statistics, or trend analysis queries
- **Integration with Other Services**: Other MCPs are separate features
- **Event Log Management**: Rotation, backup, retention policies
- **Advanced Security**: RBAC, multi-user approval workflows (future features)

---

## Success Criteria

- [ ] **SC-1: GraphQL Interface Complete**: `eventLogs` query fully implemented with all parameters
- [ ] **SC-2: Data Model Complete**: All EventLogEntry fields populated and tested
- [ ] **SC-3: Filtering Functional**: All filter types (time, level, source, message) work correctly
- [ ] **SC-4: Pagination Working**: Cursor-based pagination supports large result sets
- [ ] **SC-5: All Logs Accessible**: System, Application, Security, and other standard logs queryable
- [ ] **SC-6: PII Anonymization Working**: Usernames, computer names, IPs anonymized consistently
- [ ] **SC-7: Configuration Support**: Designed for future Config UI integration (hardcoded enabled for MVP)
- [ ] **SC-8: Metrics Tracked**: Query count and response time tracked per query
- [ ] **SC-9: Error Handling**: All errors handled gracefully without crashes
- [ ] **SC-10: Test Coverage >80%**: Unit tests (filtering, pagination, PII), integration tests (GraphQL), security tests (anonymization), performance tests (large sets)
- [ ] **SC-11: Documentation Complete**: Code documented, GraphQL schema documented, deployment guide included
- [ ] **SC-12: No PII in Logs**: Verify that sensitive information does not appear in LLM logs or audit trails

---

## Questions for Design Review

1. **Windows API Investigation**: Should we use the Windows EventLog API directly or PowerShell cmdlets? What are the trade-offs in terms of performance, flexibility, and error handling?

2. **Anonymization Key Management**: How should we store and manage the anonymization token mapping to ensure consistency across service restarts? Should this be:
   - Persisted to disk (SQLite, JSON file)?
   - Kept in memory with dump/restore on shutdown?
   - Derived from a seed so it's reproducible?

3. **Batch Metrics**: Should metrics be tracked in real-time or accumulated and flushed periodically? Where should metrics be stored (in-memory, database, log file)?

4. **Message Content Filtering**: Should `messageContains` search only in the main message field, or also in structured event data fields?

5. **Permission Denied Handling**: For logs that are partially accessible (some entries visible, some denied), should we:
   - Return all accessible entries with a warning?
   - Return an error and none of the results?
   - Return results with a note that some were filtered?

6. **Log Size Limits**: Should we impose limits on how far back in event history queries can search to prevent performance issues?

7. **Timezone Handling**: Should `startTime` and `endTime` accept timezone information, or assume the system's local timezone?

---

## Next Steps

1. **Specification Approval**: Review this specification with stakeholders and confirm no changes needed
2. **Feature Planning**: Run the `feature-plan` skill to create a detailed technical implementation plan
   - Research Windows EventLog API capabilities and limitations
   - Design anonymization token management strategy
   - Plan module structure and data models
   - Identify dependencies and risks
3. **Task Breakdown**: Run the `feature-tasks` skill to break the plan into ordered implementation tasks
4. **Implementation**: Begin implementation following the technical plan and tasks

---

## Document Metadata

- **Specification Version**: 1.0
- **Created**: 2026-02-02
- **Last Updated**: 2026-02-02
- **Stakeholders**: Development Team, Project Lead
- **Related Documents**: 
  - `/features/plan.md` - Project overall plan
  - `/features/001-mcp-host-bootstrap.spec.md` - MCP Host specification (dependency)
- **Approval Status**: Pending Review
