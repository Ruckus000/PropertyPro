# PropertyPro Florida: Implementation Planning Prompt
## Ralph Wiggum Technique

**Objective:** Create a detailed, prioritized implementation plan by analyzing specs against current codebase state.

**Output:** `IMPLEMENTATION_PLAN.md` with ordered tasks, blockers, and risk flags.

---

## Phase 1: Read and Inventory

### 1.1 Read All Phase Specifications
- Read every spec file in `specs/phase-0/`, `specs/phase-1/`, `specs/phase-2/`, `specs/phase-3/`, `specs/phase-4/`
- For each spec, extract:
  - **Feature Name** - What is being built?
  - **Dependencies** - What must exist first?
  - **Tech Stack Requirements** - Services, packages, or infrastructure needed
  - **Acceptance Criteria** - How do we know it's done?
  - **Files Affected** - Which source files should change

### 1.2 Audit Current Codebase State
- List all source files in the codebase with their status (exists/missing)
- Check which test files exist and run tests to see what passes/fails
- Document the current state of each tech stack component:
  - Next.js 14+ App Router setup
  - TypeScript configuration
  - Tailwind CSS setup
  - Supabase (DB, Auth, Storage) integration
  - Drizzle ORM schema and migrations
  - Resend email setup
  - Stripe integration
  - Turborepo configuration
- Note any environment variables that are missing or misconfigured

### 1.3 Read AGENTS.md
- Open `AGENTS.md` and carefully note all known pitfalls
- Add these pitfalls to your planning context
- Flag any spec that triggers a known pitfall

---

## Phase 2: Gap Analysis

### 2.1 Compare Specs to Implementation
For each spec:
1. Check if the feature files exist in the codebase
2. Check if test coverage exists for the feature
3. Determine implementation status:
   - **Not Started** - No files exist
   - **Partially Implemented** - Files exist, tests failing or incomplete
   - **Blocked** - Dependencies not met
   - **Complete** - Tests passing, feature working

### 2.2 Identify Spec Dependency Graph
- For each spec, identify what other specs must be complete first
- Create a visual dependency chain (you can use text arrows: A → B → C)
- Mark specs as **BLOCKED** if their dependencies aren't met

### 2.3 Flag Stuck Specs
- For specs that have been attempted 10+ times:
  - Mark as **STUCK**
  - Recommend splitting into smaller tasks
  - List why it's failing
  - Suggest a reduced scope version to unblock progress

---

## Phase 3: Generate Implementation Plan

### 3.1 Build Prioritized Task List
Order tasks by:
1. **Phase** - Phase 0 before Phase 1, etc.
2. **Dependencies** - A task that blocks others comes first
3. **Risk** - Flag high-risk tasks (complex, many moving parts, dependency on external service)
4. **Size** - Small tasks before large ones (within same phase/dependency level)

### 3.2 For Each Task, Document:
```
## Task: [Feature Name]
- **Phase:** X
- **Status:** Not Started | Partially Implemented | Blocked | Complete
- **Files to Create/Modify:** [list]
- **Dependencies:** [spec A, spec B]
- **Blocks:** [spec C, spec D]
- **Acceptance Criteria:** [from spec]
- **Known Pitfalls:** [from AGENTS.md if applicable]
- **Estimated Effort:** Small | Medium | Large
- **Risk:** None | Low | Medium | High
```

### 3.3 Create a Critical Path
- Identify the shortest path to a working MVP
- Highlight which tasks MUST be done first
- Mark optional/nice-to-have features separately

---

## Phase 4: Output Format

Write results to `IMPLEMENTATION_PLAN.md` with this structure:

```markdown
# PropertyPro Florida: Implementation Plan
Generated: [timestamp]

## Overview
- **Total Tasks:** [number]
- **Blocked Tasks:** [number]
- **Stuck Tasks:** [number]
- **Estimated Effort:** [total effort]

## Critical Path (MVP)
[List of tasks needed for minimal working product]

## Phase 0 Tasks
[Ordered task list]

## Phase 1 Tasks
[Ordered task list]

## Phase 2 Tasks
[Ordered task list]

## Phase 3 Tasks
[Ordered task list]

## Phase 4 Tasks
[Ordered task list]

## Blocked Tasks
[List specs blocked by missing dependencies]

## Stuck Tasks
[Specs attempted 10+ times - recommend splitting]

## Risk Register
[High-risk tasks and mitigation strategies]

## Dependency Graph
[Visual representation of task dependencies]
```

---

## Constraints

1. **DO NOT** write any code
2. **DO NOT** create commits or modify the codebase
3. **DO** read specs and code thoroughly
4. **DO** be honest about gaps and blockers
5. **DO** check test results against current codebase
6. **DO** flag assumptions that need validation
7. **DO** recommend next steps but don't implement them

---

## Success Criteria

- [ ] All specs (phase-0 through phase-4) are read and understood
- [ ] Current codebase state is accurately documented
- [ ] All gaps are identified
- [ ] Tasks are ordered by logical dependency
- [ ] Blocked specs are clearly marked with reasons
- [ ] Stuck specs (if any) are flagged and split recommendations given
- [ ] `IMPLEMENTATION_PLAN.md` is complete and ready for agent execution
- [ ] AGENTS.md pitfalls are considered in the plan
