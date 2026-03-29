# PropertyPro Transition Plan v4 — Reviewed & Revised

> **Status:** Draft for review. This revision is based on a line-by-line audit of the
> v3 plan against the actual codebase at HEAD (post-Phase 4 / Gate 4, 2026-02-26).
>
> **What changed from v3:** Consolidated app count from 4 → 2, removed the bespoke
> CRM phase, corrected factual errors about the existing codebase, added missing
> work items the v3 plan silently depended on, and added team/timeline framing.

---

## Starting Point — What Actually Exists (Verified)

The codebase is a single Next.js 15.1.0 app (`apps/web`) with **28 database tables**
(not 24 — the CLAUDE.md is stale post-Phase 4). Key infrastructure that's already working:

- **Middleware:** 455-line `middleware.ts` handling session refresh, tenant resolution
  (subdomain + query param, 256-entry LRU cache), auth redirects, email verification,
  request tracing, header anti-spoofing, rate limiting (IP + user-based), CORS, and
  security headers (CSP, HSTS, X-Frame-Options).
- **PM routes:** `/pm/dashboard/communities`, `/pm/dashboard/[community_id]`,
  `/pm/settings/branding` — all with `property_manager_admin` role enforcement.
- **PM components:** `CommunitySwitcher`, `CommunityFilters`, `BrandingForm`,
  `BrandingPreview`, `CommunityCard` — all in `apps/web/src/components/pm/`.
- **Mobile routes:** `/mobile/` (home), `/mobile/documents`, `/mobile/announcements`,
  `/mobile/meetings`, `/mobile/maintenance` — all with auth + community membership
  enforcement in the layout server component.
- **Mobile components:** `PhoneFrame` (iPhone 15 CSS mockup, iframe-based, 393×852),
  `BottomTabBar` (5 tabs, community-type feature flags), `CompactCard`.
- **Branding:** `CommunityBranding` interface (`{primaryColor?, secondaryColor?, logoPath?}`),
  `isValidHexColor()` validator, `getBrandingForCommunity()` / `updateBrandingForCommunity()`
  API helpers, presigned upload flow, magic-byte MIME validation.
- **CSS variables:** `--brand-primary` and `--brand-secondary` used in `mobile.css`
  (tab bar active state, accent colors). Not yet injected from branding JSONB at layout
  level — currently hardcoded fallbacks only.
- **DB access guard:** AST-based TypeScript scanner (`verify-scoped-db-access.ts`),
  15 allowlisted files for `@propertypro/db/unsafe`, runs in CI via `pnpm lint`.
  Currently hardcoded to scan only `apps/web/src`.
- **Seed infrastructure:** `seed-demo.ts` imports from `scripts/config/demo-data.ts`
  which defines 3 hardcoded communities and 22 demo users. Config-driven but **not
  parameterized** — you can't call it with "create one community with this branding."
- **Tests:** 550+ unit tests, 10+ integration test suites, PM route tests (6 cases),
  mobile home test (3 cases), PM portfolio integration tests (15+ cases).
- **CI:** Lint → Typecheck → Unit Tests → Build (parallel first 3, build depends on all).

Nothing gets deleted. Everything gets extended or reorganized.

---

## Architecture Decision: Two Apps, Not Four

**v3 proposed:** `apps/web`, `apps/admin`, `apps/sites`, `apps/pm` (4 Next.js apps, 4 Vercel projects).

**v4 decision:** `apps/web` + `apps/admin` (2 Next.js apps, 2 Vercel projects).

**Rationale:**

| v3 App | v4 Decision | Why |
|--------|-------------|-----|
| `apps/web` | Keep | Core product. No change. |
| `apps/admin` | Keep as new app | Different auth model (platform admin vs. community member). Different users (you vs. residents). Justified separation. |
| `apps/sites` | **Route group in `apps/web`** | Public site renderer needs tenant resolution — middleware already does this. Needs theme injection — same mechanism as mobile theming. Adding a `(public-site)/[slug]` route group gets this for free. A separate app means duplicating tenant resolution, middleware, and Vercel config for zero architectural benefit. |
| `apps/pm` | **Stays in `apps/web`** | PM routes already exist and work. The role check is implemented. Building a fourth app to show a "Coming Soon" page is premature. When PM features need to diverge from the community member experience, extract then — not now. |

