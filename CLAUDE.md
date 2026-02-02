# Claude Instructions for SysMCP

This file provides detailed guidance for Claude (and similar LLMs) working on the SysMCP codebase. Reference `.github/copilot-instructions.md` for architecture and high-level conventions.

## Before Starting Any Task

1. **Read the main instructions** - Understand the project architecture and security model
2. **Check existing code patterns** - If code exists, analyze it for patterns and conventions
3. **Verify test coverage** - Any changes must maintain or improve >80% coverage
4. **Update AI documentation** - After completing changes, review and update all AI instruction files

## Common Implementation Patterns

### Security Layer Implementation

All permission and filtering operations follow this pattern:

```
1. Input validation (assert non-null, valid types)
2. Permission check (deny by default)
3. Apply filtering if read operation
4. Execute or buffer operation
5. Log for audit trail
6. Return sanitized result or error
```

Example structure:
```csharp
public Result Execute(Request req)
{
    // Validate input
    if (req == null) throw new ArgumentNullException(nameof(req));

    // Check permission
    if (!PermissionChecker.IsAllowed(req.ServiceName, req.OperationType, req.UserLevel))
        throw new PermissionDeniedException($"Operation not allowed at {req.UserLevel}");

    // Execute or buffer
    if (req.OperationType == OperationType.Read)
        return ExecuteRead(req);
    else
        return BufferWrite(req);
}
```

### PII Filtering Pattern

Create small, focused filter functions:

```csharp
public class PiiFilters
{
    public static string MaskEmail(string email)
        => email?.Contains("@") ?? false
            ? email[0] + "***@" + email.Split("@")[1]
            : "[email]";

    public static string MaskPhoneNumber(string phone)
        => Regex.IsMatch(phone, @"^\+?1?\d{10}$")
            ? "***-****-" + phone.Substring(phone.Length - 4)
            : "[phone]";

    // More filters...
}
```

### Resource Provider Interface

All providers implement the same contract:

```csharp
public interface IResourceProvider
{
    string Name { get; }
    IReadOnlyList<OperationType> SupportedOperations { get; }

    /// <summary>
    /// Execute an operation. Caller is responsible for permission checking.
    /// Returns data with PII already filtered if applicable.
    /// </summary>
    Task<OperationResult> ExecuteAsync(Operation operation, CancellationToken ct);

    /// <summary>
    /// Whether this provider's results require PII filtering.
    /// </summary>
    bool RequiresPiiFiltering { get; }
}
```

### Write Buffering Pattern

```csharp
public class WriteBuffer
{
    private readonly object _lock = new();
    private List<BufferedOperation> _pending = new();

    public void Queue(Operation op)
    {
        lock (_lock)
        {
            _pending.Add(new BufferedOperation
            {
                Id = Guid.NewGuid(),
                Operation = op,
                QueuedAt = DateTime.UtcNow,
                Status = BufferStatus.Pending
            });
        }
    }

    public void Approve(Guid operationId)
    {
        lock (_lock)
        {
            var op = _pending.First(o => o.Id == operationId);
            op.Status = BufferStatus.Approved;
            op.ApprovedAt = DateTime.UtcNow;
            // Execute operation...
        }
    }
}
```

## Testing Patterns

### Unit Test Structure

```csharp
[TestClass]
public class EmailFilterTests
{
    [TestMethod]
    public void MaskEmail_ValidEmail_ReturnsMasked()
    {
        // Arrange
        string email = "john.doe@example.com";

        // Act
        string result = PiiFilters.MaskEmail(email);

        // Assert
        Assert.AreEqual("j***@example.com", result);
        Assert.IsFalse(result.Contains("john"));
        Assert.IsFalse(result.Contains("doe"));
    }

    [TestMethod]
    public void MaskEmail_InvalidEmail_ReturnsMask()
    {
        // Arrange
        string notEmail = "definitely not an email";

        // Act
        string result = PiiFilters.MaskEmail(notEmail);

        // Assert
        Assert.AreEqual("[email]", result);
    }

    [TestMethod]
    public void MaskEmail_Null_ReturnsMask()
    {
        var result = PiiFilters.MaskEmail(null);
        Assert.AreEqual("[email]", result);
    }
}
```

### Security Test Structure

