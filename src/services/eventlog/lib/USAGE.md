# EventLog Library - Usage Guide

The `@sysmcp/eventlog-lib` library provides a TypeScript interface for querying Windows Event Logs using PowerShell's `Get-WinEvent` cmdlet.

## Installation

```bash
npm install @sysmcp/eventlog-lib
```

Or for local development:

```bash
cd src/services/eventlog/lib
npm install
npm run build
```

## Basic Usage

### Import and Initialize

```typescript
import { EventLogLibrary } from '@sysmcp/eventlog-lib';

const library = new EventLogLibrary();
```

### Query System Event Log

```typescript
const result = await library.queryEventLog({
  logName: 'System',
  maxResults: 100
});

if (result.success) {
  console.log(`Found ${result.entries.length} events`);
  result.entries.forEach(entry => {
    console.log(`${entry.timeCreated} [${entry.levelDisplayName}] ${entry.message}`);
  });
} else {
  console.error(`Query failed: ${result.errorMessage}`);
}
```

## API Reference

### EventLogLibrary

Main class for querying Windows Event Logs.

#### Methods

**`queryEventLog(options: EventLogQueryOptions): Promise<EventLogResult>`**

Query event logs with optional filters.

Parameters:
- `options.logName?: string` - Name of the event log (default: 'System')
- `options.maxResults?: number` - Maximum events to return (default: unlimited, max 10,000)
- `options.level?: string` - Filter by level: VERBOSE, INFORMATION, WARNING, ERROR, CRITICAL
- `options.eventId?: number` - Filter by specific event ID
- `options.providerId?: string` - Filter by provider name
- `options.startTime?: Date` - Filter events after this time (not yet implemented)
- `options.endTime?: Date` - Filter events before this time (not yet implemented)
- `options.userId?: string` - Filter by user ID (not yet implemented)

Returns: `EventLogResult`
```typescript
{
  success: boolean;
  entries: EventLogEntry[];
  totalCount?: number;
  errorMessage?: string;
}
```

Example:
```typescript
const result = await library.queryEventLog({
  logName: 'Application',
  level: 'ERROR',
  maxResults: 50
});
```

**`getAvailableLogs(): Promise<string[]>`**

Get list of all available event logs on the system.

Returns: Promise<string[]> - Array of log names like ['System', 'Application', 'Security']

Example:
```typescript
const logs = await library.getAvailableLogs();
console.log('Available logs:', logs.join(', '));
```

**`dispose(): Promise<void>`**

Cleanup resources (currently no-op but provided for future extensions).

Example:
```typescript
await library.dispose();
```

### EventLogEntry

Interface representing a single event log entry.

```typescript
interface EventLogEntry {
  id: number;                    // Record ID
  logName: string;               // Event log name (System, Application, etc.)
  providerName: string;          // Provider/source name
  eventId: number;               // Event ID
  levelDisplayName: string;      // VERBOSE, INFORMATION, WARNING, ERROR, CRITICAL
  message: string;               // Event message
  timeCreated: Date;             // Event timestamp
  userId?: string;               // User account
  computerName?: string;         // Computer name
  [key: string]: any;            // Additional properties
}
```

## Advanced Usage

### Filter by Event Level

```typescript
// Get all errors and critical events
const result = await library.queryEventLog({
  logName: 'System',
  level: 'ERROR',
  maxResults: 100
});
```

### Filter by Provider

```typescript
// Get events from a specific provider
const result = await library.queryEventLog({
  logName: 'Application',
  providerId: 'MyApplication',
  maxResults: 50
});
```

### Filter by Event ID

```typescript
// Get specific event type
const result = await library.queryEventLog({
  logName: 'System',
  eventId: 1000,
  maxResults: 25
});
```

### Combine Filters

```typescript
// Get error events from specific provider
const result = await library.queryEventLog({
  logName: 'Application',
  level: 'ERROR',
  providerId: 'MyApp',
  maxResults: 50
});
```

## Error Handling

The library returns structured error information in `EventLogResult`:

```typescript
const result = await library.queryEventLog({ logName: 'NonExistent' });

if (!result.success) {
  if (result.errorMessage?.includes('Permission')) {
    console.error('Access denied - may need admin privileges');
  } else if (result.errorMessage?.includes('not found')) {
    console.error('Event log not found');
  } else if (result.errorMessage?.includes('timeout')) {
    console.error('Query timed out');
  } else {
    console.error(`Query failed: ${result.errorMessage}`);
  }
}
```

### Common Error Scenarios

1. **Permission Denied** - Occurs when querying Security log without admin privileges
   ```typescript
   // Solution: Run with admin or use a different log
   const result = await library.queryEventLog({ logName: 'Application' });
   ```

2. **Invalid Log Name** - Occurs when log doesn't exist
   ```typescript
   // Solution: Check available logs first
   const logs = await library.getAvailableLogs();
   ```

3. **Query Timeout** - Occurs if query takes longer than 30 seconds
   ```typescript
   // Solution: Reduce maxResults or add more specific filters
   const result = await library.queryEventLog({
     logName: 'System',
     maxResults: 50  // Reduce from default
   });
   ```

## Performance Characteristics

- **Query Performance**: ~100-420ms depending on result size
- **Typical**: 10 events in <200ms, 100 events in <500ms
- **Startup**: No initialization overhead (stateless design)
- **Memory**: Minimal overhead, results freed after processing

## Exported Types and Classes

```typescript
// Main class
export class EventLogLibrary { ... }

// Interfaces
export interface EventLogEntry { ... }
export interface EventLogQueryOptions { ... }
export interface EventLogResult { ... }

// Utilities (advanced use)
export class PowerShellExecutor { ... }
export class EventLogAdapter { ... }
```

## Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm test -- --coverage
```

Run integration tests (requires real event logs):
```bash
ENABLE_INTEGRATION_TESTS=1 npm test
```

## Limitations

1. **PowerShell Startup** - Each query spawns a new PowerShell process (~100ms overhead)
2. **Date Range Filtering** - startTime/endTime not yet implemented in PowerShell command
3. **Security Log** - Requires admin privileges to access
4. **Message Filtering** - Message content search not yet implemented
5. **Result Caching** - No caching layer (each query executes fresh)

## Future Enhancements

- [ ] PSSession pooling to reduce startup overhead
- [ ] Date range filtering support
- [ ] Message content search
- [ ] Result caching layer
- [ ] Performance metrics collection
- [ ] Batch operations

## Troubleshooting

**"Permission denied" errors**
- Solution: Run as Administrator

**Empty results when expecting events**
- Check the log name with `getAvailableLogs()`
- Increase `maxResults` to see if events exist
- Add specific filters (level, eventId) to verify filtering works

**"Query timed out"**
- Reduce `maxResults`
- Add more specific filters to reduce scope
- Check system performance

**PowerShell not found**
- Ensure Windows PowerShell 5.0+ or PowerShell Core is installed
- Verify PowerShell is in system PATH

## License

MIT

## See Also

- [Main EventLog Service Documentation](./README.md)
- [SysMCP Project](../../../README.md)
