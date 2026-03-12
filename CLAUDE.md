# PropertyPro Florida

Compliance and community management platform for Florida condominium associations.

## Project Overview

PropertyPro is a demo platform for Florida condo/HOA compliance with Florida Statute §718.111(12)(g). The platform helps associations meet statutory requirements for document posting, meeting notices, and owner portal access.

**Status:** Phase 2 Complete (16/16 base tasks, Gate 3 closed 2026-02-21). Phase 3 kickoff next.

## Tech Stack

### Web Application
- **Framework:** Next.js 15.1.0 (App Router) with TypeScript / React 19
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **State Management:** TanStack Query (React Query)

### Mobile
- Mobile-optimized web routes at `/mobile/` (Next.js pages, not a native app)
- No React Native/Expo app exists yet

### Backend
- **Runtime:** Node.js
- **Database:** PostgreSQL via Supabase
- **ORM:** Drizzle ORM
- **Authentication:** Supabase Auth (email + password)
- **File Storage:** Supabase Storage
- **Email:** Resend

### Infrastructure
- **Web Hosting:** Vercel
- **Database:** Supabase (managed Postgres)

## Project Structure

```
propertyprofl/
├── apps/
│   └── web/                    # Next.js web application
│       └── src/
│           ├── app/
│           │   ├── (auth)/           # Auth routes (login, signup, verify)
│           │   ├── (authenticated)/  # Protected routes (dashboard, settings)
│           │   ├── (marketing)/      # Marketing/landing pages
│           │   ├── (public)/         # Public website routes
│           │   ├── api/              # API routes
│           │   └── mobile/           # Mobile web routes
│           ├── components/
│           ├── hooks/
│           ├── lib/
│           │   ├── auth/             # Supabase auth utilities
│           │   ├── services/         # Business logic services
│           │   ├── middleware/        # Middleware utilities
│           │   └── tenant/           # Multi-tenancy resolution
│           └── middleware.ts          # Request middleware
├── packages/
│   ├── db/                     # Database layer (Drizzle ORM)
│   │   ├── src/
│   │   │   ├── schema/         # Drizzle schema definitions (24 tables)
│   │   │   ├── supabase/       # Supabase client factories (client, server, admin, middleware, storage)
│   │   │   ├── queries/        # Query builders
│   │   │   ├── scoped-client.ts  # Tenant-scoped query builder (primary entry point)
│   │   │   ├── filters.ts      # Drizzle operator facade (eq, and, or, etc.)
│   │   │   └── unsafe.ts       # Allowlisted cross-tenant imports
│   │   ├── migrations/         # SQL migrations
│   │   └── __tests__/          # DB integration tests
│   ├── email/                  # Email templates and service
│   ├── shared/                 # Shared types and constants
│   └── ui/                     # Shared UI components
├── scripts/
│   ├── seed-demo.ts
│   └── verify-*.ts             # Verification scripts
└── docs/                       # Documentation
```

## Key Concepts

### Multi-Tenancy
- Single database with `association_id` foreign key isolation
- Subdomains per association: `[subdomain].propertyprofl.com`
- Property manager dashboard: `pm.propertyprofl.com`

### User Roles
- `owner` - Unit owner with portal access
- `tenant` - Resident (renter) in condos/HOAs/apartments
- `board_member` - Board member with admin access
- `board_president` - Board president
- `cam` - Community Association Manager
- `site_manager` - Apartment on-site manager (apartment-only role)
- `property_manager_admin` - PM company admin

### Florida Compliance Requirements
- **§718** (Condos): Associations with 25+ units must have a website
- **§720** (HOAs): Associations with 100+ parcels must have a website
- **30-day rule:** Documents must be posted within 30 days of creation
- **Meeting notices:** 14 days for owner meetings, 48 hours for board meetings

## API Patterns

```
# Core resources (tenant-scoped via middleware, not URL)
GET/POST /api/v1/documents
GET/POST /api/v1/meetings
GET/POST /api/v1/announcements
GET      /api/v1/compliance
GET/POST /api/v1/leases
GET/POST /api/v1/residents

# Documents extras
GET      /api/v1/documents/:id/download
GET/POST /api/v1/documents/:id/versions
GET      /api/v1/documents/search
GET      /api/v1/document-categories

# Auth & onboarding
POST     /api/v1/auth/signup
POST     /api/v1/invitations
POST     /api/v1/onboarding/condo
POST     /api/v1/onboarding/apartment

# PM dashboard
GET      /api/v1/pm/communities
GET/POST /api/v1/pm/branding

# Internal / webhooks
POST     /api/v1/webhooks/stripe
POST     /api/v1/internal/provision
POST     /api/v1/internal/notification-digests/process
POST     /api/v1/internal/payment-reminders

# Uploads & preferences
POST     /api/v1/upload
GET/PUT  /api/v1/notification-preferences
POST     /api/v1/import-residents
```

## Demo Data

