# FileSearch MCP Service

Provides file search functionality via the Windows Search Indexer (OLE DB).

## Architecture

- `types.ts` - TypeScript interfaces and enums
- `config.ts` - Configuration manager (mirrors EventLog pattern)
- `metrics.ts` - Metrics collector for query performance tracking
- `scope-validator.ts` - Path scope restriction validator
- `query-builder.ts` - Translates parameters to Windows Search SQL
- `oledb-executor.ts` - Executes SQL via node-adodb OLE DB provider
- `result-mapper.ts` - Maps OLE DB rows to FileSearchEntry objects
- `path-anonymizer.ts` - PII anonymization for file paths and authors
- `provider.ts` - Main provider orchestrating all components
- `mcp-service.ts` - IService implementation for MCP integration

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
