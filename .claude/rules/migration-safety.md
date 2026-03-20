<important if="creating database migrations, modifying schema, or running db:migrate">

# Migration Safety

## Current State

- Last migration file on main: `0036_add_is_applicable.sql`
- Migration journal has 28 entries (idx 0-27)
- Migration journal drift: files 0030-0036 exist but journal only goes to idx 27
- Phase 2 migrations use the 0090-0106 range (on the phase-2A branch)

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