**What this eliminates:** 2 Vercel projects, 2 deployment pipelines, 2 middleware implementations,
2 sets of environment variable management, the `apps/pm` scaffold phase, the `apps/sites`
Vercel wildcard domain setup, and the ongoing operational burden of coordinating deploys
across 4 apps.

---

## Decisions Made Up Front

These are answered once, referenced everywhere.

| # | Decision | Answer |
|---|----------|--------|
| A | Local dev ports | `web: 3000`, `admin: 3001` — codified in each app's `package.json` dev script |
| B | `turbo dev` behavior | Starts both apps. Individual: `pnpm --filter apps/admin dev` |
| C | Environment variables | Each app symlinks to root `.env.local`. App-specific vars via `next.config.ts` `env` block |
| D | Vercel project plan | Verify team plan supports 2 projects. No fallback needed at this scale |
| E | Production domain | `getpropertypro.com`. Public sites at `[slug].getpropertypro.com` (same app, subdomain routing) |
| F | Supabase auth cookie scope | `.getpropertypro.com` (leading dot). Each app enforces its own authorization. See Auth Boundary Model |
| G | Demo data lifecycle | `is_demo` boolean on `communities`. Expired demos flagged, not deleted. Daily cron deactivates |
| H | Shared Supabase Storage | Single bucket, path prefixing: `community-assets/{community_id}/`, `admin-assets/`, `demo-assets/{demo_id}/` |
| I | Rich text in site builder | No. Plain text and markdown only. Rich text is a future enhancement |
| J | CSS variable naming | `--theme-primary`, `--theme-secondary`, `--theme-accent`, `--theme-font-heading`, `--theme-font-body`, `--theme-logo-url`, `--theme-community-name`. Replaces existing `--brand-primary` / `--brand-secondary` |
| K | Font injection | Google Fonts `<link>` tag from layout server component. Validated against ~30 pre-approved fonts |
| L | PM route behavior | **No redirect stubs.** Existing PM routes stay functional. Future PM features built in place |

---

## Auth Boundary Model

Principle: A valid Supabase session proves identity, not authorization. Every app/route
enforces its own authorization.

| Surface | Session required? | Authorization check | Scoping |
|---------|-------------------|---------------------|---------|
| `apps/web` (community routes) | Yes (except public/marketing) | `user_roles` row for resolved community | Community-scoped via `createScopedClient()` |
| `apps/web` (public site routes) | No | None — fully public | Read-only, community-scoped by slug |
| `apps/web` (PM routes) | Yes | `user_roles` row with `property_manager_admin` | Scoped to assigned communities |
| `apps/admin` | Yes | `platform_admin_users` row — checked in middleware AND every API route handler | Unscoped — platform admin sees all |

**Cookie sharing:** A session from `sunset-condos.getpropertypro.com` is technically valid
on `admin.getpropertypro.com`. Safe because admin middleware rejects sessions without
a `platform_admin_users` row.

**Mitigation for shared cookie risk:** Set `SameSite=Lax` on auth cookies (Supabase default).
Add `HttpOnly` if not already set. Monitor for XSS in community-themed content — any
user-supplied branding values (colors, logo URLs) must be sanitized before injection
into HTML/CSS. The CSS variable injection must use server-side rendering with escaped
values, never raw string interpolation.

**API route protection:** Every API route in `apps/admin` must call `requirePlatformAdmin(request)`.
This is a hard requirement. A single unprotected route is a privilege escalation bug.

---

## RLS and Table Security

New tables fall into two categories:

