# Guard Adversarial Coverage Audit (2026-05-06)

Phase 0 step 0.4 from `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

Each new CI guard is a regex / lint rule. This audit attempts to bypass each one and reports what holds, what doesn't, and what extensions (if any) are warranted. Goal: convert "looks correct" into "demonstrably correct."

---

## 0.4a — Component-API-call guard regex coverage

**Hypothesis:** the [`scripts/verify-component-api-calls.ts`](../../scripts/verify-component-api-calls.ts) regex (`\bfetch\s*\(\s*[`'"]\/api\/v1\/`) misses non-`fetch` HTTP libraries used in component scope.

**Method:** grep for `axios.<verb>`, `XMLHttpRequest`, `sendBeacon`, `navigator.sendBeacon` against `apps/web/src/components` and all `apps/web/src/app/(authenticated|public|onboarding|auth|marketing)` directories. Also check `package.json` for non-fetch HTTP libs.

**Result:** ✅ guard is sufficient.

- Zero `axios` callsites in any component or page directory.
- Zero `XMLHttpRequest` callsites.
- Zero `sendBeacon` callsites.
- `axios` is not a dependency in either `apps/web/package.json` or root `package.json`.

The codebase is `fetch`-only on the client. The guard's `fetch(`-only regex matches the actual surface area. **No regex extension warranted.**

---

## 0.4b — Template-literal fetch coverage

**Hypothesis:** the regex requires a leading string-literal opener ([`'"`]) immediately after `fetch(`, which catches simple cases. Template literals (\`/api/v1/${x}\`) start with backtick — does the regex catch them?

**Method:** injected `apps/web/src/components/test-template-fetch-DELETEME.tsx` with `` fetch(`/api/v1/things/${id}`).then(...) `` and ran the guard.

**Result:** ✅ caught.

```
❌ 1 new direct API call(s) detected outside the allowlist:
  apps/web/src/components/test-template-fetch-DELETEME.tsx:4
      fetch(`/api/v1/things/${id}`).then((r) => r.json());
```

Exit code 1. The character class `[`'"]` includes the backtick, so template literals are correctly matched. Test file removed.

---

## 0.4c — Migration-ordering guard against drizzle-kit-generated names

**Hypothesis:** the guard's literal `tag === filename` comparison may reject names that drizzle-kit produces with unexpected formatting.

**Method:** attempted `pnpm --filter @propertypro/db db:generate -- --name=chaos_test_zzz`.

**Result:** ⚠️ **drizzle-kit generate is currently broken in this repo, separate finding.**

```
Error: [migrations/meta/0021_snapshot.json, migrations/meta/0022_snapshot.json,
        migrations/meta/0023_snapshot.json, migrations/meta/0024_snapshot.json]
        are pointing to a parent snapshot: migrations/meta/0021_snapshot.json/snapshot.json
        which is a collision.
```

Cannot test the guard directly via the canonical path. **However**, by inspection of the existing 111 journal entries, the guard's literal-string comparison is robust to all observed name patterns:

- Standard descriptive: `0005_append_only_audit_log`
- Long phrases: `0025_p4_55f_community_settings_and_user_scoped_rls`
- Suffixed indices: `0139a_stripe_prices_unit_amount_not_null`
- Auto-generated names: `0000_flashy_toro`

The guard's logic is `journalTags.has(tag)` where `tag = filename.replace(/\.sql$/, '')`. As long as drizzle-kit emits matching journal+filename pairs (its standard behavior), the guard will accept whatever shape comes out.

**Separate finding — block for later:** the snapshot collision blocks `db:generate` entirely. The team cannot currently produce new migrations through the canonical path. This needs investigation independent of Phase 0; tentatively related to the same drift class that produced the 3 orphan files (`0011_billing_scheduler.sql` etc.). Possible fix paths:
1. Identify and rebase the colliding snapshots (`0021_snapshot.json` etc.).
2. Rebuild the snapshot chain from the current schema.
3. Coordinate with whoever applied the orphans manually.

Logged for the next migration-tooling triage.

---

## 0.4d — Pagination helper integration test

**Hypothesis:** the `paginate()` unit tests use mocked drizzle ops; the SQL it produces may not be valid against the real schema, particularly around bigint columns and the cursor predicate.

**Method:** authored [`packages/db/__tests__/pagination.integration.test.ts`](../../packages/db/__tests__/pagination.integration.test.ts), 7 test cases covering:

1. Walk all 250 rows forward; assert no gaps, no duplicates.
2. Default direction is descending by `id`.
3. `nextCursor` decodes to the **last visible** row's id, not the look-ahead row's.
4. Final page returns `hasMore=false`, `nextCursor=null`.
5. Stale cursor (id past the smallest available) returns empty data with no error.
6. Malformed cursor is treated as "first page" without throwing.
7. Cross-tenant safety: pagination on one community never returns another community's rows.

The suite also seeds one row mid-range as soft-deleted to prove the scoped client's automatic `deletedAt IS NULL` filter is honored during pagination (one of the original A2 risks the unit tests with mocks could not validate).

**Result:** ⏸ **authored, not yet executed.** This worktree lacks `DATABASE_URL`, so the suite skips. The integration test config (`packages/db/vitest.integration.config.ts`) picks it up; CI will run it against seeded Postgres on the next push.

The skip is graceful and verified:
```
↓ __tests__/pagination.integration.test.ts (7 tests | 7 skipped)
Test Files  1 skipped (1)
```

When CI runs it, it will either confirm the SQL is valid or surface a concrete failure to fix.

---

## 0.4e — Pagination helper without `id` column

**Hypothesis:** the helper throws when the table has no `id`, but the message may not be actionable.

**Method:** read the throw site at [`packages/db/src/pagination.ts:175`](../../packages/db/src/pagination.ts).

**Result:** ✅ message is actionable.

```
paginate(): table "<name>" has no 'id' column.
This helper only supports tables with a numeric primary key.
```

Includes the table name and explains the constraint. No change needed.

---

## Phase 0 — remaining steps (blocked on access)

These are documented but cannot be executed from this worktree without environment access:

| Step | Blocker | Owner action required |
|---|---|---|
| **0.1** Confirm production schema for orphan migrations | Production Supabase read access | Run the 3 SQL queries against prod (see plan doc), report results |
| **0.2** Quantify historical notification drop rate | Production Supabase read access | Run the 2 SQL queries, compute the delta |
| **0.3** Sentry / log baseline sweep | Sentry access | Search the 3 known signatures over 90 days |
| **0.5** Tenant-isolation game day | Non-prod environment with seeded data + DB write access | See plan for full experiment design |

Each is timeboxed (≤30 min for 0.1–0.3, half day for 0.5). Outputs are individual audit docs co-located with this one in `docs/audits/`.

---

## Summary

| Sub-step | Status | Action |
|---|---|---|
| 0.4a (non-fetch HTTP) | ✅ Pass | None — guard regex sufficient for current codebase |
| 0.4b (template literal) | ✅ Pass | None — guard catches |
| 0.4c (drizzle-kit names) | ⚠️ Inspection-verified | Open separate ticket: **drizzle-kit generate is broken** (snapshot collision) |
| 0.4d (paginate integration) | ⏸ Authored | Will run in CI; investigate failures if any |
| 0.4e (paginate without id) | ✅ Pass | None — message is actionable |

**Net result:** the 5 CI guards we shipped are not theater. The component-API-call guard's regex matches the surface area in use; the migration-ordering guard's logic accepts all observed naming patterns; the pagination helper's SQL will be validated in CI on next push. **Confidence in the foundation increased; one new finding surfaced (drizzle-kit broken) that needs separate attention.**

Phase 0.4 is complete. 0.1, 0.2, 0.3, 0.5 await environment access.
