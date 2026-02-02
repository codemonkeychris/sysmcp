# Skill: feature-tasks

## Purpose
Breaks down a feature specification and technical plan into ordered, checklist-able implementation tasks.

## Input
- Feature number or spec/plan file paths (e.g., "001" or "features/001-feature-name.spec.md")

## Output
- Tasks document saved to: `/features/XXX-feature-name.tasks.md`
- Status file created at: `/features/XXX-feature-name/status.md` (same content for tracking)
- Directory created: `/features/XXX-feature-name/`

## Execution Steps

1. **Locate Documents**
   - Accept feature number or file paths from user
   - Find and read spec: `/features/XXX-*.spec.md`
   - Find and read plan: `/features/XXX-*.plan.md` (optional but recommended)

2. **Analyze Requirements**
   - Extract all requirements from spec
   - Review technical plan for implementation approach
   - Identify dependencies and ordering constraints

3. **Break Down Into Tasks**
   - Create 5-15 tasks (typically)
   - Organize into categories: Setup, Core Implementation, Testing, Documentation, Integration
   - Order tasks by dependency and logical flow
   - Mark critical path tasks
   - Note any parallel-able tasks

4. **Create Tasks Document**
   Save to `/features/XXX-feature-name.tasks.md` with sections:

   - Task Breakdown (by category with checklists and descriptions)
   - Task Dependencies (diagram or text)
   - Notes
   - Critical Path
   - Parallel Work Opportunities
   - Risk Mitigation

5. **Create Status Tracking File**
   - Create directory: `/features/XXX-feature-name/`
   - Create `/features/XXX-feature-name/status.md` with same checklist
   - Add tracking metadata: progress %, started date, etc.

6. **Output Summary**
   - Tasks file path
   - Number of tasks created
   - Critical path identified
   - Estimated effort (if determinable)
   - Next step: Begin implementation by checking out feature branch

## Rules
- Feature spec must exist
- Plan should exist (warn if missing, but don't require)
- Tasks must be ordered by dependency
- Each task must have clear acceptance criteria
- Critical path must be identified
- Create feature directory for status tracking
