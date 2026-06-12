<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- Migrations were squashed to a new baseline; live ledger is now `0000`–`0019` (`packages/db/migrations/`) — Phase 1 = 0014–0016, Phase 2 = 0017 storage-RLS + 0018 backfill, Phase 2b = 0019 root_claim_disputes.
- **Next migration number: `0020`.**
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- **Migrations are applied to prod MANUALLY** (Supabase MCP `apply_migration`, then verify via `information_schema`). `deploy.yml` *does* contain an auto-migrate gate (`db:migrate` before the Vercel build; needs the `production`-env `DIRECT_URL` secret, which IS set), added by #683 to prevent drift — **but it FAILS on every run** (`drizzle-kit migrate` → `check_for_column_name_collision`) because manual out-of-band application left drizzle's `__drizzle_migrations` ledger out of sync, so the migrate step re-applies existing DDL and collides. A failed migrate step **skips the deploy**, so `deploy.yml` is *not* the deploy path — prod code ships via Vercel's **native GitHub integration**. Net: still apply manually; the drizzle ledger needs re-reconciling before the gate can go green. **Verify the pipeline's real behavior via GH Actions run history, not just the workflow file — the file alone looks like auto-migrate works.**
- Prod `user_role_v2` enum carries an undeclared extra value `super_admin` (no rows) — account for it in any enum rebuild

## Rules

- Every schema change MUST use a Drizzle migration — no manual SQL against production
- Check existing migration files AND the journal before creating new migrations to avoid numbering collisions
- Run `pnpm --filter @propertypro/db db:migrate` to apply migrations
- Drizzle default `.defaultNow()` generates `now()` which returns a timestamp — use `sql\`CURRENT_DATE\`` if you need a date-only default
- Always add new migrations to the Drizzle migration journal (`meta/_journal.json`)
- New RLS policies must be included in the migration SQL, not applied manually
- Include the write-scope trigger for new tenant tables: `CREATE TRIGGER enforce_community_scope...`

## Before Creating a Migration

1. Check `packages/db/migrations/` for the highest existing file number
2. Check `packages/db/migrations/meta/_journal.json` for the highest journal index
3. Verify no other branch has reserved the same migration number range

</important>
