# feature-implement Skill

**AUTONOMOUS IMPLEMENTATION AGENT** - This skill actively implements feature tasks, writing code, running tests, and tracking progress. The AI agent executes all implementation work automatically, not asking for user input on individual tasks.

## Invocation

- GitHub Copilot: `Run feature-implement skill`
- Claude Code: `Run feature-implement skill`
- Gemini CLI: `Run feature-implement skill`

## Input

Feature number or feature name (e.g., "001" or "001-mcp-host-bootstrap")

## Output

- Autonomous implementation of all feature tasks in order
- Actual code changes, test files, documentation created and committed
- Status updates as each task completes
- Final summary of all work completed

## Workflow

### 1. Validate Feature Setup
- Accept feature number or feature name from user
- Verify feature documentation exists (spec, plan, tasks files)
- Check that feature branch exists and is checked out (or create/checkout if needed)
- Confirm task tracking files are in place: `features/001-mcp-host-bootstrap/status.md`
- Log all validations

### 2. Execute Tasks Sequentially
For each unchecked task in order (no user intervention):
- Load task description and acceptance criteria from `features/001-mcp-host-bootstrap.tasks.md`
- Check for blocking dependencies; skip if any remain incomplete
- **IMPLEMENT THE TASK**: Write actual code, create files, make changes
- Run tests, linting, and validation to verify acceptance criteria
- If criteria not met, iterate until they are (max 3 attempts per task)
- **CRITICAL**: Update `features/001-mcp-host-bootstrap.tasks.md` by changing `- [ ]` to `- [x]` for completed task
- **CRITICAL**: Also update `features/001-mcp-host-bootstrap/status.md` with same checkmark
- Create commit: `✓ Task X.Y: [Task Name]`
- Report single-line completion: `✅ Task X.Y: [Task Name] - [brief summary]`

### 3. Loop Until Complete
- Repeat step 2 for each task until all 17 are completed
- **NEVER create completion report files in root directory**
- Track and report overall progress
- Update both .tasks.md and /status.md files after each task

### 4. Final Summary
- Generate final report showing:
  - All 17 tasks completed ✅
  - Total lines of code added
  - Test coverage achieved
  - Files created/modified
  - All commits made
- Report should be printed to console, not saved as markdown file

## Key Responsibilities

1. **Branch Management**
   - Verify feature branch is active: `git branch --show-current`
   - Create/checkout branch if it doesn't exist
   - Keep branch up-to-date with main as needed
   - All commits go to feature branch

2. **Autonomous Task Execution**
   - Read tasks from `features/XXX-feature-name.tasks.md`
   - Execute tasks in order sequentially
   - Implement actual code for each task (not just describe it)
   - Do NOT ask user which task to work on
   - Do NOT ask user for guidance or clarification

3. **Implementation Work**
   - Write actual source code files in /src directory
   - Create test files in /tests directory
   - Update configuration files as needed
   - Create/update documentation and README
   - Follow project code style and conventions
   - Use existing code patterns as examples

4. **Verification & Testing**
   - Run tests to verify acceptance criteria (use `npm test` or equivalent)
   - Run linters to ensure code quality (use `npm run lint` if available)
   - Verify no regression in existing functionality
   - Confirm test coverage remains above 80%
   - Check all files compile/validate (TypeScript, etc.)

5. **Status Tracking**
   - Update `features/XXX-feature-name.tasks.md` after each task by changing `- [ ] Task X.Y` to `- [x] Task X.Y`
   - Also update `features/XXX-feature-name/status.md` with same checkmarks
   - Track overall progress percentage
   - Note any blockers that prevented task completion
   - Update metrics (test coverage, code quality, etc.)
   - **NEVER create .md files in the root directory** - all documentation stays in /features/XXX-feature-name/

6. **Commit Management**
   - Create a commit after each task completes
   - Use format: `✓ Task X.Y: [Task Name]`
   - Include summary of changes in commit body
   - Never commit incomplete work

7. **Error Handling**
   - If acceptance criteria cannot be met after good-faith attempt, note the blocker
   - Document what failed and why in status.md
   - Flag for user review before moving forward
   - Try up to 3 different approaches per task

## Task Completion Format

When a task is completed, the commit message should follow this format:

```
✓ Task X.Y: [Task Name]

Acceptance Criteria Met:
- [criterion 1]
- [criterion 2]
- [criterion 3]

Changes:
- File 1: [change description]
- File 2: [change description]
```

## File Organization Rules

