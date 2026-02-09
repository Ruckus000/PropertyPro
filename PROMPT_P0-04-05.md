# Claude Code Prompt: P0-04 (Supabase Setup) + P0-05 (Drizzle Schema Core)

## Context

You are implementing P0-04 and P0-05 for PropertyPro Florida, a multi-tenant SaaS for condo/HOA communities.

**Read these files FIRST — do not skip:**
- `IMPLEMENTATION_PLAN.md` — Full task definitions, acceptance criteria, dependencies
- `AGENTS.md` — 45 known pitfalls. Follow these STRICTLY.
- `.env.local` — Already configured with real Supabase, Stripe, Resend, Sentry, Upstash credentials

**Current state:**
- Monorepo scaffold: DONE (Turborepo, pnpm, apps/web + 5 packages)
- `pnpm build` passes (5/5), `pnpm typecheck` passes (7/7), `pnpm test` passes (295 tests, 8 files)
- `packages/db/` exists as a placeholder with only `export const DB_PLACEHOLDER = true;`
- `packages/shared/src/index.ts` has WRONG role names — see fix below

---

## TASK 1: Fix packages/shared USER_ROLES

The current `packages/shared/src/index.ts` defines:
```ts
export const USER_ROLES = ["owner", "board_member", "board_president", "cam", "property_manager_admin"] as const;
```

The IMPLEMENTATION_PLAN.md specifies roles as: `admin, manager, auditor, resident`. Fix this:
```ts
export const USER_ROLES = ["admin", "manager", "auditor", "resident"] as const;
export type UserRole = (typeof USER_ROLES)[number];
```

---

## TASK 2: P0-04 — Supabase Setup

### Install Dependencies

In `packages/db/`:
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

In `apps/web/`:
```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

### Files to Create

**`packages/db/src/supabase/client.ts`** — Browser client for Client Components
- Creates Supabase client using `createBrowserClient` from `@supabase/ssr`
- Uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Singleton pattern (create once, reuse)

**`packages/db/src/supabase/server.ts`** — Server client for Server Components
- Creates Supabase client using `createServerClient` from `@supabase/ssr`
- **CRITICAL [AGENTS #1]:** Must read cookies from request headers. Use Next.js `cookies()` from `next/headers`
- This is an async function that creates a new client per request

**`packages/db/src/supabase/admin.ts`** — Admin client with service role key
- Uses `SUPABASE_SERVICE_ROLE_KEY` for server-side admin operations
- NEVER expose this client to the browser

**`packages/db/src/supabase/middleware.ts`** — Session refresh logic
- Creates middleware-specific client that can read AND write cookies
- Refreshes session tokens without blocking rendering
- Returns updated response with refreshed cookies

**`packages/db/src/supabase/storage.ts`** — Presigned URL helpers
- **[AGENTS #9]:** Use presigned URLs for uploads (Vercel 4.5MB body limit)
- `createPresignedUploadUrl(bucket, path, expiresIn?)` — generates upload URL
- `createPresignedDownloadUrl(bucket, path, expiresIn?)` — generates download URL
- `deleteStorageObject(bucket, path)` — deletes a file

**`apps/web/src/middleware.ts`** — Next.js middleware
- Imports middleware helper from packages/db
- Refreshes Supabase auth session on every request
- **[AGENTS #45]:** Generates X-Request-ID (UUID) header on every request
- Matcher: exclude static files, _next, favicon

### Update Exports

Update `packages/db/src/index.ts` to export supabase utilities:
```ts
export { createBrowserClient } from './supabase/client';
export { createServerClient } from './supabase/server';
export { createAdminClient } from './supabase/admin';
export { createMiddlewareClient } from './supabase/middleware';
export { createPresignedUploadUrl, createPresignedDownloadUrl, deleteStorageObject } from './supabase/storage';
```

### Update package.json

`packages/db/package.json` needs additional exports:
```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./supabase/client": { "types": "./src/supabase/client.ts", "import": "./src/supabase/client.ts" },
    "./supabase/server": { "types": "./src/supabase/server.ts", "import": "./src/supabase/server.ts" },
    "./supabase/admin": { "types": "./src/supabase/admin.ts", "import": "./src/supabase/admin.ts" },
    "./supabase/middleware": { "types": "./src/supabase/middleware.ts", "import": "./src/supabase/middleware.ts" }
  }
}
```

### Acceptance Criteria (P0-04)
- [ ] Server-side queries work in Server Components via cookie-reading server client
- [ ] Browser auth works in Client Components
- [ ] Storage upload/download work via presigned URLs
- [ ] Session persists across page refreshes
- [ ] Middleware refreshes session without blocking rendering
- [ ] X-Request-ID (UUID) header present on every response

---

## TASK 3: P0-05 — Drizzle Schema Core

### Install Dependencies

In `packages/db/`:
```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

