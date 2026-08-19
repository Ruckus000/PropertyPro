<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- Migrations were squashed to a new baseline; live migration files on `main` currently run `0000`–`0056` (`packages/db/migrations/`), with reserved gaps at `0050`/`0051` (journal idx runs 49 → 52), tolerated by the ordering guard. The old `0024` reserved gap has since been **filled** by its intended #763 trigger migration (`0024_canonicalize_onboarding_checklist_trigger`, journal idx-24 present). Historical phase mapping through the squash baseline: Phase 1 = 0014–0016, Phase 2 = 0017 storage-RLS + 0018 backfill, Phase 2b = 0019 root_claim_disputes, Phase 4.1 = 0020 role-v3 cleanup (enum rebuild + column drops; CONTRACT migration), 0021 = access_requests/community_join_requests RLS repair, 0022 = pending_signups token lifecycle, 0023 = wrong-GUC RLS policy repair, 0025 = subscription current-period-end column. **This range goes stale — re-check it before creating a migration, and note that `main`'s highest number is NOT the next free one (see the next bullet: prod runs ahead).**
- **As of 2026-07-02, prod was APPLIED AND LEDGER-RECONCILED through `0022`** (verified against `pg_catalog` + `drizzle.__drizzle_migrations`) — a dated historical snapshot, not the current tip. The live prod ledger position is a database fact: verify it against `drizzle.__drizzle_migrations` rather than trusting a number written here. At that reconciliation: 0020 had been applied manually without a ledger record, so the reconciliation backfilled ledger rows for 0014–0020 and recorded 0021/0022 at apply time. `0021` (access_requests/community_join_requests RLS repair) and `0022` (pending_signups token lifecycle) were applied to prod ahead of their PRs merging (#752 / #757) per expand-before-code; their migration files have since landed on `main`. **NEVER derive the next free migration number from `main` alone — prod runs AHEAD of it.** Verified against prod 2026-08-19 (Supabase `list_migrations` + `SELECT` on `drizzle.__drizzle_migrations`: 60 ledger rows, tip id 89 / `created_at` 1786412347694): prod has applied `0057`–`0061` (`terms_acceptance_versioning`, `community_export_jobs`, `community_exports_bucket`, `arc_rule_reference`, `fining_committee_record`) from in-flight branches under expand-before-code, while `main`'s merged file tip is only `0056`; and `0062_secret_ballot` sits on a branch, deliberately unapplied. So `0057`–`0062` are ALL claimed even though they are absent from `main` — taking "highest on disk + 1" would collide with prod. **Next free number: `0063`.** Re-derive it before creating one by checking `packages/db/migrations/` AND the prod ledger AND open branches. The reserved gaps at `0050`/`0051` (journal idx runs 49 → 52) are expected and allowed by the ordering guard (`scripts/verify-migration-ordering.ts` passes) — prod applied `marketing_leads` under `0050`/`0051`, whereas it merged to `main` renumbered as `0053`–`0055`.
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- **Migrations are applied to prod MANUALLY** (Supabase MCP `apply_migration`, then verify via `information_schema`). This is the single, deliberate apply path — do NOT rely on CI to migrate.
  - *Deploy model (corrected — verify via GH run history, not the workflow file alone):* `deploy.yml` deploys **CODE ONLY** (`vercel build --prod` + `vercel deploy --prebuilt --prod`) on CI-success on `main`. The earlier `db:migrate` gate (#683) was **removed** (`fix/deploy-pipeline-manual-migrations`): it conflicted with manual applies (ledger drift → `check_for_column_name_collision`), failed on every run, and silently **blocked all prod deploys for ~2 weeks** (last good deploy 2026-06-07). It was also unsafe for contract migrations (migrate-FIRST would drop columns the live old code still reads).
  - *Native Vercel git integration is intentionally skipped for PRODUCTION* via the `ignoreCommand` in **both** `apps/web/vercel.json` and `apps/admin/vercel.json` (so `--prebuilt` CLI deploys from `deploy.yml` are the only prod path). Each begins `if [ "$VERCEL_ENV" = "production" ]; then exit 0; fi` — remember Vercel's polarity: **exit 0 = SKIP the build**. Previews still build (web: on API/contract paths; admin: on `apps/admin/`, `packages/`, the lockfile or `turbo.json`).
    - *Why the explicit guard:* until 2026-08-05 this claim was only accidentally true. The path filter alone let an **API-path** commit on `main` trigger a git production build that then RACED the CLI deploy — two production deploys of the same SHA, one of them **not** gated on Integration Tests, so a red integration run could still be promoted. Observed on `a1aa1be7` and `3fcc9939`, where the git-triggered production deploy was cancelled only because those particular commits happened to miss the filter.
    - Both apps' `buildCommand`s are also filtered to their own app (`turbo run build --filter=@propertypro/{web,admin}`), so a web deploy no longer compiles admin.
  - **Expand/contract discipline (this replaces the CI gate as drift protection):** apply **expand** migrations (add column/table) BEFORE shipping the code that needs them; apply **contract** migrations (drop column/enum value) AFTER the new code that stops reading them is live. Pure policy/trigger REPAIR migrations (0021, 0023) are order-independent — safe to apply before or after their code merges.
  - *Ledger hygiene:* keep `__drizzle_migrations` reconciled with what's actually applied (record each manual apply: `hash` = sha256 of the migration file bytes, `created_at` = the journal `when`) so any future `drizzle-kit` use stays consistent.
- The canonical tenant session GUC is `app.current_community_id`. `app.community_id` (no `current_`) is a historical drift that shipped in some baseline policies — repaired by 0021/0023; never introduce it in new policies.

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