Three demo communities are seeded via `pnpm seed:demo`:
- **Sunset Condos** (`sunset-condos`) — Miami, FL (condo_718)
- **Palm Shores HOA** (`palm-shores-hoa`) — Fort Lauderdale, FL (hoa_720)
- **Sunset Ridge Apartments** (`sunset-ridge-apartments`) — Tampa, FL (apartment)

Each is pre-populated with documents, meetings, announcements, and residents.

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Type-check all packages
pnpm typecheck

# Lint code + run DB access guard
pnpm lint

# Run database migrations
pnpm --filter @propertypro/db db:migrate

# Seed demo data
pnpm seed:demo

# Verify seed integrity
pnpm seed:verify

# Build for production
pnpm build

# Run unit tests
pnpm test

# Run integration tests (requires DATABASE_URL via .env.local loaded by helper)
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts

# Run full integration preflight (migrations + seed verify + tests)
scripts/with-env-local.sh pnpm test:integration:preflight

# Performance budget check
pnpm perf:check

# Clean build outputs
pnpm clean
```

## Environment Setup

Environment variables are stored in the root `.env.local` file. Run the setup script after cloning:

```bash
# First-time setup (creates necessary symlinks)
./scripts/setup.sh

# Install dependencies
pnpm install
```

The setup script creates a symlink at `apps/web/.env.local` pointing to the root env file, since Next.js only loads `.env*` from its own directory.

## Gotchas & Architecture Notes

### Scoped Database Access
- All tenant queries MUST go through `createScopedClient()` from `@propertypro/db`
- Direct Drizzle imports are blocked; use `@propertypro/db/filters` for operators (`eq`, `and`, `or`, `gte`, etc.)
- CI guard (`pnpm guard:db-access`) scans for unauthorized imports — only 8 allowlisted files may bypass scoping
- The `communities` table is the root tenant table and cannot be scoped by `community_id`

### Middleware
- `apps/web/src/middleware.ts` handles: Supabase session refresh, tenant resolution, auth redirects, email verification checks, request tracing (`X-Request-ID`), rate limiting, and header sanitization
- Protected paths: `/dashboard`, `/settings`, `/documents`, `/maintenance`, `/api/v1`, etc.
- Token-authenticated routes (no session): `/api/v1/invitations`, `/api/v1/auth/signup`, `/api/v1/webhooks/stripe`, cron endpoints

### Node Version
- `.nvmrc` locks to Node 20

### Turbo
- Build orchestration via Turbo (`turbo.json`) — `pnpm build`/`dev`/`lint` are turbo-orchestrated

## Agent Testing — IMPORTANT: Read This Before Testing Any Authenticated Feature

**DO NOT read `.env.local` or try to extract credentials.** Use the `/dev/agent-login` endpoint instead.

### How to Log In as a Demo User

The dev server exposes `/dev/agent-login?as=<role>` which authenticates the browser session as a demo user without needing any passwords or env vars. This is the **only** way agents should authenticate.

**Step 1 — Start the dev server** (if not already running):
```
preview_start("web")
```

**Step 2 — Navigate to the agent-login endpoint:**
```
preview_eval: window.location.href = '/dev/agent-login?as=owner'
```

**Step 3 — Verify the login worked:**
```
preview_snapshot()
```

### Available Roles

| `?as=` value | Role | Email | Community |
|---|---|---|---|
| `owner` | Unit Owner | owner.one@sunset.local | Sunset Condos |
| `tenant` | Tenant/Renter | tenant.one@sunset.local | Sunset Condos |
| `board_president` | Board President | board.president@sunset.local | Sunset Condos |
| `board_member` | Board Member | board.member@sunset.local | Sunset Condos |
| `cam` | Community Assoc. Manager | cam.one@sunset.local | Sunset Condos |
| `pm_admin` | PM Company Admin | pm.admin@sunset.local | Sunset Condos |
| `site_manager` | Site Manager | site.manager@sunsetridge.local | Sunset Ridge Apartments |

### Switching Roles Mid-Session

Just navigate to the endpoint again with a different role:
```
preview_eval: window.location.href = '/dev/agent-login?as=cam'
```

### Making Authenticated API Calls

After logging in, the session cookies are set. Use `fetch()` in the preview browser:
```javascript
preview_eval: fetch('/api/v1/documents').then(r => r.json()).then(d => JSON.stringify(d, null, 2))
```

### JSON Mode (for programmatic use)

Add `Accept: application/json` header to get a JSON response instead of a redirect:
```javascript
preview_eval: fetch('/dev/agent-login?as=owner', { headers: { 'Accept': 'application/json' } }).then(r => r.json())
// Returns: { ok: true, user: {...}, community: {...}, portal: "..." }
```

## Documentation

See `/docs` for detailed documentation:
- `00-DEMO-PLATFORM-TECH-SPEC.md` - Full technical specification
- `01-DOCUMENT-CONTRADICTIONS-ANALYSIS.md` - Analysis notes
- `02-NEXT-STEPS-TASK-LIST.md` - Development tasks
- `03-08` - Sales and market documentation
- `adr/` - Architecture Decision Records
- `audits/` - Gate verification evidence
- `design-system/` - Design system documentation
- `spec-bundle/` - Specification bundles
