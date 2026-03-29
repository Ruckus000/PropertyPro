# PropertyPro Transition Plan v4.1 — Agent Implementation Spec

> **Purpose:** This document is the single source of truth for implementing the
> PropertyPro platform transition. It is written to be handed directly to an
> implementing agent. Every decision is made. Every default value is specified.
> Every file path is exact. If something is not in this document, it is not in scope.
>
> **Base commit:** Post-Phase 4 / Gate 4 (2026-02-26). 28 tables, 550+ tests.
>
> **Codebase root:** The monorepo root is referred to as `$ROOT` throughout.
> In the actual repo this is the directory containing `pnpm-workspace.yaml`.

---

## Table of Contents

1. [Starting Point — Verified Inventory](#starting-point)
2. [Architecture Decisions (Locked)](#architecture-decisions)
3. [Auth Boundary Model](#auth-boundary-model)
4. [RLS and Table Security](#rls-and-table-security)
5. [Reference: Default Theme Values](#reference-default-theme-values)
6. [Reference: Allowed Fonts List](#reference-allowed-fonts-list)
7. [Reference: Block Type Content Schemas](#reference-block-type-content-schemas)
8. [Phase 0 — Stabilize](#phase-0)
9. [Phase 1 — Scaffold apps/admin](#phase-1)
10. [Phase 2 — Demo Generator + Mobile Demo](#phase-2)
11. [Phase 3 — Public Site Builder](#phase-3)
12. [Phase 4 — Sales Pipeline (Lightweight)](#phase-4)
13. [Phase Dependencies](#phase-dependencies)
14. [Testing Strategy](#testing-strategy)
15. [Indexes](#indexes)
16. [Timeline](#timeline)
17. [Out of Scope](#out-of-scope)
18. [Changelog from v3/v4](#changelog)

---

<a id="starting-point"></a>
## 1. Starting Point — Verified Inventory

The codebase is a single Next.js 15.1.0 app (`apps/web`) with 28 database tables.

### Files the agent will modify or reference frequently

| Purpose | Exact path |
|---------|-----------|
| Communities schema | `$ROOT/packages/db/src/schema/communities.ts` |
| Branding type | `$ROOT/packages/shared/src/branding.ts` |
| Branding API | `$ROOT/apps/web/src/lib/api/branding.ts` |
| Branding form | `$ROOT/apps/web/src/components/pm/BrandingForm.tsx` |
| Branding preview | `$ROOT/apps/web/src/components/pm/BrandingPreview.tsx` |
| PM branding route | `$ROOT/apps/web/src/app/api/v1/pm/branding/route.ts` |
| Mobile layout | `$ROOT/apps/web/src/app/mobile/layout.tsx` |
| Mobile CSS | `$ROOT/apps/web/src/styles/mobile.css` |
| PhoneFrame | `$ROOT/apps/web/src/components/mobile/PhoneFrame.tsx` |
| BottomTabBar | `$ROOT/apps/web/src/components/mobile/BottomTabBar.tsx` |
| Main middleware | `$ROOT/apps/web/src/middleware.ts` |
| DB access guard | `$ROOT/scripts/verify-scoped-db-access.ts` |
| Seed script | `$ROOT/scripts/seed-demo.ts` |
| Seed config | `$ROOT/scripts/config/demo-data.ts` |
| Sentry client config | `$ROOT/apps/web/sentry.client.config.ts` |
| Sentry server config | `$ROOT/apps/web/sentry.server.config.ts` |
| Sentry edge config | `$ROOT/apps/web/sentry.edge.config.ts` |
| Global CSS tokens | `$ROOT/packages/ui/src/styles/tokens.css` |
| Tailwind config | `$ROOT/apps/web/tailwind.config.ts` |
| Turbo config | `$ROOT/turbo.json` |
| Workspace config | `$ROOT/pnpm-workspace.yaml` |
| CI workflow | `$ROOT/.github/workflows/ci.yml` |

### Current `communities` table columns (for reference)

```
id, name, slug, community_type, timezone, address_line1, address_line2,
city, state, zip_code, logo_path, branding (jsonb), community_settings (jsonb),
stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status,
payment_failed_at, next_reminder_at, subscription_canceled_at,
created_at, updated_at, deleted_at
```

### Current `CommunityBranding` interface

```typescript
// $ROOT/packages/shared/src/branding.ts
export interface CommunityBranding {
  primaryColor?: string;      // Hex #RRGGBB
  secondaryColor?: string;    // Hex #RRGGBB
  logoPath?: string;          // Supabase Storage path
}
```

### Current CSS variables in use

Only two exist, both in `$ROOT/apps/web/src/styles/mobile.css`:
- `var(--brand-primary, #1a56db)` — line 58
- `var(--brand-primary, #1a56db)` — line 59

These are the ONLY references. No other file uses `--brand-primary` or `--brand-secondary`.

### Current seed script structure

`seed-demo.ts` is **not parameterized**. The function `seedCoreEntities()` (line 1079)
hardcodes references to specific community slugs (`sunset-condos`, `palm-shores-hoa`,
`sunset-ridge-apartments`) and specific user emails (`board.president@sunset.local`, etc.).
It cannot be called with arbitrary community config. Key functions that need extraction:

- `seedDocumentCategories(communityId, communityType)` — creates 6-9 categories per type
- `seedRegistryDocument(communityId, key, title, filename, description, categoryId)` — creates one document
- `seedRegistryMeeting(communityId, key, title, type, date, location)` — creates one meeting
- `seedRegistryAnnouncement(communityId, key, title, body, authorId, visibility?, pinned?)` — creates one announcement
- `seedCommunityCompliance(communityId, communityType)` — seeds compliance checklist
- `seedApartmentUnits(communityId)` — creates unit records (apartment-only)
- `seedApartmentLeases(communityId, unitIds, unitNumbers, context)` — creates leases (apartment-only)
- `seedApartmentMaintenanceRequests(communityId, unitIds, unitNumbers, context)` — creates maintenance requests (apartment-only)
- `seedWizardState(communityId, wizardType)` — marks onboarding complete

### Sentry status

Sentry is **already installed and configured** in `apps/web` with client, server, and edge
configs. DSN is provided via `SENTRY_DSN` (server/edge) and `NEXT_PUBLIC_SENTRY_DSN` (client)
environment variables. The owner will add DSN values for `apps/admin` to `.env.local` themselves.
The agent's job is to wire `@sentry/nextjs` into `apps/admin` following the same pattern as `apps/web`.

---

<a id="architecture-decisions"></a>
## 2. Architecture Decisions (Locked)

These are answered. Do not revisit or ask for clarification.

| # | Decision | Answer |
|---|----------|--------|
| A | App count | **2 apps only:** `apps/web` (port 3000) + `apps/admin` (port 3001). No `apps/sites`. No `apps/pm`. |
| B | `turbo dev` behavior | Starts both apps. Individual: `pnpm --filter apps/admin dev` |
| C | Environment variables | Each app symlinks to root `.env.local` via `scripts/setup.sh`. App-specific vars via `next.config.ts` `env` block: `NEXT_PUBLIC_APP_ROLE=web` or `NEXT_PUBLIC_APP_ROLE=admin` |
| D | Vercel projects | 2 projects: `apps/web` → `getpropertypro.com`, `apps/admin` → `admin.getpropertypro.com` |
| E | Public site URL pattern | **Same subdomain, auth-split.** `sunset-condos.getpropertypro.com` shows the public site to unauthenticated visitors and the portal dashboard to authenticated ones. No new subdomain pattern. Middleware already resolves the community from the subdomain. |
| F | Supabase auth cookie scope | `.getpropertypro.com` (leading dot). Shared across apps. Each app enforces its own authorization independently |
| G | Demo data lifecycle | **Demos persist until manually deleted.** No auto-expiry cron. Dashboard card in `apps/admin` shows "Stale Demos" with age badges at 10, 20, 30 days |
| H | Shared Supabase Storage | Single bucket, path prefixing: `community-assets/{community_id}/`, `admin-assets/`, `demo-assets/{demo_id}/` |
| I | Rich text in site builder | **No.** Plain text and markdown only |
| J | CSS variable naming | `--theme-primary`, `--theme-secondary`, `--theme-accent`, `--theme-font-heading`, `--theme-font-body`, `--theme-logo-url`, `--theme-community-name` |
| K | Font injection | Google Fonts `<link>` tag injected by layout server component. Validated against the exact list in [Reference: Allowed Fonts](#reference-allowed-fonts-list) |
| L | PM route behavior | **No changes.** Existing PM routes stay functional as-is |
| M | Admin DB access | **Service role client** (`createAdminClient()` from `@propertypro/db/supabase/admin`). Same pattern used for Stripe, provisioning, and PM portfolio queries in `apps/web`. No Postgres SECURITY DEFINER functions |
| N | Admin portal access to real communities | **`platform_observer` role.** Create a new value in the `user_role` enum. When an admin views a community workspace, their auth user is automatically assigned `platform_observer` for that community. This role grants read-only access — no write permissions. Used for the "View as…" feature in the client workspace |
| O | Demo user email pattern | `demo-resident@{slug}.getpropertypro.com` and `demo-board@{slug}.getpropertypro.com` where `{slug}` is the demo community's slug |
| P | Demo user roles | Two users per demo: one with `owner` role (resident experience), one with `board_member` role (admin experience) |
| Q | Seed data volume for demos | **Same as current seed.** Each demo community gets the full data set: document categories, documents, meetings, announcements, compliance checklist, and (for apartments) units, leases, maintenance requests |
| R | PhoneFrame sharing | Move `PhoneFrame.tsx` to `packages/ui/src/components/PhoneFrame.tsx`. Remove app-specific imports — it should accept only `src: string` as prop (the iframe URL). `apps/admin` and `apps/web` both import from `@propertypro/ui` |

---

<a id="auth-boundary-model"></a>
## 3. Auth Boundary Model

| Surface | Session required? | Authorization check | DB access pattern |
|---------|-------------------|---------------------|-------------------|
| `apps/web` — public marketing pages | No | None | None |
| `apps/web` — public site (unauthenticated subdomain visit) | No | None | Read-only community-scoped queries via `createScopedClient()` |
| `apps/web` — authenticated portal | Yes | `user_roles` row for resolved community | Community-scoped via `createScopedClient()` |
| `apps/web` — PM routes | Yes | `user_roles` row with `property_manager_admin` | Cross-community via allowlisted unsafe client |
| `apps/web` — demo auto-auth endpoint | No (token-based) | HMAC token validation | Service role for session creation |
| `apps/admin` — all routes | Yes | `platform_admin_users` row via `requirePlatformAdmin()` | Service role via `createAdminClient()` |

**API route protection in `apps/admin`:** Every API route handler must call
`requirePlatformAdmin(request)` as its first line. Middleware alone is insufficient.
A single unprotected API route is a privilege escalation bug.

**Cookie security:**
- `SameSite=Lax` (Supabase default — do not change)
- `HttpOnly` (verify Supabase SSR sets this — if not, configure it)
- CSS variable injection from branding MUST use server-side rendering with escaped values.
  Never interpolate user-supplied color strings directly into HTML. Use: `style={{ ['--theme-primary' as string]: sanitizedHex }}`

---

<a id="rls-and-table-security"></a>
## 4. RLS and Table Security

| New table | RLS policy | Access pattern |
|-----------|-----------|----------------|
| `platform_admin_users` | `service_role` only. `REVOKE ALL FROM anon, authenticated` | `createAdminClient()` in `apps/admin` |
| `demo_instances` | `service_role` only. Same revoke pattern | `createAdminClient()` in `apps/admin` |
| `site_blocks` | Standard community-scoped RLS (same as `documents`, `announcements`) | `createScopedClient()` in `apps/web` for rendering. `createAdminClient()` in `apps/admin` for editing |

**CI enforcement:** Every new migration file must include RLS policy statements for each
`CREATE TABLE`. The CI guard checks for this. Tables without RLS must be added to an
explicit allowlist in the guard script with a one-line documented reason.

---

<a id="reference-default-theme-values"></a>
## 5. Reference: Default Theme Values

These are the platform defaults, derived from the current landing page palette.
Used by `resolveTheme()` when a community has no custom branding set.

```typescript
export const THEME_DEFAULTS: CommunityTheme = {
  primaryColor: '#2563EB',       // blue-600 (current landing page primary)
  secondaryColor: '#6B7280',     // gray-500 (current landing page secondary text)
  accentColor: '#DBEAFE',        // blue-100 (current landing page badge/icon backgrounds)
  fontHeading: 'Inter',          // current landing page font (via --font-sans)
  fontBody: 'Inter',             // same — single font family currently in use
  logoUrl: null,                 // no default logo — shows community name text instead
  communityName: '',             // populated from communities.name
  communityType: 'condo_718',    // populated from communities.community_type
};
```

**CSS variable mapping (exact names, never changed after this point):**

```typescript
export const THEME_CSS_VARS: Record<keyof Omit<CommunityTheme, 'communityType'>, string> = {
  primaryColor: '--theme-primary',
  secondaryColor: '--theme-secondary',
  accentColor: '--theme-accent',
  fontHeading: '--theme-font-heading',
  fontBody: '--theme-font-body',
  logoUrl: '--theme-logo-url',
  communityName: '--theme-community-name',
};
```

---

<a id="reference-allowed-fonts-list"></a>
## 6. Reference: Allowed Fonts List

Exactly these 25 Google Fonts families are permitted. No additions without a plan update.
Selected for readability, professional appearance, and broad language support.

```typescript
export const ALLOWED_FONTS = [
  // Sans-serif — general purpose
  'Inter',
  'Open Sans',
  'Lato',
  'Roboto',
  'Source Sans 3',
  'Nunito',
  'Nunito Sans',
  'Poppins',
  'Raleway',
  'Montserrat',
  'Work Sans',
  'DM Sans',
  'Plus Jakarta Sans',
  'Outfit',

  // Sans-serif — slightly distinctive
  'Barlow',
  'Manrope',
  'Urbanist',
  'Figtree',

  // Serif — formal / traditional
  'Merriweather',
  'Lora',
  'Playfair Display',
  'Source Serif 4',
  'Libre Baskerville',
  'Crimson Text',
  'EB Garamond',
] as const;
```

**Validation rule:** `fontHeading` and `fontBody` must be values from this list.
`resolveTheme()` falls back to `'Inter'` if an invalid font is encountered.

---

<a id="reference-block-type-content-schemas"></a>
## 7. Reference: Block Type Content Schemas

The `site_blocks.content` JSONB column stores block-specific data. The `block_type`
column determines which shape the content conforms to. The discriminated union type
lives in `$ROOT/packages/shared/src/site-blocks.ts`.

```typescript
// Hero block — full-width banner at the top of the site
interface HeroBlockContent {
  headline: string;                    // max 120 chars
  subheadline: string;                 // max 300 chars
  ctaLabel: string;                    // button text, max 40 chars
  ctaHref: string;                     // URL the button links to
  backgroundImageUrl?: string;         // Supabase Storage public URL, optional
}

// Announcements block — renders latest N announcements from the DB
interface AnnouncementsBlockContent {
  title: string;                       // section heading, default "Announcements"
  limit: number;                       // max items to show, 1-10, default 5
}

// Documents block — renders documents, optionally filtered by category
interface DocumentsBlockContent {
  title: string;                       // section heading, default "Documents"
  categoryIds: number[];               // empty array = all categories
}

// Meetings block — renders upcoming meetings from the DB
interface MeetingsBlockContent {
  title: string;                       // section heading, default "Upcoming Meetings"
}

// Contact block — static contact information
interface ContactBlockContent {
  boardEmail: string;                  // required, validated as email
  managementCompany?: string;          // optional company name
  phone?: string;                      // optional, no format validation
  address?: string;                    // optional, plain text
}

// Text block — static text content
interface TextBlockContent {
  body: string;                        // plain text or markdown, max 5000 chars
}

// Image block — static image with optional caption
interface ImageBlockContent {
  url: string;                         // Supabase Storage public URL, required
  alt: string;                         // alt text, required, max 200 chars
  caption?: string;                    // optional, max 300 chars
}

// Discriminated union for type safety
type BlockContent =
  | { type: 'hero' } & HeroBlockContent
  | { type: 'announcements' } & AnnouncementsBlockContent
  | { type: 'documents' } & DocumentsBlockContent
  | { type: 'meetings' } & MeetingsBlockContent
  | { type: 'contact' } & ContactBlockContent
  | { type: 'text' } & TextBlockContent
  | { type: 'image' } & ImageBlockContent;
```

**Note:** The `type` field in the content JSONB is redundant with `site_blocks.block_type`
in the DB column. This is intentional — the DB column is for queries/indexing, the content
`type` field is for TypeScript discrimination after the JSONB is parsed.

**Validation:** All content fields are validated server-side before writing to the DB.
Max lengths are enforced. URLs are validated as strings starting with `https://`.
The `limit` field in announcements is clamped to 1-10.

---

<a id="phase-0"></a>
## 8. Phase 0 — Stabilize Before Adding

Goal: Clean up the existing codebase and establish contracts before adding `apps/admin`.

### 0.1 — Local development infrastructure

**Files to create/modify:**
- `$ROOT/scripts/setup.sh` — add symlink creation for `apps/admin/.env.local → ../../.env.local`
- `$ROOT/apps/web/package.json` — add `"dev": "next dev --port 3000"` to scripts
- `$ROOT/apps/admin/package.json` — (created in Phase 1, but port documented here): `"dev": "next dev --port 3001"`
- `$ROOT/turbo.json` — update `dev` task to include both apps
- `$ROOT/apps/web/next.config.ts` — add `env: { NEXT_PUBLIC_APP_ROLE: 'web' }`
- `$ROOT/README.md` — add "Local Development" section documenting ports, how to run individual apps, how to run everything

**Acceptance criteria:**
- `pnpm dev` starts `apps/web` on :3000
- `pnpm --filter apps/admin dev` starts admin on :3001 (after Phase 1)
- README documents the setup clearly

### 0.2 — Extend and lock `communities.branding` shape

**Migration file:** `$ROOT/packages/db/migrations/0029_extend_branding_shape.sql`

```sql
-- Set sensible defaults for all existing rows that have branding
UPDATE communities
SET branding = branding
  || jsonb_build_object(
    'accentColor', '#DBEAFE',
    'fontHeading', 'Inter',
    'fontBody', 'Inter'
  )
WHERE branding IS NOT NULL
  AND branding != 'null'::jsonb;
```

**Files to modify (in this order):**

1. **`$ROOT/packages/shared/src/branding.ts`** — extend interface:
```typescript
export interface CommunityBranding {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;        // NEW — hex color
  fontHeading?: string;        // NEW — must be in ALLOWED_FONTS
  fontBody?: string;           // NEW — must be in ALLOWED_FONTS
  logoPath?: string;
}
```

2. **`$ROOT/apps/web/src/lib/api/branding.ts`** — extend `BrandingPatch`:
```typescript
export interface BrandingPatch {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;         // NEW
  fontHeading?: string;         // NEW
  fontBody?: string;            // NEW
  logoPath?: string;
}
```
Update `updateBrandingForCommunity()`: add `accentColor` hex validation.
Add font validation: `if (patch.fontHeading && !ALLOWED_FONTS.includes(patch.fontHeading)) throw new ValidationError(...)`.
Import `ALLOWED_FONTS` from `packages/theme` (created in 0.4) or define inline temporarily.

3. **`$ROOT/apps/web/src/components/pm/BrandingForm.tsx`** — add:
   - Accent color picker (same pattern as primary/secondary: `<input type="color">` + text input)
   - Font heading dropdown: `<select>` with `ALLOWED_FONTS` as options
   - Font body dropdown: same
   - Wire new fields into the submit handler's PATCH body

4. **`$ROOT/apps/web/src/components/pm/BrandingPreview.tsx`** — show accent color swatch,
   heading font name, body font name in the preview card.

5. **`$ROOT/apps/web/src/app/api/v1/pm/branding/route.ts`** — accept `accentColor`,
   `fontHeading`, `fontBody` in the PATCH request body. Pass through to `updateBrandingForCommunity()`.

**Acceptance criteria:**
- Migration runs without error
- Existing demo community branding gains `accentColor`, `fontHeading`, `fontBody` defaults
- BrandingForm shows the new fields
- PATCH `/api/v1/pm/branding` accepts and persists the new fields
- Invalid font names are rejected with 400
- Existing branding tests still pass

### 0.3 — Create `platform_admin_users` table

**Migration file:** `$ROOT/packages/db/migrations/0030_create_platform_admin_users.sql`

```sql
CREATE TABLE platform_admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'super_admin',
  invited_by uuid REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_admin_users FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform_admin_users TO service_role;

COMMENT ON TABLE platform_admin_users IS 'Platform admin authorization. service_role only.';
```

**Drizzle schema file:** `$ROOT/packages/db/src/schema/platform-admin-users.ts`

**DO NOT seed the admin user UUID in a migration file.** The owner's Supabase auth UUID
is environment-specific. Instead, document a one-time SQL command in the README:
```sql
INSERT INTO platform_admin_users (user_id) VALUES ('YOUR-SUPABASE-AUTH-UUID-HERE');
```

### 0.4 — Create `packages/theme`

**Directory:** `$ROOT/packages/theme/`

**Files to create:**

```
packages/theme/
├── package.json          # name: "@propertypro/theme"
├── tsconfig.json
├── src/
│   ├── index.ts          # re-exports everything
│   ├── types.ts          # CommunityTheme interface
│   ├── constants.ts      # THEME_CSS_VARS, THEME_DEFAULTS, ALLOWED_FONTS
│   ├── resolve-theme.ts  # resolveTheme()
│   ├── to-css-vars.ts    # toCssVars()
│   └── to-font-links.ts  # toFontLinks()
└── __tests__/
    ├── resolve-theme.test.ts
    ├── to-css-vars.test.ts
    └── to-font-links.test.ts
```

**`CommunityTheme` interface:**
```typescript
export interface CommunityTheme {
  primaryColor: string;       // always populated (defaults applied)
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoUrl: string | null;
  communityName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}
```

**`resolveTheme(branding: unknown, communityName: string, communityType: string): CommunityTheme`**
- Accepts the raw JSONB from `communities.branding` (type `unknown` for safety)
- Validates each field, applies defaults from `THEME_DEFAULTS` for missing/invalid values
- Validates `fontHeading` and `fontBody` against `ALLOWED_FONTS`, falls back to `'Inter'`
- Validates hex colors with `/^#[0-9a-fA-F]{6}$/`, falls back to default
- Converts `logoPath` (Supabase Storage path) to `logoUrl` — **note:** this function
  does NOT generate signed URLs. The caller must convert `logoPath` to a public URL
  before passing it, or pass `null`

**`toCssVars(theme: CommunityTheme): Record<string, string>`**
- Returns: `{ '--theme-primary': '#2563EB', '--theme-secondary': '#6B7280', ... }`
- Uses `THEME_CSS_VARS` mapping. Does not include `communityType`.

**`toFontLinks(theme: CommunityTheme): string[]`**
- Returns array of Google Fonts `<link>` href URLs
- Deduplicates if `fontHeading === fontBody`
- Format: `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`
- Always includes weights 400, 500, 600, 700

**Required unit tests:**
- `resolveTheme` with valid branding → correct CommunityTheme
- `resolveTheme` with `null` branding → all defaults
- `resolveTheme` with invalid font → falls back to Inter
- `resolveTheme` with invalid hex color → falls back to default
- `toCssVars` → correct key-value pairs
- `toFontLinks` with same heading/body font → 1 link (deduplicated)
- `toFontLinks` with different fonts → 2 links

**Add to `pnpm-workspace.yaml`:** Already covered by `packages/*` glob.
**Add to `turbo.json`:** Package will be picked up automatically.
**Add to `vitest.workspace.ts`:** Add `'packages/theme'` to the array.

### 0.5 — CSS variable migration

**Files to modify:**

1. `$ROOT/apps/web/src/styles/mobile.css` line 58: `var(--brand-primary, #1a56db)` → `var(--theme-primary, #2563EB)`
2. `$ROOT/apps/web/src/styles/mobile.css` line 59: `var(--brand-primary, #1a56db)` → `var(--theme-primary, #2563EB)`

**Note:** After searching the full codebase, these are the ONLY two references to
`--brand-primary` or `--brand-secondary`. No other files need updating.

**CI check:** Add a script `$ROOT/scripts/verify-css-var-migration.sh`:
```bash
#!/bin/bash
count=$(grep -r -- '--brand-primary\|--brand-secondary' apps/ packages/ --include='*.css' --include='*.tsx' --include='*.ts' | wc -l)
if [ "$count" -gt 0 ]; then
  echo "FAIL: Found $count references to deprecated CSS variables (--brand-primary or --brand-secondary)"
  grep -rn -- '--brand-primary\|--brand-secondary' apps/ packages/ --include='*.css' --include='*.tsx' --include='*.ts'
  exit 1
fi
echo "PASS: No deprecated CSS variable references found"
```
Add to CI workflow after lint step.

### 0.6 — Extend CI guard to support multiple apps

**File to modify:** `$ROOT/scripts/verify-scoped-db-access.ts`

**Current problem (line 18):**
```typescript
const runtimeRoot = join(repoRoot, 'apps', 'web', 'src');
```
Hardcoded to `apps/web` only.

**Refactor to:**
```typescript
interface AppGuardConfig {
  appDir: string;
  mode: 'scoped' | 'admin';  // 'scoped' = normal rules, 'admin' = all unsafe allowed
  unsafeAllowlist: Set<string>;
}

const APP_CONFIGS: AppGuardConfig[] = [
  {
    appDir: join(repoRoot, 'apps', 'web', 'src'),
    mode: 'scoped',
    unsafeAllowlist: new Set([/* existing 15 files */]),
  },
  {
    appDir: join(repoRoot, 'apps', 'admin', 'src'),
    mode: 'admin',
    unsafeAllowlist: new Set([/* all files — admin legitimately queries all tables */]),
  },
];
```

For `mode: 'admin'`: allow `@propertypro/db/unsafe` imports from any file, but still
forbid direct `drizzle-orm` imports (must go through package exports).

**Add RLS policy check:** New function that scans `$ROOT/packages/db/migrations/*.sql`
for `CREATE TABLE` statements and verifies each has a corresponding
`ENABLE ROW LEVEL SECURITY` in the same file. Tables in a `NO_RLS_ALLOWLIST` are exempt.

### 0.7 — Add `is_demo` and `demo_expires_at` columns to `communities`

**Migration file:** `$ROOT/packages/db/migrations/0031_add_demo_columns.sql`

```sql
ALTER TABLE communities ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE communities ADD COLUMN demo_expires_at timestamptz;

-- Mark existing seed communities as non-demo explicitly
UPDATE communities SET is_demo = false WHERE is_demo = false;

COMMENT ON COLUMN communities.is_demo IS 'True for demo communities created via admin console';
COMMENT ON COLUMN communities.demo_expires_at IS 'Unused — demos persist until manually deleted. Column retained for future use';
```

**Update Drizzle schema:** Add columns to `$ROOT/packages/db/src/schema/communities.ts`.

**Note:** `demo_expires_at` is kept in the schema but unused. Decision G says demos
persist until manually deleted. The column exists so a future auto-expiry feature
doesn't require a migration.

### 0.8 — Refactor seed script for parameterized use

**This is the most complex Phase 0 task.** The current `seedCoreEntities()` function
(line 1079 of `seed-demo.ts`) hardcodes slugs, emails, and cross-community references.

**New file:** `$ROOT/packages/db/src/seed/seed-community.ts`

```typescript
export interface SeedCommunityConfig {
  name: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  timezone?: string;           // default: 'America/New_York'
  city?: string;
  state?: string;
  zipCode?: string;
  addressLine1?: string;
  branding?: CommunityBranding;
  isDemo?: boolean;            // default: false
}

export interface SeedUserConfig {
  email: string;
  fullName: string;
  phone?: string;
  role: CanonicalRole;
}

export interface SeedCommunityResult {
  communityId: number;
  users: Array<{ email: string; userId: string; role: CanonicalRole }>;
}

export async function seedCommunity(
  config: SeedCommunityConfig,
  users: SeedUserConfig[],
  options?: { syncAuthUsers?: boolean },
): Promise<SeedCommunityResult>;
```

**Implementation approach:**
1. Extract `ensureCommunity()`, `ensureUser()`, `ensureAuthUser()`, `seedRoles()`,
   `seedDocumentCategories()`, `seedRegistryDocument()`, `seedRegistryMeeting()`,
   `seedRegistryAnnouncement()`, `seedCommunityCompliance()`, `seedWizardState()`,
   `ensureNotificationPreference()` — move to `seed-community.ts` as internal helpers.
2. `seedCommunity()` creates the community, creates users, assigns roles, seeds
   document categories, creates a standard set of documents/meetings/announcements
   appropriate for the community type, and seeds compliance.
3. For `apartment` type: also calls `seedApartmentUnits()`, `seedApartmentLeases()`,
   `seedApartmentMaintenanceRequests()`.
4. **Standard data per community type:**
   - **condo_718:** 6 document categories, 2 documents, 1 meeting (14 days out), 2 announcements, compliance checklist
   - **hoa_720:** 6 document categories, 2 documents, 1 meeting (21 days out), 2 announcements, compliance checklist
   - **apartment:** 9 document categories, 3 documents, 1 meeting (10 days out), 5 announcements, 15 units, leases, maintenance requests, compliance checklist

5. **Rewrite `scripts/seed-demo.ts`** to call `seedCommunity()` three times:
```typescript
import { seedCommunity } from '@propertypro/db/seed/seed-community';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';

// Map existing config to new interface, call seedCommunity() for each
```

**Acceptance criteria:**
- `pnpm seed:demo` still produces the same result as before (regression test)
- `seedCommunity()` can be called with arbitrary config and produces a valid community
- Exported from `@propertypro/db/seed/seed-community` for Phase 2 to import

### 0.9 — Wire Sentry into `apps/admin`

Sentry is already configured in `apps/web`. Replicate the same setup for `apps/admin`:

**Files to create:**
- `$ROOT/apps/admin/sentry.client.config.ts` — copy from `apps/web`, same structure
- `$ROOT/apps/admin/sentry.server.config.ts` — copy from `apps/web`
- `$ROOT/apps/admin/sentry.edge.config.ts` — copy from `apps/web`
- `$ROOT/apps/admin/instrumentation.ts` — copy from `apps/web`

**Files to modify:**
- `$ROOT/apps/admin/next.config.ts` — wrap with `withSentryConfig()` (same as `apps/web`)

**Environment:** Owner will add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to `.env.local`.
Agent does NOT need to create a Sentry project or obtain a DSN.

**Also add:** `GET /api/health` endpoint in both apps returning `{ status: 'ok', timestamp: new Date().toISOString() }`.

---

<a id="phase-1"></a>
## 9. Phase 1 — Scaffold `apps/admin`

Goal: A working `admin.getpropertypro.com` with login and client portfolio view.

### 1.1 — Bootstrap the app

**Create directory:** `$ROOT/apps/admin/`

**Key files:**
```
apps/admin/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── sentry.client.config.ts    (from 0.9)
├── sentry.server.config.ts    (from 0.9)
├── sentry.edge.config.ts      (from 0.9)
├── instrumentation.ts          (from 0.9)
└── src/
    ├── app/
    │   ├── layout.tsx           # Root layout with sidebar nav
    │   ├── page.tsx             # Redirect to /clients
    │   ├── auth/
    │   │   └── login/
    │   │       └── page.tsx
    │   ├── clients/
    │   │   ├── page.tsx         # Portfolio view
    │   │   └── [id]/
    │   │       └── page.tsx     # Client workspace
    │   ├── demo/
    │   │   ├── page.tsx         # Demo list (Phase 2)
    │   │   ├── new/
    │   │   │   └── page.tsx     # Demo generator (Phase 2)
    │   │   └── [id]/
    │   │       ├── preview/
    │   │       │   └── page.tsx # Split-screen (Phase 2)
    │   │       └── mobile/
    │   │           └── page.tsx # Full-screen mobile (Phase 2)
    │   └── api/
    │       ├── health/
    │       │   └── route.ts
    │       └── admin/           # Admin API routes (Phase 2+)
    ├── components/
    │   ├── Sidebar.tsx
    │   └── AdminLayout.tsx
    ├── middleware.ts
    └── styles/
        └── globals.css
```

**`package.json` dependencies:** Same Next.js/React versions as `apps/web`. Dependencies:
`@propertypro/db`, `@propertypro/shared`, `@propertypro/ui`, `@propertypro/theme`,
`@sentry/nextjs`, `@supabase/ssr`, `@supabase/supabase-js`.

**`tailwind.config.ts`:** Extend from `packages/ui` if a shared preset exists, otherwise
create standalone config using the same design tokens as `apps/web`
(`$ROOT/packages/ui/src/styles/tokens.css`).

**`next.config.ts`:**
```typescript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  transpilePackages: ['@propertypro/db', '@propertypro/shared', '@propertypro/ui', '@propertypro/theme'],
  env: {
    NEXT_PUBLIC_APP_ROLE: 'admin',
  },
};

export default withSentryConfig(nextConfig, { /* sentry options */ });
```

### 1.2 — Shared auth utilities

**New file:** `$ROOT/packages/shared/src/auth/platform-admin.ts`

```typescript
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { createMiddlewareClient } from '@propertypro/db/supabase/middleware';

interface PlatformAdminUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Extract Supabase session from request, verify platform_admin_users row.
 * Throws 403 Response if not a platform admin.
 */
export async function requirePlatformAdmin(
  request: Request,
): Promise<PlatformAdminUser> {
  // 1. Create middleware Supabase client, get session
  // 2. If no session, throw new Response('Unauthorized', { status: 401 })
  // 3. Query platform_admin_users WHERE user_id = session.user.id using createAdminClient()
  // 4. If no row, throw new Response('Forbidden', { status: 403 })
  // 5. Return { id: session.user.id, email: session.user.email, role: row.role }
}

/**
 * Non-throwing variant for conditional rendering.
 */
export async function getPlatformAdminSession(
  request: Request,
): Promise<PlatformAdminUser | null> {
  try {
    return await requirePlatformAdmin(request);
  } catch {
    return null;
  }
}
```

**Export from package:** Add to `$ROOT/packages/shared/src/index.ts`.

### 1.3 — Admin middleware

**File:** `$ROOT/apps/admin/src/middleware.ts`

**Responsibilities (in order):**
1. Supabase session refresh (same pattern as `apps/web` middleware lines 1-30)
2. **Header anti-spoofing:** Strip `x-community-id`, `x-tenant-slug`, `x-user-id`, `x-tenant-source`
3. **Rate limiting:** IP-based, 100 requests/minute on API routes. Use the same rate limiter implementation from `apps/web`'s middleware (extract to a shared utility if not already)
4. Allow `/auth/login`, `/api/health` without admin check
5. Call `requirePlatformAdmin(request)` for all other routes
6. On 401/403 → redirect to `/auth/login`
7. Add `X-Request-ID` header

**Matcher:** `/((?!_next/static|_next/image|favicon.ico).*)` (same as `apps/web`)

### 1.4 — Auth UI

**File:** `$ROOT/apps/admin/src/app/auth/login/page.tsx`

**Design:**
- Background: `#111827` (gray-900) — dark, distinct from client platform
- Card: white, centered, max-width 400px
- Heading: "Operator Console"
- Subheading: "PropertyPro Platform Administration"
- Form: email + password (standard Supabase auth)
- On success: middleware checks `platform_admin_users`
- **If no admin row:** Render access denied page:
  - Message: "Access Denied — Your account does not have platform administrator privileges."
  - "Return to Login" button
  - **No redirect loop** — this is a full page render, not a redirect

### 1.5 — Client Portfolio view

**File:** `$ROOT/apps/admin/src/app/clients/page.tsx`

**Query:** `SELECT * FROM communities WHERE is_demo = false AND deleted_at IS NULL ORDER BY name`
via `createAdminClient()`.

**Card fields:**
- Community name
- Type badge: "Condo §718" (blue), "HOA §720" (green), "Apartment" (purple)
- City, State
- Subscription status: `subscription_status` field → badge (active/trialing/past_due/canceled)
- Created date: `created_at` formatted as "MMM D, YYYY"
- Unit count: query `units` table count for that community

**Controls:**
- Search: filter by `name` (case-insensitive `ILIKE`)
- Filter: dropdown for `community_type`
- Sort: name (A-Z, Z-A), created date (newest, oldest)

**Click:** Navigate to `/clients/[id]`

**Stale Demos card (Decision G):** Below the portfolio grid, show a "Stale Demos" card
if any `demo_instances` have `created_at` older than 10 days. Show:
- Demos 10-19 days old: yellow "10+ days" badge
- Demos 20-29 days old: orange "20+ days" badge
- Demos 30+ days old: red "30+ days" badge
- Each row: prospect name, type, age, "Delete" button

### 1.6 — Client Workspace shell

**File:** `$ROOT/apps/admin/src/app/clients/[id]/page.tsx`

**Layout:** Tab bar with:
- **Overview** (default) — community name, type, address, subscription status, member count, document count, compliance score
- **Site Builder** — placeholder: "Site Builder coming in Phase 3"
- **Settings** — placeholder: "Community settings"

Fetch community by ID via `createAdminClient()`.
If community not found or `is_demo = true`, show 404.

### 1.7 — Testing

**Files to create:**
- `$ROOT/apps/admin/vitest.config.ts`
- `$ROOT/apps/admin/__tests__/middleware/admin-auth.test.ts`
- `$ROOT/apps/admin/__tests__/clients/portfolio.test.ts`
- `$ROOT/apps/admin/__tests__/auth/cross-subdomain-session.test.ts`

**Test cases for middleware:**
1. Unauthenticated request to `/clients` → redirect to `/auth/login`
2. Authenticated request without `platform_admin_users` row → redirect to `/auth/login`
3. Authenticated request WITH `platform_admin_users` row → passes through
4. Request to `/auth/login` → always passes through (no admin check)
5. Request to `/api/health` → always passes through
6. Rate limiting: 101st request in 1 minute → 429 response

**Cross-subdomain session test:**
1. Create a session cookie for a user who IS in `platform_admin_users`
2. Verify admin middleware accepts it
3. Create a session cookie for a user who IS NOT in `platform_admin_users`
4. Verify admin middleware rejects it with redirect

**Add to CI:** Update `$ROOT/.github/workflows/ci.yml` to build `@propertypro/theme`
and run `apps/admin` tests.

### 1.8 — Vercel configuration

Manual step (not automated by agent):
- Create Vercel project for `apps/admin`
- Set root directory to `apps/admin`
- Point `admin.getpropertypro.com` DNS
- Set environment variables (same Supabase project, same keys as `apps/web`)

---

<a id="phase-2"></a>
## 10. Phase 2 — Demo Generator + Mobile Demo

Goal: Generate a branded demo for a prospect in under 30 seconds.

### 2.1 — Demo schema

**Migration file:** `$ROOT/packages/db/migrations/0032_create_demo_instances.sql`

```sql
CREATE TABLE demo_instances (
  id bigserial PRIMARY KEY,
  template_type community_type NOT NULL,
  prospect_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  theme jsonb NOT NULL,
  seeded_community_id bigint REFERENCES communities ON DELETE SET NULL,
  demo_resident_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_board_user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  demo_resident_email text NOT NULL,
  demo_board_email text NOT NULL,
  auth_token_secret text NOT NULL,
  external_crm_url text,
  prospect_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_instances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_instances FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_instances TO service_role;

CREATE INDEX idx_demo_instances_slug ON demo_instances(slug);

COMMENT ON TABLE demo_instances IS 'Demo instance tracking. service_role only.';
```

**Note vs. v3/v4:** Removed `expires_at` and `is_expired` columns. Decision G says demos
persist until manually deleted. Added `demo_board_user_id`, `demo_board_email`,
`external_crm_url`, `prospect_notes` (from Phase 4, collapsed here since the table
doesn't exist yet — no reason to add columns in a separate migration).

**Drizzle schema:** `$ROOT/packages/db/src/schema/demo-instances.ts`

### 2.2 — Demo auto-auth token system

**New file:** `$ROOT/packages/shared/src/auth/demo-token.ts`

```typescript
import { createHmac } from 'node:crypto';

/**
 * Generate a signed demo auto-auth token.
 * Token format: base64url(JSON({ demoId, userId, role, exp })) + '.' + base64url(HMAC)
 */
export function generateDemoToken(params: {
  demoId: number;
  userId: string;
  role: 'resident' | 'board';
  secret: string;
  ttlSeconds: number;   // 3600 for shareable links, 86400 for admin preview
}): string;

/**
 * Validate and decode a demo token.
 * Returns null if invalid, expired, or HMAC doesn't match.
 */
export function validateDemoToken(
  token: string,
  secret: string,
): { demoId: number; userId: string; role: 'resident' | 'board'; exp: number } | null;
```

**HMAC algorithm:** `sha256`
**TTL values:** 1 hour (3600s) for shareable links, 24 hours (86400s) for admin preview iframes.

### 2.3 — Demo generator API

**File:** `$ROOT/apps/admin/src/app/api/admin/demos/route.ts`

**`POST /api/admin/demos`** (protected by `requirePlatformAdmin`):

Request body:
```typescript
{
  templateType: 'condo_718' | 'hoa_720' | 'apartment';
  prospectName: string;       // max 100 chars
  branding: {
    primaryColor: string;     // hex
    secondaryColor: string;
    accentColor: string;
    fontHeading: string;      // must be in ALLOWED_FONTS
    fontBody: string;
    logoPath?: string;        // Supabase Storage path if logo was uploaded
  };
  externalCrmUrl?: string;
  prospectNotes?: string;
}
```

Implementation steps:
1. Generate slug: `demo-${prospectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${randomId(6)}`
2. Create community via `createAdminClient()`:
   - `name`: `prospectName`
   - `slug`: generated slug
   - `community_type`: `templateType`
   - `branding`: from request body
   - `is_demo`: `true`
3. Call `seedCommunity()` from Phase 0.8
4. Create resident demo user: `demo-resident@{slug}.getpropertypro.com`, password: random 32-char string (never stored/shown)
5. Create board demo user: `demo-board@{slug}.getpropertypro.com`, same approach
6. Assign `owner` role to resident user, `board_member` role to board user
7. Generate HMAC secret: `crypto.randomBytes(32).toString('hex')`
8. Write `demo_instances` row
9. Return: `{ demoId, slug, previewUrl, mobilePreviewUrl, residentToken, boardToken }`

### 2.4 — Demo generator UI

**File:** `$ROOT/apps/admin/src/app/demo/new/page.tsx`

Three-step wizard (use state machine, not separate pages):

**Step 1 — Template:** Three cards for condo/HOA/apartment. Click to select. Show preview
thumbnail (static image or icon for each type). "Next" button.

**Step 2 — Brand:**
- Prospect name (text input, required)
- Logo upload (same presigned upload flow as BrandingForm — `POST /api/admin/upload`)
- Primary color picker (type="color" + hex text input)
- Secondary color picker
- Accent color picker
- Heading font dropdown (`ALLOWED_FONTS`)
- Body font dropdown (`ALLOWED_FONTS`)
- **Live preview panel:** Show a mini card using `toCssVars()` to apply the selected theme in real-time. Show community name in heading font, body text in body font, colored elements using the three colors.
- "Next" button.

**Step 3 — Confirm:**
- Summary of all selections
- Optional: CRM URL field, prospect notes field
- "Generate Demo" button → calls `POST /api/admin/demos`
- On success: show result card with clickable preview links

### 2.5 — Theme injection in mobile layout

**File to modify:** `$ROOT/apps/web/src/app/mobile/layout.tsx`

After the existing `requireCommunityMembership()` call (line 47), add:

```typescript
import { resolveTheme, toCssVars, toFontLinks } from '@propertypro/theme';
import { getBrandingForCommunity } from '@/lib/api/branding';

// After membership check:
const branding = await getBrandingForCommunity(communityId);
const theme = resolveTheme(branding, membership.communityName, membership.communityType);
const cssVars = toCssVars(theme);
const fontLinks = toFontLinks(theme);

// In the JSX return:
return (
  <>
    {fontLinks.map((href) => (
      <link key={href} rel="stylesheet" href={href} />
    ))}
    <div className="mobile-shell" style={cssVars as React.CSSProperties}>
      <main id="main-content" className="mobile-content">{children}</main>
      <BottomTabBar features={features} communityId={communityId} />
    </div>
  </>
);
```

**Note:** `style={cssVars}` safely sets CSS custom properties without string interpolation.
React's style prop escapes values. This is the correct sanitization approach.

### 2.6 — Theme injection in desktop portal layout

**File to modify:** `$ROOT/apps/web/src/app/(authenticated)/layout.tsx`

Same pattern as 2.5. Read branding for the resolved community, inject CSS vars and
font links. Then update these specific elements to use theme variables:

- Sidebar/header background: `bg-blue-600` → `style={{ backgroundColor: 'var(--theme-primary)' }}`
- Active navigation item: `text-blue-600` → `style={{ color: 'var(--theme-primary)' }}`
- Primary buttons: `bg-blue-600 hover:bg-blue-700` → keep Tailwind classes but add `style={{ backgroundColor: 'var(--theme-primary)' }}`
- Page header accent borders: `border-blue-600` → `style={{ borderColor: 'var(--theme-primary)' }}`

**Scope limit:** Only replace colors that are semantically "brand" colors. Do not
touch: error states (red), success states (green), warning states (amber), gray text,
gray borders, white backgrounds. Aim for 15-20 CSS changes maximum.

### 2.7 — Demo auto-auth endpoint

**File:** `$ROOT/apps/web/src/app/api/v1/auth/demo-login/route.ts`

**`GET /api/v1/auth/demo-login?token=...`**

1. Extract `token` from query params
2. Query `demo_instances` by `demoId` from decoded token (before HMAC verification — just to get the secret)
3. Call `validateDemoToken(token, instance.auth_token_secret)`
4. If invalid/expired → redirect to `/auth/login` with error
5. Determine which user: `role === 'resident'` → `demo_resident_user_id`, `role === 'board'` → `demo_board_user_id`
6. Create Supabase session via admin API: `supabase.auth.admin.generateLink({ type: 'magiclink', email: demoUserEmail })`
7. Set session cookie
8. Redirect to: `role === 'resident'` → `/mobile?communityId={communityId}`, `role === 'board'` → `/dashboard?communityId={communityId}`

**This endpoint is token-authenticated, not session-authenticated.** Add it to the
token-auth allowlist in `apps/web/src/middleware.ts` (same pattern as `/api/v1/auth/signup`).

### 2.8 — Mobile screen polish

**Files to modify:** All files in `$ROOT/apps/web/src/app/mobile/*/page.tsx`

For each mobile page, add a themed header:

```tsx
<header
  className="mobile-page-header"
  style={{ backgroundColor: 'var(--theme-primary)', color: '#ffffff' }}
>
  {/* Community logo (if available) + community name */}
</header>
```

Ensure seeded demo data (from `seedCommunity()`) produces enough content:
- Documents page: at least 3 documents across 2+ categories
- Meetings page: at least 1 upcoming meeting
- Announcements page: at least 3 announcements
- Maintenance page: at least 2 requests (for apartment type)

### 2.9 — Split-screen preview

**File:** `$ROOT/apps/admin/src/app/demo/[id]/preview/page.tsx`

**Layout:** CSS Grid, two columns: `grid-template-columns: 1fr 430px`

- **Left column:** `<iframe>` loading `https://{slug}.getpropertypro.com/api/v1/auth/demo-login?token={boardToken}`.
  After auto-auth, the iframe shows the board member dashboard. Full height, border.
- **Right column:** `<PhoneFrame src="https://{slug}.getpropertypro.com/api/v1/auth/demo-login?token={residentToken}" />`
  (imported from `@propertypro/ui`). After auto-auth, shows the mobile resident experience.

**Token generation:** On page load, server component queries `demo_instances`, generates
fresh tokens (1-hour TTL for board, 1-hour TTL for resident) using the stored HMAC secret.

**PhoneFrame move:** Before this step, `PhoneFrame.tsx` must be in `packages/ui`.
Move `$ROOT/apps/web/src/components/mobile/PhoneFrame.tsx` → `$ROOT/packages/ui/src/components/PhoneFrame.tsx`.
Simplify its props to accept only `src: string`. Update `apps/web` to import from `@propertypro/ui`.

### 2.10 — Full-screen mobile preview

**File:** `$ROOT/apps/admin/src/app/demo/[id]/mobile/page.tsx`

Dark background (`bg-gray-950`), centered `<PhoneFrame>` with resident auto-auth token.
No admin chrome. This page IS the shareable link for prospects.

### 2.11 — Demo list

**File:** `$ROOT/apps/admin/src/app/demo/page.tsx`

**Query:** `SELECT * FROM demo_instances ORDER BY created_at DESC` via `createAdminClient()`.

**Table columns:**
- Prospect name
- Template type (badge)
- Created date
- Age (computed: days since `created_at`)
- Age badge: green (<10 days), yellow (10-19), orange (20-29), red (30+)
- Split-screen preview link (icon button → `/demo/[id]/preview`)
- Mobile preview link (icon button → `/demo/[id]/mobile`)
- CRM link (external link icon, if `external_crm_url` is set)
- Notes (truncated, expandable)
- **Delete button:** Hard-deletes `demo_instances` row, linked `communities` row (cascade),
  and deactivates demo users in Supabase Auth. Requires confirmation dialog.

---

<a id="phase-3"></a>
## 11. Phase 3 — Public Site Builder

Goal: Each client has a public site at `[slug].getpropertypro.com`.

### 3.1 — Site blocks table

**Migration file:** `$ROOT/packages/db/migrations/0033_create_site_blocks.sql`

```sql
CREATE TABLE site_blocks (
  id bigserial PRIMARY KEY,
  community_id bigint NOT NULL REFERENCES communities ON DELETE CASCADE,
  block_order int NOT NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image'
  )),
  content jsonb NOT NULL DEFAULT '{}',
  is_draft boolean NOT NULL DEFAULT true,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, block_order, is_draft)
);

CREATE INDEX idx_site_blocks_community_order ON site_blocks(community_id, block_order);
CREATE INDEX idx_site_blocks_community_draft ON site_blocks(community_id, is_draft);

-- Standard community-scoped RLS
ALTER TABLE site_blocks ENABLE ROW LEVEL SECURITY;

-- Policy: service_role has full access
CREATE POLICY site_blocks_service_role ON site_blocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Policy: authenticated users can read published blocks for their community
CREATE POLICY site_blocks_read_published ON site_blocks
  FOR SELECT TO authenticated
  USING (is_draft = false AND community_id = current_setting('app.community_id')::bigint);

-- Policy: anon can read published blocks (for public site rendering)
CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (is_draft = false);
```

**Also add to communities:**
```sql
ALTER TABLE communities ADD COLUMN custom_domain text;
ALTER TABLE communities ADD COLUMN site_published_at timestamptz;
```

**Drizzle schema:** `$ROOT/packages/db/src/schema/site-blocks.ts`

**Block type definitions:** `$ROOT/packages/shared/src/site-blocks.ts`
(Exact shapes defined in [Reference: Block Type Content Schemas](#reference-block-type-content-schemas))

### 3.2 — Image upload endpoint for admin

**File:** `$ROOT/apps/admin/src/app/api/admin/upload/route.ts`

**`POST /api/admin/upload`** (protected by `requirePlatformAdmin`):

Request: `multipart/form-data` with `file` field and `communityId` query param.

Implementation:
1. Validate file: max 5MB, MIME type in `['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']`
2. Magic-byte validation (same pattern as `BrandingForm.tsx`)
3. Upload to Supabase Storage: `community-assets/{communityId}/site/{randomUUID}.{ext}`
4. Return: `{ url: publicUrl, path: storagePath }`

### 3.3 — Public site renderer

**New route group:** `$ROOT/apps/web/src/app/(public-site)/[slug]/page.tsx`

**How it works with existing middleware:**

The middleware already resolves community by subdomain and sets `x-community-id` and
`x-tenant-slug` headers (after anti-spoofing strips any inbound values). For the public
site route, the middleware ALSO already skips auth for routes that aren't in
`PROTECTED_PATH_PREFIXES`. Since `(public-site)` is a route group (parentheses), the
actual URL path is `/{slug}` — which is NOT in the protected list.

**However:** There's a routing conflict. `/{slug}` could match other top-level routes.
Solution: The public site should be rendered at the **root** `/` for subdomain requests.

**Revised approach:**
- `$ROOT/apps/web/src/app/(public-site)/page.tsx` — renders public site for the
  current subdomain (community resolved by middleware from `Host` header)
- Middleware change: When the request is for `/` on a community subdomain AND the user
  is NOT authenticated, serve the public site page. When authenticated, serve the
  dashboard (existing behavior).
- Read `x-tenant-slug` header to determine which community's site to render
- Query `site_blocks WHERE community_id = ? AND is_draft = false ORDER BY block_order`
- Apply theme via `resolveTheme()` + `toCssVars()` + `toFontLinks()`
- Render each block using a component map:

```typescript
const BLOCK_RENDERERS: Record<string, React.ComponentType<{ content: unknown; theme: CommunityTheme }>> = {
  hero: HeroBlock,
  announcements: AnnouncementsBlock,
  documents: DocumentsBlock,
  meetings: MeetingsBlock,
  contact: ContactBlock,
  text: TextBlock,
  image: ImageBlock,
};
```

**Block components directory:** `$ROOT/apps/web/src/components/public-site/blocks/`

**Dynamic data blocks:**
- `AnnouncementsBlock` — queries `announcements` for that community, limited to `content.limit`
- `DocumentsBlock` — queries `documents`, filtered by `content.categoryIds` if non-empty
- `MeetingsBlock` — queries `meetings` where `date >= now()`

These use `createScopedClient()` with the community's ID set in middleware context.

### 3.4 — Site Builder UI in `apps/admin`

**File:** `$ROOT/apps/admin/src/app/clients/[id]/site-builder/page.tsx`
(Or as a tab within the client workspace — implementation choice for the agent)

**Layout:** Two columns. Left: block editor (60% width). Right: iframe preview (40% width).

**Block editor (left):**
- Stack of block cards, each showing: block type icon, title/preview, drag handle, expand/collapse toggle, delete button
- Drag-and-drop via `@dnd-kit/core` + `@dnd-kit/sortable` — install as dependencies of `apps/admin`
- Expanded block shows inline editing fields specific to block type (text inputs, dropdowns, etc.)
- "Add Block" dropdown at bottom with all 7 block types
- Each edit triggers `PUT /api/admin/site-blocks/{blockId}` debounced 500ms

**Preview (right):**
- `<iframe>` loading the public site URL for that community's subdomain
- Scaled to 70% via `transform: scale(0.7)` with `transform-origin: top left`
- After each successful save, send `postMessage('reload')` to the iframe
- Iframe listens for the message and calls `window.location.reload()`

**API routes in `apps/admin`:**
- `GET /api/admin/site-blocks?communityId=X` — returns all blocks (draft and published) for a community
- `POST /api/admin/site-blocks` — create a new block
- `PUT /api/admin/site-blocks/[id]` — update a block's content or order
- `DELETE /api/admin/site-blocks/[id]` — delete a block
- `POST /api/admin/site-blocks/publish?communityId=X` — publish: for each draft block, set `is_draft = false`, stamp `published_at`. Update `communities.site_published_at`
- `POST /api/admin/site-blocks/discard?communityId=X` — discard all draft blocks

All protected by `requirePlatformAdmin`.

### 3.5 — Testing

**Test files:**
- `$ROOT/apps/web/__tests__/public-site/block-rendering.test.tsx` — render each block type with mock content, verify HTML output
- `$ROOT/apps/web/__tests__/public-site/community-resolution.test.ts` — verify slug resolution from host header
- `$ROOT/apps/admin/__tests__/site-builder/block-crud.test.ts` — API route CRUD operations
- `$ROOT/apps/admin/__tests__/site-builder/publish-flow.test.ts` — draft → publish → discard lifecycle

### 3.6 — Domain configuration

Public sites served at `[slug].getpropertypro.com`. This uses the existing subdomain
routing in middleware. No new Vercel projects, no wildcard DNS changes needed.

The `custom_domain` column on `communities` exists for a future paid tier. Not implemented.

---

<a id="phase-4"></a>
## 12. Phase 4 — Sales Pipeline (Lightweight)

Since `external_crm_url` and `prospect_notes` are included in the `demo_instances`
table created in Phase 2.1, and the Stale Demos card is built in Phase 1.5, there
is no additional work for Phase 4. It's absorbed into earlier phases.

---

<a id="phase-dependencies"></a>
## 13. Phase Dependencies

```
Phase 0.1-0.7 (stabilize) → sequential, must complete before Phase 1
Phase 0.8 (seed refactor) → must complete before Phase 2.3
Phase 0.9 (Sentry wiring) → must complete before Phase 1.8 (production deploy)

Phase 1 (admin scaffold) → requires Phase 0

Phase 2 (demo generator)
  → requires Phase 1 (admin shell)
  → requires Phase 0.4 (theme package)
  → requires Phase 0.8 (parameterized seed)

Phase 3 (public sites + builder)
  → requires Phase 2.5 (theme wiring in apps/web, proves the pattern)
  → independent of Phase 2 demo features
```

**For two engineers:**
- Engineer A: Phase 0 → Phase 1 → Phase 2
- Engineer B: joins after Phase 1 is done → Phase 3 (in parallel with Engineer A on Phase 2)

---

<a id="testing-strategy"></a>
## 14. Testing Strategy

| Phase | Test deliverables |
|-------|-------------------|
| 0 | `packages/theme` unit tests (7 cases minimum). CSS variable grep CI check. Seed refactor regression test (`pnpm seed:demo` produces same result). CI guard multi-app refactor tests. RLS policy CI check. |
| 1 | `apps/admin` Vitest config. Middleware auth tests (6 cases). Portfolio view integration test. Automated cross-subdomain session test. Stale demos card test. |
| 2 | Demo creation API integration test. HMAC token generation + validation unit tests. Theme injection snapshot tests for mobile layout. Theme injection snapshot tests for authenticated layout. Demo auto-auth endpoint test. |
| 3 | Block rendering unit tests (7 types). Community resolution test. Public site auth-split test (unauthed → public site, authed → dashboard). Block CRUD API tests. Publish/discard lifecycle test. |

---

<a id="indexes"></a>
## 15. Indexes

All indexes are included in their respective migration files (not separate).

```sql
-- demo_instances (Phase 2.1)
CREATE INDEX idx_demo_instances_slug ON demo_instances(slug);

-- site_blocks (Phase 3.1)
CREATE INDEX idx_site_blocks_community_order ON site_blocks(community_id, block_order);
CREATE INDEX idx_site_blocks_community_draft ON site_blocks(community_id, is_draft);
```

---

<a id="timeline"></a>
## 16. Timeline

Single senior full-stack engineer:

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 0 | 2-3 weeks | Week 3 |
| Phase 1 | 2 weeks | Week 5 |
| Phase 2 | 3-4 weeks | Week 9 |
| Phase 3 | 3-4 weeks | Week 13 |
| **Total** | **10-13 weeks** | |

Two engineers (after Phase 1):

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Phase 0 | 2-3 weeks | Week 3 |
| Phase 1 | 2 weeks | Week 5 |
| Phase 2 + Phase 3 (parallel) | 3-4 weeks | Week 9 |
| **Total** | **7-9 weeks** | |

---

<a id="out-of-scope"></a>
## 17. Out of Scope

Do NOT implement any of the following. They are explicitly excluded:

- React Native app
- AI/ML agent code or automation
- Automated email sending or CAN-SPAM compliance
- Stripe pricing tier changes
- Custom domain configuration (column exists, feature not built)
- Rich text editor in site builder
- Bespoke CRM (contacts, pipeline kanban, sequences, agent tasks)
- PM console as a separate app
- `apps/sites` as a separate Next.js app
- `apps/pm` as a separate Next.js app
- Any table not specified in this document
- Any API route not specified in this document

---

<a id="changelog"></a>
## 18. Changelog from v3 → v4 → v4.1

| Item | v3 | v4.1 | Reason |
|------|----|----|--------|
| App count | 4 | 2 | `apps/sites` → route group, `apps/pm` → deferred |
| CRM | 6 tables, kanban, sequences, agent infra | 2 fields on demo_instances | Premature for zero-customer product |
| PM scaffold | New Next.js app | Deferred entirely | Existing PM routes work |
| Demo lifecycle | Auto-expiry cron | Manual deletion + stale demos dashboard card | Owner preference |
| Demo schema | Single demo user | Two demo users (resident + board member) | Split-screen preview needs both roles |
| Public site URL | `*.sites.getpropertypro.com` | `[slug].getpropertypro.com` (auth-split) | Same subdomain, fewer DNS records |
| Admin DB access | Unspecified | `createAdminClient()` (service_role) | Consistent with existing patterns |
| Site blocks storage | JSONB on communities | `site_blocks` table | Granular saves, queryability |
| Branding defaults | Unspecified | Exact hex values from landing page | Agent needs concrete values |
| Font allowlist | "~30 fonts" | 25 named fonts | Agent needs exact list |
| Block content shapes | TypeScript union in plan text | Full interface definitions with max lengths | Agent needs exact schema |
| Seed refactor | Not mentioned | Full spec with interface and acceptance criteria | Demo generator depends on it |
| Theme defaults | Unspecified | `#2563EB`, `#6B7280`, `#DBEAFE`, `Inter` | Derived from landing page audit |
| Sentry | "Add Sentry" | "Wire into admin following existing web pattern" | Already installed in apps/web |
| CSS var references | "Find and replace" | Exactly 2 references in mobile.css, lines 58-59 | Verified by codebase search |
