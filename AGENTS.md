# PropertyPro Florida — Agent Safety Guide

> Read `CLAUDE.md` first for architecture, project structure, API patterns, and dev commands.
> This file covers enforcement boundaries and failure patterns that agents must know to avoid breaking things.

---

## 1. Tenant Isolation (Enforced, Not Voluntary)

Tenant isolation is enforced at four layers — not by convention alone:

1. **Runtime:** `createScopedClient()` (`packages/db/src/scoped-client.ts`) auto-injects `community_id` and `deleted_at IS NULL` on every query. Throws `TenantContextMissing` if community ID is null/undefined/NaN.
2. **Database RLS:** `FORCE ROW LEVEL SECURITY` is enabled on all 21+ tenant tables (migrations 0020, 0027). Even the table owner role cannot bypass policies.
3. **Write trigger:** `pp_rls_enforce_tenant_community_id` blocks any non-privileged INSERT/UPDATE lacking `app.current_community_id` in session context. Direct browser-to-Supabase writes are blocked even if RLS policies pass.
4. **CI guard:** `scripts/verify-scoped-db-access.ts` (rules DB001–DB005) runs on every PR via `pnpm lint`. It uses TypeScript AST parsing to catch unauthorized `drizzle-orm` imports, direct `@propertypro/db/src` imports, and new tables missing RLS enablement.

**Escape hatch:** `packages/db/src/unsafe.ts` exports `createUnscopedClient()` and purpose-built unscoped queries. Each caller requires:
- A documented authorization contract comment (e.g., "callers MUST verify PM role")
- The importing file added to the allowlist in `scripts/verify-scoped-db-access.ts`
- Code review approval

**What agents must do:** Use `createScopedClient()` for all new code. If you genuinely need cross-tenant access, add a function to `unsafe.ts` with an authorization contract, add the consuming file to the CI allowlist, and explain why in the PR.

---

## 2. Migration Pipeline (Fragile — Handle With Care)

Drizzle Kit does not auto-increment migration numbers. The pipeline has known fragility:

- **Before creating a migration:** Check `packages/db/migrations/` for the current max number. Collisions from parallel branches are the most common failure mode.
- **Journal sync:** The migration directory may have more files than `meta/_journal.json` entries (drift exists on main). The CI job `migration-ordering` catches ordering violations but not file/journal count mismatches.
- **Timestamp ordering:** `drizzle-kit generate --custom` can emit a `when` timestamp older than existing entries if prior migrations were manually future-dated. Always verify the new journal entry's `when` is strictly greater than the current max.
- **Connection discipline:** Pooled connection string for app queries; direct connection string for migrations only.
- **After any migration change:** Run `pnpm --filter @propertypro/db db:migrate` against the target DB before integration tests. Never trust "tests pass locally" as evidence of shared DB health.

---

## 3. Compliance Engine (Core Differentiator)

The compliance engine tracks Florida statutory obligations for condos (§718, 16 items) and HOAs (§720, 10 items). Templates live in `packages/shared/src/compliance/templates.ts`. Apartments are excluded via feature gating.

- **Status is computed at query time**, not stored — prevents stale data. Statuses: `satisfied`, `unsatisfied`, `overdue`, `not_applicable`.
- **30-day posting rule:** Documents must be posted within 30 days of creation. Deadline math uses `date-fns` with weekend rollover (Saturday/Sunday → Monday).
- **Rolling 12-month windows:** Meeting minutes, video recordings, and bids use rolling retention windows checked at query time.
- **Florida timezone split:** Florida spans Eastern and Central zones. Timezone is per-community (`communities.timezone` column), not per-application. All dates stored UTC, displayed in community-local timezone.
- **Append-only audit log:** `compliance_audit_log` is excluded from soft-delete filtering and has DB-native delete protection. Never attempt to delete audit rows. Integration test teardown must be best-effort and tolerate FK-restricted cleanup.
- **Edge cases requiring test coverage:** DST transitions, leap years, weekend posting dates, year-boundary crossings.

---

## 4. CI Enforcement Gates

Seven parallel CI jobs run on every PR (`.github/workflows/ci.yml`):

| Job | What it catches | Script |
|-----|----------------|--------|
| **lint** | TypeScript lint + DB access guard (DB001–DB005) | `pnpm lint` (includes `guard:db-access`) |
| **typecheck** | Type errors across all packages | `pnpm typecheck` |
| **unit-tests** | Vitest unit test failures | `pnpm test` |
| **no-mock-guard** | `vi.mock()` / `jest.mock()` in integration tests | `scripts/verify-no-mocks-in-integration.ts` |
| **migration-ordering** | Timestamp ordering violations, duplicate indices | `scripts/verify-migration-ordering.ts` |
| **perf-check** | Bundle size budget violations | `pnpm perf:check` |
| **build** | Build failures (depends on all 6 above) | `pnpm build` |

Integration tests require a live DB: `scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts`

---

## 5. Supabase & Auth Gotchas

- **Session in Server Components:** Not available directly. Use `@supabase/ssr` server client that reads cookies from request headers.
- **Roles are per-community:** Keyed by `(user_id, community_id)` in `user_roles`. Never assume a single global role.
- **Driver:** Use `postgres-js`, NOT `node-postgres` (PgBouncer incompatibility).
- **File uploads:** Presigned URLs for direct upload to Supabase Storage (Vercel 4.5MB body limit). Validate file types via magic bytes (`file-type` package), never trust Content-Type headers.
- **Stripe webhooks:** Handlers must be idempotent. Events arrive out of order. Always fetch fresh state from the Stripe API inside the handler.

---

## 6. Rules From Failure

Synthesized from recurring incidents — these are the root causes, not the symptoms:

1. **Schema drift:** After any migration, run `pnpm --filter @propertypro/db db:migrate` against the target DB before integration tests. Shared DBs can have migration-history drift where newer tables are absent while older objects exist.
2. **Build cache:** After editing workspace package source (`@propertypro/shared`, `@propertypro/db`, `@propertypro/email`), rebuild before evaluating test results. Stale `dist/` outputs cause misleading behavior.
3. **Env loading:** `scripts/with-env-local.sh` uses `set -u`. If `.env.local` has `$` expansions referencing unset vars, sourcing aborts. Use `set +u` before sourcing if needed.
4. **Append-only tables:** `compliance_audit_log` has DB-native delete protection. Integration teardown must tolerate FK-restricted cleanup failures.
5. **PDF parsing:** `pdf-parse` loads entire files into memory. Run asynchronously outside the upload handler to avoid blocking.

---

## 7. Type Safety & Escape Hatches

- **`any`:** Avoid. Use `unknown` with a type guard, or `as unknown as T` backed by a runtime column/property check (this pattern is used in `scoped-client.ts` at Drizzle generic boundaries).
- **`@ts-ignore`:** Never. Use `@ts-expect-error` with a comment explaining why — it auto-fails when the underlying error is fixed, preventing stale suppressions.
- **Unscoped DB access:** Use `createUnscopedClient()` via `@propertypro/db/unsafe`. Document the authorization contract. Add the file to the CI allowlist in `scripts/verify-scoped-db-access.ts`.