### DO:
- ✅ Create source code in `/src` directory
- ✅ Create tests in `/tests` directory
- ✅ Update configuration files in project root (`package.json`, `tsconfig.json`, etc.)
- ✅ Update `features/001-mcp-host-bootstrap.tasks.md` with checkmarks
- ✅ Update `features/001-mcp-host-bootstrap/status.md` with checkmarks
- ✅ Create subdirectories under `/features/001-mcp-host-bootstrap/` if needed for work artifacts
- ✅ Store task-specific notes or docs in `/features/001-mcp-host-bootstrap/docs/` if needed

### DO NOT:
- ❌ Create `TASK_X_Y_COMPLETION_REPORT.md` in root directory
- ❌ Create status files in root directory
- ❌ Create documents like `TASK_1_1_SUMMARY.md` in root directory
- ❌ Store any feature-specific artifacts outside of `/features/001-mcp-host-bootstrap/`
- ❌ Pollute the root directory with implementation details

All feature work stays in the feature branch. The only files that appear in root are actual source code, config, and tests for the project itself.

## Status File Format

The status.md file mirrors tasks.md but with progress tracking:

```markdown
# Feature XXX Implementation Status

**Overall Progress**: 5/17 tasks complete (29%)
**Current Phase**: Phase 2: Core Infrastructure
**Critical Path Status**: On track (3/11 critical tasks complete)
**Last Updated**: 2026-02-04

## Task Checklist

### Phase 1: Setup
- [x] Task 1.1: Initialize Node.js project
- [x] Task 1.2: Set up TypeScript
- [ ] Task 1.3: Configure ESLint and Prettier

### Phase 2: Core Infrastructure
- [x] Task 2.1: Build Configuration Manager
- [ ] Task 2.2: Build Logger Service (Blocked by 2.1)
- [ ] Task 2.3: Build Service Registry
...

## Blockers & Notes

- Task 2.2: Waiting for 2.1 completion ✓ Now unblocked
- Task 3.1: Ready to start (depends on 2.3)

## Metrics

- Test Coverage: 72% (target: 80%)
- Linting: 0 errors, 0 warnings
- Documentation: 85% coverage
```

## Integration with Other Skills

- **feature-spec**: Provides acceptance criteria and requirements that drive implementation
- **feature-plan**: Provides technical details that guide code structure and approach
- **feature-tasks**: Provides ordered tasks that determine execution sequence
- **feature-implement**: (This skill) Executes all tasks autonomously and produces working code

## Notes for AI Assistants