**Platform-internal (never readable by anon key):**
- `platform_admin_users` — RLS: `service_role` only
- `demo_instances` — RLS: `service_role` only

**Community-scoped (existing pattern):**
- `site_blocks` (Phase 3) — standard community-scoped RLS
- No other new community-scoped tables

All new table migrations include RLS policies in the same migration file.
CI guard extended to verify RLS exists on every table not in an explicit allowlist.

---

## Phase 0 — Stabilize Before Adding

Goal: Clean up the existing codebase and establish contracts before adding `apps/admin`.

### 0.1 — Local development infrastructure
- Update `scripts/setup.sh` to create `.env.local` symlinks for `apps/admin` (when it exists).
- Add `--port` flags to each app's `dev` script.
- Update `turbo.json` `dev` pipeline for both apps.
- Add `NEXT_PUBLIC_APP_ROLE` env var to each app's `next.config.ts`.
- Document full local dev setup in root README.

### 0.2 — Extend and lock `communities.branding` shape

The branding JSONB column exists with type `CommunityBranding` (`{primaryColor?, secondaryColor?, logoPath?}`).

Extended shape: `{ primaryColor, secondaryColor, accentColor, fontHeading, fontBody, logoUrl, communityName }`

**Work required (v3 said "no application code changes" — that was wrong):**
1. Migration: add defaults for new fields on all existing rows.
2. Update `CommunityBranding` interface in `packages/shared/src/branding.ts` — add new optional fields.
3. Update `isValidHexColor` usage — add `accentColor` validation.
4. Update `BrandingPatch` type in `apps/web/src/lib/api/branding.ts` — accept new fields.
5. Update `updateBrandingForCommunity()` — validate and persist new fields.
6. Update `BrandingForm.tsx` — add accent color picker, font selectors (with allowlist dropdown).
7. Update `BrandingPreview.tsx` — show new fields in preview.
8. Update the PM branding API route (`/api/v1/pm/branding`) — accept new fields in PATCH body.

This is ~2 days of work, not a trivial migration.

### 0.3 — Create `platform_admin_users` table

Single migration with RLS policy:

```sql
CREATE TABLE platform_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users,
  role text DEFAULT 'super_admin',
  invited_by uuid REFERENCES auth.users,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admin_users FROM anon, authenticated;
GRANT SELECT ON platform_admin_users TO service_role;
```

Seed your Supabase auth UUID via SQL.

### 0.4 — Create `packages/theme`

New package. Exports:
- `CommunityTheme` interface — `{ primaryColor, secondaryColor, accentColor, fontHeading, fontBody, logoUrl, communityName, communityType }`
- `THEME_CSS_VARS` — constant mapping theme keys → CSS variable names. Single source of truth.
- `ALLOWED_FONTS` — allowlist of ~30 Google Fonts families.
- `resolveTheme(branding: unknown): CommunityTheme` — reads JSONB, fills defaults, validates fonts.
- `toCssVars(theme: CommunityTheme): Record<string, string>` — converts to CSS custom properties.
- `toFontLinks(theme: CommunityTheme): string[]` — returns Google Fonts `<link>` URLs.

No consumer app uses this yet. Contract only.

### 0.5 — CSS variable migration

Rename `--brand-primary` → `--theme-primary` and `--brand-secondary` → `--theme-secondary`
across:
- `apps/web/src/styles/mobile.css` (lines 58-59: tab bar active state)
- Any component referencing `var(--brand-primary)` or `var(--brand-secondary)`
- The server-side injection point (when wired in Phase 2)

**Add a CI check:** grep-based assertion that `--brand-primary` and `--brand-secondary`
appear zero times in the codebase. This prevents regressions when new components are added.

### 0.6 — Extend CI guard to support multiple apps

The current guard (`verify-scoped-db-access.ts`, line 18) hardcodes:
```typescript
const runtimeRoot = join(repoRoot, 'apps', 'web', 'src');
```

