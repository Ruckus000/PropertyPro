# PropertyPro Florida

Compliance and community management platform for Florida condominium associations (§718.111(12)(g)).

**Status:** role-v3 / ADR-006 fully landed — the legacy 7-role vocabulary is retired and a single v3 role vocabulary runs end-to-end. Pre-launch hardening in progress.

## Tech Stack

- **Framework:** Next.js 15.5.x (App Router) / TypeScript / React 19
- **Styling:** Tailwind CSS + shadcn/ui
- **State:** TanStack Query (React Query)
- **Database:** PostgreSQL via Supabase, Drizzle ORM
- **Auth:** Supabase Auth (email + password)
- **Storage:** Supabase Storage
- **Email:** Resend
- **Hosting:** Vercel (web), Supabase (database)
- **Mobile:** Web-only routes at `/mobile/` (no native app yet)

## Project Structure

```
apps/web/src/           # Next.js app (routes, components, hooks, lib, middleware)
apps/admin/src/         # Platform admin app (community management, access plans, deletion requests)
packages/db/            # Drizzle ORM schema, migrations, scoped-client, queries
packages/email/         # Email templates and service
packages/shared/        # Shared types and constants (roles, RBAC, access policies)
packages/api-contract/  # Typed API route contracts (@propertypro/api-contract)
packages/ui/            # Shared UI components
packages/tokens/        # Design tokens
packages/theme/         # Per-community theme resolution → CSS vars + font links
scripts/                # Seed, verify, and utility scripts
docs/                   # Specs, ADRs, audits, design system
```

## Key Concepts

**Multi-Tenancy:** Single DB with `community_id` FK isolation. Subdomains per association (`[slug].getpropertypro.com`). PM dashboard at `pm.getpropertypro.com`.

**User Roles (v3 / ADR-006):** Community-scoped roles in `user_roles` are `resident`, `property_manager`, and `root_manager` (≤1 per community). `resident.isUnitOwner` distinguishes owner vs. tenant. Board status is an orthogonal `designation` column (`board_president` / `board_member`), read only by statutory features — not general permissions. `super_admin` is system-scoped (`platformAdminRoleEnum`), stored outside `user_roles`.

> Role vocabulary: the legacy seven-role names (`owner`, `tenant`, `board_member`,
> `board_president`, `cam`, `site_manager`, `property_manager_admin`) have been
> **fully retired** — the compatibility shim, the 7-role `RBAC_MATRIX` columns, and
> the dead `user_role` pgEnum are all gone. `CommunityRole` (`packages/shared`) is
> now the 3 v3 roles (`resident`/`property_manager`/`root_manager`); the derived
> permission layer keys on the `MatrixRole` rows (`owner`/`tenant`/`manager`, e.g.
> `ADMIN_ROLES = ['manager']` in `access-policies.ts`), which `resolveMatrixRole`
> maps the v3 roles onto (`resident` splits owner/tenant via `isUnitOwner`). The only
> residual legacy-name strings are non-runtime content — help-article frontmatter,
> dev-login aliases, and test fixtures — held to a floor by `guard:legacy-roles`
> (STRUCTURAL/BRIDGE buckets empty). See `docs/adr/ADR-006-root-manager-role-model.md`
> (supersedes ADR-001).

## Development Commands

