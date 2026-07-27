# Supabase security-advisor triage — 2026-07-27

Project `vbqobyagjzvlfpfozvmx` (prod). Triage of every remaining advisor lint after
migrations 0037/0038 took the project to **zero ERROR-level findings**. Assessed against
production state via `pg_catalog`, not against the advisor's labels.

**Outcome:** of six categories, two were real and are now fixed; four are accepted with
reasons recorded below. The rationale for the largest accepted category is in the header of
`packages/db/migrations/0039_pin_function_search_path.sql` and is not repeated here.

| Advisor lint | Count | Verdict | Where handled |
|---|---|---|---|
| `function_search_path_mutable` (0011) | 13 | **FIXED** | `0039_pin_function_search_path.sql` |
| CREATE on `public` held by `anon`/`authenticated` | — | **FIXED** | `0039` (not an advisor finding; the precondition behind 0011) |
| `public_bucket_allows_listing` (0025) | 1 | **FIXED** | `0040_scope_site_assets_read.sql` |
| `auth_leaked_password_protection` | 1 | **OPEN** — dashboard toggle | see below |
| `anon`/`authenticated_security_definer_function_executable` (0028/0029) | 8 | **ACCEPTED** | see `0039` header |
| `extension_in_public` (0014) | 2 | **ACCEPTED** | below |
| `rls_enabled_no_policy` (0008, INFO) | 15 | **BY DESIGN** | below |

---

## Accepted: `extension_in_public` — `pg_trgm`, `btree_gist`

Both live in `public`. Relocating them means dropping and recreating everything that
depends on their operator classes, under lock, on live tables:

- **`pg_trgm`** (created without `WITH SCHEMA` in `0002_reconcile_help_articles_user_search.sql:49`)
  backs 7 `gin_trgm_ops` indexes: `idx_user_search_fullname_trgm`, `idx_user_search_email_trgm`,
  and — from `_archive/0109` — `idx_documents_title_trgm`, `idx_announcements_title_trgm`,
  `idx_meetings_title_trgm`, `idx_maintenance_title_trgm`, `idx_violations_desc_trgm`.
- **`btree_gist`** backs 2 GiST exclusion constraints: `no_overlapping_reservations` on
  `amenity_reservations` and `leases_no_overlap_per_unit` on `leases`.

The lint's concern — extension functions sitting in a schema untrusted roles can write to —
was addressed at the root instead: `0039` revoked `CREATE` on `public` from `anon` and
`authenticated`, so neither can introduce a shadowing object regardless of which schema the
extensions occupy. Relocation would be churn against a now-closed attack path.

**Revisit if** `CREATE` on `public` is ever granted back, which would reopen it.

## By design: `rls_enabled_no_policy` (INFO, 15 tables)

Zero policies **is** the deny-everyone posture for platform tables, applied deliberately by
`0005`, `0035`, `0037` and `0038`. Every one of these tables also has its ACL revoked from
`anon`/`authenticated`, with `service_role` retaining CRUD, and is reached at runtime only
through the `postgres` role (which holds `rolbypassrls`). Adding policies would weaken them.
Not actionable.

## Open: leaked password protection

Supabase Auth can reject credentials found in HaveIBeenPwned at signup and password reset.
Currently disabled. Enable at **Dashboard → Authentication → Providers/Passwords**. No
migration exists for this — it is project auth config, not schema, and no MCP tool exposes it.

---

## Verification of prod state after 0039 (2026-07-27)

```
public schema ACL   postgres=UC/postgres | anon=U/postgres |
                    authenticated=U/postgres | service_role=UC/postgres
has_schema_privilege('anon','public','CREATE')            false
has_schema_privilege('authenticated','public','CREATE')   false
has_schema_privilege('anon','public','USAGE')             true
```

All 16 functions reviewed carry a pinned `search_path`; the 4 `SECURITY DEFINER` ones are
`sync_user_search_index`, `pp_rls_can_read_audit_log`, `pp_rls_has_community_membership` and
`pp_rls_community_allows_member_writes`.

## Known drift (not introduced here, not fixed here)

A database rebuilt from the current migration set diverges from production:

- `trg_sync_user_search_index` on `auth.users` exists only in `_archive/0110` and in prod.
  `0039` restored the *function* to the lineage; the trigger is still absent, so on a fresh
  database `user_search_index` is never populated. Restoring it means a migration writing into
  Supabase's managed `auth` schema — a deliberate open decision.
- The two `btree_gist` exclusion constraints above exist only in `_archive` and prod; the 0000
  squash dropped both the `CREATE EXTENSION` and the `EXCLUDE` clauses.