- **You are the implementer**: Do not ask the user what to do or wait for user input
- **Work autonomously**: Start with Task 1.1 and execute all tasks sequentially until complete
- **Always verify branch**: Check `git branch --show-current` at session start
- **Write real code**: Not pseudo-code or descriptions—actual working source files
- **Update .tasks.md FIRST**: Mark tasks complete in `features/XXX-feature-name.tasks.md` by changing `- [ ]` to `- [x]`
- **Update status.md SECOND**: Mirror the same checkmarks in `features/XXX-feature-name/status.md`
- **Never skip acceptance criteria**: All must be met; run tests to verify
- **Commit after each task**: Use format `✓ Task X.Y: [Task Name]`
- **Run tests and linting**: Verify quality gates before committing
- **Document as you go**: Add inline comments, docstrings, and README updates
- **Link to documentation**: Reference spec.md, plan.md, and tasks.md when making decisions
- **Handle blockers gracefully**: If a task has unmet dependencies, note it and move on; don't get stuck
- **NO ROOT DIRECTORY FILES**: Do not create completion reports, status files, or other artifacts in the root `/` directory
- **ALL WORK IN /features/XXX-feature-name/**: Keep feature work contained in feature directory

## Example: Full Autonomous Implementation Run

```
User: "Run feature-implement skill"

Skill Response:
✅ Verified: feature/001-mcp-host-bootstrap branch is active
✅ Found: 001-mcp-host-bootstrap.spec.md
✅ Found: 001-mcp-host-bootstrap.plan.md
✅ Found: 001-mcp-host-bootstrap.tasks.md
✅ Found: 001-mcp-host-bootstrap/status.md

📊 Implementation Status
- Overall Progress: 0/17 tasks (0%)
- Current Phase: Phase 1: Project Setup
- Dependencies: All clear for Phase 1

🚀 BEGINNING AUTONOMOUS IMPLEMENTATION
================================================

✅ TASK 1.1: Initialize Node.js Project
   └─ Implementing...
   ├─ Created: package.json with all dependencies
   ├─ Created: tsconfig.json with strict mode
   ├─ Created: .gitignore with proper exclusions
   ├─ Created: src/index.ts
   ├─ Created: src/config/, src/logger/, src/server/, src/services/
   ├─ Created: tests/ directory
   ├─ Ran: npm install ✓
   ├─ Ran: npm run build ✓
   ├─ Ran: npm run test ✓
   └─ Committed: ✓ Task 1.1: Initialize Node.js Project
   
   Progress: 1/17 (6%) ✅

✅ TASK 1.2: Environment Configuration Files
   └─ Implementing...
   ├─ Created: .env.example with required variables
   ├─ Created: src/config/index.ts with validation
   ├─ Added: dotenv loading to src/index.ts
   ├─ Verified: npm run build ✓
   └─ Committed: ✓ Task 1.2: Environment Configuration Files
   
   Progress: 2/17 (12%) ✅

✅ TASK 1.3: Linting and Code Formatting
   └─ Implementing...
   ├─ Created: .eslintrc.json configuration
   ├─ Created: .prettierrc configuration
   ├─ Updated: package.json with lint scripts
   ├─ Ran: eslint src/ ✓
   ├─ Ran: prettier --check . ✓
   └─ Committed: ✓ Task 1.3: Linting and Code Formatting
   
   Progress: 3/17 (18%) ✅

[... continues for all 17 tasks ...]

✅ TASK 5.3: Smoke Test Verification
   └─ Implementing...
   ├─ Started: npm start
   ├─ Verified: Server listening on port 3000 ✓
   ├─ Tested: GraphQL /graphql endpoint ✓
   ├─ Tested: Health check /health endpoint ✓
   ├─ Verified: Test coverage > 80% ✓
   └─ Committed: ✓ Task 5.3: Smoke Test Verification
   
   Progress: 17/17 (100%) ✅

================================================
🎉 FEATURE 001 IMPLEMENTATION COMPLETE!
================================================

📊 Final Summary
├─ Tasks Completed: 17/17 ✅
├─ Total Lines Added: 2,847
├─ Files Created: 34
├─ Files Modified: 2
├─ Test Coverage: 87%
├─ Linting: 0 errors, 0 warnings
└─ Documentation: Updated

🔗 Commits Made (17 total)
├─ ✓ Task 1.1: Initialize Node.js Project
├─ ✓ Task 1.2: Environment Configuration Files
├─ ✓ Task 1.3: Linting and Code Formatting
├─ ✓ Task 2.1: Configuration Manager Module
[... all 17 commits ...]
└─ ✓ Task 5.3: Smoke Test Verification

📝 Next Steps
1. Review the completed implementation at /features/001-mcp-host-bootstrap/
2. Push feature branch and create a pull request to main
3. Have the PR reviewed and merged
4. Begin Feature 002 (EventLog MCP Read-Only Service)
```

## Example: Completing a Task

```
User: "Task 1.1 is complete. I've initialized npm, created package.json with base dependencies, and set up the basic directory structure."

Skill Response:
✅ Task 1.1: Initialize Node.js Project - COMPLETED

Acceptance Criteria Verification:
- [x] npm project initialized with package.json
- [x] Base dependencies installed (express, apollo-server, etc.)
- [x] Directory structure created: /src, /tests, /config
- [x] README.md updated with setup instructions
- [x] .gitignore configured for node_modules
- [x] All changes committed to feature branch

📝 Updating Status
Updating 001-mcp-host-bootstrap/status.md...
✓ Task 1.1 marked complete
✓ Task 1.2 now ready to start (no blockers)
✓ Task 1.3 now ready to start (no blockers)

📊 New Progress
- Overall: 1/17 tasks complete (6%)
- Phase 1: 1/3 tasks complete (33%)
- Critical Path: On track

🎯 Next Task (Ready to Start)
Task 1.2: Set Up TypeScript Configuration (Simple, 1 hour)
- Configure tsconfig.json
- Set up build scripts
- Verify compilation works

Ready to continue?
```

## Success Criteria for This Skill

✅ Feature branch is created and maintained throughout
✅ All 17 tasks are implemented with actual working code
✅ All acceptance criteria for every task are met
✅ Tests pass and coverage exceeds 80%
✅ Code follows project style guidelines
✅ Each task gets its own commit with proper message
✅ status.md is updated after each task completion
✅ No tasks are skipped, deferred, or marked incomplete
✅ Documentation (README, inline comments, docstrings) is complete
✅ User receives single summary at end showing everything that was built
