# Task 0.9 — Sentry Wiring for Admin App

> **Context files to read first:** `SHARED-CONTEXT.md`, then read:
> - `apps/web/sentry.client.config.ts`
> - `apps/web/sentry.server.config.ts`
> - `apps/web/sentry.edge.config.ts`
> - `apps/web/next.config.ts` (Sentry plugin wrapping, if present)
> - `apps/admin/next.config.ts` (admin app config from Phase 1)
> **Branch:** `feat/sentry-admin`
> **Estimated time:** 30 minutes
> **Wave 3** — depends on TASK-1 (admin app must exist first).

## Objective

Wire Sentry error tracking into the `apps/admin` Next.js app, matching the pattern already established in `apps/web`.

## Deliverables

### 1. Sentry config files

Read the three existing Sentry config files in `apps/web/` and replicate the same pattern in `apps/admin/`.

**Create:** `apps/admin/sentry.client.config.ts`
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
```

**Create:** `apps/admin/sentry.server.config.ts`
Match the `apps/web` server config exactly. Read it first — it may include additional options like `environment` or `release`.

**Create:** `apps/admin/sentry.edge.config.ts`
Match the `apps/web` edge config exactly.

### 2. Next.js config integration

If `apps/web/next.config.ts` wraps the config with `withSentryConfig()`, do the same in `apps/admin/next.config.ts`.

Read `apps/web/next.config.ts` to see the exact pattern. Common approach:
```typescript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = { /* existing config */ };

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  silent: true,
  org: '...', // read from web config
  project: '...', // may need a separate project name for admin
});
```

**Note:** The Sentry project name for admin may differ from web. If unsure, use the same DSN and project — Sentry will still capture errors, just tagged under the same project. The user will configure separate projects later if needed.

### 3. Install dependency

If `@sentry/nextjs` is not already in `apps/admin/package.json`:
```bash
cd apps/admin && pnpm add @sentry/nextjs
```

### 4. Environment variable

`NEXT_PUBLIC_SENTRY_DSN` must be available to `apps/admin`. Since both apps share the root `.env.local` via symlink (set up in Phase 0.1), this should already work. Verify:
- `apps/admin/.env.local` exists (or is symlinked to root `.env.local`)
- If not, add it to the Phase 0.1 setup script

## Do NOT

- Do not create a new Sentry project or organization — reuse the existing DSN
- Do not modify the `apps/web` Sentry configuration
- Do not add Sentry to packages (only apps)

## Acceptance Criteria

- [ ] `sentry.client.config.ts` exists in `apps/admin`
- [ ] `sentry.server.config.ts` exists in `apps/admin`
- [ ] `sentry.edge.config.ts` exists in `apps/admin`
- [ ] Next.js config wrapped with `withSentryConfig` (if web does this)
- [ ] `@sentry/nextjs` in admin dependencies
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