```csharp
[TestClass]
public class PermissionCheckerTests
{
    [TestMethod]
    [DataRow(PermissionLevel.Disabled, OperationType.Read, false)]
    [DataRow(PermissionLevel.ReadOnlyPiiLocked, OperationType.Read, true)]
    [DataRow(PermissionLevel.ReadOnlyPiiLocked, OperationType.Write, false)]
    [DataRow(PermissionLevel.ReadWrite, OperationType.Write, true)]
    public void IsAllowed_VariesByPermissionLevel(
        PermissionLevel level,
        OperationType op,
        bool expected)
    {
        var result = PermissionChecker.IsAllowed("EventLog", op, level);
        Assert.AreEqual(expected, result);
    }
}
```

### Integration Test Structure

```csharp
[TestClass]
public class EndToEndSecurityTests
{
    private McpServer _server;

    [TestInitialize]
    public void Setup()
    {
        _server = new McpServer();
        _server.SetPermissionLevel("EventLog", PermissionLevel.ReadOnlyPiiLocked);
    }

    [TestMethod]
    public async Task RequestToDisabledService_ReturnsDenied()
    {
        var request = new McpRequest
        {
            Service = "DisabledService",
            Operation = OperationType.Read
        };

        var result = await _server.HandleAsync(request);

        Assert.IsFalse(result.Success);
        Assert.AreEqual(ErrorCode.PermissionDenied, result.ErrorCode);
        // Verify no details leaked
        Assert.IsFalse(result.ErrorMessage.Contains("internal"));
    }
}
```

## Specific Component Guidance

### EventLog Provider

- Query events using Windows Event Log API (System.Diagnostics.EventLog)
- Implement efficient filtering before returning (don't load all events then filter)
- PII fields to filter: User names, computer names, application paths, URLs in event data
- Handle log rotation and clearing gracefully
- Return results sorted by timestamp descending
- Support pagination for large result sets

### File System Provider

- Use FileInfo and DirectoryInfo for safe operations
- Validate all paths to prevent directory traversal attacks
- Support glob patterns but validate pattern syntax
- PII fields: Full file paths containing user profiles, file contents
- Implement depth limiting to prevent infinite recursion
- Handle symbolic links by following but with cycle detection
- Return results with canonical paths

### Registry Provider

- Use RegistryKey and RegistryValueKind for safe operations
- Only allow access to approved registry hives
- PII fields: User profile references, installation paths, personal data stored in registry
- Implement transaction semantics for multi-key operations
- Return error (not exception) for missing keys
- Validate key and value names for injection attempts

## Error Handling Guidelines

**Always use this pattern:**

```csharp
try
{
    // Perform operation
}
catch (PermissionDeniedException ex)
{
    // Log full details internally
    _logger.LogWarning($"Permission denied: {ex.Details}");
    // Return generic error to caller
    throw new OperationDeniedException("Operation not allowed");
}
catch (Exception ex)
{
    // Log full details internally
    _logger.LogError($"Unexpected error: {ex}");
    // Return generic error to caller
    throw new OperationFailedException("Operation failed");
}
```

## Documentation Maintenance

When modifying code, update:

1. **Inline comments** - Explain non-obvious logic, especially security-critical sections
2. **Method documentation** - Include what the method does, parameters, return value, exceptions, security notes
3. **CLAUDE.md** - Update this file with new patterns or changes to patterns
4. **AGENTS.md** - Note if changes affect coordination with other agents
5. **.github/copilot-instructions.md** - Update if architectural changes occur

Example documentation:

```csharp
/// <summary>
/// Masks email addresses to prevent PII exposure.
/// </summary>
/// <param name="email">The email address to mask. May be null.</param>
/// <returns>Masked email in format first_char***@domain, or "[email]" if invalid/null</returns>
/// <remarks>
/// Security: This is the primary email masking function used before returning EventLog data.
/// Test coverage: See EmailFilterTests for comprehensive test cases.
/// Performance: O(n) where n is email length, typical <1ms.
/// </remarks>
public static string MaskEmail(string email) { ... }
```

## Key Things NOT to Do

- Never skip PII filtering because "the security layer will catch it"--implement at every layer
- Don't log PII in any form, even "for debugging"
- Never hardcode secrets or credentials
- Don't trust network-accessible code--assume it's compromised
- Never execute buffered writes without explicit user approval
- Don't implement permission checks in multiple places inconsistently
- Never ignore test coverage requirements for "expedience"
- Don't create large monolithic files--keep them <300 lines
