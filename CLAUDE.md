# PropertyPro Florida

Compliance and community management platform for Florida condominium associations (§718.111(12)(g)).

**Status:** Phase 2 Complete. Phase 3 kickoff next.

## Tech Stack

- **Framework:** Next.js 15.1.0 (App Router) / TypeScript / React 19
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
packages/db/            # Drizzle ORM schema, migrations, scoped-client, queries
packages/email/         # Email templates and service
packages/shared/        # Shared types and constants
packages/ui/            # Shared UI components
scripts/                # Seed, verify, and utility scripts
docs/                   # Specs, ADRs, audits, design system
```

## Key Concepts

**Multi-Tenancy:** Single DB with `community_id` FK isolation. Subdomains per association (`[slug].propertyprofl.com`). PM dashboard at `pm.propertyprofl.com`.

**User Roles:** `owner`, `tenant`, `board_member`, `board_president`, `cam`, `site_manager`, `property_manager_admin`

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

# Integration tests (requires DATABASE_URL)
scripts/with-env-local.sh pnpm exec vitest run --config apps/web/vitest.integration.config.ts

# Full integration preflight
scripts/with-env-local.sh pnpm test:integration:preflight
```

**CI:** 7 parallel jobs per PR — lint (includes DB access guard), typecheck, unit tests, no-mock-guard, migration-ordering, perf-check, then build.

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
- `api-patterns.md` — Route structure, required patterns, middleware, route catalog
- `agent-testing.md` — How to authenticate as demo users for testing
- `design.md` — UI/UX design system rules, component patterns, accessibility, quality gate

## Documentation

- `DESIGN.md` — Comprehensive UI/UX design system reference (tokens, components, UX patterns, accessibility)
- `AGENTS.md` — Agent safety guide: tenant isolation, migration gotchas, CI gates
- `docs/00-DEMO-PLATFORM-TECH-SPEC.md` — Full technical specification
- `docs/adr/` — Architecture Decision Records
- `docs/audits/` — Gate verification evidence
- `docs/design-system/` — Design system documentation (V2 spec, patterns, constants)
