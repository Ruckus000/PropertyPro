# Custom Domain Support — Design Spec

**Date:** 2026-06-03
**Feature flag:** `hasSiteCustomDomain` (Pro+)
**Status:** Design approved, pending implementation plan
**Spec lineage:** Phase 2 of [2026-05-26-property-landing-page-design.md](./2026-05-26-property-landing-page-design.md) §Ph2-1

---

## Context

Community public sites are served today only at `[slug].getpropertypro.com` subdomains.
The property-landing spec deferred "custom domain mapping (Pro+)" to Phase 2
(§4.3, §Ph2-1: *"Vercel domains API + CNAME verification; ~8d"*). This spec makes
that feature real.

**The need:** a Pro+ property manager wants their community site reachable on their
own domain (e.g. `www.sunsetcondos.com`) instead of a PropertyPro subdomain — for
brand trust and marketing. Today there is no path to do this: the `custom_domain`
column exists but is inert, the `hasSiteCustomDomain` flag is `false` everywhere,
and the middleware has no way to resolve a foreign host back to a community.

**Intended outcome:** a PM on a Pro plan can attach **one** custom host to their
community's **public `/` site**, register it with Vercel, follow on-screen DNS
instructions, click "Check status" until it goes live, and have middleware route
that host to their site — additively, with the `[slug].getpropertypro.com`
subdomain still working for everything (including login/dashboard).

**Root cause this design targets:** `parseHostSubdomain`
([packages/shared/src/middleware/subdomain-router.ts:42-60](../../../packages/shared/src/middleware/subdomain-router.ts))
has no concept of the base domain — it blindly returns `parts[0]` for any 3+-label
host and `null` for 2-label hosts, assuming every host is `<slug>.getpropertypro.com`.
A custom domain means the **entire host** is foreign and must be matched against
`custom_domain`. The inert flag/column are downstream symptoms; the resolver is the
root.

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Live Vercel Domains API** integration (not a permanent stub) | User directive. Real HTTP at runtime; `fetch` mocked in unit tests so CI never makes live calls. |
| D2 | **Manual "Check status" button** to refresh verification (no cron) | Smallest surface, deterministic to test, no new scheduling. |
| D3 | **Single host per community** | The `custom_domain` column is singular. Apex+`www` pairing (2 registrations + redirect) is an explicit future follow-up. |
| D4 | **Custom domain serves the public `/` site only** | Residents still authenticate on the subdomain. Keeps the middleware change to one branch; avoids re-theming the entire auth/dashboard surface on a foreign host. |
| D5 | **Columns on `communities`, not a new table** | Strictly one host per community; `custom_domain`/`site_published_at` set the precedent. A table would be over-engineering. |
| D6 | Writes to `communities` use **`createUnscopedClient`** (`@propertypro/db/unsafe`) after route-layer auth | `communities` is the root tenant table and cannot be `community_id`-scoped. Mirrors `branding.ts` / `plan-guard.ts`. |
| D7 | Domain release on PM **Remove** action in-cycle; community-purge release is a documented follow-up | Soft-delete's `deleted_at IS NULL` middleware filter already stops serving immediately, so there is no correctness/security gap — only a Vercel-project orphan to clean up later. |
| D8 | Env vars: **`VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID`** (canonical Vercel CLI names) | Already present in `.env.local`; reused instead of inventing `VERCEL_API_TOKEN`/`VERCEL_TEAM_ID`. `VERCEL_ORG_ID` is team-scoped (`team_…`) → every Domains API call passes `?teamId=$VERCEL_ORG_ID`. |
| D9 | Auth gate: **`requireRole(['pm_admin','cam'])`** + `requirePlanFeature('hasSiteCustomDomain')` + `assertNotDemoGrace` | Mirrors the `pm/site/publish` route, the closest sibling (site management). *Not* `requirePermission('settings','write')` (that is the `communities/delete` lifecycle pattern). CAMs manage the site, so they manage its domain. |
| D10 | **One domain at a time** — to change it, Remove then Add (no in-place replace) | An in-place overwrite would orphan the previous host in the Vercel project (unreleased). `POST set` rejects when a domain already exists; the UI shows Add xor Remove. Zero replace-path complexity. |