```bash
pnpm install                    # Install dependencies
pnpm dev                        # Run dev server
pnpm typecheck                  # Type-check all packages
pnpm lint                       # Lint + DB access guard
pnpm build                      # Production build
pnpm test                       # Unit tests
pnpm seed:demo                  # Seed demo data
pnpm seed:verify                # Verify seed integrity
pnpm perf:check                 # Performance budget check
pnpm --filter @propertypro/db db:migrate  # Run migrations

# Integration tests — LOCAL isolated DB (recommended). Creates/migrates a
# disposable localhost Postgres mirroring CI, then runs the suite. NEVER prod.
pnpm test:integration:local                       # whole suite (add a path for one file)
pnpm db:test-local:setup                           # just create/migrate the local DB
pnpm db:test-local:reset                           # clean slate (drop + recreate + migrate)

# ⚠️ Integration tests against .env.local's DATABASE_URL — which is PRODUCTION.
# Avoid; this is how test communities leaked into prod. Prefer the local runner above.
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts

# Full integration preflight (also uses .env.local → prod; prefer the local runner)
scripts/with-env-local.sh pnpm test:integration:preflight

# E2E (Playwright) — THREE configs; none of them runs the whole directory.
pnpm playwright:install         # Install browsers (once)
pnpm test:e2e                   # dev server on :3000 (+ admin on :3001)
pnpm test:e2e:tenant            # tenant-host specs; dev server on localtest.me:3002
pnpm --filter @propertypro/web test:e2e:prod
                                # production build on :3100; the only specs CI runs.
                                # Takes NO spec paths — the list is PROD_SAFE_SPECS
                                # in playwright.prod.config.ts. A CLI path list
                                # overrides testMatch and silently diverges.

> **E2E preconditions, and what CI does NOT cover.** These specs are not
> self-contained: they need `NODE_ENV=development`, a live Supabase **Auth**
> instance (`/dev/agent-login` calls `auth.admin.generateLink`, so a bare
> Postgres is not enough — use a local `supabase start` stack, never prod), and
> `pnpm seed:demo` for the demo users. `test:e2e:tenant` additionally needs
> wildcard DNS for `*.localtest.me` → 127.0.0.1 (works unconfigured on macOS)
> and starts its own server on :3002.
>
> **Two local-stack requirements that are easy to miss** (both cost a full
> investigation on 2026-08-05 — see the seventh addendum of the audit note):
> 1. Set **`auto_expose_new_tables = true`** under `[api]` in
>    `supabase/config.toml`. The Supabase CLI now defaults this OFF, so tables
>    created by our migrations get NO Data API grants and routes fail with
>    `permission denied for table … (42501)` — 85 of 100 public tables. Prod is
>    not like this. On an existing DB, apply
>    `scripts/sql/local-supabase-post-migrate.sql` after a blanket grant.
> 2. Launch the suite through **`scripts/with-env-local-demo-db.sh`**. `next dev`
>    reads `.env.local`, whose `DATABASE_URL` is **production**; it is safe only
>    because Next's loader does not overwrite vars already in `process.env`, so
>    the wrapper's loopback exports must come first.
>
> The admin app (`:3001`) needs a row in `platform_admin_users`. **Nothing seeds
> it, deliberately** — that would put platform-wide `super_admin` into shared demo
> data. Instead `apps/admin/src/app/dev/agent-login/route.ts` provisions a
> dedicated `e2e.platform.admin@local` identity and its grant on demand, in
> `development` only. `pnpm seed:demo` still leaves the table at 0 rows, and the
> demo persona `pm.admin@sunset.local` never holds platform privilege.
> **Use `localhost:3001`, never `127.0.0.1:3001`,** for admin-app specs: Supabase
> auth cookies are host-only and Next's dev server normalises `request.url` to
> `localhost` regardless of `--hostname`, so mixing the two silently drops the
> session (see the eighth addendum).
>
> **CI now runs 32 of the suite's 45 test blocks, across two runners.** (45 is from
> `playwright test --list` per config — 35 default + 4 pdfjs + 6 tenant. Do not
> count with `grep -c 'test('`; that is how an earlier note said 43.)
>
> 1. The **localci suite's build step** (`pnpm build` → `test:e2e:prod` →
>    `perf:check`) runs `pdfjs-runtime`, `activation-smoke` and `marketing-smoke`
>    (10 blocks) in one `test:e2e:prod` invocation. Those three are exactly the
>    ones needing no DB, no Auth and no seed, which is what lets them run against
>    a stub `DATABASE_URL` that was never started. This is also the only place
>    that exercises a PRODUCTION build — do not fold it into the one below.
> 2. **`.github/workflows/e2e.yml`** runs the 28 blocks in
>    `apps/web/e2e/ci-safe-specs.json` via `playwright.ci.config.ts`, against a
>    real Supabase stack (`supabase start` in `.supabase-ci/`, migrations,
>    `pnpm seed:demo`) and a **dev** server — which is what `/dev/agent-login`
>    requires, and why `next start` cannot host these. It is NOT a required
>    check, and it only fires on PRs touching app/package/e2e paths.
>
> **The remaining 13 blocks are still unexercised on a PR**: the 5 signup blocks
> (owned by `stripe-e2e.yml` and conditional on its secrets), the 6 tenant-host
> blocks (they need `:3002`), and the 2 `onboarding-first-run` `test.fixme`
> blocks.
>
> `support-access` joined the allowlist in #958. It had looked like a broken
> spec — a 120s timeout on the admin popup — but the cause was that the admin
> app was running with NO environment: `signSupportToken` throws without
> `SUPPORT_SESSION_JWT_SECRET`, the route 500s, and the dialog returns without
> ever opening the popup being waited on. `scripts/setup.sh` symlinks
> `apps/admin/.env.local`, but a worktree created before the admin app existed
> will not have it. The e2e job starts the admin server for this spec.
>
> The allowlist is meant to GROW: fix a spec, add it to `ci-safe-specs.json` and
> bump `expectedTestCount`, which the workflow asserts as a floor so a spec
> renamed out of the glob fails loudly instead of shrinking coverage silently.
> `docs/audits/2026-08-03-e2e-inventory.md` measures the whole suite. Latest
> measurement (**2026-08-12**, full local stack, `workers: 1`): the default
> suite is **27 passed / 1 failed / 7 skipped** in 11.1 min. The 7 skipped are
> the 5 Stripe signup blocks (no test-mode secrets locally) and the 2 deliberate
> `onboarding-first-run` `test.fixme` blocks — that spec describes a 4-/5-step
> wizard, but **both** condo and apartment ship the same 2-step one. The single
> failure is `support-access`, which times out after 120s waiting for the admin
> app's `popup` event after Start Session.
>
> Before trusting a local number, confirm the port is clear AND
> `ps -eo comm | grep -c vitest` is 0; also compare the CANARY TIMINGS
> (`activation-smoke` ~0.7-4s, `marketing-smoke` ~3s), because a canary that
> passes but is 5x slower still means the environment moved.
>
> **Never click straight after waiting for a heading — use `clickWhenHydrated`**
> (`apps/web/e2e/helpers/hydration.ts`). Playwright actionability is a DOM check
> and does NOT mean React attached a handler; a click on server-rendered markup is
> **swallowed**, so no timeout can recover it. A heading is in the server HTML and
> appears *before* hydration by definition. This one cause hit THREE specs — two
> red for months behind 30s waits (misdiagnosed twice as first-render budgets and
> once as a stale dev server), and one silently patched with a retry-click.
> Measured hydration lag was only ~260-510ms.
>
> **Support impersonation forwards ONE identity.** The web middleware's support
> branch must move `x-user-id`, `x-user-full-name` and `x-user-email` together;
> name/email come from the `target_name`/`target_email` claims on the signed
> support JWT (resolved once at session creation, so there is no per-request
> query), and `x-user-phone` is always dropped. When a claim is absent the headers
> are **cleared, never inherited** — overriding only the id is what previously
> showed the admin's identity over the impersonated user's data.
>
> **Adding a spec to the localci suite's `test:e2e:prod` step requires proving it
> passes against a PRODUCTION build with an UNREACHABLE database.** Passing under
> `pnpm test:e2e` proves nothing about that step — that command runs a dev server
> against a real database, differing on both axes.

# Other guards (run individually; all bundled into `pnpm lint`)
pnpm guard:breadcrumbs          # Breadcrumb coverage
pnpm guard:tenant-scope         # tenantScope contract well-formedness
pnpm guard:legacy-roles         # Legacy-role vocabulary floor
pnpm guard:design-tokens        # Ban raw colors/arbitrary values (shrink-only baseline)
pnpm guard:page-padding         # Page gutter single-sourced in the shell; no per-page px / nested <main>
pnpm guard:token-coverage       # Every referenced var(--*) must be defined
pnpm guard:class-resolution     # Every colour utility class in apps/web/src must emit CSS
```

