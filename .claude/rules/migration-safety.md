<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- **How to get the next free migration number — do this, do not read a number off this page.**
  Three sources, because prod runs AHEAD of `main` and a branch can claim a number that is on
  neither:

  ```bash
  ls packages/db/migrations/[0-9]*.sql | tail -1     # highest file on main
  gh pr list --state open                            # a PR may claim the next one
  # and the prod ledger, read-only:
  #   select count(*), max(id) from drizzle.__drizzle_migrations;
  ```

  **Measured 2026-09-09: files run `0000`–`0071` (70 of them; reserved gaps at `0050`/`0051`,
  journal idx 49 → 52, tolerated by the ordering guard). Prod's ledger holds 69 rows — the
  difference is `0062_secret_ballot`, merged but deliberately unapplied. No open PR and no
  branch claims a number. So the next free number was `0072`.**

  That paragraph is a snapshot and goes stale the moment anything merges — it is stamped so you
  can see how old it is, not so you can copy the digits. The previous version of this bullet
  said "Next free number: `0063`" while `0063`–`0071` were all merged; the localci gate's
  `verify-migration-ordering.ts` would have caught the collision at push time, but only after
  you had written the migration.
- **Prod runs ahead of `main`, and that is deliberate** — expand migrations are applied before
  the code that needs them merges. So `main`'s highest number is NOT the next free one, and the
  prod ledger is a database fact to be queried rather than a number to be remembered. A dated
  example of the pattern: at the 2026-07-02 reconciliation, `0020` had been applied manually
  with no ledger record, so rows for `0014`–`0020` were backfilled and `0021`/`0022` recorded at
  apply time; both had been applied to prod ahead of their PRs (#752 / #757) merging.
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- **Migrations are applied to prod MANUALLY** (Supabase MCP `apply_migration`, then verify via `information_schema`). This is the single, deliberate apply path — do NOT rely on CI to migrate.
  - *Deploy model (corrected — verify via GH run history, not the workflow file alone):* `deploy.yml` deploys **CODE ONLY** (`vercel build --prod` + `vercel deploy --prebuilt --prod`) on the **push to `main`** — not on a CI result. `ci.yml` has been `disabled_manually` since #976; a pushed deploy is gated on the Integration Tests run for that SHA, and a `workflow_dispatch` deploy is not gated at all. The earlier `db:migrate` gate (#683) was **removed** (`fix/deploy-pipeline-manual-migrations`): it conflicted with manual applies (ledger drift → `check_for_column_name_collision`), failed on every run, and silently **blocked all prod deploys for ~2 weeks** (last good deploy 2026-06-07). It was also unsafe for contract migrations (migrate-FIRST would drop columns the live old code still reads).
  - *Native Vercel git integration is intentionally skipped for PRODUCTION* via the `ignoreCommand` in **both** `apps/web/vercel.json` and `apps/admin/vercel.json` (so `--prebuilt` CLI deploys from `deploy.yml` are the only prod path). Each begins `if [ "$VERCEL_ENV" = "production" ]; then exit 0; fi` — remember Vercel's polarity: **exit 0 = SKIP the build**. Previews still build (web: on API/contract paths; admin: on `apps/admin/`, `packages/`, the lockfile or `turbo.json`).
    - *Why the explicit guard:* until 2026-08-05 this claim was only accidentally true. The path filter alone let an **API-path** commit on `main` trigger a git production build that then RACED the CLI deploy — two production deploys of the same SHA, one of them **not** gated on Integration Tests, so a red integration run could still be promoted. Observed on `a1aa1be7` and `3fcc9939`, where the git-triggered production deploy was cancelled only because those particular commits happened to miss the filter.
    - Both apps' `buildCommand`s are also filtered to their own app (`turbo run build --filter=@propertypro/{web,admin}`), so a web deploy no longer compiles admin.
  - **Expand/contract discipline (this replaces the CI gate as drift protection):** apply **expand** migrations (add column/table) BEFORE shipping the code that needs them; apply **contract** migrations (drop column/enum value) AFTER the new code that stops reading them is live. Pure policy/trigger REPAIR migrations (0021, 0023) are order-independent — safe to apply before or after their code merges.
  - *Ledger hygiene:* keep `__drizzle_migrations` reconciled with what's actually applied (record each manual apply: `hash` = sha256 of the migration file bytes, `created_at` = the journal `when`) so any future `drizzle-kit` use stays consistent. **Verify it with `scripts/with-env-local.sh pnpm db:ledger:verify`** — read-only, one SELECT, safe against prod. Run it after every manual apply; that is when drift is created. It hashes every file against the ledger and reports orphan rows, `created_at`/`when` mismatches, unapplied files, and **stranded** ones — unapplied AND below the ledger tip, which `drizzle-kit migrate` will silently skip forever (`0062_secret_ballot` is in that state today). See [docs/runbooks/migration-ledger-reconciliation.md](../../docs/runbooks/migration-ledger-reconciliation.md).
- The canonical tenant session GUC is `app.current_community_id`. `app.community_id` (no `current_`) is a historical drift that shipped in some baseline policies — repaired by 0021/0023; never introduce it in new policies.

## Prod Data Repairs

A **data repair** is an out-of-band change to production rows — un-deleting a
record, fixing an orphan, correcting a bad value — applied with Supabase MCP
`execute_sql` rather than through an app mutation. It is not a migration: no
schema changes, no journal entry, no migration number.

**The rule: a repair and its audit entry go in ONE `execute_sql` call.**

Repairs bypass `logAuditEvent()` entirely, so nothing records them unless the
statement does it itself. This is not hypothetical — the 2026-08-09 sweep that
soft-deleted four communities wrote zero audit rows, and the "I cannot log in"
report it caused had to be diagnosed by inference from orphaned `demo_instances`
rows and the shape of the `expire-demos` predicate. A repair that leaves no trace
is indistinguishable from a bug.

Use a CTE so the repair cannot land without the record:

```sql
with repaired as (
  update public.<table> t
     set <changes>
   where <narrow, self-limiting predicate>
  returning t.id, t.community_id, <before/after columns>
)
insert into public.compliance_audit_log
  (user_id, community_id, action, resource_type, resource_id,
   old_values, new_values, metadata)
select null,                    -- system actor; AuditEntry renders "System"
       r.community_id, 'data_repair', '<table>', r.id::text,
       jsonb_build_object(<prior values>),
       jsonb_build_object(<new values>),
       jsonb_build_object('reason', '<why>',
                          'applied_via', 'supabase_mcp_execute_sql',
                          'operator', '<who authorised>',
                          'reference', '<PR or issue>')
from repaired r;
```

Constraints, each forced by the table itself — read before composing a payload:

- **Append-only, uncorrectable.** `compliance_audit_log_append_only_guard` raises
  on UPDATE and DELETE. Compose the statement, read it back as a `SELECT` first,
  and only then execute. You cannot fix a bad row afterwards.
- **Never log a secret.** Append-only plus manager-readable means a leaked value
  is permanent. `old_values`/`new_values` carry changed columns only — no
  credentials, tokens, or unrelated PII.
- **`community_id` is NOT NULL** (`ON DELETE restrict`), so a repair spanning N
  communities writes N rows. A soft-deleted community still satisfies the FK.
- **The template above only works on a table that HAS a `community_id`.** Test the
  column, not the exclusions list — `communities`, `conversion_events` and
  `demo_instances` are all in `RLS_GLOBAL_TABLE_EXCLUSIONS` and all have one.
  Without it there is no value to supply and the insert cannot run, which you
  discover mid-repair. Write to **`platform_admin_audit_log`** instead: same CTE,
  omit `community_id` (nullable there), and set `admin_user_id` to the authorising
  operator's `platform_admin_users.user_id`. That column is NOT NULL but carries no
  FK — deliberately, pinned by `platform-admin-audit-log-migration.test.ts` — and
  `action` has no CHECK, so `'data_repair'` is fine. This is already where every
  community-less admin action goes. **If you cannot name a human for
  `admin_user_id`, do not run the repair through `execute_sql`**: the tenant-scoped
  template permits an anonymous system actor, this one does not, and that is the
  point. `community_id = 0` is not the escape hatch — it FK-violated in production
  and turned a successful `recoverUser` into a 500. The "both doors are shut"
  comment at `account-lifecycle-service.ts:726-729` is about **crons**, which have
  no actor; it concedes the platform-admin case, which is this one.
- **`user_id` null is correct** for a repair — the column is nullable precisely so
  system actors can be recorded.
- **Make the predicate self-limiting** (e.g. `and deleted_at = '<exact stamp>'`)
  so re-running is idempotent and a concurrent change is not clobbered.

Who sees these: `audit: { read: true }` is on the `manager` row only, so property
and root managers of that community — not owners, not tenants.

**This is a convention, not an enforcement mechanism.** Nothing stops a bare
`UPDATE` through the same MCP tool. It makes the correct thing atomic and easy;
it does not make the incorrect thing impossible.

## Rules

- Every schema change MUST use a Drizzle migration — no manual SQL against production
- Check existing migration files AND the journal before creating new migrations to avoid numbering collisions
- Apply migrations to prod MANUALLY via Supabase MCP `apply_migration` (in statement order), then verify via `information_schema`/`pg_catalog`. Do NOT run `pnpm --filter @propertypro/db db:migrate` locally to reach prod — the local `DATABASE_URL` points at PROD, and `drizzle-kit migrate` collides on the drifted ledger (and would apply contract migrations migrate-first)
- Drizzle default `.defaultNow()` generates `now()` which returns a timestamp — use `sql\`CURRENT_DATE\`` if you need a date-only default
- Always add new migrations to the Drizzle migration journal (`meta/_journal.json`)
- New RLS policies must be included in the migration SQL, not applied manually
- Include the write-scope trigger for new tenant tables: `CREATE TRIGGER enforce_community_scope...`

## Before Creating a Migration

**Don't hand-edit `meta/_journal.json`.** Use the scaffolders — they pick the next
index, stamp the timestamp, and chain the snapshot:

- `pnpm db:migration:new <snake_case_name>` — hand-authored SQL (RLS policies,
  grants, triggers, functions, CHECK constraints, backfills). Copies the tip
  snapshot, which is correct only because drizzle-tracked schema is unchanged.
- `pnpm --filter @propertypro/db db:generate` — when a **table** is added or
  altered, so the snapshot records a real diff. Copying the tip snapshot for a
  schema change is how the chain rots (`0033_snapshot` lost
  `storm_damage_reports`, and `db:generate` then emitted a bogus migration
  re-creating a live table).

**`when` is stamped with wall-clock `Date.now()`, never derived from the previous
entry.** Deriving it is what made PRs #852 and #853 both compute
`1784511314576` from the same parent commit. It also matters for correctness:
drizzle records `created_at = when` and applies only when
`lastApplied.created_at < folderMillis`, so a `when` at or below the newest
applied value is **silently skipped**. After rebasing onto migrations that merged
ahead of you, re-stamp — `pnpm exec tsx scripts/verify-migration-ordering.ts`
rejects an idx or `when` already on `origin/main`, and a `when` older than its
newest entry.

Existing entries idx 33–42 carry the old derived values. Leave them: prod's
`drizzle.__drizzle_migrations.created_at` **is** the journal `when` for each, so
rewriting history there would desync the ledger.

</important>
