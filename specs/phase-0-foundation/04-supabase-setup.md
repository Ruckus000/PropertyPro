# Spec: P0-04 — Supabase Setup

> Configure the Supabase project with database, auth, and storage for local development.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-00

## Functional Requirements
- Set up Supabase client utilities: createServerClient (for Server Components using cookies from request headers), createBrowserClient (for Client Components), createAdminClient (for API routes with service role key)
- Configure email/password auth provider in Supabase project
- Create storage buckets: documents (private, 50MB limit), images (private, 10MB limit), public (for community logos, public read access)
- Set up environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- Implement middleware to refresh auth session on every request
- Create utility to generate presigned URLs for secure file access
- Support cookie-based auth persistence across page refreshes
- Handle auth state changes with onAuthStateChange listeners

## Acceptance Criteria
- [ ] Server-side Supabase client can query the database from a Server Component without errors
- [ ] Browser-side client can authenticate a user with email/password
- [ ] Storage upload to documents bucket works with presigned URLs
- [ ] Storage download from images bucket works with presigned URLs
- [ ] Auth session persists across page refreshes and browser restarts
- [ ] Middleware refreshes session before each request without blocking
- [ ] `pnpm typecheck` passes
- [ ] createServerClient, createBrowserClient, and createAdminClient are tested and working

## Technical Notes
- Use @supabase/ssr for Next.js integration — it handles Server Component auth correctly.
- Test auth in Server Components on day 1 to catch integration issues early.
- Use pooled connection string for normal app queries, direct connection for migrations.
- Presigned URLs should be generated server-side, never expose service role key to browser.
- Store auth session in httpOnly cookies to prevent XSS attacks.
- Middleware should run on every route to keep session fresh without requiring explicit calls.

## Files Expected
- packages/db/src/supabase/server.ts
- packages/db/src/supabase/client.ts
- packages/db/src/supabase/admin.ts
- packages/db/src/supabase/middleware.ts
- packages/db/src/supabase/storage.ts
- apps/web/middleware.ts (auth check and session refresh)
- packages/db/src/index.ts (update barrel export)
- .env.example (update with Supabase keys)

## Attempts
0