---

## Architecture

### Data model — migration 0012 (extends `communities`)

The `custom_domain text` column already exists
([packages/db/migrations/0000_nappy_guardian.sql:161](../../../packages/db/migrations/0000_nappy_guardian.sql)).
Migration **0012** adds:

- `custom_domain_status text` — `NULL` (none) | `'pending'` | `'active'` | `'error'`.
  Middleware routes a host **only when `'active'`**, so a pending/misconfigured
  domain never serves over a not-yet-provisioned cert.
- `custom_domain_verified_at timestamptz` — stamped on first activation.
- **Partial unique index**
  `communities_custom_domain_unique ON communities (custom_domain) WHERE custom_domain IS NOT NULL AND deleted_at IS NULL`
  — prevents two communities claiming the same host (closes a tenant-isolation /
  domain-hijack hole) and makes the reverse lookup unambiguous. Index only; no RLS
  change (adding columns/index to an existing RLS-enabled table needs no new policy).
  **Data-safety:** the column has been inert (effectively all-`NULL`); the migration
  must still verify no existing non-`NULL` duplicate `custom_domain` values before
  the unique index is created, or `CREATE UNIQUE INDEX` will fail.

The DNS records to display are returned **live by Vercel** on Add/Verify actions;
we persist status, not the records. The settings page renders persisted status on
load and **never calls Vercel on GET**.

### Validation — lift to `@propertypro/shared`

`sanitizeCustomDomain` + `isValidHostname` live today **only** in
[apps/admin/src/lib/clients/website.ts:30-57](../../../apps/admin/src/lib/clients/website.ts)
and the web app cannot import across apps. **Move them into a shared module**
(e.g. `packages/shared/src/site/custom-domain.ts`), repoint the admin import, and
extend with an **own-domain blocklist**: reject the configured root domain and
`*.<root>` (read from `NEXT_PUBLIC_ROOT_DOMAIN`, falling back to `getpropertypro.com`
per [community-url.ts:10](../../../apps/web/src/lib/utils/community-url.ts)) plus
reserved labels — so a custom domain can never shadow subdomain routing. One
validator, consumed by both admin and the new web route — no drift.

### Host resolution — base-domain awareness (the real middleware work)

`resolveCommunityContext`
([subdomain-router.ts](../../../packages/shared/src/middleware/subdomain-router.ts))
gains base-domain awareness. **The function stays pure** — it does *not* read
`process.env`. The middleware reads `NEXT_PUBLIC_ROOT_DOMAIN` (fallback
`getpropertypro.com`) and **passes `rootDomain` in as an input param**, keeping the
shared package decoupled from web env vars and trivially testable.

1. **Host under the root domain** (host equals `rootDomain` or ends with `.<rootDomain>`,
   after stripping the port) → existing subdomain logic, unchanged.
2. **Foreign host** → new `'custom_domain'` source carrying the **full host**.
   Middleware does a `custom_domain = <host> AND custom_domain_status = 'active' AND deleted_at IS NULL`
   lookup, sets `x-community-id`, and rewrites `/` → `/public-site` exactly like the
   subdomain path ([middleware.ts:623-696](../../../apps/web/src/middleware.ts)). Only
   the `/` branch handles custom hosts in v1 (D4).

The incoming host is **lowercased before lookup** (the write path sanitizes to
lowercase, and the partial unique index is on the raw column). Reuses the
**edge-safe supabase middleware client** already proven by `findCommunityIdBySlug`
([middleware.ts:286-300](../../../apps/web/src/middleware.ts)). Port stripped via the
existing `host.split(':')[0]` normalization.

**Cache:** the lookup caches **positive (`active`) hits only**. Custom-domain misses
are **not** negative-cached, so a `pending → active` flip serves immediately instead
of 404ing for up to the 5-minute TTL.

