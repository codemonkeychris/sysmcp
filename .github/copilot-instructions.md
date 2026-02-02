# SysMCP Copilot Instructions

## Feature Development Skills

This project uses three reusable skills for structured feature development. Invoke them explicitly when starting a new feature:

- **`feature-spec` skill** - Creates a feature specification by asking clarifying questions
  - Input: Feature idea or requirement
  - Output: Specification file + git branch
  
- **`feature-plan` skill** - Creates a technical implementation plan from the spec
  - Input: Feature number or spec file
  - Output: Technical plan document
  
- **`feature-tasks` skill** - Breaks spec and plan into ordered implementation tasks
  - Input: Feature number or spec/plan files
  - Output: Tasks checklist + status tracking file

See `/skills/README.md` for complete documentation on using these skills.

## Project Overview

SysMCP is a user-mode service that hosts multiple MCP (Model Context Protocol) servers to expose system resources including EventLog, file search, registry, and others. The system implements a sophisticated security model with PII filtering for read operations and buffering/consent for write operations. A system tray application provides user control over which MCP services are enabled and their permission levels (read-only with PII locked, read-only with PII exposed, or read-write).

## Architecture

### Core Components

1. **MCP Server Hosting Layer** - Manages the lifecycle of multiple MCP servers, handles protocol communication, and routes requests to appropriate resource providers

2. **Security and Privacy Layer** - Implements the permission and filtering system:
   - Read operation filtering to remove/mask PII (name, email, SSN, phone, etc.)
   - Write operation buffering for audit trail and user consent
   - Permission levels per service: read-only (PII locked), read-only (PII exposed), read-write

3. **System Resources Providers** - Individual modules that expose system resources:
   - EventLog access and querying
   - File system search and operations
   - Registry access and operations
   - Additional system resources as needed

4. **System Tray UI** - User-facing control center for:
   - Enabling/disabling individual MCP services
   - Toggling permission levels per service
   - Reviewing and approving buffered write operations
   - Service status monitoring

### Data Flow

- Incoming MCP requests → Security layer (permission check, PII filtering if read) → Resource provider → Response with filtered/buffered result
- Write operations bypass immediate execution, go to buffer → User approval in system tray UI → Execution

## Key Conventions

### File Organization (when implemented)

- `/src` - Main application source code
- `/src/services` - MCP server implementations and resource providers
- `/src/security` - Filtering and permission logic
- `/src/ui` - System tray and user interface components
- `/tests` - Unit and integration tests

### Permission Model Convention

Services are configured with permission levels:
- `read-only-pii-locked` - Read operations with PII filtering enabled
- `read-only-pii-exposed` - Read operations without PII filtering
- `read-write` - Full read and write with write buffering
- `disabled` - Service not available

### PII Definition

The system recognizes these data types as PII and filters them based on permission level:
- Full names and personal identifiers
- Email addresses
- Phone numbers
- Social Security numbers
- File paths containing personal information
- Registry keys related to user profiles

### Write Operation Buffering

Write operations:
1. Are captured and stored in a buffer with timestamp and initiator info
2. Trigger a notification in the system tray UI
3. Require explicit user approval before execution
4. Are logged for audit purposes upon execution or rejection

## Build & Test (when implemented)

Build commands to follow the project's chosen platform and framework. Common scenarios:
- Building the service executable
- Running unit tests for security and filtering logic
- Running integration tests for MCP communication
- Building the system tray UI

## Code Guidelines

### Security Layer (`/src/security`)

**Permission Checker Module**
- Implement as a stateless validator that takes (service, operation_type, user_permission_level) and returns boolean
- Should raise clear exceptions with reason codes for permission denials
- Cache permission lookups if dealing with frequent same-service checks

**PII Filtering Module**
- Create reusable filter functions for common data types: names, emails, phone numbers, SSNs, file paths, registry paths
- Support multiple masking strategies: full redaction, partial masking (show first/last only), anonymization
- Apply filters consistently—never skip PII filtering based on operation context
- Include unit tests for each filter function with realistic data samples
- Document all PII patterns recognized by the system

**Write Operation Buffer**
- Implement as an append-only log with transaction semantics
- Each buffered operation must include: timestamp, initiator ID, operation details, required permissions
- Support atomic operations for groups of related writes
- Implement buffer persistence (e.g., local database) to survive service restarts
- Provide clear audit trail of approvals/rejections

### Resource Providers (`/src/services`)

Each resource provider follows the same interface:

```
interface ResourceProvider {
  name: string
  supportedOperations: Operation[]
  execute(operation, context) -> Result
  supportsFiltering(): boolean
}
```

