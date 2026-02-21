# PropertyPro Florida

Compliance and community management platform for Florida condominium associations.

## Project Overview

PropertyPro is a demo platform for Florida condo/HOA compliance with Florida Statute §718.111(12)(g). The platform helps associations meet statutory requirements for document posting, meeting notices, and owner portal access.

**Status:** Phase 2 Complete (16/16 base tasks), Gate 3 Verification in Progress

## Tech Stack

### Web Application
- **Framework:** Next.js 14+ (App Router) with TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **State Management:** TanStack Query (React Query)

### Mobile Application
- **Framework:** React Native with Expo
- **Navigation:** Expo Router
- **Push Notifications:** Expo Notifications → APNs/FCM

### Backend
- **Runtime:** Node.js
- **Database:** PostgreSQL via Supabase
- **ORM:** Drizzle ORM
- **Authentication:** NextAuth.js (email + password)
- **File Storage:** Supabase Storage or AWS S3
- **Email:** Resend

### Infrastructure
- **Web Hosting:** Vercel
- **Mobile:** Expo Application Services (EAS)
- **Database:** Supabase (managed Postgres)
- **CDN:** Cloudflare

## Project Structure

```
propertyprofl/
├── apps/
│   └── web/                    # Next.js web application
│       ├── app/
│       │   ├── (public)/       # Public website routes
│       │   ├── (portal)/       # Owner portal routes
│       │   ├── (admin)/        # Admin dashboard routes
│       │   └── api/            # API routes
│       ├── components/
│       ├── lib/
│       └── __tests__/          # Test suites
├── packages/
│   ├── db/                     # Database layer (Drizzle ORM)
│   │   ├── src/
│   │   │   └── schema/         # Drizzle schema definitions
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

**Note:** Mobile app is planned for future phases. Current focus is web platform.

## Key Concepts

### Multi-Tenancy
- Single database with `association_id` foreign key isolation
- Subdomains per association: `[subdomain].propertyprofl.com`
- Property manager dashboard: `pm.propertyprofl.com`

### User Roles
- `owner` - Unit owner with portal access
- `board_member` - Board member with admin access
- `board_president` - Board president
- `cam` - Community Association Manager
- `property_manager_admin` - PM company admin

### Florida Compliance Requirements
- **§718** (Condos): Associations with 25+ units must have a website
- **§720** (HOAs): Associations with 100+ parcels must have a website
- **30-day rule:** Documents must be posted within 30 days of creation
- **Meeting notices:** 14 days for owner meetings, 48 hours for board meetings

## API Patterns

```
GET/POST /api/v1/associations/:id/documents
GET/POST /api/v1/associations/:id/meetings
GET/POST /api/v1/associations/:id/announcements
GET/POST /api/v1/associations/:id/maintenance-requests
GET      /api/v1/associations/:id/compliance
```

## Demo Data

The platform uses a fictional association "Palm Gardens Condominium Association" for demos:
- 50 units in West Palm Beach, FL
- Pre-populated with documents, meetings, announcements, and maintenance requests
- Demo credentials reset nightly

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

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

# Run full integration test suite
set -a; source .env.local; set +a; pnpm test:integration:preflight
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

## Documentation

See `/docs` for detailed documentation:
- `00-DEMO-PLATFORM-TECH-SPEC.md` - Full technical specification
- `01-DOCUMENT-CONTRADICTIONS-ANALYSIS.md` - Analysis notes
- `02-NEXT-STEPS-TASK-LIST.md` - Development tasks
- `03-08` - Sales and market documentation