**Auth-split safety (D4):** a foreign host **never carries a PropertyPro session** —
Supabase cookies are host-scoped (no `domain:` / `COOKIE_DOMAIN` is wired in
`apps/web/src/lib`), so `getUser()` is null on the custom host and the public site
always renders. The custom-domain `/` branch therefore serves `/public-site` directly
and **must not** perform the authenticated→`/dashboard` same-host redirect that the
subdomain branch does ([middleware.ts:663-674](../../../apps/web/src/middleware.ts)) —
that redirect targets the foreign host, where `/dashboard` is not served (D4). Stated
explicitly so it is not "fixed" into a bug later.

### Vercel Domains client — `apps/web/src/lib/domains/`

Thin typed wrapper over the Vercel Domains REST API:
`addProjectDomain`, `getDomainStatus`, `removeProjectDomain`. Reads `VERCEL_TOKEN`,
`VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` (D8) and passes `?teamId=$VERCEL_ORG_ID` on every
call. Real `fetch` at runtime; mocked in unit tests. Unconfigured env → an explicit
`DOMAIN_PROVISIONING_UNAVAILABLE` error, never a silent fake-success.

> **Edge boundary:** this module is node-runtime only and **must never be imported by
> `middleware.ts`** (edge) — that is a build-only failure. Middleware does a pure DB
> lookup and never touches this client.

### State mapping (Vercel → enum)

To confirm with one live `vercel domains inspect` probe in PR5 (the CLI docs don't
pin every JSON field):

| `custom_domain_status` | Vercel signal | PM sees |
|---|---|---|
| `pending` | added, `verified:false` **or** config `misconfigured:true` | DNS records + "Check status" |
| `active` | `verified:true && misconfigured:false` (auto-SSL issued) | green "Live" pill + View site |
| `error` | Vercel 4xx on add (owned elsewhere / invalid) or unrecoverable verify state | red pill + Vercel's reason string |

---

## API routes — `apps/web/src/app/api/v1/pm/site/domain/`

Plan A1 (`defineRoute` + `runRoute` from `@propertypro/api-contract`, colocated
`contract.ts`; `request: {}` required even for no-input). Every handler mirrors the
`pm/site/publish` auth chain (D9), **not** `requirePermission`:

```
requireAuthenticatedUserId()
resolveEffectiveCommunityId(req, body?.communityId ?? null)
assertNotDemoGrace(communityId)
const membership = await requireCommunityMembership(communityId, userId)
requireRole(membership, ['pm_admin','cam'], 'Only property managers can manage the custom domain')
await requirePlanFeature(communityId, 'hasSiteCustomDomain')
```

Single-object `{ data: … }` envelopes (not list endpoints). All mutations →
`logAuditEvent` ([audit-logger.ts:75](../../../packages/db/src/utils/audit-logger.ts))
with new `custom_domain_set` / `custom_domain_verified` / `custom_domain_removed`
values added to the `AuditAction` **TypeScript union** (`audit-logger.ts:11-12`) —
**no migration** (the union is widened in code; the DB `action` column is `text` —
confirm it is not a pg-enum/CHECK in PR5, low risk) — and `resourceType: 'community'`.

| Method | Purpose | Notes |
|---|---|---|
| `GET` | current status + (if pending) the DNS records to add | **no Vercel call** — renders persisted status; records fetched only on Add/Verify |
| `POST` | set domain | validate(shared) → **reject 409 if a domain is already configured** (D10: Remove first) → `addProjectDomain` → store `pending` → return DNS records. Duplicate-host (other community) → 409 `DOMAIN_ALREADY_CLAIMED`. A Vercel "domain already exists in this project" response is treated as success-idempotent, not `error`. |
| `POST .../verify` | re-read Vercel; maybe promote `pending→active` + stamp `verified_at` | the manual button |
| `DELETE` | remove | `removeProjectDomain` → reset `custom_domain*` columns to `NULL` |

### Error handling (via `withErrorHandler` → `{error:{code,message}}`)

