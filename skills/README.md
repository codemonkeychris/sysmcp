# SysMCP Skills

This directory contains reusable skills for feature development. Each skill guides AI assistants (GitHub Copilot, Claude, Gemini) through a specific workflow.

## Available Skills

### 1. feature-spec
Creates a feature specification by asking clarifying questions to flesh out the design.

**Invocation**: `Run feature-spec skill` or `Start feature-spec`

**Input**: Feature idea or requirement (e.g., "Add email notifications")

**Output**: 
- Feature specification document (saved to `/features/XXX-feature-name.spec.md`)
- Git branch created: `feature/XXX-feature-name`

**Workflow**:
1. Ask user for feature title and number (if not provided, assign next number in sequence: 001, 002, etc.)
2. Ask clarifying questions about scope, requirements, constraints
3. Document specification with sections: Overview, Requirements, Constraints, Out of Scope, Success Criteria
4. Create git branch `feature/XXX-feature-name`
5. Save spec file to `/features/XXX-feature-name.spec.md`

### 2. feature-plan
Takes a feature specification and creates a technical implementation plan.

**Invocation**: `Run feature-plan skill` or `Start feature-plan`

**Input**: Feature specification file or feature number (e.g., "001")

**Output**:
- Technical plan document (saved to `/features/XXX-feature-name.plan.md`)

**Workflow**:
1. Accept feature spec file path or feature number
2. Read and analyze the specification
3. Research current codebase structure (if applicable)
4. Identify affected components and dependencies
5. Document plan with sections: Architecture Changes, Component Changes, Data Flow, Testing Strategy, Implementation Risks, Dependencies
6. Save plan file to `/features/XXX-feature-name.plan.md`

### 3. feature-tasks
Breaks down a spec and plan into ordered, checklist-able implementation tasks.

**Invocation**: `Run feature-tasks skill` or `Start feature-tasks`

**Input**: Feature specification and/or plan files (feature number or paths)

**Output**:
- Tasks document (saved to `/features/XXX-feature-name.tasks.md`)
- Create `/features/XXX-feature-name/` directory structure for task tracking

**Workflow**:
1. Accept feature number or paths to spec/plan files
2. Read spec and plan documents
3. Break down into ordered tasks (typically 5-15 tasks)
4. Organize tasks by category: Setup, Core Implementation, Testing, Documentation, Integration
5. Create markdown checklist with dependencies noted
6. Save tasks file to `/features/XXX-feature-name.tasks.md`
7. Create task tracking file at `/features/XXX-feature-name/status.md` with same checklist

## Feature Numbering

Features are numbered sequentially: **001, 002, 003, etc.**

**Finding the next feature number**:
1. List `/features` directory
2. Find highest numbered feature
3. Increment by 1, zero-padded to 3 digits

Example: If `003-auth-system` exists, next feature is `004-...`

## File Structure

\\\
/features
├── 001-feature-name.spec.md       # Feature specification
├── 001-feature-name.plan.md       # Technical plan
├── 001-feature-name.tasks.md      # Implementation tasks
└── 001-feature-name/
    └── status.md                   # Task tracking (copy of tasks.md for status updates)
\\\

## Git Workflow

Each feature gets a dedicated branch:

\\\
Branch: feature/001-feature-name
Spec: spec -> plan -> tasks -> implementation
Commit: When tasks are complete, submit all feature changes with PR
\\\

## Using Skills Across AI Systems

### GitHub Copilot CLI
\\\
copilot run feature-spec skill
copilot run feature-plan skill
copilot run feature-tasks skill
\\\

### Claude Code
\\\
Run feature-spec skill
Run feature-plan skill
Run feature-tasks skill
\\\

### Gemini CLI
\\\
gemini run feature-spec skill
gemini run feature-plan skill
gemini run feature-tasks skill
\\\

## Notes for AI Assistants

- **Always verify feature number doesn't exist** before creating
- **Use consistent terminology** across all three documents (spec, plan, tasks)
- **Link documents together** - each should reference the others
- **Maintain feature branch** - switch to correct branch before implementation
- **Update status.md** as tasks are completed
- **After completion** - merge to main and archive in `/features/XXX-feature-name/` directory