> **Design tokens (`guard:design-tokens`):** bans raw hex, raw Tailwind palette
> classes (`bg-blue-500`), arbitrary color/font/spacing values, and
> **slash-opacity on semantic tokens** (`bg-interactive/10`,
> `hover:bg-status-danger/90`) — the app's semantic colors are bare `var(--x)`
> with no `<alpha-value>`, so Tailwind emits ZERO CSS for the modifier and the
> color silently renders as nothing. Use a solid `-subtle`/`-bg`/`-hover`/`-border`
> token, or built-in `white`/`black` alpha (`bg-white/20`) for genuine
> translucency. Existing violations are frozen in
> `scripts/design-token-baseline.json` (shrink-only); new files must be clean;
> escape hatch `// design-tokens:exempt — <reason>`. Full rules in
> `.claude/rules/design.md`.

> **Class resolution (`guard:class-resolution`):** Tailwind does not error on a
> class it does not recognise — it emits **no rule**, and the element renders with
> no colour. `guard:design-tokens` cannot see this (it checks that RAW palette
> classes are gone, not that the replacement resolves), and `guard:token-coverage`
> cannot either (a class name never reaches a `var(--x)` if Tailwind drops it
> first). This guard compiles Tailwind via postcss against
> `apps/web/tailwind.config.ts` — **no `next build` needed**, ~0.7s — and asserts
> every colour utility referenced in `apps/web/src` emits CSS. Two shapes it
> catches: **shadcn orphans** (`bg-background`, `text-muted-foreground`,
> `border-input`, `ring-ring` — upstream assumes a `background`/`input`/`ring`
> vocabulary this repo never defined) and **semantic near-misses**, where the CSS
> VAR name is written as the CLASS name (the var is `--interactive-primary`; the
> class is `bg-interactive`). It checks the **base** utility with variants
> stripped, and deliberately ignores slash-opacity so that stays owned by
> `guard:design-tokens`. Tri-state exit: 0 clean / 1 violations / 2 could-not-check.
> Note a class emitting CSS still does not prove the control is *visible* — see
> `apps/web/__tests__/accessibility/switch-contrast.test.ts`.
>
> It scans **`apps/web/src` + `packages/ui/src`** — both roots the web config
> lists in `content`, so a packages/ui class that resolves to nothing renders as
> no style in web exactly like one written in apps/web (apps/admin's guard scans
> only `apps/admin/src`, so nothing else covers it). Extraction uses the
> **TypeScript parser**, not a regex over the raw text: a quote-delimited regex
> cannot tell a string from a REGEX LITERAL or from JSX TEXT, so `const re =
> /"/g` and `<p>Don't stop</p>` each swallow whatever follows on their line. It
> also flags class names **assembled at runtime** (`` `bg-status-${v}` ``,
> `cls.replace("text-", "bg-")`), which Tailwind's source-text scanner can never
> see — that is a separate failure from an undefined class, and `StatusDot` had
> both at once. The parser's own failure detector is self-tested before the scan
> is trusted, because `parseDiagnostics` is a TS internal.