- Unconfigured env → `AppError(503, 'DOMAIN_PROVISIONING_UNAVAILABLE')`.
- Invalid / own-domain / malformed → `ValidationError(400)` (before any Vercel call).
- Domain already configured for this community → `AppError(409, 'DOMAIN_ALREADY_CONFIGURED')` (D10 — Remove first; checked before any Vercel call).
- Already claimed by another community → `AppError(409, 'DOMAIN_ALREADY_CLAIMED')` (service check + unique-index backstop; translate PG unique violation, don't leak it).
- Plan lacks feature → existing `requirePlanFeature` 403 `PLAN_UPGRADE_REQUIRED`.
- Vercel down/network → `AppError(502, 'DOMAIN_PROVIDER_ERROR')`, message scrubbed of token.
- **`VERCEL_TOKEN` is server-only: never logged, never in client bundle, never returned.** Vercel's own error code/message (no secrets) may be surfaced to the PM. Requests logged with `requestId`.

---

## PM settings UI — `pm/settings/website` + `components/pm/site-editor/`

A `'use client'` Domain card added to the existing website settings page
([apps/web/src/app/(authenticated)/pm/settings/website/page.tsx](../../../apps/web/src/app/(authenticated)/pm/settings/website/page.tsx),
which already uses `getEffectiveFeaturesForPage` + gated forms like
`CustomStylingForm`): host input + Add, DNS-records panel, **Check status** button,
status pill (`getStatusConfig`), Remove; disabled-but-visible "(Pro)" upsell when
gated. React-query hooks calling the routes above.

> The card fetches **JSON only** — it must not import the Vercel client or
> `@propertypro/db`, or it's a build-only client-bundle failure. A real
> `pnpm --filter @propertypro/web build` is part of this PR's final-verify.

No new breadcrumb obligation (the card lands on an existing page, not a new route).

---

## Feature-flag enablement

`hasSiteCustomDomain` is defined in `CommunityFeatures`
([packages/shared/src/features/types.ts:69](../../../packages/shared/src/features/types.ts))
but `false` everywhere and absent from `PLAN_FEATURES`. Enable it by **mirroring
exactly how `hasSiteCustomCss` was enabled**:

- `PLAN_FEATURES`: `true` for `professional` + `operations_plus`
  ([plan-features.ts](../../../packages/shared/src/features/plan-features.ts)).
- `COMMUNITY_FEATURES`: `true` for all three types — it is plan-gated, not type-gated
  ([community-features.ts](../../../packages/shared/src/features/community-features.ts)).

`getEffectiveFeatures` ANDs the two dimensions
([get-features.ts](../../../packages/shared/src/features/get-features.ts)); demo
communities are null-plan → fail-open (gate effectively open in demos, but
`VERCEL_TOKEN` presence still governs whether provisioning works → clean 503 if
absent).

---

## PR decomposition

Ordering rule: **nothing that writes an `active` domain ships before the middleware
that can safely serve one, and the user-facing UI ships last** — main stays green
*and* coherent at every merge. PR2–PR5 ship dark (no `active` rows, no UI).

```
PR1 (validator→shared) ─┐
PR2 (migration+flag) ───┼─→ PR5 (service+routes) ─→ PR6 (PM UI)
PR3 (vercel client) ────┘
PR4 (middleware routing) ── independent, reads schema from PR2
```

| PR | Scope | Pre-empted risk |
|---|---|---|
| **PR1** | Lift `sanitizeCustomDomain`/`isValidHostname` → `@propertypro/shared`; repoint admin import; add own-domain blocklist | New shared export → `pnpm --filter @propertypro/shared build` before web resolves (local-only trap). Admin `website-status.test.ts` stays green. |
| **PR2** | Migration 0012 (status + verified_at + partial unique index); enable flag in both feature maps | Existing-table columns need no new RLS; partial index hand-written; journal entry 0012 TAB-indented. Mirror `hasSiteCustomCss` enablement. |
| **PR3** | Vercel Domains client + tests | Node-runtime only — **never** imported by `middleware.ts` (edge build-only failure). |
| **PR4** | `rootDomain`-param base-domain awareness in (pure) `resolveCommunityContext` + middleware foreign-host branch (lowercased lookup) + positive-only cache + skip authed→dashboard redirect on custom host | **Riskiest.** Regression: `*.getpropertypro.com` must still resolve as a subdomain under the unset-`NEXT_PUBLIC_ROOT_DOMAIN` CI fallback. Smoke: CSP renders public site on the custom host. Reuses edge-safe supabase client. |
| **PR5** | Domain service (`createUnscopedClient`) + 4 A1 routes (D9 auth chain) + Remove-action release | Live Vercel can't run in CI → mock client at module boundary; grep `vi.mock('@propertypro/db')` factories for new exports. Set-when-exists → 409 (D10); duplicate-host → 409; Vercel re-add idempotent. Add `custom_domain_*` to `AuditAction` union. |
| **PR6** | PM Domain card UI + react-query hooks | Client component fetches JSON only — no server-only imports; real web build in final-verify. |

PR1+PR2 could bundle but are kept apart (cross-app vs `packages/db`) to narrow blast
radius. PR3 and PR4 are fully parallel-safe.

---

## Test matrix (TDD — failing test first per PR)

- **PR1:** valid hosts pass; scheme/path/port stripped; own root + `*.<root>` rejected; reserved labels rejected; empty/overlong rejected; admin tests green.
- **PR2:** migration applies; unique index rejects 2nd claim, allows two `NULL`s, allows re-claim after soft-delete; `getEffectiveFeatures('condo_718','professional').hasSiteCustomDomain===true`, `…'essentials'…===false`.
- **PR3:** mocked `fetch` — add returns records; each status maps; remove ok; non-2xx → typed error; `teamId` on every call; unconfigured env throws.
- **PR4:** foreign host + active → header+rewrite; foreign + pending → not served; unknown foreign → not served & not negative-cached (serves after activation); mixed-case host matches lowercased row; **regression:** subdomain still resolves under CI fallback; apex (2-label) handled; port stripped; `resolveCommunityContext` stays pure (rootDomain passed in); authed request on custom `/` does not redirect to `/dashboard`.
- **PR5:** each gate 4xx (incl. `cam` allowed, other roles 403, demo-grace blocked); set→pending; **set-when-already-set→409 (D10)**; duplicate-host→409; invalid/own-domain→400; verify pending→active flips + stamps; remove→releases+resets; Vercel re-add idempotent; unconfigured→503.
- **PR6:** loading/empty/error/success; gated upsell when off; status pill; focus ring; `pnpm --filter @propertypro/web build`.

---

## Verification (end-to-end)

1. **Per-PR CI gauntlet** (the lineage standard): affected `vitest`; `tsx scripts/verify-scoped-db-access.ts` + `verify-contracts.ts`; cache-free `pnpm --filter @propertypro/<pkg> exec tsc --noEmit`; `pnpm lint` when touching guards/migrations; real `pnpm --filter @propertypro/web build` for PR4 (middleware) and PR6 (client component).
2. **Migration:** `pnpm --filter @propertypro/db db:migrate` applies 0012; migration-ordering + integration `db:migrate` run on CI.
3. **Manual live smoke (post-PR6, real Vercel):** as a Pro PM, add a real test domain → see DNS records → add CNAME at a registrar → click Check status → watch `pending → active` → confirm the host serves the public site and the subdomain still works. Remove → confirm released from the Vercel project and no longer routes.
4. **Demo/no-token:** confirm `POST` returns a clean `503 DOMAIN_PROVISIONING_UNAVAILABLE`, never a crash.

---

## Out of scope (future follow-ups)

- Apex + `www` pairing (two registrations + redirect).
- Custom domain on `/auth/*` and `/dashboard` (branded auth on the foreign host).
- Background cron polling of pending domains.
- Community-purge Vercel release hook in `account-lifecycle-service` (orphan cleanup only — no correctness gap per D7).
