# Platform Admin Portal — Production-Readiness & Hardening Audit

**Date:** 2026-08-05
**Scope:** `apps/admin` (platform operator console, `admin.getpropertypro.com`) — 17.5k LoC, 36 API routes, ~18 pages, 42 components, 40 test files.
**Method:** three parallel read-only sweeps (API routes, frontend/pages, infra/CI/deploy) + manual verification of every P0 claim against source.
**Baseline for parity:** `apps/web` hardening stack (`withErrorHandler`, `requirePermission`/`runRoute`, `logAuditEvent`, CSP/HSTS via `security-headers.ts`, `error.tsx`/`not-found.tsx`).

---

## Verdict

**Not production-ready.** The console is functionally incomplete (sign-out is broken, error/404 pages render as unstyled Next defaults) and is the *less* hardened of the two apps despite holding the more dangerous capability: 23 files use the **service-role client (RLS-bypassing)** and it can impersonate any user, delete tenants, and grant free access.

Three issues are release-blocking on their own:

1. **Nothing ships.** The admin Vercel project's `ignoreCommand` skips the build unless a commit touches specific API/contract paths — so admin **page/component/middleware/auth changes never deploy at all**. This audit's fixes cannot reach prod until this is corrected first.
2. **A support-impersonation JWT is forgeable** in any environment not started with `NODE_ENV=production` (preview/staging/docker), because both signer and verifier fall back to a hard-coded secret checked into the repo.
3. **The console serves no security headers** — no CSP, HSTS, X-Frame-Options, or nosniff — and its auth cookie loses the `secure` flag in production.

Everything is fixable with focused work; nothing requires an architectural rewrite. The phased plan below is ordered so the enabling fixes (deploy, error handling) come first.

---

## Severity legend

- **P0 — ship-blocker:** breaks a core function, or the fix is a precondition for other fixes reaching prod.
- **P1 — hardening-critical:** exploitable security gap or missing safety control; fix before real operators use it.
- **P2 — robustness/parity:** correctness, observability, or divergence from `apps/web` conventions.
- **P3 — polish:** UX, a11y, dead code, tracked design debt.

---

## P0 — Ship-blockers

### P0-1 · Admin has not deployed to production in 69 days

> **Severity corrected 2026-08-05 after querying the Vercel API.** The original
> finding below said admin "never deploys on admin-only changes." The measured
> reality is worse: **it has not deployed at all since 2026-05-28.**
>
> | | |
> |---|---|
> | Vercel project | `property-pro-admin` (`prj_qVuIdXqyykxBRy4RvO1kftPhvSOT`) |
> | Last `READY` production deploy | `47311e04`, **2026-05-28 01:44 UTC** |
> | `ignoreCommand` committed (`9ac5e657`) | **2026-05-28 01:53 UTC** — nine minutes later |
> | Every deployment since | `CANCELED` — including **7** with `target: production` from `main` |
> | Commits on `main` since | **728**, of which **42 touch `apps/admin`** |
>
> `admin.getpropertypro.com` is live and returns `200` from `/api/health`, so
> operators have been using a **69-day-old console** with no signal that it was
> stale — which is exactly what P2-4 (no post-deploy verification, no uptime
> monitoring) predicts. Everything merged into `apps/admin` since May 28 —
> site-templates, the coral rebrand, role-v3 admin fixes, block-registry, the
> Phase 9/11 site-editor admin work — is **not in production**.
>
> The git integration *is* connected and *does* fire on `main` with
> `target: production`; the Ignored Build Step cancels every one.


`apps/admin/vercel.json:4`:
```
git diff --quiet HEAD^ HEAD -- 'apps/web/src/app/api/v1/' 'apps/admin/src/app/api/' 'packages/api-contract/' 'scripts/verify-contracts.ts' && exit 0 || exit 1
```
Vercel semantics: **exit 0 = skip build.** `git diff --quiet` exits 0 when there is *no* diff in those paths. So any commit that only touches admin **pages, components, `src/lib/`, `src/middleware.ts` (auth!), or `next.config.ts`** produces **no deploy**. `deploy.yml` has a single `VERCEL_PROJECT_ID` (web) and no admin deploy step; it only *compiles* admin as collateral of the unfiltered `turbo run build` and throws the output away. Admin's **only** production path is the native Vercel Git integration, governed entirely by this inverted filter. Almost certainly a copy-paste of a contract-verification filter into an app project.
**Fix:** give admin a correct `ignoreCommand` (build when `apps/admin/**` or shared `packages/**` change) or a dedicated deploy job in `deploy.yml` with its own project id. This must land **first** — it is the precondition for every other fix reaching prod.

