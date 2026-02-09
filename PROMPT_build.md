# PropertyPro Florida - Ralph Wiggum Build Technique

## Overview

You are building PropertyPro Florida, a compliance and community management platform for Florida condo associations, HOAs, and apartment communities.

**Tech Stack:**
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Database + Auth + Storage)
- Drizzle ORM
- Resend (Email)
- Stripe (Payments)
- Turborepo monorepo with pnpm workspaces
- Deployed on Vercel

**Monorepo Structure:**
- `apps/web/` — Next.js application
- `packages/ui/` — Design system (tokens + components)
- `packages/shared/` — Types, constants, validation schemas (Zod)
- `packages/db/` — Drizzle schema, migrations, scoped query builder
- `packages/email/` — React Email templates

---

## Build Process (Follow These Steps in Order)

### 1. Find the Next Task

Read `IMPLEMENTATION_PLAN.md` to identify the next incomplete task. This is your source of truth for what needs to be built. Do not skip ahead or work on tasks out of order.

### 2. Check for Known Pitfalls

Read `AGENTS.md` and locate any notes relevant to the current task. This file accumulates learnings from previous attempts. Use it to avoid repeating mistakes.

### 3. Read the Specification

Read the specific spec file for your task (e.g., `specs/auth.md`, `specs/dashboard.md`, etc.). Understand the requirements completely before writing any code.

### 4. Implement Using Test-Driven Development

**Write failing tests first:**
- Create test files alongside your implementation
- Write tests that fail (red phase)
- Make assertions that describe the desired behavior
- **Do NOT write assertions to match broken code**

**Then implement (green phase):**
- Write the implementation to make tests pass
- Follow the spec exactly
- Use types correctly — no `any` or `@ts-ignore`

**Finally verify (refactor phase):**
- Run tests again to confirm they all pass
- Check code quality

### 5. Lint and Type Check

Run the following commands in order:

```bash
pnpm lint
pnpm typecheck
```

**Code must pass both checks.** If there are linting errors or type errors, fix them. Do not skip this step.

### 6. Run Full Test Suite

```bash
pnpm test
```

**All tests must pass** — not just your new tests, but the entire suite. If tests fail:
1. Read the failure output carefully
2. Debug the issue
3. Fix the implementation or tests
4. Do NOT delete or modify test assertions to make them pass
5. Do NOT skip failing tests
6. Rerun until all pass

### 7. Handle Test Failures

If `pnpm test` fails:
- **Never modify test assertions** to match broken code — fix the implementation instead
- **Never delete tests** just to make the suite pass
- **Never use `only()` or `skip()`** to bypass failing tests
- Debug systematically: read error messages, check the code, trace the issue, implement a fix, retest

### 8. Commit on Success

Once all linting, type checking, and tests pass, commit your changes with a conventional commit message:

```bash
git add .
git commit -m "feat(area): implement <feature> per spec <spec-filename>"
```

or

```bash
git commit -m "fix(area): resolve <issue> per spec <spec-filename>"
```

Always reference the spec file in your commit message.

### 9. Update the Plan

Mark the completed task as done in `IMPLEMENTATION_PLAN.md`. Add a completion date or checkmark. Do this for every task you finish.

### 10. Move to the Next Task

Repeat from step 1 until all tasks in `IMPLEMENTATION_PLAN.md` are marked complete.

### 11. Signal Completion

When every task in `IMPLEMENTATION_PLAN.md` is complete, output:

```
<promise>COMPLETE</promise>
```

This signals that the build is done.

---

## Critical Rules

### Code Quality and Type Safety

- **Never skip type errors** with `any` or `@ts-ignore`
- Resolve all TypeScript errors properly
- Pass `pnpm lint` and `pnpm typecheck` for every task
- All tests must pass — use proper debugging, not test deletion

### Database Queries

- **Every database query must go through the scoped query builder**
- The scoped query builder automatically filters by `community_id`
- This ensures compliance and data isolation for multi-tenant requirements
- Do not write raw Supabase queries that bypass the builder

### Date/Time Handling

- **Store all dates as UTC** in the database
- Convert to community timezone **only in the UI layer**
- Use community timezone settings when displaying dates to users
- Timestamps should never be timezone-specific in the database

### API Routes and Error Handling

- **Every API route must be wrapped in `withErrorHandler`**
- This provides consistent error handling and logging across the platform
- Use the error handler utility provided in the codebase

### Audit Logging for Compliance

- **Every mutation endpoint must call `logAuditEvent`** for compliance-relevant actions
- This includes:
  - User creation, updates, deletions
  - Permission changes
  - Document uploads/deletions
  - Payment processing
  - Rule changes
  - Any other actions that must be tracked for regulatory compliance
- Log the action type, actor, timestamp, and details as required by the spec

### Continuous Learning

- **Before starting every new spec, check `AGENTS.md`**
- It accumulates learnings, common pitfalls, and solutions from all previous attempts
- Use this knowledge to avoid repeating mistakes
- If you encounter a new pitfall or learn something, you might add it to `AGENTS.md` for future reference

---

## Success Criteria

For each task:
- ✓ Spec read and understood
- ✓ Tests written (fail initially)
- ✓ Implementation complete
- ✓ All tests pass
- ✓ `pnpm lint` passes
- ✓ `pnpm typecheck` passes
- ✓ Conventional commit with spec reference
- ✓ `IMPLEMENTATION_PLAN.md` updated

For the build:
- ✓ All tasks in plan completed
- ✓ Output `<promise>COMPLETE</promise>`

---

## Questions to Ask Yourself

Before moving forward:

1. Have I read the current spec completely?
2. Have I checked `AGENTS.md` for this area?
3. Are my tests written to spec, not to broken code?
4. Do all tests pass (not just new ones)?
5. Does the code pass linting and type checking?
6. Did I use the scoped query builder for all DB queries?
7. Are dates stored as UTC?
8. Are API routes wrapped in error handler?
9. Did I call `logAuditEvent` for compliance actions?
10. Have I committed with a meaningful message?
11. Have I updated `IMPLEMENTATION_PLAN.md`?

If all answers are yes, move to the next task.

---

## Ralph Wiggum Mantra

*"I'm helping."*

You are the agent helping build PropertyPro Florida. Follow this process literally. Read the plan. Check the learnings. Read the spec. Write tests. Implement. Verify. Lint. Type check. Test. Commit. Update plan. Repeat.

The clarity of this process is your strength. Use it.
