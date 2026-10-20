# PropertyPro Florida — Agent Safety Guide

> Read `CLAUDE.md` first for architecture, project structure, API patterns, and dev commands.
> This file covers enforcement boundaries and failure patterns that agents must know to avoid breaking things.

---

## 1. Tenant Isolation (Enforced, Not Voluntary)

Tenant isolation is enforced at four layers — not by convention alone:

1. **Runtime:** `createScopedClient()` (`packages/db/src/scoped-client.ts`) auto-injects `community_id` and `deleted_at IS NULL` on every query. Throws `TenantContextMissing` if community ID is null/undefined/NaN.
2. **Database RLS:** `FORCE ROW LEVEL SECURITY` is enabled on all 50+ tenant tables (baseline migration `0000`; policy repairs in `0021`/`0023`). Even the table owner role cannot bypass policies.
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

- **Before creating a migration:** Use `pnpm db:migration:new <snake_case_name>` for hand-authored migrations (RLS policies, grants, triggers, functions, backfills) — it picks the next index, stamps `when` with wall-clock `Date.now()`, and chains the snapshot. Use `pnpm --filter @propertypro/db db:generate` when a drizzle-tracked TABLE changes. Editing `meta/_journal.json` by hand is what produces collisions from parallel branches, the most common failure mode.
- **Timestamp ordering — a correctness rule, not bookkeeping:** drizzle records `created_at = journal when` and applies a migration only when `lastApplied.created_at < folderMillis`. A `when` that does not exceed the newest applied value is **silently skipped** — no error, no output. So: stamp `when` with `Date.now()` at authoring time and **never derive it from the previous entry** (PRs #852 and #853 both computed `1784511314576` that way, from the same parent commit). If you rebase onto migrations that merged ahead of you, **re-stamp** — `migration-ordering` rejects a `when` at or below the baseline's newest.
- **Connection discipline:** Pooled connection string for app queries; direct connection string for migrations only.
- **Applying migrations:** production is applied **manually** (see `.claude/rules/migration-safety.md`). Never run `db:migrate` from a shell that loads `.env.local`: its `DATABASE_URL` is PRODUCTION. For tests, `pnpm db:test-local:setup` migrates a disposable local DB.

---

## 3. Compliance Engine (Core Differentiator)

The compliance engine tracks Florida statutory obligations for condos (§718, 17 items) and HOAs (§720, 10 items). Templates live in `packages/shared/src/compliance/templates.ts`. Apartments are excluded via feature gating.

- **Status is computed at query time**, not stored — prevents stale data. Statuses: `satisfied`, `unsatisfied`, `overdue`, `not_applicable`.
- **30-day posting rule:** an item's deadline is `deadlineDays` after its checklist row is generated (see `.claude/rules/florida-compliance.md`). The deadline is exact elapsed milliseconds with **no** weekend adjustment (`packages/shared/src/compliance/posting-deadline.ts` explains why); do not reintroduce a weekend roll or `date-fns` `addDays`.
- **Rolling 12-month windows:** Meeting minutes, video recordings, and bids use rolling retention windows checked at query time.
- **Florida timezone split:** Florida spans Eastern and Central zones. Timezone is per-community (`communities.timezone` column), not per-application. All dates stored UTC, displayed in community-local timezone.
- **Append-only audit log:** `compliance_audit_log` is excluded from soft-delete filtering and has DB-native delete protection. Never attempt to delete audit rows. Integration test teardown must be best-effort and tolerate FK-restricted cleanup.
- **Edge cases requiring test coverage:** DST transitions, leap years, weekend posting dates, year-boundary crossings.

---

## 4. CI Enforcement Gates

> **GitHub Actions is the merge authority.** `.github/workflows/ci.yml` runs on
> pull requests to `main` and pushes to `main`; its required contexts are the
> checks in the table below. `localci` remains useful for fast local feedback,
> but its detached suite is not a merge gate and must never be treated as proof
> that CI passed.

| Check | What it catches | Script |
|-----|----------------|--------|
| **lint** | ESLint, plus every guard listed in `scripts/run-lint-guards.mjs` (DB access DB001–DB005, tenant scope, contracts, legacy roles, design tokens, …) | `pnpm lint` (`turbo run lint` + `node scripts/run-lint-guards.mjs`) |
| **typecheck** | Type errors across all packages | `pnpm typecheck` |
| **unit-tests** | Vitest unit test failures | `pnpm test` |
| **no-mock-guard** | `vi.mock()` / `jest.mock()` in integration tests | `scripts/verify-no-mocks-in-integration.ts` |
| **migration-ordering** | Timestamp ordering, duplicate indices, and an index or `when` already claimed on `origin/main` | `scripts/verify-migration-ordering.ts` — GitHub's PR merge ref catches cross-branch collisions |
| **perf-check** | Bundle size budget violations | `pnpm perf:check` |
| **build** | Asserts perf-check's production build succeeded (`needs: [perf-check]`) | `pnpm build` |

Integration tests need a database: run `pnpm test:integration:local` (a disposable localhost Postgres). **Never** run them through `scripts/with-env-local.sh` — `.env.local`'s `DATABASE_URL` is PRODUCTION, and that is how test communities leaked into prod.

---

## 5. Supabase & Auth Gotchas

- **Session in Server Components:** Not available directly. Use `@supabase/ssr` server client that reads cookies from request headers.
- **Roles are per-community:** Keyed by `(user_id, community_id)` in `user_roles`. Never assume a single global role.
- **Driver:** Use `postgres-js`, NOT `node-postgres` (PgBouncer incompatibility).
- **File uploads:** Presigned URLs for direct upload to Supabase Storage (Vercel 4.5MB body limit). Validate file types via magic bytes (`file-type` package), never trust Content-Type headers.
- **Stripe webhooks:** Handlers must be idempotent. Events arrive out of order. Always fetch fresh state from the Stripe API inside the handler. An event that can never be processed (unknown `signupRequestId`, wrong Stripe mode) must return **200**, not throw — a non-2xx makes Stripe retry something that cannot succeed. Never point local dev at production's webhook endpoint; use `stripe listen --forward-to` (see *Webhook Failures* in `docs/DEPLOYMENT.md`).

---

## 6. Rules From Failure

Synthesized from recurring incidents — these are the root causes, not the symptoms:

1. **Schema drift:** Test against a freshly migrated local DB (`pnpm db:test-local:reset`), never a shared one. Prod migrations are applied manually, so prod can be ahead of or behind `main`.
2. **Build cache:** After editing workspace package source (`@propertypro/shared`, `@propertypro/db`, `@propertypro/email`), rebuild before evaluating test results. Stale `dist/` outputs cause misleading behavior.
3. **Env loading:** `scripts/with-env-local.sh` uses `set -u`. If `.env.local` has `$` expansions referencing unset vars, sourcing aborts. Use `set +u` before sourcing if needed.
4. **Append-only tables:** `compliance_audit_log` has DB-native delete protection. Integration teardown must tolerate FK-restricted cleanup failures.
5. **PDF parsing:** text extraction (`apps/web/src/lib/workers/pdf-extraction.ts`) runs fire-and-forget after the upload handler responds. Keep it out of the request path.
6. **The jsdom pin is load-bearing (Sentry PROPERTY-PRO-7):** root `package.json` has `pnpm.overrides["isomorphic-dompurify>jsdom"] = "25.0.1"`. jsdom >= 26 pulls the **ESM-only `@exodus/bytes`**, which the externalized sanitizer packages `require()` at runtime — 500ing every HTML-sanitizing route (public tenant sites, announcements, violations, document drafts, help API) on Vercel's **Node 24**. It shipped because CI and local ran Node 20 while Vercel ran 24, so CI-green + local-green meant nothing; all three now run 24 (`.nvmrc` + `engines.node`), but keep the override and the guard. Do not drop or raise that override when bumping `isomorphic-dompurify`; `pnpm guard:sanitizer-deps` enforces it. Pinning `html-encoding-sniffer` alone is a known dead end — three separate edges reach `@exodus/bytes`.

---

## 7. Type Safety & Escape Hatches

- **`any`:** Avoid. Use `unknown` with a type guard, or `as unknown as T` backed by a runtime column/property check (this pattern is used in `scoped-client.ts` at Drizzle generic boundaries).
- **`@ts-ignore`:** Never. Use `@ts-expect-error` with a comment explaining why — it auto-fails when the underlying error is fixed, preventing stale suppressions.
- **Unscoped DB access:** Use `createUnscopedClient()` via `@propertypro/db/unsafe`. Document the authorization contract. Add the file to the CI allowlist in `scripts/verify-scoped-db-access.ts`.

---

## 8. Platform Admin App (`apps/admin/`)

The admin app is a separate Next.js application for platform operators (`super_admin`), not PM companies. It has its own API routes under `apps/admin/src/app/api/admin/`; see the admin block in `CLAUDE.md`.

**Key features:**
- Community management (demo lifecycle, subscription status, branding)
- Access plan management (grant/revoke/extend free access)
- Deletion request dashboard (intervene, recover)
- Platform dashboard with KPI stats

**Auth:** Admin routes use `requirePlatformAdmin()`, which reads the Supabase session and then requires a `platform_admin_users` row parsing as `z.enum(['super_admin'])` (`apps/admin/src/lib/auth/platform-admin.ts:19`). `super_admin` is **system-scoped** and stored outside `user_roles`; no community-scoped role grants it.

**DB access:** The admin app uses Supabase admin client (`createAdminClient()`) for direct queries — it is NOT in the scoped client allowlist and does NOT use `createScopedClient()`.

**Account lifecycle tables** (`access_plans`, `account_deletion_requests`): Platform-level, NOT tenant-scoped. Listed in `RLS_GLOBAL_TABLE_EXCLUSIONS`, not `RLS_TENANT_TABLES`. Service-role only access (REVOKE from anon/authenticated).

---

## 9. Agent Live-Test Sandbox

For authenticated UI verification, use `pnpm agent:live:web` (or
`pnpm agent:live:admin`) and the login URL it prints. It starts an isolated
Supabase Auth + Storage + Postgres stack for the current worktree and never
reads `.env.local`.

- Never run bare `pnpm seed:demo`, `pnpm dev`, or `/dev/agent-login` for agent
  live testing from an environment that may inherit `.env.local` production
  values. Use the `agent:*` commands.
- For UI or authenticated behavior, inspect the changed user journey in that
  sandbox. For non-UI work, run the smallest relevant automated check.
- Use `pnpm agent:env:reset` before a test that needs a clean baseline. It
  resets only the current worktree's local sandbox.
- Use `pnpm agent:fixture:user` and `pnpm agent:fixture:community` only for
  `@agent.local` identities and `agent-` community slugs. These commands are
  local-only; do not add a remote fixture endpoint or platform-admin fixture.
- Do not read `.env.local`, extract credentials, or point a live-test command
  at a shared/remote Supabase project. The loopback guard is a security boundary.
- **Document publishing (PDF) in the sandbox.** The renderer's bundled Chromium
  is Linux x64 only. `agent:live:web` passes a shell-exported
  `PUPPETEER_EXECUTABLE_PATH` through; failing that, on macOS it uses
  `/Applications/Google Chrome.app` (or `Chromium.app`). It prints which browser
  it chose, and warns when it found none. On Linux x64 the host needs `libnss3`. A sandbox publish exercises
  the route, Storage and the row; it proves **nothing** about Vercel, whose
  runtime, libraries and function trace differ. After a Chromium or puppeteer
  bump, verify with a real publish on the deployed SHA (see `render-pdf.ts`).
