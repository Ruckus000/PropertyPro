# PropertyPro Florida

Compliance and community management platform for Florida condominium associations.

## Overview

PropertyPro helps condo associations, HOAs, and apartments meet Florida statutory requirements (§718 / §720) for document posting, meeting notices, and owner portal access.

## Apps

| App | Port | Domain | Description |
|-----|------|--------|-------------|
| `apps/web` | 3000 | `[slug].propertyprofl.com` | Community portal (resident, board, PM) |
| `apps/admin` | 3001 | `admin.propertyprofl.com` | Operator console (platform admin only) |

## Local Development

### First-time setup

```bash
# 1. Copy environment variables
cp .env.example .env.local
# Fill in your Supabase, Stripe, Resend, and Sentry values

# 2. Run setup (creates .env.local symlinks for each app)
./scripts/setup.sh

# 3. Install dependencies
pnpm install

# 4. Run database migrations
pnpm --filter @propertypro/db db:migrate

# 5. Seed demo data
pnpm seed:demo
```

### Running the apps

```bash
# Run everything (all apps + packages watch mode)
pnpm dev

# Run a single app
pnpm --filter @propertypro/web dev      # web on :3000
pnpm --filter @propertypro/admin dev    # admin on :3001
```

### Admin access

After running migrations, insert your Supabase auth UUID into `platform_admin_users`:

```sql
INSERT INTO platform_admin_users (user_id) VALUES ('YOUR-SUPABASE-AUTH-UUID-HERE');
```

Then log in at `http://localhost:3001`.

## Other Commands

```bash
pnpm typecheck          # Type-check all packages
pnpm lint               # Lint + DB access guard
pnpm test               # Unit tests
pnpm build              # Production build
pnpm seed:demo          # Seed demo communities
pnpm seed:verify        # Verify seed integrity
pnpm perf:check         # Performance budget check
pnpm clean              # Clean build outputs
```

## Demo Communities

Three pre-seeded demo communities (created via `pnpm seed:demo`):

| Community | Slug | Type | City |
|-----------|------|------|------|
| Sunset Condos | `sunset-condos` | Condo §718 | Miami, FL |
| Palm Shores HOA | `palm-shores-hoa` | HOA §720 | Fort Lauderdale, FL |
| Sunset Ridge Apartments | `sunset-ridge-apartments` | Apartment | Tampa, FL |

## Documentation

See [`docs/`](./docs/) for detailed documentation:

- [`TRANSITION-PLAN-v4.1-AGENT-SPEC.md`](./docs/TRANSITION-PLAN-v4.1-AGENT-SPEC.md) — Implementation plan
- [`00-DEMO-PLATFORM-TECH-SPEC.md`](./docs/00-DEMO-PLATFORM-TECH-SPEC.md) — Full technical spec
- [`adr/`](./docs/adr/) — Architecture Decision Records
- [`design-system/`](./docs/design-system/) — Design system documentation
