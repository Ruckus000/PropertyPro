# Production Verification — Role Simplification Phase 0 (2026-06-10)

Phase 0 of the role-simplification program, as specified in
`docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md`
and the implementation plan in
`docs/superpowers/plans/2026-06-10-role-simplification-phase0-1.md`.

Queries were run via the Supabase MCP against the **PropertyPro production project**
(`vbqobyagjzvlfpfozvmx`, region `us-west-2`, ACTIVE_HEALTHY) on 2026-06-10. Read-only
schema introspection and aggregate counts only; no individual row data was examined
or echoed.

---

## Queries Run

**Q1 — enum values of `user_role_v2`**
```sql
SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'user_role_v2' ORDER BY e.enumsortorder;
```

**Q2 — `information_schema.columns` for `user_roles`**
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'user_roles' ORDER BY ordinal_position;
```

**Q3 — role/preset distribution**
```sql
SELECT role, preset_key, count(*) FROM user_roles GROUP BY 1, 2 ORDER BY 1, 2;
```

**Q4 — communities with >1 `board_president` preset rows**
```sql
SELECT community_id, count(*) AS presidents FROM user_roles
WHERE preset_key = 'board_president' GROUP BY 1 HAVING count(*) > 1;
```

**Q5a — `drizzle.__drizzle_migrations` tail**
```sql
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;
```

**Q5b — pg_type check**
```sql
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t
LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('user_role', 'user_role_v2', 'platform_admin_role') GROUP BY t.typname;
```

---

## Results

### Q1 — enum values of `user_role_v2`

```
resident
manager
pm_admin
super_admin
```

### Q2 — `information_schema.columns` for `user_roles`

| column_name    | data_type                   | is_nullable |
|----------------|-----------------------------|-------------|
| id             | bigint                      | NO          |
| user_id        | uuid                        | NO          |
| community_id   | bigint                      | NO          |
| unit_id        | bigint                      | YES         |
| created_at     | timestamp with time zone    | NO          |
| role           | USER-DEFINED                | NO          |
| is_unit_owner  | boolean                     | NO          |
| permissions    | jsonb                       | YES         |
| preset_key     | text                        | YES         |
| display_title  | text                        | YES         |
| legacy_role    | text                        | YES         |
| updated_at     | timestamp with time zone    | NO          |

### Q3 — role/preset distribution

| role     | preset_key      | count |
|----------|-----------------|-------|
| resident | NULL            | 442   |
| manager  | board_member    | 118   |
| manager  | board_president | 461   |
| manager  | cam             | 2     |
| manager  | site_manager    | 48    |
| manager  | NULL            | 10    |
| pm_admin | NULL            | 211   |

Total: 1292 rows. Zero rows with `role = 'super_admin'`.

### Q4 — communities with >1 `board_president` preset rows

```
(empty — zero collisions)
```

### Q5a — `drizzle.__drizzle_migrations` tail

Hashes truncated to first 12 chars; full values are 64-char SHA-256 strings.

| id | hash (truncated)  | created_at        |
|----|-------------------|-------------------|
| 19 | 8733ad944c23…     | 1780621668534     |
| 18 | 045170dbd70a…     | 1780543614483     |
| 17 | 58f428c800f5…     | 1780443306070     |
| 16 | 363fd0ae5229…     | 1780041600003     |
| 15 | f7a1f7629fba…     | 1780041600002     |

### Q5b — pg_type check

| typname             | values                                        |
|---------------------|-----------------------------------------------|
| platform_admin_role | {super_admin}                                 |
| user_role_v2        | {resident,manager,pm_admin,super_admin}       |
| user_role           | (does not exist in prod)                      |

---

## Findings

**Finding 1 — `super_admin` enum drift (Q1, Q5b)**

`user_role_v2` carries a 4th value `super_admin` in prod that is NOT declared in
`packages/db/src/schema/enums.ts` (which defines exactly `resident | manager | pm_admin`).
Zero rows use it (confirmed by Q3). Verdict: harmless for Phase 1 (the `ALTER TYPE ADD VALUE`
migrations 0014–0015 are unaffected); MUST be accounted for in the Phase 4 enum rebuild —
any `DROP TYPE` / `CREATE TYPE` sequence must include dropping this value. Likely origin:
a manual SQL apply that targeted `user_role_v2` instead of `platform_admin_role`, which
legitimately holds `super_admin`. Because Postgres cannot `ALTER TYPE ... DROP VALUE`, the
Phase 4 rebuild must create a fresh enum type containing only the v3 values
(`resident | manager | pm_admin`), migrate the `user_roles.role` column to that new type,
then drop the old `user_role_v2` type — and that sequence must NOT assume the legacy
`user_role` type exists in prod (it doesn't; see Finding 4).

**Finding 2 — NULL-preset manager rows (Q3)**

10 `manager` rows have `preset_key = NULL` ("custom" managers). The Phase 2 backfill
mapping table in the spec does not explicitly cover this case. Plan 2 must add the rule:
`manager + NULL preset_key → property_manager, no designation` — meaning "no designation"
is that the backfilled `property_manager` row receives `designation = NULL` (these are
custom managers, not board members, so no board designation applies).

**Finding 3 — zero board_president collisions (Q4)**

The Q4 result is empty: every community has at most one `board_president` row, so the
deterministic dedup rule in the Phase 2 backfill is a defensive guard only, with no
actual conflicts to resolve in prod today.

**Finding 4 — orphaned legacy `user_role` type**

The squashed Drizzle baseline file references a legacy `user_role` type, but Q5b confirms
it does not exist in prod. Phase 4 must not attempt to drop it in prod.

---

## Verdict

Prod is **RECONCILED** with the squashed ledger (ledger ids 18–19 align to journal entries
idx 12–13 by `created_at`; the id offset is expected bookkeeping from the pre-squash history).
Prod is **SAFE for Phase 1** (migrations 0014–0016, purely additive `ALTER TYPE ADD VALUE` and
`ADD COLUMN` operations) with three findings recorded for later phases.

The deploy pipeline does **NOT** run `db:migrate` — migrations 0014–0016 require a manual
prod apply (see Task 5 of the implementation plan).

---

## Prod Apply Evidence (Task 5)

_To be appended when migrations 0014–0016 are applied to prod._
