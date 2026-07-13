<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- Migrations were squashed to a new baseline; live migration files on `main` are `0000`–`0023` plus `0025` (`packages/db/migrations/`); `0024` is an intentional reserved gap (journal idx-24, held for prod's #763 trigger migration) — Phase 1 = 0014–0016, Phase 2 = 0017 storage-RLS + 0018 backfill, Phase 2b = 0019 root_claim_disputes, Phase 4.1 = 0020 role-v3 cleanup (enum rebuild + column drops; CONTRACT migration), 0021 = access_requests/community_join_requests RLS repair, 0022 = pending_signups token lifecycle, 0023 = wrong-GUC RLS policy repair, 0025 = subscription current-period-end column.
- **Prod is APPLIED AND LEDGER-RECONCILED through `0022`** (verified against `pg_catalog` + `drizzle.__drizzle_migrations`, 2026-07-02). 0020 had been applied manually without a ledger record; the reconciliation backfilled ledger rows for 0014–0020 and recorded 0021/0022 at apply time. `0021` (access_requests/community_join_requests RLS repair) and `0022` (pending_signups token lifecycle) were applied to prod ahead of their PRs merging (#752 / #757) per expand-before-code; their migration files live on those PR branches until merge. **Next free migration number: `0026`.** The journal idx-24 gap (reserved for prod's #763 trigger migration; journal runs 23 → 25) is expected and allowed by the ordering guard (`scripts/verify-migration-ordering.ts` passes).
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- **Migrations are applied to prod MANUALLY** (Supabase MCP `apply_migration`, then verify via `information_schema`). This is the single, deliberate apply path — do NOT rely on CI to migrate.
  - *Deploy model (corrected — verify via GH run history, not the workflow file alone):* `deploy.yml` deploys **CODE ONLY** (`vercel build --prod` + `vercel deploy --prebuilt --prod`) on CI-success on `main`. The earlier `db:migrate` gate (#683) was **removed** (`fix/deploy-pipeline-manual-migrations`): it conflicted with manual applies (ledger drift → `check_for_column_name_collision`), failed on every run, and silently **blocked all prod deploys for ~2 weeks** (last good deploy 2026-06-07). It was also unsafe for contract migrations (migrate-FIRST would drop columns the live old code still reads).
  - *Native Vercel git integration is intentionally skipped* via `apps/web/vercel.json`'s `ignoreCommand` (so `--prebuilt` CLI deploys from `deploy.yml` are the prod path, not git-triggered builds).
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

1. Check `packages/db/migrations/` for the highest existing file number
2. Check `packages/db/migrations/meta/_journal.json` for the highest journal index
3. Verify no other branch has reserved the same migration number range

</important>
