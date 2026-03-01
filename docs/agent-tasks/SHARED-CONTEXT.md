# PropertyPro — Shared Agent Context

> **Every agent task file imports this context.** Read this file completely before
> starting any task. It contains locked decisions, exact values, and conventions
> that every task depends on.

## Project Facts

- **Monorepo root:** The directory containing `pnpm-workspace.yaml`
- **Framework:** Next.js 15.1.0, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Database:** PostgreSQL via Supabase, Drizzle ORM
- **Auth:** Supabase Auth (email + password)
- **Test framework:** Vitest 3.0.0
- **Node version:** 20 (locked in `.nvmrc`)
- **Package manager:** pnpm 10.28.0
- **Build orchestrator:** Turbo 2.3.0
- **Current table count:** 28 (post-Phase 4 / Gate 4)
- **Current test count:** 550+ unit tests, 10+ integration suites

## Architecture (Locked)

**Two apps only:**
- `apps/web` — port 3000, community-facing platform
- `apps/admin` — port 3001, platform administration console

No `apps/sites`. No `apps/pm`. Public sites are a route group in `apps/web`.
PM routes stay where they are in `apps/web`.

## Conventions

### Migration numbering
Migrations live in `packages/db/migrations/`. Files are numbered `NNNN_name.sql`.
Current highest: `0028`. New migrations start at `0029` and increment sequentially.
**If your task creates a migration, check the current highest number first and use the next one.**

### Drizzle schema files
Each table gets its own file in `packages/db/src/schema/`. Export the table from
`packages/db/src/schema/index.ts`.

### DB access patterns
- **Community-scoped queries:** `createScopedClient()` from `@propertypro/db`
- **Cross-community queries (allowlisted):** `createUnscopedClient()` from `@propertypro/db/unsafe`
- **Platform admin queries:** `createAdminClient()` from `@propertypro/db/supabase/admin`
- **Drizzle operators:** Import from `@propertypro/db/filters` (e.g., `eq`, `and`, `or`)
- **NEVER import directly from `drizzle-orm`** — the CI guard will catch it

### RLS policy requirement
Every `CREATE TABLE` migration must include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
and explicit policy statements in the same file. No exceptions.

### Test file locations
- `apps/web/__tests__/` — web app tests
- `apps/admin/__tests__/` — admin app tests
- `packages/*/__ tests__/` — package tests

### CSS variable names (locked, never changed)
```
--theme-primary      (maps to primaryColor)
--theme-secondary    (maps to secondaryColor)
--theme-accent       (maps to accentColor)
--theme-font-heading (maps to fontHeading)
--theme-font-body    (maps to fontBody)
--theme-logo-url     (maps to logoUrl)
--theme-community-name (maps to communityName)
```

These replace the old `--brand-primary` and `--brand-secondary` variables.

## Default Theme Values

Derived from the current landing page. Used when a community has no custom branding.

```typescript
{
  primaryColor: '#2563EB',       // blue-600
  secondaryColor: '#6B7280',     // gray-500
  accentColor: '#DBEAFE',        // blue-100
  fontHeading: 'Inter',
  fontBody: 'Inter',
  logoUrl: null,
  communityName: '',             // populated from communities.name
  communityType: 'condo_718',    // populated from communities.community_type
}
```

## Allowed Fonts (exact list, 25 families)

```typescript
const ALLOWED_FONTS = [
  'Inter', 'Open Sans', 'Lato', 'Roboto', 'Source Sans 3',
  'Nunito', 'Nunito Sans', 'Poppins', 'Raleway', 'Montserrat',
  'Work Sans', 'DM Sans', 'Plus Jakarta Sans', 'Outfit',
  'Barlow', 'Manrope', 'Urbanist', 'Figtree',
  'Merriweather', 'Lora', 'Playfair Display', 'Source Serif 4',
  'Libre Baskerville', 'Crimson Text', 'EB Garamond',
] as const;
```

## Auth Boundary Model

| Surface | Session? | Authorization | DB access |
|---------|----------|---------------|-----------|
| `apps/web` public/marketing | No | None | None |
| `apps/web` public site (unauthed subdomain) | No | None | Read-only scoped |
| `apps/web` authenticated portal | Yes | `user_roles` row | `createScopedClient()` |
| `apps/web` PM routes | Yes | `property_manager_admin` role | Allowlisted unsafe |
| `apps/web` demo auto-auth | No (token) | HMAC validation | Service role for session |
| `apps/admin` all routes | Yes | `platform_admin_users` row | `createAdminClient()` |

**Critical:** Every API route in `apps/admin` must call `requirePlatformAdmin(request)`
as its first line, even though middleware also checks. Defense in depth.

## CommunityBranding Extended Interface

After Phase 0.2, the interface is:
```typescript
export interface CommunityBranding {
  primaryColor?: string;      // Hex #RRGGBB
  secondaryColor?: string;    // Hex #RRGGBB
  accentColor?: string;       // Hex #RRGGBB (NEW)
  fontHeading?: string;       // Must be in ALLOWED_FONTS (NEW)
  fontBody?: string;          // Must be in ALLOWED_FONTS (NEW)
  logoPath?: string;          // Supabase Storage path
}
```

## Block Type Content Schemas (for Phase 3)

```typescript
interface HeroBlockContent {
  headline: string;                    // max 120 chars
  subheadline: string;                 // max 300 chars
  ctaLabel: string;                    // max 40 chars
  ctaHref: string;
  backgroundImageUrl?: string;
}

interface AnnouncementsBlockContent {
  title: string;                       // default "Announcements"
  limit: number;                       // 1-10, default 5
}

interface DocumentsBlockContent {
  title: string;                       // default "Documents"
  categoryIds: number[];               // empty = all
}

interface MeetingsBlockContent {
  title: string;                       // default "Upcoming Meetings"
}

interface ContactBlockContent {
  boardEmail: string;
  managementCompany?: string;
  phone?: string;
  address?: string;
}

interface TextBlockContent {
  body: string;                        // plain text or markdown, max 5000 chars
}

interface ImageBlockContent {
  url: string;
  alt: string;                         // max 200 chars
  caption?: string;                    // max 300 chars
}
```

## Demo User Conventions

- Resident email: `demo-resident@{slug}.propertyprofl.com`
- Board email: `demo-board@{slug}.propertyprofl.com`
- Passwords: random 32-char string, never stored or shown
- Resident gets `owner` role, board gets `board_member` role
- Auth via HMAC-signed tokens (SHA-256), not passwords
- Token TTL: 1 hour for shareable links, 24 hours for admin preview
