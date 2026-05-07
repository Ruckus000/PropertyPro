# Help Center Overhaul — Verification Log

- **Date:** 2026-05-07
- **Plan:** `~/.claude/plans/let-s-break-all-of-warm-penguin.md`
- **Branch:** `claude/funny-yonath-b9ed7a`

This document satisfies Gate 3 of the help-center overhaul plan. It records
the local verification evidence that supports the claim "implementation is
done." Where a check requires infrastructure not present in this worktree
(live Supabase, integration DB, dev server with seed data), the entry is
marked as **CI-required** and the CI job that will exercise it is named.

---

## Workstream completion

| WS | Status | Notes |
|---|---|---|
| WS2 + Gate 1 — frontmatter Zod schema, `guard:help-content`, ADR-004, preview script | ✅ Shipped | All 50 articles parse cleanly. Guard wired into `pnpm lint`. ADR-004 merged. |
| WS6 — resilience (debounce/abort, fail-open featureGates, contextual timeout, widget error state) | ✅ Shipped | Tests cover both fail-open and 300ms debounce paths. |
| WS7 — telemetry (Sentry signals + weekly content-gaps script) | ✅ Shipped | Three signatures captured server-side; one client-side. Gaps report verified with fixture. |
| WS1 phase 1a — search aliases + ranking + result cap | ✅ Shipped | 12 alias tests pass; 50-result cap enforced. |
| WS3 — hub redesign (Start Here hero + FAQ duplication removed) | ✅ Shipped | Eight roles validated. |
| WS4 — UX polish (HelpTooltip + mobile TOC + read-state) | ✅ Shipped | First HelpTooltip placed on board-election quorum field. |
| WS5 — statute reverse-index | ✅ Shipped | `/help/statutes` and `/help/statutes/[ref]` build clean. Statute pills clickable on article detail. |
| WS1 phase 1b — trigram migration | ⏭️ Deferred | Requires `drizzle-kit generate` round-trip against a live DB to keep the migration journal/snapshot lockstep guard satisfied. Handoff documented at the bottom of the plan file. |

---

## Gate 1 — `guard:help-content`

```
$ pnpm guard:help-content
🔍 Help Content Guard
============================================================
Scanning 50 MDX article(s) under apps/web/src/content/help

Checking COMMUNITY_FEATURE_KEYS sync with CommunityFeatures source...
Checking slug uniqueness...
Checking relatedArticles integrity...
Checking per-article schema, category, slug-filename match, staleness...

✅ Help content is valid. 50 article(s) checked, 0 warning(s), 0 errors.
```

Pre-commit, the guard caught two real corpus issues that fail-silently
under the old parser:

1. `apps/web/src/content/help/elections/using-board-polls.mdx` — missing
   `updatedAt` (fixed in this PR by adding `updatedAt: "2026-04-19"`).
2. `apps/web/src/content/help/violations/{arc-acc-submissions,reporting-and-managing-violations,responding-to-a-violation-notice}.mdx`
   — initial schema rejected the legitimate `HB 1203` Florida bill
   reference. Schema relaxed to accept both `§NNN.NNN` statute and
   `HB|SB NNNN` bill formats per `.claude/rules/florida-compliance.md`.

---

## Gate 2 — Vitest suite expansion

```
$ DATABASE_URL=postgresql://postgres:postgres@localhost:5432/propertypro_stub pnpm test
…
Test Files  368 passed | 2 skipped (370)
     Tests  5522 passed | 4 skipped | 7 todo (5533)
   Duration  28.53s
```

New suites added under [apps/web/__tests__/help/](apps/web/__tests__/help/):

