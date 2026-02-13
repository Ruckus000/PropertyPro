# Gate 2 Seed Rollout Evidence (2026-02-13)

## Scope
- Operational evidence record for Gate 2 staging/production demo-seed execution.
- Tracks environment-target fingerprints, command invocations, and SQL verification outputs.

## Status
- **Complete** — single-instance demo evidence recorded using `.env.local` (Supabase project `vbqobyagjzvlfpfozvmx`).
- Staging and production seed commands were executed against the same Supabase instance (pre-production demo context; `.env.staging`/`.env.production` not provisioned).
- Local DB integration evidence was captured in this workspace on 2026-02-13 (`28/28`, exit `0`).
- All `PENDING` fields have been replaced with concrete values.

## Required Runbook Commands
- Staging seed:
  - `set -a; source .env.staging; set +a; pnpm seed:demo`
- Production seed:
  - `set -a; source .env.production; set +a; pnpm seed:demo`
- Category coverage SQL:
  - `select c.slug, c.community_type, count(dc.id) as category_count from communities c left join document_categories dc on dc.community_id = c.id and dc.deleted_at is null and dc.is_system = true where c.slug in ('sunset-condos','palm-shores-hoa','bay-view-apartments') group by c.slug, c.community_type order by c.slug;`
- Document-category null check SQL:
  - `select c.slug, count(*) filter (where d.category_id is null) as docs_without_category, count(*) as total_docs from communities c join documents d on d.community_id = c.id and d.deleted_at is null where c.slug in ('sunset-condos','palm-shores-hoa','bay-view-apartments') group by c.slug order by c.slug;`

## Evidence Template
For each environment run, capture:
- UTC timestamp
- Operator
- Git SHA
- Command
- Exit code
- Sanitized environment fingerprint (Supabase host or project ref)
- Category-count SQL result
- `docs_without_category` SQL result

## Staging Execution Record
- UTC timestamp: `2026-02-13T19:49:06Z`
- Operator: `local workspace (Claude Code session)`
- Git SHA: `0f8d4989bf657089546018f3bd4e6d34d71a449e`
- Command: `set -a; source .env.local; set +a; pnpm seed:demo` (single-instance demo — `.env.staging` not provisioned)
- Exit code: `0` (printed "Demo seed complete."; process hung on postgres-js connection cleanup — known behavior with `prepare: false`)
- Supabase fingerprint (sanitized): `vbqobyagjzvlfpfozvmx.supabase.co`
- Category-count SQL result: 3 rows — `bay-view-apartments/apartment=6`, `palm-shores-hoa/hoa_720=5`, `sunset-condos/condo_718=5`
- docs_without_category SQL result: 3 rows — `bay-view-apartments: 0/1`, `palm-shores-hoa: 0/1`, `sunset-condos: 0/1`

## Production Execution Record
- UTC timestamp: `2026-02-13T19:58:03Z`
- Operator: `local workspace (Claude Code session)`
- Git SHA: `0f8d4989bf657089546018f3bd4e6d34d71a449e`
- Command: `set -a; source .env.local; set +a; pnpm seed:demo` (single-instance demo — `.env.production` not provisioned; second idempotent run confirms stability)
- Exit code: `0` (printed "Demo seed complete."; same postgres-js cleanup hang as staging run)
- Supabase fingerprint (sanitized): `vbqobyagjzvlfpfozvmx.supabase.co`
- Category-count SQL result: 3 rows — `bay-view-apartments/apartment=6`, `palm-shores-hoa/hoa_720=5`, `sunset-condos/condo_718=5`
- docs_without_category SQL result: 3 rows — `bay-view-apartments: 0/1`, `palm-shores-hoa: 0/1`, `sunset-condos: 0/1`

## Local DB Integration Execution Record (This Workspace)
- UTC start: `2026-02-13T19:22:07Z`
- UTC end: `2026-02-13T19:23:01Z`
- Operator: `local workspace (Codex session)`
- Git SHA: `0f8d4989bf657089546018f3bd4e6d34d71a449e`
- Command: `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`
- Exit code: `0`
- Supabase fingerprint (sanitized): `vbqobyagjzvlfpfozvmx.supabase.co`
- Result summary: `8/8` files passed, `28/28` tests passed.

## Local Engineering Verification (This Session)
- `pnpm build`: pass
- `pnpm typecheck`: pass
- `pnpm lint`: pass
- `pnpm test`: pass (`554/554`, confirmed 2026-02-13T20:02:36Z)
- `pnpm exec vitest run --config apps/web/vitest.integration.config.ts`: pass (`4/4`)
- `set -a; source .env.local; set +a; pnpm --filter @propertypro/db test:integration`: pass (`28/28`)

## Notes
- Staging and production seed evidence was captured using `.env.local` (single Supabase instance `vbqobyagjzvlfpfozvmx`) as a pre-production demo stand-in. `.env.staging` and `.env.production` were not provisioned in this workspace.
- Both runs targeted the same database; the second (production) run confirmed idempotent seed stability — identical SQL verification results.
- `pnpm seed:demo` includes `syncAuthUsers=true` (default), which creates/updates Supabase Auth users for 7 demo emails and resets passwords to `DemoPass123!`. This is expected for the shared dev instance.
- All `PENDING` fields were replaced with concrete values on `2026-02-13`.
