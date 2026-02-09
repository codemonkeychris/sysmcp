# Extension Guide: Adding New Services to SysMCP

This guide explains how to add new system resource services to SysMCP and expose them through the MCP protocol.

## Architecture Overview

SysMCP uses a plugin-based architecture for extensibility:

```
MCP Client (Claude, Cursor)
         ↓
   Protocol Handler
         ↓
   Service Manager
         ↓
    [Services]
    ├─ EventLog ✅
    ├─ FileSearch (TODO)
    ├─ Registry (TODO)
    └─ Custom...
```

Each service implements the `IService` interface and provides:
1. Tool definitions (name, description, schema)
2. Tool execution logic
3. Error handling and validation

## Creating a New Service

### Step 1: Implement IService Interface

Create a new service file: `src/services/your-service/mcp-service.ts`

```typescript
import { IService, ToolDefinition, ToolResult } from '../shared/service-interface';

export class YourService implements IService {
  readonly id = 'your_service';
  readonly name = 'Your Service Name';
  readonly version = '1.0.0';
  private enabled = true;

  constructor() {
    // Initialize service
  }

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'your_service_action',
        description: 'Perform an action',
        inputSchema: {
          type: 'object' as const,
          properties: {
            param1: {
              type: 'string',
              description: 'First parameter'
            }
          },
          required: ['param1']
        }
      }
    ];
  }

  async callTool(toolName: string, params: unknown): Promise<ToolResult> {
    switch (toolName) {
      case 'your_service_action':
        return await this.handleAction(params);
      default:
        return {
          success: false,
          error: {
            code: 'ToolNotFound',
            message: `Tool ${toolName} not found`
          }
        };
    }
  }

  private async handleAction(params: unknown): Promise<ToolResult> {
    try {
      // Validate params (cast to specific type)
      const typedParams = params as { param1: string };

      // Execute action
      const result = await this.performAction(typedParams.param1);

      // Return MCP-formatted result
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ToolExecutionError',
          message: `Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  private async performAction(param1: string): Promise<unknown> {
    // Implement actual functionality
    return { param1, status: 'completed' };
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
```

### Step 2: Define IService Interface

If creating the first service of its type, you may need to update the interface: `src/services/shared/service-interface.ts`

```typescript
export interface IService {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  getTools(): ToolDefinition[];
  callTool(toolName: string, params: unknown): Promise<ToolResult>;
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

### Step 3: Register Service with ServiceManager

Update the MCP server startup code to register your service:

```typescript
import { ServiceManager } from './service-manager';
import { YourService } from '../services/your-service/mcp-service';

const serviceManager = new ServiceManager();

// Register your service
const yourService = new YourService();
serviceManager.registerService(yourService);

// Add more services...
const eventlogService = new EventLogMcpService();
serviceManager.registerService(eventlogService);
```

### Step 4: Create Comprehensive Tests

Create test file: `src/services/your-service/__tests__/mcp-service.test.ts`

```typescript
import { YourService } from '../mcp-service';

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    service = new YourService();
  });

  describe('Service Interface', () => {
    it('implements IService interface', () => {
      expect(service.id).toBe('your_service');
      expect(service.name).toBeDefined();
      expect(service.version).toBeDefined();
      expect(service.isEnabled()).toBe(true);
    });

    it('returns tools', () => {
      const tools = service.getTools();
      expect(tools).toBeDefined();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('your_service_action tool', () => {
    it('executes successfully', async () => {
      const result = await service.callTool('your_service_action', {
        param1: 'test_value'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('returns error for invalid params', async () => {
      const result = await service.callTool('your_service_action', {
        param1: 123 // Should be string
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error for unknown tool', async () => {
      const result = await service.callTool('nonexistent_tool', {});

      expect(result.success).toBe(false);
      expect((result.error?.code as string).includes('ToolNotFound')).toBe(true);
    });
  });

  describe('Service Control', () => {
    it('can be disabled', () => {
      service.disable();
      expect(service.isEnabled()).toBe(false);

      service.enable();
      expect(service.isEnabled()).toBe(true);
    });
  });
});
```

## Tool Definition Best Practices

### Schema Design

Use detailed JSON Schema for input validation:

```typescript
{
  name: 'your_service_query',
  description: 'Query system resources with filters',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query'
      },
      limit: {
        type: 'number',
        description: 'Max results (1-10000)',
        minimum: 1,
        maximum: 10000
      },
      filters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' }
        },
        required: ['name']
      }
    },
    required: ['query']
  }
}
```

### Error Handling

Always wrap operations in try-catch:

```typescript
async callTool(toolName: string, params: unknown): Promise<ToolResult> {
  try {
    const typedParams = params as { [key: string]: unknown };

    // Validate parameters
    if (!typedParams.requiredParam) {
      return {
        success: false,
        error: {
          code: 'InvalidParams',
          message: 'Missing required parameter: requiredParam'
        }
      };
    }

    // Execute
    const result = await this.executeOperation(typedParams);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'ToolExecutionError',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}
```

### Response Format

Always return consistent ToolResult format:

```typescript
// Success
{
  success: true,
  data: {
    // Your data here
    items: [],
    count: 0,
    metadata: {}
  }
}

// Error
{
  success: false,
  error: {
    code: 'ErrorCode',
    message: 'Human-readable error message',
    details: { /* additional context */ }
  }
}
```

## Tool Naming Convention

Tool names should follow the pattern: `{service_id}_{action}`

Examples:
- `eventlog_query` (service: eventlog, action: query)
- `fs_search` (service: fs, action: search)
- `reg_read` (service: reg, action: read)

This enables automatic routing from tool name to service.

## Performance Considerations

### Caching

Implement caching for expensive operations:

```typescript
private cache = new Map<string, { data: unknown; timestamp: number }>();
private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async getCachedData(key: string): Promise<unknown> {
  const cached = this.cache.get(key);
  if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
    return cached.data;
  }

  const data = await this.fetchData(key);
  this.cache.set(key, { data, timestamp: Date.now() });
  return data;
}
```

### Timeout Handling

Always implement operation timeouts:

```typescript
async executeWithTimeout(
  operation: Promise<unknown>,
  timeoutMs: number = 30000
): Promise<unknown> {
  return Promise.race([
    operation,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
}
```

### Memory Management

Be mindful of memory with large result sets:

```typescript
async * queryLargeDataset(params: unknown): AsyncGenerator<unknown> {
  // Yield results incrementally instead of building array
  let offset = 0;
  while (true) {
    const batch = await this.fetchBatch(offset, 1000);
    if (batch.length === 0) break;
    
    for (const item of batch) {
      yield item;
    }
    offset += batch.length;
  }
}
```

## Integration Example: FileSearch Service

Here's a complete example of adding a file search service:

```typescript
// src/services/filesearch/mcp-service.ts
import { IService, ToolDefinition, ToolResult } from '../shared/service-interface';
import { promises as fs } from 'fs';
import * as path from 'path';

export class FileSearchService implements IService {
  readonly id = 'filesearch';
  readonly name = 'File Search';
  readonly version = '1.0.0';
  private enabled = true;

  getTools(): ToolDefinition[] {
    return [
      {
        name: 'filesearch_search',
        description: 'Search for files by name or pattern',
        inputSchema: {
          type: 'object' as const,
          properties: {
            pattern: {
              type: 'string',
              description: 'File name pattern to search for'
            },
            directory: {
              type: 'string',
              description: 'Root directory to search in (default: current directory)'
            },
            recursive: {
              type: 'boolean',
              description: 'Search recursively (default: true)'
            },
            maxResults: {
              type: 'number',
              description: 'Maximum results to return (default: 100, max: 1000)'
            }
          },
          required: ['pattern']
        }
      }
    ];
  }

  async callTool(toolName: string, params: unknown): Promise<ToolResult> {
    switch (toolName) {
      case 'filesearch_search':
        return await this.searchFiles(params);
      default:
        return {
          success: false,
          error: {
            code: 'ToolNotFound',
            message: `Tool ${toolName} not found`
          }
        };
    }
  }

  private async searchFiles(params: unknown): Promise<ToolResult> {
    try {
      const {
        pattern,
        directory = process.cwd(),
        recursive = true,
        maxResults = 100
      } = params as {
        pattern: string;
        directory?: string;
        recursive?: boolean;
        maxResults?: number;
      };

      if (!pattern) {
        return {
          success: false,
          error: {
            code: 'InvalidParams',
            message: 'pattern is required'
          }
        };
      }

      const results = await this.findFiles(
        directory,
        pattern,
        recursive,
        maxResults
      );

      return {
        success: true,
        data: {
          pattern,
          directory,
          results,
          count: results.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ToolExecutionError',
          message: error instanceof Error ? error.message : 'Search failed'
        }
      };
    }
  }

  private async findFiles(
    dir: string,
    pattern: string,
    recursive: boolean,
    maxResults: number
  ): Promise<string[]> {
    const results: string[] = [];
    const regex = new RegExp(pattern);

    const search = async (currentDir: string): Promise<void> => {
      if (results.length >= maxResults) return;

      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) return;

        if (regex.test(entry.name)) {
          results.push(path.join(currentDir, entry.name));
        }

        if (entry.isDirectory() && recursive) {
          await search(path.join(currentDir, entry.name));
        }
      }
    };

    await search(dir);
    return results;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
```

## Testing Your Service

### Unit Tests

```bash
npm test -- src/services/your-service/__tests__/
```

### Integration Tests

```bash
npm test -- src/mcp/__tests__/e2e-integration.test.ts
```

### Manual Testing

```typescript
const service = new YourService();
const result = await service.callTool('your_service_action', {
  param1: 'test'
});
console.log(result);
```

## Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug node dist/index.js
```

This logs:
- Service registration
- Tool discovery
- Tool execution details
- Errors and validation failures

## Common Patterns

### Pagination

```typescript
{
  limit: 100,
  offset: 0,
  nextOffset: 100,
  hasMore: true
}
```

### Filtering

```typescript
{
  filters: {
    type: 'string',
    level: 'ERROR'
  }
}
```

### Async Operations

Always return promises:

```typescript
async callTool(toolName: string, params: unknown): Promise<ToolResult> {
  // Always async
}
```

## Security Best Practices

1. **Input Validation**: Always validate and sanitize inputs
2. **Error Messages**: Don't expose system details in error messages
3. **Access Control**: Check permissions before operations
4. **Type Safety**: Use TypeScript strict mode
5. **No Shell**: Never invoke shell commands
6. **Sandboxing**: Consider isolation for untrusted operations

## Deployment

After implementing your service:

1. Add unit tests (>80% coverage)
2. Update integration tests
3. Add documentation to docs/TOOLS.md
4. Create PR with tests passing
5. Deploy with code review

## Troubleshooting

### Service not appearing in tools/list

- Verify service is registered in ServiceManager
- Check that getTools() returns non-empty array
- Verify service.isEnabled() returns true

### Tool execution fails

- Check parameter types match schema
- Verify error handling in callTool
- Enable debug logging to see details
- Check validation results

### Performance issues

- Profile async operations
- Check for blocking I/O
- Implement caching where appropriate
- Monitor memory usage

## Related Documentation

- [MCP Protocol Documentation](./MCP-PROTOCOL.md)
- [Tools Documentation](./TOOLS.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
