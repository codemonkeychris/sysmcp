# Skill: feature-spec

## Purpose
Creates a feature specification document by asking clarifying questions to flesh out the feature design.

## Input
- Feature idea or requirement (user provides)
- Feature number (auto-assigned if not provided, format: 001, 002, etc.)

## Output
- Specification document saved to: `/features/XXX-feature-name.spec.md`
- Git branch created: `feature/XXX-feature-name`
- Git checkout to new branch

## Execution Steps

1. **Determine Feature Number**
   - Ask user if they have a preferred feature number
   - If not, scan `/features` directory for highest number
   - Assign next sequential number (001, 002, etc.)

2. **Gather Feature Title**
   - Ask user for descriptive feature title
   - Format: short, lowercase-hyphenated (e.g., "user-authentication", "email-notifications")
   - Final feature ID: XXX-feature-name (e.g., "001-user-authentication")

3. **Ask Clarifying Questions** (ask_user tool for each)
   - What is the main goal of this feature?
   - What user problem does it solve?
   - Who are the primary users?
   - What are the must-have requirements?
   - Are there any constraints or limitations?
   - What should be explicitly out of scope?
   - How do we know this feature is successful?

4. **Create Specification Document**
   Save to `/features/XXX-feature-name.spec.md` with sections:
   
   - Overview (one paragraph summary)
   - Goals (bullet list)
   - User Stories (as/I want/so that format)
   - Functional Requirements
   - Non-Functional Requirements
   - Constraints & Limitations
   - Out of Scope
   - Success Criteria (checklist)
   - Questions for Design Review
   - Next Steps

5. **Create Git Branch**
   - Command: `git checkout -b feature/XXX-feature-name`

6. **Output Summary**
   - Feature ID and name
   - Specification file path
   - Git branch created
   - Next step: Run feature-plan skill

## Rules
- Feature number must not already exist
- Verify no feature with same name exists
- Always create git branch before returning
- Always save specification file before returning
- Use consistent naming: lowercase, hyphens between words
