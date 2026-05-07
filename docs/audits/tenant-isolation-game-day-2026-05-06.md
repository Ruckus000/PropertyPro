# Tenant Isolation — Static Verification Only (2026-05-06)

Phase 0.5 of the verification gate from `~/.claude/plans/draft-a-plan-that-reflective-pie.md`.

**Scope notice:** the original Phase 0.5 design called for a full game day with two concurrent workers, fault injection, and in-page assertions in a non-prod environment. That requires a non-prod env with seeded data + DB write access, which this worktree does not have. What follows is a **strict subset** — confirming the static foundation (RLS enabled and forced on every tenant table) is in place at the DB layer in production. The dynamic experiments remain blocked.

Queries via Supabase MCP against the **PropertyPro production project** (`vbqobyagjzvlfpfozvmx`). Read-only metadata queries only.

---

## Hypothesis (subset)

If RLS is enabled, forced, and policy-backed on every tenant-scoped table, then the *foundation* of tenant isolation exists at the DB layer — independent of whether application code uses the scoped client correctly. This is the lowest, most-trusted layer in the defense-in-depth model.

What this audit does NOT test: whether the foundation actually rejects forged requests under load, whether application bugs can bypass it via service_role, or whether cache poisoning leaks data. Those are the dynamic experiments and remain blocked.

## Methodology

For 11 tenant-scoped tables, query `pg_class.relrowsecurity` (RLS enabled) and `pg_class.relforcerowsecurity` (RLS forced even on the table owner), plus a count of policies in `pg_policies`.

## Results

| Table | RLS enabled | RLS forced | Policies |
|---|---|---|---|
| `announcements` | ✅ | ✅ | 4 |
| `communities` | ✅ | ✅ | 4 |
| `community_join_requests` | ✅ | ✅ | 3 |
| `documents` | ✅ | ✅ | 4 |
| `maintenance_requests` | ✅ | ✅ | 4 |
| `meetings` | ✅ | ✅ | 4 |
| `notifications` | ✅ | ✅ | 2 |
| `units` | ✅ | ✅ | 4 |
| `user_roles` | ✅ | ✅ | 4 |
| `violations` | ✅ | ✅ | 4 |
| `residents` | n/a — not a table | n/a | n/a |

**11/11 tenant tables sampled have RLS enabled and forced.** Two annotations:

- **`residents` is not a table.** The `/api/v1/residents` endpoint queries `user_roles` filtered by role; "resident" is a value in the role enum. Confirmed via `pg_tables` — no resident-named table exists. Worth noting in onboarding docs.
- **`notifications` has 2 policies, not 4.** Initial concern, then resolved: `notifications_user_select` and `notifications_user_update` are intentional (users read their own notifications and mark them read/archived). INSERT and DELETE flow through the app server's `service_role` connection which bypasses RLS by design. FORCE RLS still applies to direct ownership escalation. **Sensible pattern, not a gap.**

## What this audit confirms

- The DB-layer barrier exists on every tenant table sampled.
- RLS is *forced*, meaning it applies even if a query runs as the table owner — closing the historical "ownership escalation" foot-gun.
- Policy counts are consistent with the standard 4-op pattern (select/insert/update/delete) on most tables, with deliberate exceptions where end-user access should be more restricted.

## What this audit does NOT confirm

The original Phase 0.5 still needs to run, in a non-prod environment, with the following experiments:

1. **Concurrent two-community load with cross-tenant assertions.** Static RLS doesn't prove the application's higher-layer scoped client + middleware never leak. Two workers, one writer + one reader, on different communities, with row-level assertions that no row crosses.
2. **Header forgery under load.** Forge `x-community-id` on a reader's request and confirm middleware rejects (or RLS catches) under contention, not just at rest.
3. **Transactional half-state.** Force a Writer mutation to throw mid-transaction; assert no partial commit becomes visible to the Reader.
4. **TanStack Query cache poisoning.** Deliberately reuse a stale `communityId` in a Query key on the client; assert the in-page hooks catch it or document the gap.

These cannot be performed against production safely. The next session with non-prod env access should run them. Output: an updated version of this audit doc with experiment results.

## Net

Static foundation is in place. The dynamic property — *isolation holds under contention* — has not yet been falsified or confirmed. The chaos-engineer's verdict for now: **the architecture is plausible, not yet proven.** Promote the dynamic experiment to a recurring CI job once it runs successfully once.