### P0-2 · Sign-out is broken
`components/Sidebar.tsx:135` posts to `POST /api/auth/signout`. **That route does not exist** anywhere in the repo (admin's API surface is `/api/admin/*` + `/api/health`). The POST hits middleware as a non-public path, gets a full auth pass, then 404s. **Platform admins cannot log out.**
**Fix:** add `app/api/auth/signout/route.ts` (or a server action) that calls `supabase.auth.signOut()` with `ADMIN_COOKIE_OPTIONS` and redirects to `/auth/login`; add `/api/auth/signout` to the middleware public list.

### P0-3 · `throw new Response()` does not work in the App Router → every 401/403 is a 500
`lib/auth/platform-admin.ts:31,47,59` and `lib/request/admin-page-context.ts:24,28` throw a raw `Response` to signal 401/403. That is a Remix idiom; Next.js App Router does **not** unwrap a thrown `Response` from a route handler or RSC — it becomes an unhandled error and Next returns a generic 500. **35 of 36 API routes** call `requirePlatformAdmin()` without catching it (only `demos/[id]/convert/route.ts:72` does). It fails *closed* (denials still deny), but every auth rejection is a Sentry-noisy 500, untestable, and any client/test asserting 401/403 is asserting on behavior that doesn't exist.
**Fix:** throw a typed error (mirror web's `ForbiddenError`/`UnauthorizedError`) and introduce an admin `withErrorHandler` that maps it to the right status. Pairs with P0-4.

### P0-4 · No `error.tsx`, `global-error.tsx`, or `not-found.tsx`
Zero of the three exist under `apps/admin/src/app` (web has all three). Consequences: the 4 `notFound()` call sites, the 3 `throw new Error(...)` sites in `site-templates/*`, and every P0-3 auth-500 all render Next's **unstyled default** page outside `AdminLayout`. No retry affordance, no branding, no `robots noindex`.
**Fix:** add root `error.tsx` (with reset), `global-error.tsx`, and a styled `not-found.tsx` inside the admin shell.

### P0-5 · The two most-privileged pages have no per-page auth check
`clients/page.tsx:43` and `clients/[id]/page.tsx:50` both instantiate `createAdminClient()` (service-role) and render **cross-tenant** data — every community's name/slug/city/subscription, member counts, compliance scores, `community_settings` JSON — with **no** `requireAdminPageSession()` call. Every other service-role page pairs with the guard (several carry `AUTHZ:` justification comments); these two are the only outliers. Not exploitable *today* (middleware is the real gate), but it removes the defense-in-depth layer on exactly the highest-value surface, and a future middleware-matcher regression would expose it.
**Fix:** add `await requireAdminPageSession()` at the top of both, matching the sibling pages.

---

## P1 — Hardening-critical

### P1-1 · Forgeable support-impersonation JWT (CRITICAL security)
`apps/admin/src/lib/support/jwt.ts:23-24` and `apps/web/src/lib/support/impersonation.ts` (verify side) both fall back to `SUPPORT_SESSION_DEV_SECRET` — a literal constant in `packages/shared/src/support-access.ts:14` (`'propertypro-local-support-session-secret-2026'`) — whenever `NODE_ENV !== 'production'`. Any deployment not explicitly running with `NODE_ENV=production` (preview, staging, a misconfigured container) will **accept a `pp-support-session` JWT that anyone can forge** for any `sub` / `community_id`, granting impersonation of any user in any community with no admin session.
**Fix:** require `SUPPORT_SESSION_JWT_SECRET` unconditionally on both signer and verifier; **delete** the shared constant; fail closed (throw) if the env var is missing regardless of `NODE_ENV`.

### P1-2 · Support JWT handed to JS in a non-HttpOnly, domain-wide cookie
`StartSessionDialog.tsx:75` sets `document.cookie = "pp-support-session=<jwt>; domain=.<root>; SameSite=Lax"` client-side. It is readable by JavaScript on **every subdomain**, so any XSS anywhere on the tenant domain steals a live impersonation token. Cookie `max-age=3600` also outlives the JWT `exp` of 1800s.
**Fix:** have `POST /api/admin/support/sessions` set an **HttpOnly, Secure** cookie server-side (or hand off via a one-time redirect on the web app); stop returning the raw `token` in the JSON body; align cookie lifetime to the JWT TTL.

### P1-3 · No security headers on any admin response
Confirmed zero across `next.config.ts`, `vercel.json`, `middleware.ts`, and `layout.tsx`: **no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy.** Web sets all of them (`security-headers.ts:111-120`, `apps/web/vercel.json:26-34`). The service-role console is clickjackable and its responses carry no HSTS.
**Fix:** port web's `security-headers.ts` into admin middleware (X-Frame-Options: DENY is a natural fit — admin is never framed), and add the HSTS header block to `apps/admin/vercel.json`.

### P1-4 · Auth cookie loses `secure: true` in production
`ADMIN_COOKIE_OPTIONS = { name: 'sb-admin-auth-token' }` (`cookie-config.ts:8`) is passed to `createServerClient`, which **replaces** (not merges) `getCookieOptions()` at `packages/db/src/supabase/middleware.ts:111`. `getCookieOptions()` is the sole source of `secure: true` in prod (`cookie-config.ts:31-34`). The session-isolation behavior (host-scoped, distinct cookie name — admin login ≠ web login) is **intended and correct**; the dropped `secure` flag is unintended collateral.
**Fix:** merge `{ ...getCookieOptions(), name: 'sb-admin-auth-token', domain: undefined }` so `secure` is retained while keeping the host-scoped isolation.

### P1-5 · Privileged mutations have no audit trail
Unlogged today: platform-admin **add** (`platform-admins/route.ts:102`) and **remove** (`[userId]/route.ts:39`); member **role change** and **removal** (`communities/[id]/members/[userId]/route.ts`); demo **hard-delete** of a community + auth users (`demos/[id]/route.ts`); access-plan **grant/revoke/extend** (all three routes); deletion-request **intervene** and the tenant **un-delete** in `recover`; file **upload**. Only `support_access_log`, `compliance_audit_log` (site-templates + demo-community edits), one settings flag, and `conversion_events` write anything. There is no record of who granted admin, who deleted a tenant, or who un-deleted one.
**Fix:** route every privileged mutation through a shared `logAdminAction({ actorId, action, target, metadata })` writing to an append-only admin audit table.

### P1-6 · Authenticated-admin RCE via the demo preview compiler
`compile-template.ts:97-101` executes template source with `new Function()` and **no VM sandbox** (the file's own header comment acknowledges "full server-side RCE"). `demos/preview/route.ts:12-18` accepts `branding.{primaryColor,…,fontHeading,fontBody}` as bare `z.string().optional()` — **no** `HEX_COLOR` / `ALLOWED_FONTS` check, unlike the sibling create route (`demos/route.ts:32-42`). Those strings are raw-interpolated into JS source (`'${primaryColor}'`, `'${communityName}'`) and evaluated. Gated behind `requirePlatformAdmin()`, so it's an **admin → arbitrary-code-in-the-admin-process** escalation (reaches the service-role key and every secret), not unauthenticated RCE — but a real defense-in-depth break with a trivial fix.
**Fix:** apply the same `HEX_COLOR` + `ALLOWED_FONTS` validation as the create route; and/or `JSON.stringify` values at the interpolation sites; longer-term run the compiler in `vm.runInNewContext` with a timeout.

### P1-7 · `srcDoc` preview iframes have a no-op sandbox
`PreviewPanel.tsx:134` and `PreviewModal.tsx:107` use `sandbox="allow-scripts allow-same-origin"` on **same-origin** `srcDoc` frames. That combination is a no-op: framed script can reach `parent.document` and strip its own sandbox. Content is `sanitize-html`'d (strips `<script>`) but re-allows `<style>` + global `style` attr; chained with P1-6's unvalidated input this is the weakest entry into the evaluator.
**Fix:** drop `allow-same-origin` for `srcDoc` preview, or render previews on a separate origin.

### P1-8 · Stored XSS via SVG upload to a public bucket
`upload/route.ts` accepts SVG on a loose substring sniff (any first-256-bytes match of `<svg`/`<?xml`), stores it as `image/svg+xml` in the **public** `community-assets` bucket, and returns a `getPublicUrl`. SVG served from a bucket origin executes embedded `<script>`/`onload`. Nothing sanitizes it. (Path traversal is *not* possible — the key is server-generated; that part is fine.)
**Fix:** drop SVG from `ALLOWED_MIME_TYPES`, or sanitize with a dedicated SVG sanitizer and force `Content-Disposition: attachment`.

### P1-9 · No last-admin protection on platform-admin removal
`platform-admins/[userId]/route.ts` guards only self-deletion. All admin rows are `super_admin` (no tier), so any admin can remove any other; a compromised admin can strip every peer, or two admins can race to zero. There is no floor and no two-person control.
**Fix:** count remaining admins inside the delete transaction and refuse below a floor (≥1, ideally ≥2); consider an approval step for admin grants/revokes.

### P1-10 · Missing body validation on money/lifecycle mutations
`access-plans/route.ts` POST grants free access with a hand-rolled truthiness check; `durationMonths`/`gracePeriodDays` are **unbounded** numbers fed into `setMonth`/`setDate` → a large value is an effectively permanent free grant. Also unvalidated: `access-plans/[planId]/extend`, `access-plans/[planId]` DELETE reason, `deletion-requests/[id]/intervene` (`notes` unbounded **and** an unguarded `request.json()` that throws on malformed input), and `deletion-requests` GET (raw `status`/`type` query strings passed straight to `.eq()`).
**Fix:** Zod-validate every body/query with bounded numeric ranges and enum-checked filters; guard all `request.json()` calls.

### P1-11 · `root_manager` promotion bypasses the atomic role op
`communities/[id]/members/[userId]/route.ts:21` allows `role: 'root_manager'` via a plain `UPDATE`, sidestepping `reassignRootOp` (the atomic path that exists specifically for the one-root partial-unique index, dispute resolution, and auditing). Setting a second root here either 500s with a raw DB message or creates inconsistent state.
**Fix:** reject `root_manager` on this route; route root changes through `reassign-root` only.

### P1-12 · Inter font is referenced but never loaded
`globals.css:8,13` set and apply `--font-sans: 'Inter'`, but there is **no** `next/font`, `@font-face`, or `<link>` anywhere in admin. Every screen silently falls back to `system-ui`, so the console does not match the product's typography at all.
**Fix:** load Inter via `next/font/google` in `layout.tsx` (mirror web) and wire the CSS variable.

---

## P2 — Robustness & parity

- **P2-1 · Systematic internal-error leakage (~45 sites).** Routes return raw `error.message` verbatim — Postgres/PostgREST/Storage/Stripe strings exposing table, column, and constraint names (e.g. `stats/route.ts:17`, `platform-admins/route.ts:36`, `theme-presets/[slug]/route.ts:179`, `upload/route.ts:120`). Directly contrary to web's `withErrorHandler` contract (flat `{error:{code:'INTERNAL_ERROR', message:'An unexpected error occurred'}}` + Sentry correlation). Fix wholesale with the admin `withErrorHandler` from P0-3.
- **P2-2 · Unbounded list endpoints (15).** GET handlers return full result sets with no limit/cursor (`deletion-requests`, `demos` `select('*')` over all instances, `communities/[id]/members`, `access-plans`, `site-templates/*`, `stats` page-loops **all** compliance rows platform-wide). Worse: `platform-admins/route.ts:44` and `members/route.ts:79` call `auth.admin.listUsers()` **unpaginated** — silently truncates at the default page size (emails show `'unknown'` past it) and dumps the whole auth table per request. Fix: paginate; page through `listUsers`.
- **P2-3 · Admin test files are never typechecked.** `apps/admin/tsconfig.json` omits `__tests__/**` (all 40 admin tests live there). `tsc --noEmit` skips them. Fix: add `__tests__/**/*` to `include`.
- **P2-4 · Zero post-deploy / uptime monitoring.** `deploy.yml` smoke-tests only web's `/auth/login`; `api/health` has no consumer anywhere (no cron, no uptime check). Combined with P0-1, admin can be broken or stale in prod with no signal. Fix: add an admin smoke step + an uptime monitor on `admin.getpropertypro.com/api/health`.
- **P2-5 · `SENTRY_PROJECT_ADMIN` (and `WEB_APP_BASE_URL`) undocumented.** `next.config.ts:36` falls back to the web Sentry project when `SENTRY_PROJECT_ADMIN` is unset → admin errors and source maps land in web's project. Not in `.env.example` or `docs/DEPLOYMENT.md`. Fix: document; set in Vercel.
- **P2-6 · Server-side error swallowing on pages.** `clients/page.tsx:70`, `clients/[id]/page.tsx:78-87`, `settings/page.tsx:27` degrade DB failures to empty UI (`?? []` / `?? 0`) — a failed `platform_admin_users` read renders an *empty admin list*. Fix: inspect `.error` and surface it via the new `error.tsx`.
- **P2-7 · `vitest.integration.config.ts` is dead code.** No `__tests__/integration/` dir; glob written relative to the wrong root; referenced by no workflow. Fix: delete or wire up.
- **P2-8 · Admin E2E exists but runs nowhere.** `apps/web/e2e/support-access.spec.ts` drives the admin console at `:3001`; CI runs only 3 unrelated specs. Fix: fold into the seeded-Auth E2E job when it exists.
- **P2-9 · Rate limiter is per-instance in-memory; login is unthrottled.** Middleware's 100/min limiter (`middleware.ts:151`) only covers `/api/*`, and `/auth/*` short-circuits **before** it — the login form has no app-side throttle (Supabase's own limits only). The limiter also resets on cold start. No CSRF token anywhere. Fix: centralized store (Upstash) or accept documented best-effort; throttle `/auth/login`.
- **P2-10 · `scoped-db-access-guard.yml` path filter omits `apps/admin/src/**`** — the dedicated guard workflow never fires on admin-only PRs (still covered indirectly via `pnpm lint`). 13 other lint guards are web-only, so admin UI/API conventions are unenforced. Fix: add admin to the path filter; decide which guards should extend to admin.
- **P2-11 · `loading.tsx` missing on 8 of 12 route segments** (all `site-templates/*`, `communities/rootless`, both `demo/[id]/*`). `AdminPageLoading` hardcodes `coolingCount={0}`, flashing the deletion badge 0→N per navigation.
- **P2-12 · The cookie-incident test tests none of it.** `__tests__/auth/cross-subdomain-session.test.ts` mocks `createMiddlewareClient` wholesale and never exercises cookie name, domain, `secure`, or `NEXT_PUBLIC_COOKIE_DOMAIN` — the prod regression it is named after cannot be caught by it. Fix: add real cookie-option assertions.

---

## P3 — Polish & tracked debt

- **P3-1 · Dead 407 KB `public/assets/tailwind.min.js`** — zero references repo-wide, publicly served, lint-exempted. (Same file in web.) Delete both.
- **P3-2 · Accessibility gaps.** `ClientWorkspace.tsx:141` (the app's primary 7-tab nav) is plain `<button>`s — no `role="tablist"/tab/tabpanel`, no `aria-selected`, no arrow-key nav. `DemoEditDrawer` modal has no `role="dialog"`/`aria-modal`/Escape/focus-trap. No skip link, no `id` on `<main>`. `Sidebar` active link is color-only (no `aria-current`). 20 of 42 components have zero ARIA. (Focus rings are *not* suppressed anywhere — that part is good.)
- **P3-3 · No `robots`/noindex, no favicon** in admin — the operator console is indexable in principle.
- **P3-4 · Preview iframes leak tokens via Referer.** Token-bearing iframe URLs (`TabbedPreviewClient.tsx:289`) have no `referrerPolicy="no-referrer"`; with no admin `Referrer-Policy` header (P1-3) they leak in the `Referer` of outbound requests the framed page makes.
- **P3-5 · Dead code / config:** `SplitPreviewClient.tsx` never imported; `darkMode: 'class'` with 0 `dark:` classes; duplicate/divergent `launch.json` (root has `autoPort`, app-scoped doesn't); `StarterPacksTable` has no empty state; `safeReturnTo()` doesn't reject backslash-prefixed paths (low risk — only `router.push()` consumes it).
- **P3-6 · Design-system divergence (tracked, accepted).** 1,196 raw ramp classes vs **0** semantic tokens (web: 20 vs ~4,135). Real shape is gray-dominant + coral-brand, with **9 undeclared stock ramps** (`red/green/yellow/amber/purple/violet/emerald/rose/orange`) leaking via Tailwind `extend` defaults — those are the uncontrolled surface, not `blue` (declared, informational-only). 2 deprecated `@propertypro/ui` `Button`/`Card` imports, both explicitly sanctioned. This is its **own migration program** per `design.md`, out of scope for hardening — but the 9 leaking ramps are worth locking down (`tailwind.config.ts`).

---

## Parity scorecard vs `apps/web`

| Capability | apps/web | apps/admin |
|---|---|---|
| Deploys reliably | ✅ (prebuilt CLI) | ❌ P0-1 (skipped on most changes) |
| Typed error envelope / `withErrorHandler` | ✅ | ❌ raw `error.message` everywhere |
| 401/403 actually returned | ✅ | ❌ P0-3 (all become 500) |
| `error.tsx` / `not-found.tsx` / `global-error.tsx` | ✅ all 3 | ❌ none |
| Per-page auth on service-role pages | ✅ | ⚠️ 2 pages missing (P0-5) |
| CSP / HSTS / X-Frame / nosniff | ✅ | ❌ none (P1-3) |
| Cookie `secure` in prod | ✅ | ❌ dropped (P1-4) |
| Audit logging of privileged mutations | ✅ `logAuditEvent` | ⚠️ partial (P1-5) |
| List pagination | ✅ canonical helper | ❌ unbounded (P2-2) |
| Post-deploy smoke + uptime | ✅ | ❌ none (P2-4) |
| Fonts loaded | ✅ | ❌ Inter never loaded (P1-12) |
| Sign-out works | ✅ | ❌ 404 (P0-2) |
| Session isolation (admin ≠ web login) | — | ✅ intended & correct |
| Dev-login `NODE_ENV`-gated | ✅ | ✅ 404 in prod |
| Spoofed-header stripping in middleware | ✅ | ✅ |
| `platform_admin_users` DB-locked (service-role only) | — | ✅ REVOKE ALL from anon/authenticated |

---

## Remediation plan (clear-cut, ordered)

Each phase is independently shippable. **Phase 1 must land first** — until P0-1 is fixed, nothing else reaches prod.

### Review gate — applies to EVERY phase, not just the last

No phase is pushed or opened as a PR until it has passed **both** reviews. Correctness verification (typecheck / lint / guards / tests / builds) is not a substitute: it answers *does it work*, not *is it safe* or *is it well-built*.

1. Implement the phase, then run its correctness gate (see Verification below).
2. **Security review** of the branch diff — identify pass, then parallel false-positive filters; report findings at confidence ≥ 8.
3. **Code review** of the branch diff in parallel, prompted with the conventions the diff must satisfy (CLAUDE.md, `.claude/rules/`, and the admin-specific exemptions: service-role client is sanctioned here, raw Tailwind ramps are baselined).
4. **Fix real defects even when the filter scores them below the reporting threshold.** The threshold governs what lands in the report, not what is worth fixing.
5. Push and open the PR.

This is not ceremony. In Phase 1 the security review found a genuine defect in code written during that same phase — the rewritten sign-out discarded the `{ error }` supabase-js *resolves* with (it does not throw), and auth-js returns early **before** clearing the cookie for anything that isn't a 401/403/404. It navigated to `/auth/login`, a public path that does not bounce an authenticated user, leaving a live `sb-admin-auth-token` while telling the operator they were signed out. Every correctness gate was green and none of them could have caught it. That finding scored 7 — below the reporting bar — and was still worth fixing.

Expect the highest-value findings to be in code written during the phase itself.

### Phase 1 — Make it deploy & function (P0)
The enabling phase. Small, mechanical, unblocks everything.
1. **P0-1** fix `apps/admin/vercel.json` `ignoreCommand` (or add an admin deploy job). *Verify with a page-only commit that produces a deploy.*
2. **P0-3 + P0-4** add an admin `withErrorHandler` + typed `UnauthorizedError`/`ForbiddenError`; add `error.tsx`, `global-error.tsx`, `not-found.tsx`. Convert `platform-admin.ts` / `admin-page-context.ts` to throw typed errors.
3. **P0-2** implement `/api/auth/signout`.
4. **P0-5** add `requireAdminPageSession()` to both `clients` pages.
*Exit criterion:* a page-only change deploys; sign-out works; a forced auth failure renders a styled 403, not a 500.

### Phase 2 — Close the security gaps (P1)
5. **P1-1** remove the JWT dev-secret fallback + delete the shared constant (touches `apps/web` verify side too — coordinate).
6. **P1-3 + P1-4** port `security-headers.ts` into admin middleware; add HSTS to `vercel.json`; retain cookie `secure`.
7. **P1-2** move the support token to an HttpOnly server-set cookie.
8. **P1-5** shared `logAdminAction` on all privileged mutations (+ append-only table via migration).
9. **P1-6 + P1-7 + P1-8** validate preview branding; fix the `srcDoc` sandbox; drop/sanitize SVG upload.
10. **P1-9, P1-10, P1-11** last-admin floor; Zod on money/lifecycle routes; reject `root_manager` on the member route.
11. **P1-12** load Inter.
*Exit criterion:* forged support JWT rejected in a non-prod env; headers present on every response; a security-review pass on the diff is clean.

### Phase 3 — Robustness & observability (P2)
12. **P2-1** wholesale error-message sanitization (falls out of the Phase-1 `withErrorHandler`).
13. **P2-2** paginate list endpoints + `listUsers`.
14. **P2-4 + P2-5** admin smoke test + uptime monitor; document & set `SENTRY_PROJECT_ADMIN`.
15. **P2-3, P2-6, P2-7, P2-9, P2-10, P2-11, P2-12** typecheck tests; page error handling; delete dead vitest config; throttle login; extend guards; real cookie test.
*Exit criterion:* no raw DB strings escape; `admin.getpropertypro.com/api/health` is monitored; `pnpm typecheck` covers admin tests.

### Phase 4 — UX / a11y / debt (P3)
16. **P3-2** ARIA + keyboard on `ClientWorkspace` tabs, `DemoEditDrawer` dialog semantics, skip link, `aria-current`.
17. **P3-1, P3-3, P3-4, P3-5** delete dead assets/code; add `noindex` + favicon; `referrerPolicy` on token iframes; lock the 9 leaking Tailwind ramps.
18. **P3-6** hand off the full semantic-token migration to the existing design-system program (separate effort).

---

## Confirmed non-issues (do not spend time here)
- `/dev/agent-login` is hard-gated by `NODE_ENV !== 'development'` → 404 in prod.
- `upload` has **no** path traversal (server-generated keys) and rejects on magic bytes, not client MIME.
- `convert`'s redirect URLs come from env, not user input (no open redirect).
- `demos/[id]` DELETE correctly refuses to cascade a converted community.
- `reset-to-starter` / `restore-from-snapshot` have confirm-by-slug guards **and** write `compliance_audit_log`.
- Middleware strips spoofable `x-admin-*` / `x-community-id` headers before forwarding.
- Session isolation (admin login ≠ web login) is intentional and safe.
- `safeReturnTo()` blocks `//evil.com` and absolute URLs (backslash variant is the only minor gap).
