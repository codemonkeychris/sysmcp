# FileSearch MCP Service

Provides file search functionality via the Windows Search Indexer (OLE DB).

## Architecture

```
MCP Client (Claude/Cursor)
    │
    ▼
filesearch-service.ts (MCP tool interface)
    │
    ▼
filesearch.resolver.ts (GraphQL resolver, validation, error mapping)
    │
    ▼
provider.ts (orchestrator: validation → scope check → query → execute → map)
    ├── scope-validator.ts (path restriction enforcement)
    ├── query-builder.ts (SQL generation with injection prevention)
    ├── oledb-executor.ts (OLE DB query execution via node-adodb)
    ├── result-mapper.ts (OLE DB rows → FileSearchEntry)
    └── path-anonymizer.ts (PII anonymization for paths/authors)
```

### Component Files

| File | Purpose |
|------|---------|
| `types.ts` | TypeScript interfaces and enums |
| `config.ts` | Configuration manager (mirrors EventLog pattern) |
| `metrics.ts` | Metrics collector for query performance tracking |
| `scope-validator.ts` | Path scope restriction validator |
| `query-builder.ts` | Windows Search SQL builder with injection prevention |
| `oledb-executor.ts` | Executes SQL via node-adodb OLE DB provider |
| `result-mapper.ts` | Maps OLE DB rows to FileSearchEntry objects |
| `path-anonymizer.ts` | PII anonymization using shared PiiAnonymizer |
| `provider.ts` | Main orchestrator coordinating all components |

## Windows Search OLE DB

Connection string: `Provider=Search.CollatorDSO;Extended Properties='Application=Windows'`

Uses `node-adodb` to execute Windows Search SQL queries against the SystemIndex.

### Key Properties

| Windows Search Property | Maps To |
|------------------------|---------|
| System.ItemPathDisplay | path |
| System.FileName | fileName |
| System.FileExtension | fileType |
| System.Size | size |
| System.DateModified | dateModified |
| System.DateCreated | dateCreated |
| System.Author | author (multi-valued) |
| System.Title | title |
| System.Keywords | tags (multi-valued) |

### Requirements

- Windows 10/11 with Windows Search service (WSearch) running
- OLE DB provider: Search.CollatorDSO
- `node-adodb` npm package

## Development Guide

### Running Tests

```bash
# All FileSearch unit tests
npx jest --no-coverage src/services/filesearch/

# Security tests
npx jest --no-coverage tests/security/

# Specific component
npx jest --no-coverage src/services/filesearch/__tests__/query-builder.test.ts

# With coverage
npx jest --coverage src/services/filesearch/
```

### Key Design Decisions

1. **No parameterized queries**: Windows Search OLE DB doesn't support parameters, so all input sanitization is done manually in `query-builder.ts`
2. **Client-side offset**: Windows Search SQL supports TOP but not OFFSET, so we fetch `TOP (offset + limit + 1)` and skip the first `offset` rows
3. **Shared PII anonymizer**: Uses the same `PiiAnonymizer` from EventLog for consistent user anonymization across services
4. **Defense in depth**: Input validation happens at both GraphQL resolver and provider layers

### Adding New Filters

1. Add parameter to GraphQL schema in `src/graphql/schema.ts`
2. Add to resolver in `src/graphql/filesearch.resolver.ts`
3. Add SQL predicate generation in `query-builder.ts` `buildFilterPredicates()`
4. Add sanitization function if needed
5. Add tests for the new filter

## API Reference

See [API.md](./API.md) for complete GraphQL and MCP tool documentation.
