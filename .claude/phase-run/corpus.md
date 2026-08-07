# PropertyPro corpus knowledge for `/phase-run`

Single source of truth for the repo-specific knowledge every `/phase-run` agent
needs. The skill reads this file and injects it verbatim into the implement,
repair, and corpus-review prompts.

**Why this is one file and not three prompt literals:** the same trap has to be
known by whoever writes the code, whoever fixes it, and whoever reviews it. When
it lived inline in `phase-run-11b2.workflow.js` there were three copies and no
way to add a lesson once. Add new entries here, not to a prompt.

**Keep it to things that are (a) non-obvious and (b) have actually cost a cycle.**
General best practice belongs in `CLAUDE.md` / `.claude/rules/`, which agents
already load. This file is for the landmines.

---

## Verification commands — the exact forms, and why the obvious form is wrong

| Do this | Never this | Why |
|---|---|---|
| `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/propertypro_stub" pnpm test` | `pnpm test` | Three test files are DB-gated and a bare run **silently skips** them. CI's unit job sets exactly this stub URL and **runs** them. Nothing connects to it — the value only has to be *present* at import. A bare run reporting `3 failed` is not evidence of anything. |
| `pnpm --filter @propertypro/web exec tsc --noEmit` | `pnpm typecheck` | Turbo caches per-package results on input hashes and reports **exit 0 on a freshly-broken file**. |
| `node scripts/run-lint-guards.mjs` | `pnpm lint \| tail` | The ~20 guards run *after* eslint and *outside* turbo, so a tail shows only the eslint summary and hides every guard failure. |
| `pnpm test:integration:local` | `scripts/with-env-local.sh …` | `.env.local`'s `DATABASE_URL` is **PRODUCTION**. Running the integration suite against it is how test communities leaked into prod. |
| `pnpm --filter @propertypro/web build` | (skipping it) | The only thing that catches a `node:*` import pulled into a `'use client'` bundle. Typecheck and vitest both pass on that bug. |

The packages/db RLS suite only runs in the **no-argument** form of
`pnpm test:integration:local`; passing a path filters against the apps/web config
only and reports "No test files found".

A **fresh worktree after `pnpm install` has unbuilt workspace packages**, so
`pnpm test` reports ~269 failed files with `Failed to resolve entry for package
"@propertypro/api-contract"`. Environmental, not a regression. Build the non-app
packages first:
```bash
pnpm --filter "@propertypro/*" --filter "!@propertypro/web" --filter "!@propertypro/admin" build
```

---

## Test traps — a green test that proves nothing

1. **Middleware's tenant cache is module-level, positive-only, and survives
   `vi.clearAllMocks()`.** A test reusing a hostname an earlier case in the file
   resolved is served from cache and never reaches the code under test. Every new
   case needs a **fresh hostname**. (`findCommunityIdBySlug` caches negatives too.)
2. **`new Request(...) as NextRequest` has no `nextUrl`** and middleware
   destructures it immediately. Use `new NextRequest`.
3. **A mock factory missing a newly-added export** yields `undefined` at call
   time. After adding an import to a file under test:
   `rg "vi\.mock\('<module>'" apps/web/__tests__` and add the symbol to **every**
   factory. Most dangerous when the test is DB-gated — CI-red, locally invisible.
4. **A test can pass on the OLD constraint.** On 11a a test meant to prove a new
   index passed on the old one because its two rows differed on a second
   dimension. Vary **only** the dimension under test.
5. **A test that mocks the thing it is verifying proves nothing.** `sitemap.test.ts`
   and `robots.test.ts` mock `resolveCommunityContext` with hardcoded returns, so
   a fix to its *arguments* is invisible unless a case asserts
   `toHaveBeenCalledWith(...)`. When a fix changes a call's inputs, assert the
   inputs.
6. **A component contract asserted in isolation cannot see the composition that
   forgets it.** 11b-1's publish button was dead in production for every PM while
   `EditorShell.test.tsx` stayed green, because the test passed the prop the real
   parent never did. Test the seam, not only the leaf.
7. **When a known-failing file is in the way, check the failure REASON, not the
   count.** A real break hides behind a pre-existing one.

---

## Architecture invariants

- **Tenant isolation.** All tenant queries go through `createScopedClient()` from
  `@propertypro/db`; operators come from `@propertypro/db/filters`. Cross-tenant
  access needs `@propertypro/db/unsafe` plus a documented authorization contract.
  Enforced by `guard:db-access`, FORCE RLS, and a write trigger.
- **The anon/public read path** is `apps/web/src/lib/db/public-community-reader.ts`.
  It must never reach a service that locks or writes — `site-pages-service.ts`'s
  `listSitePages` takes `FOR UPDATE` on `communities` and can INSERT.