**CRITICAL [AGENTS #5]:** Use `postgres` (postgres-js driver), NOT `pg` (node-postgres). node-postgres is incompatible with PgBouncer/Supavisor.

### Create Drizzle Config

**`packages/db/drizzle.config.ts`**
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DIRECT_URL!, // Direct connection for migrations only [AGENTS #4]
  },
});
```

### Create Database Connection

**`packages/db/src/drizzle.ts`**
- Use `postgres` (postgres-js) driver with `DATABASE_URL` (pooled, port 6543) [AGENTS #4]
- Create and export the `db` instance (but see P0-06 — this will be hidden behind scoped client later)
- Do NOT export `db` from the package index — it will be internal only

### Schema Files to Create

All in `packages/db/src/schema/`:

**`enums.ts`** — PostgreSQL enum definitions:
```ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const communityTypeEnum = pgEnum('community_type', ['condo_718', 'hoa_720', 'apartment']);
export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'auditor', 'resident']);
```

**`communities.ts`** — Communities table:
- `id` — BIGINT, primary key, auto-generated (use `bigserial`)
- `name` — text, NOT NULL
- `slug` — text, NOT NULL, UNIQUE (for subdomain routing)
- `community_type` — communityTypeEnum, NOT NULL
- `timezone` — text, NOT NULL, default 'America/New_York' [AGENTS #19: Florida spans Eastern + Central]
- `address_line1`, `address_line2`, `city`, `state`, `zip_code` — text fields
- `created_at` — timestamp with time zone, default now()
- `updated_at` — timestamp with time zone, default now()
- `deleted_at` — timestamp with time zone, nullable (soft-delete)

**`users.ts`** — Users table:
- `id` — UUID, primary key (matches Supabase auth.users.id)
- `email` — text, NOT NULL, UNIQUE
- `full_name` — text, NOT NULL
- `phone` — text, nullable
- `avatar_url` — text, nullable
- `created_at`, `updated_at` — timestamptz, default now()
- `deleted_at` — timestamptz, nullable

**`user-roles.ts`** — User-Community role junction [AGENTS #2]:
- `id` — BIGINT primary key
- `user_id` — UUID, FK → users.id, ON DELETE CASCADE
- `community_id` — BIGINT, FK → communities.id, ON DELETE CASCADE, NOT NULL
- `role` — userRoleEnum, NOT NULL
- `created_at` — timestamptz, default now()
- UNIQUE constraint on (user_id, community_id, role)

**`units.ts`** — Units/lots within a community:
- `id` — BIGINT primary key
- `community_id` — BIGINT, FK → communities.id, ON DELETE CASCADE, NOT NULL
- `unit_number` — text, NOT NULL
- `building` — text, nullable
- `floor` — integer, nullable
- `owner_user_id` — UUID, FK → users.id, ON DELETE SET NULL, nullable
- `created_at`, `updated_at`, `deleted_at` — timestamptz

**`document-categories.ts`** — Document category definitions:
- `id` — BIGINT primary key
- `community_id` — BIGINT, FK → communities.id, ON DELETE CASCADE, NOT NULL
- `name` — text, NOT NULL
- `description` — text, nullable
- `is_system` — boolean, default false (system categories can't be deleted)
- `created_at`, `updated_at`, `deleted_at` — timestamptz

**`documents.ts`** — Document records:
- `id` — BIGINT primary key
- `community_id` — BIGINT, FK → communities.id, ON DELETE CASCADE, NOT NULL
- `category_id` — BIGINT, FK → document_categories.id, ON DELETE RESTRICT, nullable
- `title` — text, NOT NULL
- `description` — text, nullable
- `file_path` — text, NOT NULL (Supabase Storage path)
- `file_name` — text, NOT NULL
- `file_size` — BIGINT, NOT NULL
- `mime_type` — text, NOT NULL
- `uploaded_by` — UUID, FK → users.id, ON DELETE SET NULL, nullable
- `search_text` — text, nullable (extracted text for search)
- `search_vector` — tsvector, nullable (PostgreSQL full-text search)
- `created_at`, `updated_at`, `deleted_at` — timestamptz

**`notification-preferences.ts`** — Per-user notification settings:
- `id` — BIGINT primary key
- `user_id` — UUID, FK → users.id, ON DELETE CASCADE
- `community_id` — BIGINT, FK → communities.id, ON DELETE CASCADE, NOT NULL
- `email_announcements` — boolean, default true
- `email_documents` — boolean, default true
- `email_meetings` — boolean, default true
- `email_maintenance` — boolean, default true
- `created_at`, `updated_at` — timestamptz
- UNIQUE on (user_id, community_id)

**`index.ts`** — Barrel export for all schema + inferred types:
```ts
export * from './enums';
export * from './communities';
export * from './users';
export * from './user-roles';
export * from './units';
export * from './documents';
export * from './document-categories';
export * from './notification-preferences';