> **Page padding (`guard:page-padding`):** the authenticated page gutter (horizontal
> `px`, vertical `py`, and centred max-width) is single-sourced in **one** place —
> `PageContainer` (`apps/web/src/components/layout/page-container.tsx`), rendered by
> the app shell around every authenticated route (`px-6 sm:px-8 lg:px-10 py-8`,
> `max-w-[1400px]`). Pages render only their content and inherit that gutter. Use
> `PageBody` (`apps/web/src/components/shared/page-body.tsx`) as the content root —
> it standardises vertical rhythm (`space-y-6`) and offers narrower centred columns
> (`width="prose|form|content|reading|narrow"`) **without** horizontal padding.
> Pages must NOT re-add their own `px-*`/`py-*` at the root (double-pads the gutter)
> or render their own `<main>` (the shell owns the only `<main id="main-content">`).
> The guard scans `(authenticated)/**/page.tsx`; violations are frozen shrink-only in
> `scripts/page-padding-baseline.json` (currently empty); escape hatch
> `// page-padding:exempt — <reason>`. To retune app-wide padding, edit
> `PAGE_GUTTER_X` / `py-*` in `PageContainer` — one line, whole app.

> The list above is representative, not exhaustive. See the root `package.json`
> `scripts` block for the full set (more `guard:*`, `seed:*`/`reset:demo`,
> `plan:verify:*`, `help:*`, and E2E variants).

