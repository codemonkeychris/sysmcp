# Instructions for All AI Agents

This document defines coordination between Claude, Gemini, OpenAI, GitHub Copilot, and other AI agents working on the SysMCP codebase. Read this FIRST before working on any task.

## Critical Principle: Multi-Agent Consistency

This codebase is optimized for AI-assisted development using **multiple different AI models**. This creates a coordination challenge:

**All AI agents must maintain consistency across documentation files.** A gap in one agent's instructions that another agent doesn't know about creates hidden bugs.

## Documentation Files and Their Purpose

| File | Primary Audience | Purpose |
|------|------------------|---------|
| `.github/copilot-instructions.md` | GitHub Copilot, Cursor | Architecture, conventions, code guidelines, security requirements |
| `CLAUDE.md` | Claude Code (Anthropic) | Detailed implementation patterns, examples, testing strategies |
| `GEMINI.md` | Google Gemini CLI | Specific patterns per component, edge cases |
| `AGENTS.md` (this file) | All agents | Coordination rules and maintenance procedures |

## Before Starting Any Work

1. **Read all relevant documentation files** in this order:
   - README.md (project overview)
   - .github/copilot-instructions.md (architecture and guidelines)
   - CLAUDE.md (implementation patterns)
   - GEMINI.md (specific component patterns)
   - AGENTS.md (this file, coordination rules)

2. **Check for existing code** - Analyze patterns in existing code to inform your approach
3. **Note any inconsistencies** - If you find contradictions between documentation files, flag them for human review
4. **Plan updates** - Before starting code changes, identify what documentation needs updating

## Mandatory Documentation Updates

After completing ANY of the following tasks, you MUST update documentation files:

### Task: Add New Component/Module
Update:
- [ ] `.github/copilot-instructions.md` - Add to Architecture section
- [ ] `CLAUDE.md` - Add implementation pattern example
- [ ] `GEMINI.md` - Add component-specific guidance
- [ ] `AGENTS.md` - Note the new area in "Known Components" section (if adding one)

### Task: Change Security or Permission Model
Update:
- [ ] `.github/copilot-instructions.md` - Update Security Architecture section
- [ ] `CLAUDE.md` - Update permission checking pattern examples
- [ ] `GEMINI.md` - Update security test examples
- [ ] Ensure test coverage remains >80%

### Task: Change PII Filtering Behavior
Update:
- [ ] `.github/copilot-instructions.md` - Update PII definition and filtering requirements
- [ ] `CLAUDE.md` - Update PII filtering patterns
- [ ] `GEMINI.md` - Update PII test examples
- [ ] Verify all providers apply filters consistently

### Task: Modify Build, Test, or Deployment Process
Update:
- [ ] `.github/copilot-instructions.md` - Update Build & Test section
- [ ] `README.md` - Update quick start instructions if they changed
- [ ] Document any new system requirements

### Task: Add New Testing Pattern or Strategy
Update:
- [ ] `CLAUDE.md` - Add new test pattern with examples
- [ ] `GEMINI.md` - Add pattern-specific guidance for Gemini
- [ ] `.github/copilot-instructions.md` - Update Testing Requirements section if applicable

## Conflict Resolution

If you discover conflicting instructions between documentation files:

1. **Document the conflict** - Note the specific files and sections that conflict
2. **Don't guess** - Don't choose one interpretation arbitrarily
3. **Flag for human review** - Create an issue or note in your response that conflict exists
4. **Ask in your response** - If working interactively, ask the user which interpretation is correct

Example conflict:
```
CONFLICT:
- .github/copilot-instructions.md says "MCP services must be localhost-only"
- CLAUDE.md says "Services can be network-accessible with authentication"

These conflict on a fundamental security requirement.
```

## Known Components and Their Primary Docs

- **Security Layer** - See CLAUDE.md "Security Layer Implementation"
- **Resource Providers** - See CLAUDE.md "Resource Provider Interface"
- **Write Buffering** - See CLAUDE.md "Write Buffering Pattern"
- **PII Filtering** - See CLAUDE.md "PII Filtering Pattern"
- **Test Coverage** - See .github/copilot-instructions.md "Testing Requirements"
- **System Tray UI** - See .github/copilot-instructions.md "System Tray UI" (needs CLAUDE.md expansion)

## Quality Gates

Before committing code changes, verify:

- [ ] **Test Coverage**: No change reduces overall test coverage; new code has >80% coverage
- [ ] **Documentation**: All affected documentation files updated
- [ ] **Security**: Follows security best practices from .github/copilot-instructions.md
- [ ] **Consistency**: Code patterns match examples in CLAUDE.md
- [ ] **Consistency**: No contradictions between different agents' instruction files

## Inter-Agent Communication

If you're Claude working with code that Copilot or Gemini will later modify:

- **Add clear comments** in code explaining non-obvious patterns
- **Update documentation** so other agents understand your choices
- **Document trade-offs** - Why did you choose this approach over alternatives?
- **Mark security-critical code** with comments like `// SECURITY: ...`

Example:

```csharp
// SECURITY: PII filtering must happen here before returning to MCP caller.
// Never assume the MCP layer will handle filtering.
// See CLAUDE.md "PII Filtering Pattern" for more.
var filtered = PiiFilters.FilterEventLog(events);
return filtered;
```

## Documentation Update Checklist

Use this checklist when updating any instruction file:

- [ ] File is syntactically correct (headers, lists, code blocks)
- [ ] Examples are accurate and up-to-date with actual code
- [ ] All cross-references to other files are correct
- [ ] No contradictions with other instruction files
- [ ] Security requirements clearly stated
- [ ] New patterns clearly explained with examples
- [ ] File is organized logically with clear sections
- [ ] All "Important Notes" sections are accurate

## Escalation Path

If you encounter a situation not covered by this documentation:

1. **Check all four documentation files** - The answer might be in one you haven't read yet
2. **Search existing code** - Real examples are better than documentation
3. **Flag for human review** - Clearly state what's ambiguous and why
4. **Ask the user** - If working interactively, ask for clarification rather than guessing

## Example: Claude Completing a Task with Proper Documentation Update

**Task**: Add support for filtering credit card numbers in PII filtering

**Process**:
1. Read all documentation files to understand current PII filtering
2. Find CLAUDE.md "PII Filtering Pattern" section
3. Implement the new filter function following the existing pattern
4. Write comprehensive tests following CLAUDE.md test patterns
5. Update documentation:
   - [ ] .github/copilot-instructions.md: Update PII definition to include credit cards
   - [ ] CLAUDE.md: Add example of credit card filtering pattern
   - [ ] GEMINI.md: Add test pattern for credit card filtering
6. Verify no documentation contradictions
7. Commit with clear message referencing the documentation updates

## Important Notes

- **Never skip documentation updates** - They're as important as code changes
- **Assume human developers use all four instruction files** - Gaps hurt them
- **Assume other AI agents will read your code and documentation** - Be clear
- **Contradictions between files are bugs** - Treat them seriously
- **This file is the source of truth for coordination** - Follow it even if it seems inefficient
- **Test coverage is non-negotiable** - Never commit code that reduces coverage
