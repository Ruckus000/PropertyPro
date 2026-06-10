<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- Migrations were squashed to a new baseline: live ledger is `0000`–`0013` (`packages/db/migrations/`), journal has 14 entries (idx 0–13)
- Next migration number: **0014** (role-simplification Phase 1 reserves 0014–0016; Phase 2 backfill = 0017)
- Pre-squash history (incl. the 0090–0106 phase-2 range) lives in `packages/db/migrations/_archive/`
- The deploy pipeline does NOT run `db:migrate` — every migration needs a manual prod apply (see `docs/audits/phase0-role-simplification-prod-verify-2026-06-10.md`)
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