- **New tenant table** ⇒ bump `RLS_EXPECTED_TENANT_TABLE_COUNT` **and** add it to
  `RLS_TENANT_TABLES` in `packages/db/src/schema/rls-config.ts`. Two parallel PRs
  each setting `+1` git-auto-merges silently; the second to merge must set the
  true total.
- **Optional props whose default means "off" fail silently.** 11b-1 shipped a dead
  publish button that way. If a prop's absence disables a feature, make it
  required — unless it is a *layout* prop, where `LayoutProps.footer` is optional
  on purpose (test files sit outside the `src/**` tsconfig include, so a required
  prop fails at runtime in layout tests rather than at typecheck).
- **An allowlist over a schema that other code can extend is a data-loss bug on a
  timer.** Three hero writers rebuilt content from hand-maintained field lists and
  two silently deleted the photo array on save.
- **A list promoted to a stricter job must be re-derived from the thing it now
  governs.** 11b-2 promoted `PROTECTED_PATH_PREFIXES` from an auth gate to a
  *routing* gate; because it is not the complete set of `(authenticated)` routes,
  `/meetings` and `/arc-requests` were briefly classified as public page slugs.

## Design system

- Semantic colour tokens are bare `var(--x)` with **no `<alpha-value>` channel**, so
  **slash-opacity emits ZERO CSS** — `bg-interactive/10`, `border-edge/50`,
  `bg-accent/10` all render as nothing. This shipped invisibly for months. Use a
  solid `-subtle`/`-bg`/`-hover`/`-border` token; for genuine translucency use
  built-in `white`/`black` alpha, which are real rgb ramps.
- No raw hex, no raw Tailwind palette classes, no arbitrary values. Baselines are
  **shrink-only** and `site-editor-v3/` + public-site files have **no slack** —
  new markup must arrive clean. Escape hatch `// design-tokens:exempt — <reason>`
  must be **on the offending line**; a JSX comment above a text node does not
  satisfy the guard.
- A comment that *quotes* a banned class trips the guard (comment lines are exempt
  from raw-hex only). Lift the literal to a `const` or reword.
- Page gutter is single-sourced in `PageContainer`; pages use `PageBody` and add no
  root `px-*`/`py-*` and no page-level `<main>`.
- Breadcrumbs are never authored per page; every detail/new/edit page needs an
  `<h1>` (via `PageHeader`) so the shell trail can resolve a leaf.
- Accessibility: decorative icons `aria-hidden="true"`; never suppress
  `:focus-visible`; exactly one `<h1>` per page; `aria-current="page"` on exactly
  one nav item.

## Process

- Migrations are applied to prod **manually**; expand before the code ships,
  contract after. Always re-check `packages/db/migrations/` for the true highest
  number. Ledger `hash` = `shasum -a 256 <file>`, `created_at` = the journal `when`.
- **Never hand-edit `meta/_journal.json`.** Use `pnpm db:migration:new` (hand-written
  SQL) or `pnpm --filter @propertypro/db db:generate` (table add/alter, so the
  snapshot records a real diff). `when` is wall-clock, never derived from the
  previous entry — a `when` at or below the newest applied value is **silently
  skipped** by drizzle.
- Auto-merge is **disabled** and so is `delete_branch_on_merge`, so a stacked PR is
  **not** retargeted when its base merges. Retarget by hand and re-check the diff.
- `Build` does not build. `perf-check` owns the only production build; `Build`
  asserts `needs.perf-check.result == 'success'`, so a *skipped* perf-check fails
  it. Do not read a skip as a pass.
- **CI runs no e2e except `e2e/pdfjs-runtime.spec.ts`** inside perf-check. Do not
  assume a Playwright spec guards anything in CI.

---

## Review lenses that have actually found defects here

Ranked by how often they have caught something real:

1. **"This ships before its UI — what can an HTTP client do in the window?"** The
   pages API shipped with no feature flag; that reframing turned three "future
   phase" findings into blockers on 11b-1, and found an anonymous draft-page leak
   on 11b-2.
2. **Draft/published and cross-page leakage.** Can an unpublished row be read
   anonymously? Can one page's blocks render on another's URL? Is a preview flag
   derived from anything visitor-controlled?
3. **Cross-tenant.** Is every new query `community_id` scoped? Is a client-supplied
   foreign key validated?
4. **Ordering changes in middleware.** Any request that previously reached the
   authenticated app and now does not is a resident-facing outage — the highest
   severity class in this repo.
5. **The test traps above**, especially #3 and #5.
6. **Deviation from the plan's Decision Ledger.** A deviation is a finding;
   *disagreeing* with a ledger entry is not.