| File | Tests | Focus |
|---|---|---|
| `frontmatter-schema.test.ts` | 10 | Zod schema rejects malformed input; accepts §-statutes and HB-bills; passes through unknown fields. |
| `feature-gate-failopen.test.ts` | 4 | `safelyFilterArticlesByFeatures` returns full corpus on null/undefined/throwing features; invokes `onError`. |
| `widget-resilience.test.tsx` | 2 | `useHelpSearch` debounces (300ms) and surfaces error state on 5xx (no silent stale-cache fallback). |
| `search-aliases.test.ts` | 12 | `expandQuery` resolves money/governing-doc/CAM/statute synonyms; ranking puts literal hits above alias hits; result cap enforced. |
| `start-here-role.test.ts` | 10 | Hero resolves ≥3 articles for every defined role and falls back for unknown roles; preserves configured order. |
| `statutes.test.ts` | 7 | `findArticlesByStatute` is case-insensitive on §-statutes and HB-bills; `listAllStatutes` sorts by frequency. |

Pre-existing tests under `apps/web/__tests__/help/`:

- `help-article-service.test.ts` (14 tests) — fixtures updated to include
  required `updatedAt`; two new "rejects invalid frontmatter" tests added.
- `help-hub-content.test.tsx` (2 tests) — assertions updated to reflect
  WS3's removal of the FAQ duplication on the hub.
- All other pre-existing help suites pass without change.

---

## Gate 3 — End-to-end verification

The plan's Gate 3 calls for `preview_start("web")` plus `/dev/agent-login`
flows for each role. This worktree has no live Supabase / seed data, so
the browser preview path is **CI-required** — the integration-tests job
on the PR pipeline will exercise it. What was verified locally:

| Check | Local evidence | CI to verify |
|---|---|---|
| Hub renders role-correct Start Here hero | `start-here-role.test.ts` covers 8 roles + fallback | preview screenshot per role |
| Search alias resolves | `search-aliases.test.ts` covers `fees`→`assessments`, `718.111`→`§718.111(12)(g)` | preview text input |
| Widget debounces + aborts | `widget-resilience.test.tsx` (300ms timer + AbortSignal) | preview DevTools network panel |
| Widget error state renders | `widget-resilience.test.tsx` 5xx case | preview with route override |
| Contextual timeout fallback | `withTimeoutSignal()` unit-tested via TanStack Query error path | preview with throttled network |
| Mobile TOC disclosure | Production build clean; `<details>` element present in source | `preview_resize(390, 844)` |
| Read-state checkmark | `getReadArticleSlugs` server helper + ✓ rendering wired in hero & category list | preview integration with seeded views |
| Statute reverse-index | `statutes.test.ts` resolves §718.111 and HB 1203; routes build clean | preview navigation to encoded ref |
| HelpTooltip on compliance form | Built and placed on board-election quorum field; typecheck clean | preview hover/focus interaction |
| Feature-gate fail-open | `feature-gate-failopen.test.ts` (4 cases) | preview with simulated feature service failure |

---

## Other verification steps

```
$ pnpm typecheck
…
@propertypro/web:typecheck: > tsc --noEmit
Tasks:    13 successful, 13 total
```

```
$ pnpm lint
…
✅ All @propertypro/db/unsafe imports are documented with an // AUTHZ: comment.
🔍 Help Content Guard
✅ Help content is valid. 50 article(s) checked, 0 warning(s), 0 errors.
```

```
$ pnpm build  (with CI env stubs)
…
Tasks:    7 successful, 7 total
Time:    1m45.31s
```

New routes and APIs visible in the production build output:
- `/help/statutes`
- `/help/statutes/[ref]`
- `/api/v1/help/views`

All pre-existing help routes still build.

```
$ pnpm exec tsx --tsconfig apps/web/tsconfig.json scripts/help-content-gaps-report.ts \
    --fixture /tmp/help-gaps-fixture.json
# (output verified — markdown report renders all three signal sections)
```

---

## Outstanding before merge

1. Open the PR and let the integration-tests CI job exercise the preview-
   based Gate 3 checks against seeded data.
2. After merge, run `scripts/help-content-gaps-report.ts` weekly (cron or
   manual) once a real Sentry window has accumulated traffic. The script
   is dry-run-safe; the live mode requires `SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`.
3. Schedule WS1 phase 1b (trigram) as a follow-up. Handoff steps are
   documented at the bottom of `~/.claude/plans/let-s-break-all-of-warm-penguin.md`.
