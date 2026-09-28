# Phase 2 prod preconditions — executed read-only 2026-09-26 ~21:10 EDT

Authorized by the human (merge-policy decision: "Pre-run prod checks, then
auto-merge"). All queries ran through `psql` against `.env.local`'s
DATABASE_URL with `PGOPTIONS="-c default_transaction_read_only=on"`. No secret
was echoed. No write was attempted; the read-only transaction mode would have
refused one.

Intake BLOCKER W1 (run `wf_46fe67df-5ff`) named three prod-touching
preconditions that an unattended run may not execute. Results:

## 1. Migration 0076 live in prod (the deploy-live phase gate)

`drizzle.__drizzle_migrations` holds exactly **1 row** matching the sha256 of
`packages/db/migrations/0076_keyset_indexes_hard_tier.sql`
(compare form: `hash like '%<sha>%'` — the column is text, `encode()` fails).
Ledger tip: `id=106`, **77 rows** total.

Note for the runner: the spec gate's `encode(hash,'hex')` verifyCommand is
broken against the real column type; the working form is above.

## 2. faqs.role_visibility census (S7 PR-B precondition)

```
select coalesce(array_length(role_visibility,1),0) as len, count(*)
from faqs where deleted_at is null group by 1;
→ 0|5
```

**5 live faq rows, every one with an EMPTY role_visibility array. Zero legacy
tokens** (`cam`, `pm_admin`, `site_manager`, `property_manager_admin`) exist in
prod. No repair is needed. The S7 PR-B failure mode (silent manager-facing FAQ
invisibility when the SQL alias mirror is deleted) has no fuel in prod **as of
this timestamp**. The census is a snapshot: faq rows can be created between now
and merge, so S7 PR-B keeps its dated re-check at merge time (D19 stands).

## 3. noticePdfGenerationEnabled kill switch (S11 merge precondition)

```
select count(*) from communities
 where community_settings->>'noticePdfGenerationEnabled' = 'true';   → 0
select count(*) from communities
 where community_settings ? 'noticePdfGenerationEnabled';            → 0
select count(*) from platform_admin_audit_log
 where created_at >= '2026-08-09'
   and (new_values::text like '%noticePdfGenerationEnabled%'
     or old_values::text like '%noticePdfGenerationEnabled%'
     or action::text like '%noticePdf%');                            → 0
```

The kill switch is OFF for **every** community (no row even carries the key),
and **no admin-audit event has touched it since 2026-08-09** (the legal-risk
audit date). S11's merge precondition is satisfied as of this timestamp; the
PR body must still carry the dated query results and the "off as of
2026-09-26" reword (never "can never").

## Consequence for the run

Per the human's decision: the Phase 2 run may **auto-merge** after CI and the
four-lens review, EXCEPT S7's PR-B (bridge deletion), which stays human-gated
on a fresh dated census at merge time. S11 may merge on the evidence above.
