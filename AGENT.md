# Agent Instructions for PropertyPro

This file contains critical instructions for AI coding agents (Claude Code, Codex, etc.) working on PropertyPro.

## Authentication — How to Log In

**DO NOT read `.env.local`, extract passwords, or use `signInWithPassword`.** Instead, use the zero-secrets agent login endpoint.

### `/dev/agent-login?as=<role>`

This endpoint authenticates the browser as a demo user. It works by generating a magic link server-side and verifying it immediately — no passwords or env vars needed from the agent.

**Available roles:**

| `?as=` value       | Role                     | Demo User                          | Default Community          |
| ------------------- | ------------------------ | ---------------------------------- | -------------------------- |
| `owner`             | Unit Owner               | owner.one@sunset.local             | Sunset Condos              |
| `tenant`            | Tenant / Renter          | tenant.one@sunset.local            | Sunset Condos              |
| `board_president`   | Board President          | board.president@sunset.local       | Sunset Condos              |
| `board_member`      | Board Member             | board.member@sunset.local          | Sunset Condos              |
| `cam`               | Community Assoc. Manager | cam.one@sunset.local               | Sunset Condos              |
| `pm_admin`          | PM Company Admin         | pm.admin@sunset.local              | Sunset Condos              |
| `site_manager`      | Site Manager             | site.manager@sunsetridge.local     | Sunset Ridge Apartments    |

### Usage with Preview Tools

```bash
# 1. Start the dev server
preview_start("web")

# 2. Log in as a specific role
preview_eval: window.location.href = '/dev/agent-login?as=owner'

# 3. Verify login succeeded
preview_snapshot()

# 4. Switch to a different role at any time
preview_eval: window.location.href = '/dev/agent-login?as=cam'

# 5. Make authenticated API calls
preview_eval: fetch('/api/v1/documents').then(r => r.json()).then(d => JSON.stringify(d, null, 2))
```

### Usage with curl / JSON Mode

Add `Accept: application/json` to get JSON instead of a redirect:

```bash
curl -c cookies.txt 'http://localhost:3000/dev/agent-login?as=owner' -H 'Accept: application/json'
# Returns: { "ok": true, "user": {...}, "community": {...}, "portal": "..." }
```

### Important Notes

- This endpoint only works in development (`NODE_ENV !== 'production'`). It returns 404 in production.
- Session cookies are set on the response, so subsequent requests in the same browser/cookie jar are authenticated.
- The demo users are created by `pnpm seed:demo`. If login fails, try re-seeding.
- `site_manager` is routed to Sunset Ridge Apartments; all other roles go to Sunset Condos.

## Project Basics

- **Monorepo:** pnpm workspaces with Turbo
- **Stack:** Next.js 15 (App Router), Supabase (Postgres + Auth), Drizzle ORM, Tailwind, shadcn/ui
- **Dev server:** `pnpm dev` (or `preview_start("web")` via preview tools)
- **Typecheck:** `pnpm typecheck`
- **Lint:** `pnpm lint`
- **Tests:** `pnpm test`
- **Seed demo data:** `pnpm seed:demo`

## Database Access

- All tenant-scoped queries MUST use `createScopedClient()` from `@propertypro/db`
- Direct Drizzle imports are blocked by a CI guard — use `@propertypro/db/filters` for operators
- **No PostgREST GRANT statements exist** — `supabase.from('table')` queries will fail with `42501`. Always use Drizzle.

## Key Architecture

- Multi-tenant: single DB with `community_id` isolation
- Subdomains per association, resolved by middleware into `x-community-id` header
- RBAC matrix in `packages/shared/src/rbac-matrix.ts`
- Feature flags by community type in `packages/shared/src/features/community-features.ts`

See `CLAUDE.md` for the full project reference.