Refactor to:
1. Accept a list of app directories to scan.
2. Support per-app allowlists (not one flat list). `apps/admin` legitimately makes
   unscoped queries — it needs a different policy, not 20 more allowlist entries.
3. Add the RLS policy check: every new table in a migration file must include an RLS
   policy or be in an explicit "no-RLS allowlist" with documented reason.

### 0.7 — Add `is_demo` and `demo_expires_at` columns to `communities`

```sql
ALTER TABLE communities ADD COLUMN is_demo boolean DEFAULT false;
ALTER TABLE communities ADD COLUMN demo_expires_at timestamptz;
```

Update seed data: set `is_demo = false` explicitly on existing rows.

### 0.8 — Refactor seed script for parameterized use

Current state: `scripts/config/demo-data.ts` defines 3 hardcoded communities. The seed
script imports this config and iterates. It is **not callable** with "create one community
with this name and branding."

Refactor `seed-demo.ts` into two layers:
1. `packages/db/src/seed/seed-community.ts` — exported function: `seedCommunity(config: SeedCommunityConfig): Promise<{ communityId: number; userIds: string[] }>`. Accepts community name, slug, type, branding, and user config. Creates the community, users, roles, and demo data (documents, meetings, announcements, maintenance requests).
2. `scripts/seed-demo.ts` — calls `seedCommunity()` three times with the existing hardcoded configs.

Phase 2's demo generator calls `seedCommunity()` directly with prospect-specific config.
Without this refactor, Phase 2.3 has no seed function to call.

### 0.9 — Observability baseline

Add before building new apps:
- Sentry error tracking for `apps/web` (and later `apps/admin`).
- Health check endpoint: `GET /api/health` returning `{ status: 'ok', timestamp }`.
- Structured logging for middleware auth failures (currently silent redirects).
- Alert on demo expiry cron failure (Phase 2 dependency).

---

## Phase 1 — Scaffold `apps/admin`

Goal: A working `admin.getpropertypro.com` with login and client portfolio view.

### 1.1 — Bootstrap the app
Create `apps/admin` as a new Next.js 15 app. Covered by `apps/*` in `pnpm-workspace.yaml`.
Add to `turbo.json`. Configure to share `packages/db`, `packages/shared`, `packages/ui`,
`packages/theme`. Own `tsconfig.json` and `tailwind.config.ts`.

Dev script: `next dev --port 3001`.

### 1.2 — Shared auth utilities
Create `packages/auth` (or extend `packages/shared`):
- `requirePlatformAdmin(request): Promise<{ user: User }>` — extracts session, checks
  `platform_admin_users`, throws 403 if missing.
- `getPlatformAdminSession(request): Promise<{ user: User } | null>` — non-throwing variant.

Package, not inline code, so the check is consistent everywhere.

