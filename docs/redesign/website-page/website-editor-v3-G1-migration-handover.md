# G1 — applying `0034_site_publish_snapshots` to production

> **Status: APPLIED AND VERIFIED 2026-07-26** to project `vbqobyagjzvlfpfozvmx`
> ("PropertyPro", us-west-2), on the user's explicit instruction. Ledger row
> **id 64** recorded (`hash` = sha256 of the migration file,
> `created_at` = 1784510954576, the journal `when` for idx 34). Ledger is now
> 35 rows, tip 64.
>
> Verified against `pg_catalog` / `information_schema`, not the success flag:
> ten columns with `snapshot` and `change_labels` nullable; RLS **enabled and
> forced**; exactly one `ALL` policy on `pp_rls_is_privileged()`; both FKs
> present including the cross-schema `auth.users` one with `ON DELETE SET NULL`;
> both indexes; zero user triggers (trigger-exempt, as designed). Supabase's
> security advisors report **nothing** against this table.
>
> RLS was proved rather than inferred: a probe row was inserted, read attempted
> as `anon` and `authenticated`, and both saw **0 rows** while `service_role`
> saw it; the probe was then deleted (table is empty, 0 rows).
>
> **Testing trap worth keeping.** A first probe used `SET LOCAL ROLE anon` alone
> and reported a false leak. `pp_rls_effective_role()` falls back to
> **`session_user`**, and `SET ROLE` changes `current_user` but not
> `session_user` — so the function still saw `postgres` and returned privileged.
> The correct simulation sets `request.jwt.claim.role`, which the function reads
> first and which is what PostgREST sets per request. Any future RLS probe
> against this schema must set that GUC, or it will report the opposite of the
> truth.
>
> This is an **expand** migration, so the table correctly exists ahead of the
> code that uses it. Phase 6's code is on `claude/website-editor-v3-7d3ff7` and
> is not deployed yet; nothing reads or writes this table in production until
> that merges and deploys.

## Why this is a manual step

`deploy.yml` deploys **code only**. The `db:migrate` gate was removed after it
blocked every production deploy for roughly two weeks — it conflicted with the
manual apply path (ledger drift) and was unsafe for contract migrations. So the
apply is a human action, and it needs the user's Supabase session.

`0034` is an **expand** migration — it only creates a new table. Expand
migrations are applied **before** the code that reads them ships, so this can be
applied as soon as it is reviewed; there is no deploy-ordering wait (that is G3,
which belongs to Phase 11).

## What it creates

`site_publish_snapshots` — one row per successful publish, written inside
`publishCommunitySite`'s transaction.

- `snapshot jsonb` is **nullable by design**: the retention sweep nulls the
  payload beyond the most recent N publishes and keeps the log row, so "what did
  the public page show in March" stays answerable on a statutory site.
- RLS family is **`service_only`**, deliberately NOT the
  `public_read_service_write` family its sibling `site_blocks` uses. `site_blocks`
  is read anonymously because the public site renders it; `snapshot` holds the
  full block payload of a *past* publish, so an anon read would expose content
  the association may since have deliberately taken down. Admin access to the
  history list is authorized at the route, not by RLS, and the list response
  omits `snapshot` entirely.
- Trigger-exempt for the same reason `site_blocks` is: every write is
  service-role, so there is no authenticated write path for
  `pp_rls_enforce_tenant_community_id()` to police.
- The FK to `auth.users` is added in the raw SQL with a `DO`-block idempotency
  guard, because drizzle cannot express a cross-schema FK. `ON DELETE SET NULL`:
  deleting a user must not erase the association's publish history.

## Apply steps

1. **Confirm the number is still free.** Another branch may have taken `0034`
   since this was written:
   ```bash
   ls packages/db/migrations/*.sql | tail -3
   ```
   If `0034` is taken, renumber the file, the journal entry (`idx`) and the
   snapshot (`meta/0034_snapshot.json`, whose `prevId` must chain to the new
   predecessor) before applying.

2. **Apply via Supabase MCP `apply_migration`**, in statement order. The file is
   `--> statement-breakpoint`-delimited; the `DO $$ … END $$` block is a single
   statement and must not be split.

3. **Verify against the catalog** — not against the ledger, which has drifted
   before:
   ```sql
   SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
    WHERE table_name = 'site_publish_snapshots'
    ORDER BY ordinal_position;

   SELECT relrowsecurity, relforcerowsecurity
     FROM pg_class WHERE relname = 'site_publish_snapshots';

   SELECT polname, polcmd FROM pg_policy
    WHERE polrelid = 'public.site_publish_snapshots'::regclass;
   ```
   Expect: ten columns with `snapshot` and `change_labels` nullable; RLS enabled
   **and** forced; exactly one `ALL` policy.

4. **Record the ledger row** in `drizzle.__drizzle_migrations` so any future
   `drizzle-kit` use stays consistent:
   - `hash` = sha256 of the migration file bytes
     (`shasum -a 256 packages/db/migrations/0034_site_publish_snapshots.sql`)
   - `created_at` = the `when` value of journal entry idx 34

5. **Re-derive `RLS_EXPECTED_TENANT_TABLE_COUNT` at merge time.** It is set to
   `63` on this branch (62 + this table). Parallel PRs each bump `+1` and git
   merges both silently, so whichever PR merges second must set the true total
   rather than trusting the number. Confirm with:
   ```bash
   pnpm --filter @propertypro/db test rls-config
   ```

6. **Run the RLS integration suite** against a local DB once the table exists —
   never against `.env.local`, whose `DATABASE_URL` is production:
   ```bash
   pnpm db:test-local:reset && pnpm test:integration:local
   ```
   The assertion that matters: anon and authenticated cannot select from
   `site_publish_snapshots`.

## What is still owed after the apply

- The integration tests the plan lists for this phase, which cannot run until the
  table exists: snapshot written in the same transaction as the publish (a
  rolled-back publish leaves none); revert is atomic and never violates the
  partial unique index; revert advances `MAX(published_at)` so a stale
  `expectedPublishedAt` raises `ConflictError`; tombstone draft rows are not
  resurrected by a revert.
- The Phase 4 property test's `applyPublish` model is explicitly labelled as
  modelling the publish transaction rather than proving it. The integration test
  that pins the model to the real `publishCommunitySite` belongs with the above.
