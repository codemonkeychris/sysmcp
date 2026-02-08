# Feature 002: EventLog MCP - Quick Start Guide

## Overview
This is a comprehensive implementation plan for adding Windows Event Log querying to SysMCP with privacy-preserving PII anonymization. The feature will expose event logs through a GraphQL interface with filtering, pagination, and metrics tracking.

## Task Checklist Quick Links

📋 **Main Tasks Document**: [`/features/002-eventlog-mcp.tasks.md`](./002-eventlog-mcp.tasks.md)  
📊 **Status Tracking**: [`/features/002-eventlog-mcp/status.md`](./status.md)  
📝 **Specification**: [`/features/002-eventlog-mcp.spec.md`](./002-eventlog-mcp.spec.md)  
🏗️ **Technical Plan**: [`/features/002-eventlog-mcp.plan.md`](./002-eventlog-mcp.plan.md)

## How to Use This Document

### For Daily Work
1. Open [`status.md`](./status.md) - tracks what's done, in progress, blocked
2. Update checkboxes as you complete tasks
3. Add notes/blockers in the Issues section
4. Update timestamps for actual start/end dates

### For Task Details
1. Open [`002-eventlog-mcp.tasks.md`](./002-eventlog-mcp.tasks.md)
2. Find your current task (look for unchecked boxes)
3. Read full description, acceptance criteria, test requirements
4. Execute the task
5. Check the box when complete

### For Architecture Questions
1. Consult [`002-eventlog-mcp.plan.md`](./002-eventlog-mcp.plan.md) - technical architecture
2. Consult [`002-eventlog-mcp.spec.md`](./002-eventlog-mcp.spec.md) - requirements

## Key Numbers

- **Total Tasks**: 28
- **Estimated Duration**: 5-6 weeks (4-5 with parallel work)
- **Critical Path Length**: 38 business days
- **Test Coverage Target**: >80%
- **Performance Target**: <100ms per query

## Start Here: Phase 0, Task 0.0

**Task**: EventLog API Research & POC  
**What to do**: 
1. Research Windows EventLog API options (wevtapi.dll vs PowerShell vs EventLogSession)
2. Create working proof-of-concept
3. Document findings and chosen approach
4. Record 10+ events from System log with correct fields

**Time Estimate**: 3 days  
**Acceptance Criteria**: [See tasks.md, Task 0.0]

## Next Steps (After 0.0)

1. Complete Phase 0 (Windows EventLog Library) - Weeks 1-2
2. Complete Phase 1 (SysMCP Integration) - Weeks 2-3
3. Parallel work on Phase 2 & 3 - Weeks 3-4
4. Complete Phase 4 (Metrics) - Week 4
5. Complete Phase 5 (Testing & Docs) - Weeks 4-5

## Parallel Work Opportunities

- **Weeks 3-4**: Phase 2 (Anonymization) and Phase 3 (GraphQL) can run in parallel
- **Week 4**: Tasks 4.0, 4.2 can run in parallel with Phases 2-3
- **Weeks 4-5**: Testing and documentation can run in parallel

With 3 developers working parallel streams, you can reduce timeline to **4-5 weeks**.

## Success Criteria

All 12 specification success criteria must be met:
- [ ] SC-1: GraphQL interface complete
- [ ] SC-2: Data model complete
- [ ] SC-3: Filtering functional
- [ ] SC-4: Pagination working
- [ ] SC-5: All logs accessible
- [ ] SC-6: PII anonymization working
- [ ] SC-7: Configuration support designed
- [ ] SC-8: Metrics tracked
- [ ] SC-9: Error handling complete
- [ ] SC-10: >80% test coverage
- [ ] SC-11: Documentation complete
- [ ] SC-12: No PII in logs/audit trail

## Key Files to Create

### Phase 0 (Library)
- `/src/services/eventlog/lib/wevtapi-bindings.ts`
- `/src/services/eventlog/lib/eventlog-query-engine.ts`
- `/src/services/eventlog/lib/anonymizer.ts`
- `/src/services/eventlog/lib/windows-eventlog-lib.ts`
- `/src/services/eventlog/lib/__tests__/` (test directory)

### Phase 1 (Integration)
- `/src/services/eventlog/provider.ts`
- `/src/services/eventlog/types.ts`

### Phase 2 (Anonymization)
- `/src/services/eventlog/anonymization-store.ts`

### Phase 3 (GraphQL)
- `/src/graphql/resolvers/eventlog.resolver.ts`

### Phase 4 (Metrics & Config)
- `/src/services/eventlog/metrics.ts`
- `/src/services/eventlog/config.ts`

### Phase 5 (Docs)
- Various documentation files (see Phase 5 tasks)

## Git Workflow

```bash
# You should already be on this branch
git checkout feature/002-eventlog-mcp

# When a task is complete
git add .
git commit -m "Task 0.0: EventLog API research & POC"

# When a phase is complete
git push origin feature/002-eventlog-mcp

# When everything is done
git checkout main
git merge feature/002-eventlog-mcp
git tag v002-eventlog-mcp
git push origin main --tags
```

## Testing Strategy

- **Unit Tests**: >80% coverage for all modules
- **Integration Tests**: Full query pipeline with real event logs
- **Security Tests**: Verify no PII leaks, input validation
- **Performance Tests**: <100ms per query, <500MB memory
- **Load Tests**: 100+ concurrent queries

## Documentation Deliverables

1. API documentation (GraphQL query reference + TypeScript API)
2. Architecture documentation
3. Deployment guide
4. Operations guide
5. Privacy/compliance documentation
6. Code completion report

## Contact & Support

- See specification for technical questions about requirements
- See plan for architectural questions about design
- See tasks for implementation details

## Last Updated

2026-02-03

---

**Ready to start? Begin with Task 0.0 in [tasks.md](./002-eventlog-mcp.tasks.md)**