### 1.3 — Admin middleware
`apps/admin/src/middleware.ts`. Responsibilities:
1. Supabase session refresh.
2. `requirePlatformAdmin(request)`.
3. Redirect to `/auth/login` if unauthorized.
4. **Rate limiting on API routes** (carry over from `apps/web` — don't skip this).
5. **Header anti-spoofing** (strip `x-community-id`, `x-tenant-slug`, etc.).
6. Protect all routes under `/clients`, `/demo`.

v3 said "no rate limiting" for admin — that's wrong. An admin console without rate
limiting on its API routes is an easy target.

### 1.4 — Auth UI
Login page at `/auth/login`. Visually distinct from client platform — "Operator Console"
label. On successful login, middleware checks `platform_admin_users`. If no row,
show access denied page (not a redirect loop).

### 1.5 — Client Portfolio view
`/clients` — reads `communities WHERE is_demo = false`. Cards show: name, type badge,
compliance health, subscription status, creation date. Filter, search, sort.
Click → `/clients/[id]`.

### 1.6 — Client Workspace shell
`/clients/[id]` with tab layout: Overview, Site Builder (placeholder), Data Manager
(placeholder), Settings (placeholder). Overview tab shows community stats.

### 1.7 — Testing
- `apps/admin/vitest.config.ts`
- Middleware tests: rejects unauthenticated, rejects non-admin, passes admin.
- Portfolio view integration tests.
- **Automated cross-subdomain session test:** Script that validates a session cookie
  from `apps/web` is accepted by `apps/admin` middleware only when the user has a
  `platform_admin_users` row. This is security-critical and must be in CI, not manual.

### 1.8 — Vercel configuration
Add `apps/admin` as Vercel project. Point `admin.getpropertypro.com`. Same Supabase
credentials. Verify cross-subdomain cookie sharing works.

---

## Phase 2 — Demo Generator + Mobile Demo

Goal: Generate a branded demo for a prospect in under 30 seconds.

### 2.1 — Demo schema

```sql
CREATE TABLE demo_instances (
  id bigserial PRIMARY KEY,
  template_type community_type NOT NULL,
  prospect_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  theme jsonb NOT NULL,
  seeded_community_id bigint REFERENCES communities,
  demo_user_id uuid REFERENCES auth.users,
  demo_user_email text NOT NULL,
  auth_token_secret text NOT NULL,
  expires_at timestamptz NOT NULL,
  is_expired boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE demo_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_instances FROM anon, authenticated;
GRANT ALL ON demo_instances TO service_role;
```

**Auto-auth:** Per-demo HMAC secret. Preview URL has signed token:
`HMAC(demo_id + user_id + expiry, secret)`. API route validates, creates Supabase session,
redirects. No plaintext passwords stored.

**Token security:**
- Short TTL (1 hour for shareable links, 24 hours for admin preview).
- Tokens are single-use: validated once, then a session cookie is set. The URL
  can be reloaded via the cookie, not the token.
- `Referrer-Policy: no-referrer` on demo preview pages to prevent token leakage
  via referrer headers.

### 2.2 — Demo expiry cron
Supabase Edge Function or Vercel Cron (daily):
1. Query `demo_instances WHERE expires_at < now() AND is_expired = false`.
2. Set `is_expired = true`.
3. Optionally deactivate the demo user in Supabase Auth.
4. **Retry logic:** If the cron fails, retry up to 3 times with exponential backoff.
5. **Alerting:** Log failure to Sentry (Phase 0.9). If all retries fail, the next daily
   run catches the backlog.

### 2.3 — Demo generator UI
`/demo/new` in `apps/admin`. Three-step form:
1. Template type (condo/HOA/apartment).
2. Brand — prospect name, logo upload, colors, fonts from `ALLOWED_FONTS`, live preview.
3. Confirm and generate.

On submit (protected by `requirePlatformAdmin`):
- Creates `communities` row with `is_demo = true`, branding, computed `demo_expires_at`.
- Calls `seedCommunity()` from Phase 0.8 with prospect config.
- Creates demo resident user + board member user in Supabase Auth.
- Assigns roles.
- Generates HMAC secret.
- Writes `demo_instances` row.
- Returns preview URLs.

### 2.4 — Theme injection in mobile layout
`MobileLayout` server component (`apps/web/src/app/mobile/layout.tsx`) currently does
auth + community membership check but no theme injection.

Add: read `communities.branding`, call `resolveTheme()`, call `toCssVars()`, inject
`<style>` tag with CSS custom properties. Call `toFontLinks()`, inject `<link>` tags.

The existing `mobile.css` references `var(--theme-primary)` (after Phase 0.5 rename).
Tab bar, headers, and accent elements immediately reflect client brand.

### 2.5 — Theme injection in desktop portal layout
Same pattern for the authenticated layout. Replace 15-20 hardcoded brand color references
with `var(--theme-primary)` etc. Only semantically "brand" colors — header background,
accent buttons, active states. Not a full design system overhaul.

### 2.6 — Demo auto-auth
`POST /api/v1/auth/demo-login` in `apps/web`:
1. Validate HMAC token.
2. If valid and not expired, create Supabase session via admin API.
3. Set session cookie, redirect to target page.
4. Mark token as used (prevents replay).

### 2.7 — Mobile screen polish
Existing screens are functional but minimal. For sales demo quality:
- Header per screen with community logo + name, `var(--theme-primary)` background.
- Rich seeded data (from `seedCommunity()`) — realistic titles, dates, categories.
- Maintenance screen populated.
- All themed elements using CSS variable contract.

### 2.8 — Split-screen preview
`/demo/[id]/preview` in `apps/admin`. Two-panel layout:
- Left: iframe of desktop portal (board member view, auto-authenticated).
- Right: `PhoneFrame` component wrapping `/mobile?communityId=[id]` (resident view).

Both panels live — real data, real theme.

**Note:** `PhoneFrame` currently lives at `apps/web/src/components/mobile/PhoneFrame.tsx`.
For `apps/admin` to use it, either:
(a) Move to `packages/ui` so both apps can import it, or
(b) Use it via iframe URL only (admin loads the PhoneFrame page from `apps/web`).

Option (a) is cleaner. Move `PhoneFrame` to `packages/ui` as a shared component.

### 2.9 — Full-screen mobile preview
`/demo/[id]/mobile` in `apps/admin`. PhoneFrame centered on dark background.
Shareable link with short-TTL signed token.

### 2.10 — Demo list
`/demo` in `apps/admin`. Table: prospect name, type, dates, status badge, preview links,
renew/delete actions. Expired demos greyed out.

---

## Phase 3 — Public Site Builder (Route Group, Not Separate App)

Goal: Each client has a public site at `[slug].getpropertypro.com`, built via a block
editor in `apps/admin`.

### 3.1 — Site blocks table

**v3 stored blocks as JSONB on `communities`. v4 uses a dedicated table.**

Rationale: The `communities` row already carries `branding`, `community_settings`,
Stripe fields, and soft-delete fields. Storing an entire site's content in one JSONB
column means every debounced save rewrites the full block array, no block-level history,
no queryability across sites, and growing row size.

```sql
CREATE TABLE site_blocks (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities,
  block_order int NOT NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image'
  )),
  content jsonb NOT NULL DEFAULT '{}',
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_site_blocks_community ON site_blocks(community_id, block_order);
-- Standard community-scoped RLS
```

Also add to `communities`:
```sql
ALTER TABLE communities ADD COLUMN custom_domain text;
ALTER TABLE communities ADD COLUMN site_published_at timestamptz;
```

`Block` discriminated union type lives in `packages/shared` — consumed by both
`apps/admin` (editor) and `apps/web` (renderer).

### 3.2 — Image upload for site builder
Images → `community-assets/{community_id}/site/` in Supabase Storage.
Upload endpoint: `POST /api/admin/upload` in `apps/admin` (protected).
Max 5MB. JPEG, PNG, WebP, SVG. Public read, authenticated write.

### 3.3 — Public site renderer (route group in `apps/web`)

New route group: `apps/web/src/app/(public-site)/[slug]/page.tsx`.

- Resolves community by slug from request host (middleware already does this).
- Reads `site_blocks` for that community where `is_draft = false`, ordered by `block_order`.
- Reads `communities.branding`, applies theme via `packages/theme`.
- Renders block array as a page — one React component per block type.
- Fully public, no auth. Server-rendered for SEO.

Dynamic data blocks (`AnnouncementsBlock`, `DocumentsBlock`, `MeetingsBlock`) query
the DB read-only. Static blocks render from stored content.

### 3.4 — Site Builder UI in `apps/admin`

"Site Builder" tab in `/clients/[id]` workspace. Two-column layout:
- Left: Block stack. Drag to reorder (`@dnd-kit/core`), inline editing, delete.
  "Add Block" dropdown.
- Right: Scaled-down iframe preview of the public site.

Data flow: Edits save individual blocks via `PUT /api/admin/site-blocks/[blockId]`
(debounced 500ms). Granular saves — not rewriting the entire block array.

"Publish" button: sets `is_draft = false` on all draft blocks, stamps `site_published_at`.
"Discard drafts" button: deletes draft blocks that have a published counterpart.

### 3.5 — Testing
- Smoke tests: community resolution by slug, block rendering per type, 404 for unknown
  slug, theme CSS variables present in rendered HTML, draft vs. published resolution.
- CI guard: `(public-site)` route group uses read-only community-scoped queries only.

### 3.6 — Domain configuration
Public sites served at `[slug].getpropertypro.com` via the existing subdomain routing.
`custom_domain` column exists for future use — not built yet.

---

## Phase 4 — Sales Pipeline (Lightweight, Not Bespoke CRM)

**v3 built a full CRM (contacts, pipeline kanban, sequences, agent tasks, 6 new tables).
v4 cuts this to a lightweight tracking layer inside `apps/admin`.**

**Rationale:** The platform has zero paying customers. Building a bespoke CRM with
sequences, agent task infrastructure, and a kanban board before the first sale is
premature optimization. The CRM phase had more tables (6) than the rest of the plan
combined. Use a free external CRM (HubSpot, Attio, or even a spreadsheet) for pipeline
management. Build only what needs to live inside PropertyPro: the link between a CRM
contact and a demo instance.

### 4.1 — Demo-to-prospect linking

Add to `demo_instances`:
```sql
ALTER TABLE demo_instances ADD COLUMN external_crm_url text;
ALTER TABLE demo_instances ADD COLUMN prospect_notes text;
```

The demo list view (`/demo`) gains a "CRM Link" field and a notes field per demo.
When you generate a demo for a prospect, you paste in their HubSpot/Attio URL.
When you're on a sales call, you can find the prospect's demo from the demo list.

### 4.2 — Navigation

`apps/admin` sidebar:

```
CLIENTS
  Portfolio       /clients
  Demos           /demo
```

That's it. No `/crm/*` routes. No kanban. No sequences. When the first 10 clients
are signed and pipeline volume justifies it, revisit.

---

## Phase 5 — PM Console (Deferred, Not Scaffolded)

**v3 scaffolded `apps/pm` as a Next.js app showing "Coming Soon." v4 defers this entirely.**

The existing PM routes in `apps/web` work. They have auth checks, a communities list,
and a branding form. There's nothing to scaffold until you've had discovery conversations
with actual property managers and know what the PM console needs to do differently
from what already exists.

**When to revisit:** After 3+ PM company conversations that reveal workflow requirements
the current route group can't serve.

---

## What Doesn't Change

- All 28 existing database tables — no drops, no destructive migrations.
- The resident and board member experience in `apps/web`.
- Auth flow, session handling, email verification.
- Compliance tracking, document management, maintenance requests.
- Scoped DB access pattern and CI guard (extended, not replaced).
- Stripe integration and billing.
- Mobile web routes at `/mobile/` (enhanced with theming, not restructured).
- PM routes in `apps/web` (enhanced with extended branding, not relocated).

---

## Phase Dependencies

```
Phase 0 (stabilize) → must complete before everything else

Phase 1 (admin scaffold) → requires Phase 0

Phase 2 (demo generator + mobile demo)
  → requires Phase 1 (admin shell)
  → requires Phase 0.4 (theme package)
  → requires Phase 0.8 (parameterized seed)

Phase 3 (public sites + builder)
  → requires Phase 2.5 (theme wiring in apps/web proves the pattern)
  → can run in parallel with Phase 4

Phase 4 (demo-to-prospect linking)
  → requires Phase 2 (demo list exists)
  → trivial scope, ~1 day
```

---

## Testing Strategy Per Phase

| Phase | Test Deliverables |
|-------|-------------------|
| 0 | CI guard refactored for multi-app + per-app policies. RLS policy check in CI. `packages/theme` unit tests. CSS variable grep assertion (zero `--brand-primary` refs). Seed refactor unit tests. |
| 1 | `apps/admin` Vitest config. Middleware auth rejection tests. Portfolio view integration tests. **Automated** cross-subdomain session test in CI. |
| 2 | Demo creation integration test. Auto-auth HMAC token generation + validation + single-use tests. Demo expiry cron test (including retry). Theme injection snapshot tests for mobile + desktop. |
| 3 | Block rendering per type. Community resolution by slug. 404 for unknown slug. Draft vs. published resolution. Granular block save tests. |
| 4 | Smoke test only (two columns added to existing table). |

---

## Indexes for New Tables

v3 mentioned no indexes. These are required:

```sql
-- demo_instances
CREATE INDEX idx_demo_instances_expires ON demo_instances(expires_at) WHERE is_expired = false;
CREATE INDEX idx_demo_instances_slug ON demo_instances(slug);

-- site_blocks
CREATE INDEX idx_site_blocks_community ON site_blocks(community_id, block_order);
CREATE INDEX idx_site_blocks_draft ON site_blocks(community_id, is_draft);
```

---

## Team Size and Timeline

This plan does not specify a team because that depends on your situation, but here's
the honest estimate for a single senior full-stack engineer:

| Phase | Estimated Duration | Notes |
|-------|-------------------|-------|
| Phase 0 | 2-3 weeks | Seed refactor and branding extension are the heavy items |
| Phase 1 | 2 weeks | Mostly boilerplate + middleware + portfolio view |
| Phase 2 | 3-4 weeks | Demo generator, HMAC auth, theme injection, mobile polish |
| Phase 3 | 3-4 weeks | Site builder UI is the heavy item (drag-and-drop, live preview) |
| Phase 4 | 1 day | Two columns and a text field |
| **Total** | **10-13 weeks** | With a second engineer, phases 2+3 can overlap: ~8 weeks |

For two engineers: one takes Phase 2 (demo + theming), the other takes Phase 3
(site builder) after Phase 1 is done. Phase 0 and 1 are sequential.

---

## What This Plan Does Not Include

- React Native app — architecture ready via `packages/theme`, build is separate.
- AI outbound agents — table schema not included; build when pipeline volume justifies.
- Automated email sending — sequences removed from scope entirely.
- Stripe changes for new tiers — existing billing untouched.
- Custom domains — column exists, feature not built.
- Rich text editing — plain text and markdown only.
- Bespoke CRM — use an external tool until pipeline volume justifies custom build.
- PM console app — existing routes serve current needs; revisit after PM discovery.

---

## Changelog from v3

| Item | v3 | v4 | Reason |
|------|----|----|--------|
| App count | 4 | 2 | `apps/sites` → route group, `apps/pm` → deferred |
| Phase 4 (CRM) | 6 tables, kanban, sequences, agent infra | 2 columns on existing table | Premature for zero-customer product |
| Phase 5 (PM scaffold) | New Next.js app | Deferred | Existing PM routes work |
| Phase 0.2 scope | "No application code changes" | Full branding stack update | Interface change requires validator/form/API updates |
| Phase 0 additions | — | 0.8 (seed refactor), 0.9 (observability) | Demo generator depends on parameterized seed; ops baseline needed before multi-app |
| Site blocks storage | JSONB on communities | Dedicated `site_blocks` table | Granular saves, queryability, row size management |
| Admin middleware | "No rate limiting" | Rate limiting + header sanitization | Admin APIs need protection too |
| Cross-subdomain test | Manual | Automated in CI | Security-critical path |
| Demo tokens | Unspecified TTL | Short TTL + single-use + Referrer-Policy | Token leakage mitigation |
| DB guard | Flat allowlist | Per-app policies | Doesn't scale to 25+ exceptions |
| Indexes | None mentioned | Explicit index definitions | Required for query performance |
| Timeline | Not stated | 10-13 weeks (1 engineer) | Grounds the plan in reality |
