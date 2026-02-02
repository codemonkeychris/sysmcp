# Skill: feature-plan

## Purpose
Takes a feature specification and creates a detailed technical implementation plan by researching the codebase.

## Input
- Feature number or specification file path (e.g., "001" or "features/001-feature-name.spec.md")

## Output
- Technical plan document saved to: `/features/XXX-feature-name.plan.md`

## Execution Steps

1. **Locate Specification**
   - Accept feature number or file path from user
   - If number provided (e.g., "001"), find `/features/001-*.spec.md`
   - Read and parse specification

2. **Analyze Current Codebase** (if code exists)
   - Explore repository structure
   - Identify relevant components
   - Check for existing similar functionality
   - Document current architecture

3. **Design Technical Solution**
   - Based on spec requirements, design implementation approach
   - Identify affected modules/components
   - Plan data flow and state management
   - Consider security implications

4. **Research Dependencies**
   - Identify external libraries/APIs needed
   - Check for conflicts with existing dependencies
   - Document version constraints

5. **Create Technical Plan Document**
   Save to `/features/XXX-feature-name.plan.md` with sections:

   - Architecture Overview
   - Components to Create/Modify
   - Data Flow
   - API Changes (if applicable)
   - Database Changes (if applicable)
   - Security Considerations
   - Testing Strategy
   - Implementation Risks
   - Dependencies
   - Rollout Strategy
   - Success Metrics
   - Open Questions
   - Next Steps

6. **Output Summary**
   - Plan file path
   - Key components identified
   - Major implementation risks
   - Next step: Run feature-tasks skill

## Rules
- Feature spec must exist
- Always research codebase if available
- Plan must reference the spec
- Identify all security implications
- List all dependencies clearly
