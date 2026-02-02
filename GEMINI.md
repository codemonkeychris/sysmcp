# Gemini Instructions for SysMCP

This file provides detailed guidance for Google Gemini working on the SysMCP codebase. Reference `.github/copilot-instructions.md` for architecture and `AGENTS.md` for coordination with other AI assistants.

## Feature Development Skills

When working on a new feature, use the three reusable skills in order:

1. **`feature-spec` skill** - Start here with a feature idea
   - Asks clarifying questions to flesh out the design
   - Creates specification document
   - Creates git feature branch
   
2. **`feature-plan` skill** - After spec is approved
   - Researches codebase and architecture
   - Creates detailed technical implementation plan
   - Identifies components and dependencies
   
3. **`feature-tasks` skill** - Before implementation begins
   - Breaks down spec and plan into ordered tasks
   - Creates task checklist with acceptance criteria
   - Identifies critical path and dependencies

Each skill is documented in `/skills/` directory. Use "Run feature-spec skill" to invoke.

## Before Starting Any Task

1. **Review AGENTS.md** - Understand coordination requirements across AI models
2. **Read `.github/copilot-instructions.md`** - Architecture and high-level guidelines
3. **Check `CLAUDE.md`** - Implementation patterns and examples
4. **Examine existing code** - Understand actual patterns in use
5. **Update all affected documentation** - After making changes, update all four instruction files

## Component-Specific Guidance

### EventLog Provider (C# Implementation)

**Pattern**: Inherit from IResourceProvider, implement ExecuteAsync

**Key Requirements**:
- Query using Windows.System.Diagnostics.EventLog API
- Filter results server-side before returning (pagination-ready)
- Apply PII filtering: user names, computer names, application paths
- Support filters: log name, event ID, time range, event level
- Return normalized EventLogEntry objects with filtered data

**Error Handling**:
- Missing event log -> return empty result (not error)
- Access denied -> PermissionDeniedException
- Invalid filter syntax -> ArgumentException with clear message

