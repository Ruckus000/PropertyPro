You are implementing P4-56 (Security Audit) in PropertyPro with permission prompts disabled.

READ FIRST
- /Users/jphilistin/Documents/Coding/PropertyPro/AGENTS.md
- /Users/jphilistin/Documents/Coding/PropertyPro/CLAUDE.md
- /Users/jphilistin/Documents/Coding/PropertyPro/PHASE4_EXECUTION_PLAN.md
- /Users/jphilistin/Documents/Coding/PropertyPro/IMPLEMENTATION_PLAN.md (P4-56 section)

STARTUP CHECKS (must run first)
- `pwd`
- `git branch --show-current`
- Confirm branch is `codex/p4-56-security-audit`

RUN MODE (PERMISSIONS DISABLED)
- You are running with skip-permissions enabled.
- Self-enforce scope and safety.
- Do not assume broad repo mutation is allowed.

HARD SCOPE LOCK (P4-56 ONLY)
- Implement ONLY `P4-56` Security Audit.
- Allowed changes: security audit docs, middleware security headers (CORS/CSP), Zod validation coverage, API error sanitization, dependency audit remediation if directly required, and tests for those.
- Do NOT implement `P4-57+`.
- Do NOT redo `P4-55` RLS.
- Do NOT edit unrelated product features or Phase 3 surfaces.
- Do NOT edit automation files, secrets, `.env*`, or unrelated CI/workflows unless strictly required for P4-56 correctness.
- Do NOT use destructive git commands.

PROJECT RULES (must obey)
- No `any`
- No `@ts-ignore`
- Preserve tenant scoping/query access boundaries
- API routes use `withErrorHandler`
- Add tests before considering implementation complete
- Fix implementation, not test assertions

ITERATION DISCIPLINE (HARD CAP 8)
- Iteration 1: inspect P4-56 scope + identify exact files + write failing tests plan
- Iteration 2-6: implement security hardening in vertical slices with targeted tests
- Iteration 7: run relevant lint/typecheck/tests for touched scope
- Iteration 8: only final fixes; no feature expansion
- If blocked by unrelated failures, stop and report blocker precisely

UNRELATED-CHANGE GUARD
- Before final response run: `git diff --name-only`
- If out-of-scope files were changed, revert only your accidental out-of-scope edits and report them

TRACKER UPDATE
- If P4-56 is complete, update `/Users/jphilistin/Documents/Coding/PropertyPro/PHASE4_EXECUTION_PLAN.md` to mark `P4-56` complete and set Phase 4 to `2/10`, next = `P4-57`.

FINAL RESPONSE RULE
- End with exactly `<promise>ALL TESTS PASSING</promise>` only if required scope checks pass.
- Otherwise do not use the success marker; report what remains and exact blockers.