**EventLog Provider**
- Encapsulate Windows EventLog access and queries
- Implement efficient filtering before returning results (don't fetch everything then filter)
- Support field-level PII filtering on event data
- Handle large result sets with pagination

**File System Provider**
- Implement recursive search with depth limiting to prevent runaway operations
- Apply PII filtering to paths and file contents
- Support glob patterns for search queries
- Implement safe path traversal (no directory traversal attacks)
- Handle symbolic links and junctions securely

**Registry Provider**
- Encapsulate registry operations with safe key/value access patterns
- Apply PII filtering to registry values
- Prevent access to sensitive registry hives unless explicitly approved
- Implement transaction semantics for multi-key operations

**Adding New Providers**
- Always implement PII filtering in the provider—don't rely solely on the security layer
- Return results in a normalized format compatible with MCP protocol
- Include timeout handling for operations that might hang
- Document any OS-specific behavior or limitations

### MCP Server Layer (`/src/mcp`)

- Implement MCP protocol compliance according to the protocol specification
- Maintain clean separation between MCP protocol handling and business logic
- All MCP handlers must validate and sanitize input before passing to resource providers
- Implement proper error responses with meaningful error codes
- Support protocol versioning for forward compatibility

### System Tray UI (`/src/ui`)

**Service Control**
- Provide clear on/off toggles for each service
- Show real-time status of each service (online/offline/error)
- Display permission level selection with clear descriptions of each level

**Write Operation Approval**
- Queue newly buffered writes for user review
- Show operation details: what changed, where, when, by whom
- Provide approve/reject actions with optional notes
- Show history of approved/rejected operations

**Configuration Persistence**
- Save user settings (enabled services, permission levels) across restarts
- Use secure storage for sensitive configuration
- Support import/export of settings for backup or sharing

## Testing Strategy

**Unit Tests**
- Test all security layer functions with positive and negative cases
- Test PII filtering patterns with real and synthetic data samples
- Test each resource provider in isolation with mocked system calls
- Test permission combinations exhaustively

**Integration Tests**
- Test MCP request → security check → resource provider → response flow
- Test write buffering through the entire approval workflow
- Test permission changes taking effect in real-time
- Test multiple concurrent requests

**Security Tests**
- Test that PII filtering cannot be bypassed with encoded/obfuscated data
- Test that write operations cannot execute without user consent
- Test that permission downgrades take effect immediately
- Test that elevated operations fail gracefully with proper error messages

## Code Quality Standards

### File Organization

- Keep source files small and focused (typically <300 lines)
- One primary responsibility per file
- Include a file header comment explaining purpose and key functions
- Group related functionality into modules/namespaces/packages

### Comments and Documentation

- Add comments for non-obvious logic and security-critical sections
- Document all public API functions with parameter descriptions and return types
- Include examples in comments for complex operations
- Keep comments up-to-date with code changes; outdated comments are harmful

### Testing Requirements

- **Minimum 80% code coverage** for all projects (measured by line and branch coverage)
- Coverage reports generated on each build
- Never merge code that reduces overall coverage
- Write tests for both happy paths and error cases
- Security-critical code should have 100% coverage

### Test Organization

```
/tests
  /unit          - Fast, isolated component tests (no external dependencies)
  /integration   - Tests spanning multiple components
  /security      - Tests for permission, filtering, and access control
  /performance   - Tests for memory usage and response times
```

## Security Architecture

### Defense in Depth Principle

- Assume naive users may enable all services—design to prevent harm by default
- Implement security at every layer (UI, MCP handler, resource provider, OS interaction)
- Deny by default, require explicit allow
- Never trust user input; validate and sanitize everywhere
- Fail securely—errors should not expose system details or allow bypass

### Information Leakage Prevention

- **Network Isolation**: MCP services accessible only from localhost (127.0.0.1), never exposed to network
- **Process Isolation**: Consider running resource providers in separate processes with limited privileges
- **Error Messages**: Return generic error messages to callers; log detailed errors internally only
- **Logging**: Never log PII in error messages or debug output
- **Memory**: Clear sensitive data from memory after use; don't rely on garbage collection
- **File Permissions**: Ensure configuration and buffer files have restrictive permissions (0600 on Unix, restricted ACLs on Windows)

### Security Checklist for New Code

- [ ] All inputs validated and sanitized
- [ ] No hardcoded credentials or secrets
- [ ] Error handling doesn't leak information
- [ ] Network access restricted to localhost
- [ ] File access follows principle of least privilege
- [ ] Sensitive operations logged for audit
- [ ] PII filtering applied before returning data
- [ ] Concurrent access properly synchronized
- [ ] No shell command injection vectors
- [ ] Dependency vulnerabilities checked

## Performance and UX Requirements

### Memory Optimization

- Profile memory usage during development
- Keep loaded services lightweight; unload services not in use
- Implement lazy loading for heavy resource providers
- Clear caches when permission levels change
- Use efficient data structures (avoid unnecessary allocations)
- System tray UI should consume <50MB RAM

### Loading and Responsiveness

- Service startup should complete in <2 seconds
- MCP request handling should complete in <100ms for most operations
- UI interactions should respond immediately (<100ms)
- No blocking operations on the UI thread
- Batch write operations when possible to reduce approval frequency

### UX Philosophy

- Clean, minimal interface in system tray
- Clear status indicators for each service
- Straightforward approval workflow (no unnecessary clicks)
- Fast visual feedback for all user actions
- No animations; focus on functionality

## Language and Tool Selection

Choose the most appropriate language for each component:

- **System Integration (EventLog, Registry, File System)**: C# or Rust (system access libraries, performance)
- **Security Layer (Filtering, Permissions, Buffering)**: C# or Rust (correctness, testability)
- **MCP Server Protocol Layer**: Language-agnostic (implement in chosen language once; use standard protocol)
- **System Tray UI**: C# WinForms or WPF (native Windows integration, lightweight)
- **Core Service Manager**: C# or Rust (high performance, reliability)

Use libraries and frameworks that are:
- Well-maintained and security-focused
- Lightweight (prefer minimal dependencies)
- Have good test coverage
- Are actively audited for vulnerabilities

## Getting Started: Enlist, Build, Run

### System Requirements (Front-loaded)

**Windows Developer Machine**
- OS: Windows 10 or later (Home, Pro, or Developer editions acceptable)
- .NET 8+ SDK OR Rust 1.70+, depending on component being developed
- Visual Studio 2022 Community (free) with C# workload OR VS Code with Rust Analyzer
- Administrator access for building/running (may be required for system access APIs)
- ~500MB free disk space

### Quick Start

```
git clone <repo>
cd SysMCP
./setup.sh               # Windows: setup.cmd
./build.sh               # Windows: build.cmd
./run.sh                 # Windows: run.cmd
```

The setup script should:
- Check for required tools and versions
- Download and install missing dependencies automatically
- Initialize test databases/fixtures
- Display clear errors if requirements aren't met

The build script should:
- Compile all components
- Run all tests
- Generate coverage reports
- Output results clearly

The run script should:
- Start the service
- Display status and any startup errors
- Show how to stop the service

## AI-Optimized Documentation

This codebase is designed for efficient AI-assisted development. All code changes should maintain and update these documentation files:

### Documentation Files for AI Agents

1. **.github/copilot-instructions.md** (this file)
   - GitHub Copilot, Cursor
   - High-level architecture, conventions, code guidelines
   - Instructions for security, testing, performance

2. **CLAUDE.md** (project root)
   - Claude Code (Anthropic)
   - Detailed examples of implementation patterns
   - Expected behavior and edge cases
   - Links to related code sections

3. **GEMINI.md** (project root)
   - Google Gemini CLI
   - Specific patterns for each component
   - Testing strategies and examples

4. **AGENTS.md** (project root)
   - General agent instructions (applicable to all AI agents)
   - How to maintain consistency across all AI documentation
   - Escalation and coordination procedures

### Agent Documentation Maintenance

**All AI agents must:**
- After making code changes, review and update ALL agent instruction files (CLAUDE.md, GEMINI.md, .github/copilot-instructions.md, and AGENTS.md)
- Keep examples in documentation synchronized with actual code patterns
- Update architecture diagrams or flowcharts if structure changes
- Add new sections to documentation if creating new modules
- Flag inconsistencies between documentation files for human review
- Never remove or deprecate documentation without creating migration guidance

**Critical**: If two different agents have conflicting instructions or documentation, this represents a gap that must be highlighted and resolved by a human reviewer.

## Important Notes for Development

- **Security-First**: All changes affecting the permission model or PII filtering must be carefully reviewed; security changes should include threat model documentation
- **PII Filtering**: When adding new system resource providers, implement PII filtering consistently—don't assume the security layer will catch everything
- **Write Buffering**: Maintain the write operation buffer integrity—never execute buffered writes without user consent or audit trail
- **Error Handling**: Return clear, actionable error messages to users while avoiding exposure of internal details
- **Performance**: Cache read results when possible, but invalidate caches when permission levels change; monitor memory usage
- **Backward Compatibility**: When modifying the permission model or buffer format, support migration from old versions
- **Logging**: Log all permission denials, write operations, and security-relevant events for audit purposes; never log PII
- **Code Style**: Use consistent naming (e.g., `requestId`, `userId`, `timestamp` in ISO 8601 format)
- **Documentation**: Every public API function should document its security requirements and PII filtering behavior
- **Test Coverage**: Never commit code that reduces overall test coverage; aim for >80% on all new code
- **AI Assistance**: Keep documentation up-to-date so AI agents can work effectively without human intervention