// Inferred types
import { communities } from './communities';
import { users } from './users';
// ... etc.

export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
// ... for all tables
```

### Add db scripts to package.json

Add to `packages/db/package.json` scripts:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Generate and Run Migration

```bash
cd packages/db
pnpm db:generate   # Creates SQL migration file
pnpm db:push       # Pushes schema to Supabase (for dev — use migrate for production)
```

### Update Package Exports

Update `packages/db/src/index.ts`:
```ts
// Supabase clients
export { createBrowserClient } from './supabase/client';
export { createServerClient } from './supabase/server';
export { createAdminClient } from './supabase/admin';
export { createMiddlewareClient } from './supabase/middleware';
export { createPresignedUploadUrl, createPresignedDownloadUrl, deleteStorageObject } from './supabase/storage';

// Schema & types
export * from './schema';
```

### Acceptance Criteria (P0-05)
- [ ] Migration creates all tables correctly on Supabase PostgreSQL
- [ ] Enums enforce valid values: community_type (condo_718, hoa_720, apartment), role (admin, manager, auditor, resident)
- [ ] All timestamps are `timestamp with time zone` defaulting to `now()`, stored as UTC
- [ ] Foreign keys have explicit ON DELETE behavior (CASCADE for owned, RESTRICT for referenced, SET NULL where noted)
- [ ] Soft-delete: `deleted_at` column on all soft-deletable tables
- [ ] TypeScript types generated via `typeof table.$inferSelect` and exported from packages/db
- [ ] BIGINT IDs on all tables (except users which uses UUID from Supabase Auth)
- [ ] `community_id` FK on every tenant-scoped table (NOT nullable)
- [ ] `search_text` and `search_vector` columns on documents table
- [ ] `pnpm build` still passes (5/5)
- [ ] `pnpm typecheck` still passes (7/7)

### Critical Checks Before Moving On
After P0-05 is done, run GATE 0:
1. Verify all tables created successfully: `pnpm db:push` completes without errors
2. Verify TypeScript types are importable: `import { Community, User, Document } from '@propertypro/db'`
3. Verify `pnpm typecheck` passes
4. Manually review schema against the Phase 1 specs in `specs/phase-1-compliance/` — check for missing columns or tables
5. **Fix packages/shared USER_ROLES** to match the schema enum: `["admin", "manager", "auditor", "resident"]`

---

## Important Constraints
- **[AGENTS #42]** No `any` or `@ts-ignore` anywhere. Strict TypeScript.
- **[AGENTS #5]** Use `postgres` (postgres-js), NOT `pg` (node-postgres)
- **[AGENTS #4]** DATABASE_URL (pooled, 6543) for app; DIRECT_URL (direct, 5432) for migrations
- **[AGENTS #16]** All timestamps as UTC with `timestamp with time zone`
- **[AGENTS #2]** Roles are per-community via junction table, NOT global

## Verification Commands
```bash
pnpm build        # Must pass (5/5 packages)
pnpm typecheck    # Must pass (7/7 tasks)
pnpm test         # Must still pass (295+ tests)
```