**Testing Pattern** (C#):

```csharp
[TestClass]
public class EventLogProviderTests
{
    private EventLogProvider _provider;

    [TestInitialize]
    public void Setup() => _provider = new EventLogProvider();

    [TestMethod]
    public async Task ExecuteAsync_QuerySystemLog_ReturnsMaskedUserNames()
    {
        var op = new Operation
        {
            Type = OperationType.Read,
            Filter = new { LogName = "System", MaxResults = 100 }
        };

        var result = await _provider.ExecuteAsync(op, CancellationToken.None);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.Entries.All(e => !e.UserName.Contains("\\")));
        Assert.IsTrue(result.Entries.All(e => e.UserName == "[user]" || e.UserName.IsValidMask()));
    }

    [TestMethod]
    public async Task ExecuteAsync_InvalidFilter_ReturnError()
    {
        var op = new Operation
        {
            Type = OperationType.Read,
            Filter = new { InvalidProperty = "value" }
        };

        var result = await _provider.ExecuteAsync(op, CancellationToken.None);

        Assert.IsFalse(result.Success);
        Assert.AreEqual(ErrorCode.InvalidFilter, result.ErrorCode);
    }
}
```

**PII Fields Specific to EventLog**:
- User names -> mask to `[user]` or `DOMAIN\[user]`
- Computer names -> mask to `[computer]`
- File paths containing user profiles -> mask
- URLs in event message data -> mask
- Email addresses in message -> mask
- Phone numbers in message -> mask

### File System Provider (C# or Rust)

**Pattern**: Safe path traversal with depth limiting and PII masking

**Key Requirements**:
- Implement glob pattern support with validation
- Maximum depth limit (prevent infinite recursion on symlinks)
- No directory traversal attacks (validate all paths)
- PII filtering: user profile paths, hidden system paths
- Return canonical paths (no relative paths)

**Validation Pattern**:

```csharp
private void ValidateSearchPath(string basePath, int maxDepth)
{
    if (basePath == null)
        throw new ArgumentNullException(nameof(basePath));

    var fullPath = Path.GetFullPath(basePath);

    // Prevent traversal outside allowed root
    if (!fullPath.StartsWith(_allowedRoot, StringComparison.OrdinalIgnoreCase))
        throw new ArgumentException("Path outside allowed root");

    // Prevent access to system-critical paths
    var forbiddenPaths = new[] { @"C:\Windows", @"C:\System32", @"C:\ProgramFiles" };
    if (forbiddenPaths.Any(fp => fullPath.StartsWith(fp, StringComparison.OrdinalIgnoreCase)))
        throw new ArgumentException("Access denied to system path");

    if (maxDepth < 1 || maxDepth > 10)
        throw new ArgumentException("Depth must be between 1 and 10");
}
```

**Testing Pattern** (C#):

```csharp
[TestClass]
public class FileSystemProviderTests
{
    [TestMethod]
    public async Task ExecuteAsync_DirectoryTraversal_ThrowsException()
    {
        var op = new Operation
        {
            Type = OperationType.Read,
            Pattern = "../../../Windows/System32/*"
        };

        Assert.ThrowsException<ArgumentException>(() =>
            _provider.ValidatePattern(op.Pattern)
        );
    }

    [TestMethod]
    public async Task ExecuteAsync_ValidGlob_ReturnsMaskedPaths()
    {
        var op = new Operation
        {
            Type = OperationType.Read,
            BasePath = @"C:\Users",
            Pattern = "*/Desktop/*.txt",
            MaxDepth = 3
        };

        var result = await _provider.ExecuteAsync(op, CancellationToken.None);

        Assert.IsTrue(result.Success);
        Assert.IsTrue(result.Files.All(f => !f.Path.Contains("Users\\") || f.Path.Contains("[user]")));
    }
}
```

**PII Fields Specific to File System**:
- User profile directories -> mask `C:\Users\[user]`
- Full paths containing identifiable names -> mask segments
- File contents (if searchable) -> apply general PII filters

### Registry Provider (C#)

**Pattern**: Limited, safe registry access with hive restrictions

**Key Requirements**:
- Only allow access to approved registry hives (ConfigurationManager, CurrentUser, LocalMachine)
- Prevent access to: SAM, SECURITY, BCD, SCHEMA
- PII filtering: user SIDs, installation paths, personal data
- Transaction semantics for multi-value operations
- Return error (not exception) for missing keys

**Hive Access Control**:

```csharp
private static readonly HashSet<string> AllowedHives = new()
{
    "HKEY_CURRENT_USER",
    "HKEY_LOCAL_MACHINE\\Software",
    "HKEY_CURRENT_CONFIG"
};

private static readonly HashSet<string> ForbiddenHives = new()
{
    "HKEY_LOCAL_MACHINE\\SAM",
    "HKEY_LOCAL_MACHINE\\SECURITY",
    "HKEY_LOCAL_MACHINE\\BCD",
    "HKEY_LOCAL_MACHINE\\SCHEMA"
};

public bool IsHiveAccessAllowed(string hivePath)
{
    if (ForbiddenHives.Any(f => hivePath.StartsWith(f)))
        return false;

    return AllowedHives.Any(a => hivePath.StartsWith(a));
}
```

**Testing Pattern** (C#):

```csharp
[TestClass]
public class RegistryProviderTests
{
    [TestMethod]
    [DataRow("HKEY_LOCAL_MACHINE\\SAM", false)]
    [DataRow("HKEY_LOCAL_MACHINE\\SECURITY", false)]
    [DataRow("HKEY_CURRENT_USER\\Software", true)]
    public void IsHiveAccessAllowed_VariesByHive(string hive, bool expected)
    {
        var result = _provider.IsHiveAccessAllowed(hive);
        Assert.AreEqual(expected, result);
    }

    [TestMethod]
    public async Task ExecuteAsync_ForbiddenHive_ReturnsDenied()
    {
        var op = new Operation
        {
            Type = OperationType.Read,
            KeyPath = "HKEY_LOCAL_MACHINE\\SAM"
        };

        var result = await _provider.ExecuteAsync(op, CancellationToken.None);

        Assert.IsFalse(result.Success);
        Assert.AreEqual(ErrorCode.PermissionDenied, result.ErrorCode);
    }
}
```

**PII Fields Specific to Registry**:
- User SIDs (S-1-5-...) -> mask to `[SID]`
- Installation paths -> mask user components
- Email addresses in registry -> mask
- Usernames in registry keys -> mask

## Cross-Component Testing

When a component depends on others, test the integration:

```csharp
[TestClass]
public class EventLogWithSecurityTests
{
    private McpServer _server;
    private EventLogProvider _eventLogProvider;

    [TestInitialize]
    public void Setup()
    {
        _eventLogProvider = new EventLogProvider();
        _server = new McpServer(_eventLogProvider);
    }

    [TestMethod]
    public async Task MCP_EventLogRequest_FilteredByPermissionLevel()
    {
        _server.SetPermissionLevel("EventLog", PermissionLevel.ReadOnlyPiiLocked);

        var result = await _server.HandleMcpRequest(new McpRequest
        {
            Service = "EventLog",
            Operation = OperationType.Read
        });

        // Result should have PII filtered
        var logs = (EventLogResult)result.Data;
        Assert.IsTrue(logs.Entries.All(e => e.UserName.IsMasked()));
    }
}
```

## Security Testing Checklist for Gemini

When implementing a component, create security tests that verify:

- [ ] **Permission Enforcement**: Disabled services return denied, not empty result
- [ ] **Permission Levels**: ReadOnlyPiiLocked filters PII; ReadOnlyPiiExposed doesn't; ReadWrite allows modification
- [ ] **Input Validation**: Invalid inputs rejected with clear errors, never exposed to caller
- [ ] **PII Filtering**: All expected PII patterns masked in results
- [ ] **Buffered Writes**: Can't execute without approval
- [ ] **Audit Trail**: All security-relevant operations logged
- [ ] **Error Messages**: Don't leak system information
- [ ] **Network Isolation**: Services not accessible from external networks
- [ ] **Concurrent Access**: Thread-safe for simultaneous requests

## Performance Testing Patterns

For components dealing with system resources, verify performance:

```csharp
[TestClass]
public class EventLogProviderPerformanceTests
{
    [TestMethod]
    public async Task ExecuteAsync_10KEvents_CompletesIn100Ms()
    {
        var sw = Stopwatch.StartNew();

        var op = new Operation
        {
            Type = OperationType.Read,
            MaxResults = 10000
        };

        var result = await _provider.ExecuteAsync(op, CancellationToken.None);

        sw.Stop();
        Assert.IsTrue(sw.ElapsedMilliseconds < 100,
            $"Took {sw.ElapsedMilliseconds}ms, expected <100ms");
    }
}
```

## Memory Optimization Guidelines

When implementing providers:
- Use `using` statements for disposable resources
- Clear large result sets after processing
- Stream results when possible instead of buffering
- Don't cache system state for >1 minute without invalidation
- Use memory-efficient collections (arrays > lists when size known)

## Common Pitfalls and How to Avoid Them

| Pitfall | How to Avoid | Example |
|---------|-------------|---------|
| Forgetting PII in event message data | Check if operation data is free-form; apply PII filters to all text data | EventLog entries have free-form "Message" field |
| Assuming API handles validation | Always validate user inputs before passing to system APIs | File paths must be validated before FileInfo |
| Logging sensitive data | Review all logging statements; never log PII or secrets | Don't log full paths, SQL queries with data |
| Permission bypass through caching | Invalidate caches when permissions change | `PermissionChanged` event must clear all caches |
| Symlink attacks on file system | Implement cycle detection and depth limiting | Track visited inodes/paths |
| Missing error codes | Return specific error codes, not generic ones | Use `ErrorCode.PermissionDenied` vs generic errors |

## Documentation Maintenance for Gemini

After implementing or modifying a component:

1. **Update this file** - Add/modify component guidance if patterns changed
2. **Update `CLAUDE.md`** - Add implementation patterns if creating new approach
3. **Update `.github/copilot-instructions.md`** - Update high-level architecture if applicable
4. **Update `AGENTS.md`** - Add to "Known Components" if new component
5. **Verify no contradictions** - All four files should be consistent

Example update:

```markdown
## My New Component (if adding)

**Pattern**: Brief description of how to implement
**Key Requirements**: List requirements
**Testing Pattern**: Example test code
**PII Fields**: List if applicable
```