**CI:** the lint / typecheck / unit / build / perf gate runs through **localci**
(the `localci` CLI), NOT GitHub Actions. `.github/workflows/ci.yml` is
`disabled_manually` and that is deliberate — #976 moved CI off GitHub when Actions
minutes ran out (last ci.yml run: 2026-08-24). Two phases, wired as a pre-push hook:

- **`gate`** — blocking, before the push completes: `pnpm lint` (includes the DB
  access guard and the rest of the `guard:*` set), `pnpm typecheck`,
  `./scripts/verify-css-var-migration.sh`.
- **`suite`** — detached after the push, 8 steps: no-mock guard →
  migration-ordering → `reset:demo` + `seed:demo` (resolve-only, against a stub
  `DATABASE_URL`) → `apps/web` vitest with coverage → the package suites + admin
  tests → then **`pnpm build` + `test:e2e:prod` + `pnpm perf:check`**. That last
  step owns **the only production build**, and with it the bundle-size budget and
  the PDF.js smoke test, which read build output from disk. It reports back to
  GitHub as the `localci/suite` check.

Run history is in `~/.localci/runs/<project>/<run>/`, and `status.json` lists every
step's exact command and exit code. **Read it before claiming what did or did not
run** — an absent GitHub `perf-check` on a PR is not a coverage gap, and the
production build is not missing. Do not propose re-enabling ci.yml (see below).

Still on GitHub Actions, independently of localci: Integration Tests, E2E, Branch
Freshness Guard, Scoped DB Access Guard.

Two consequences worth knowing:

- `deploy.yml` used to trigger on `workflow_run: [CI]`, and a disabled workflow
  never completes — so #978 moved it to `push: [main]`. **Re-enabling ci.yml means
  reverting that trigger, or every merge deploys twice.**
- The gate is per-machine. A contributor without localci gets no
  lint/typecheck/unit/build/perf gate server-side; `localci hooks` installs a
  global dispatcher, but that too is per-machine.

Two traps: the suite runs against the **working tree**, not the pushed commit, so
editing or rebasing while it runs fails the run on your own half-written files;
and suites serialize across every registered project, so `suite running in the
background` on push can mean *queued* — confirm with `localci runs` and check the
run's `status.json` `commit` matches.

Unit tests are split into two vitest projects — `node` (~505 files) and `jsdom`
(~285) — because constructing a JSDOM per file dominated the job. See
`apps/web/vitest.shared.ts` for the partition rules before adding test files.

## Environment Setup

Env vars stored in root `.env.local`. Run `./scripts/setup.sh` after cloning (creates symlink to `apps/web/.env.local`). Node 20 (`.nvmrc`). Turbo orchestrates build/dev/lint.

## Demo Data

Three seeded communities (`pnpm seed:demo`):
- **Sunset Condos** (`sunset-condos`) — Miami (condo_718)
- **Palm Shores HOA** (`palm-shores-hoa`) — Fort Lauderdale (hoa_720)
- **Sunset Ridge Apartments** (`sunset-ridge-apartments`) — Tampa (apartment)

## Rules & Detailed Guidance

Domain-specific rules are in `.claude/rules/` and load automatically when relevant:
- `tenant-isolation.md` — Scoped DB access, schema conventions, CI guard
- `migration-safety.md` — Migration numbering, journal drift, creation checklist
- `florida-compliance.md` — Statutes, timing rules, compliance engine
- `api-patterns.md` — Route structure, required patterns, route contracts (`runRoute`), tenant scoping, pagination, middleware, route catalog
- `agent-testing.md` — How to authenticate as demo users for testing
- `design.md` — UI/UX design system rules, component patterns, accessibility, quality gate
- `verification.md` — Revert-checks, why an exit code is not evidence, running one test file, guard shape

## Documentation

- `DESIGN.md` — Comprehensive UI/UX design system reference (tokens, components, UX patterns, accessibility)
- `AGENTS.md` — Agent safety guide: tenant isolation, migration gotchas, CI gates
- `docs/00-DEMO-PLATFORM-TECH-SPEC.md` — Full technical specification
- `docs/adr/` — Architecture Decision Records
- `docs/audits/` — Gate verification evidence
- `docs/design-system/` — Design system documentation, docs only (V2 spec README, DESIGN_LAWS, public-site block specs, layout templates, custom CSS overrides); implementations live in the canonical code paths listed in its README
