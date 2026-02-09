# Spec: P1-22 — Session Management

> Configure Supabase Auth session handling with JWT cookies, auto-refresh, and multi-tab sync.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P0-04

## Functional Requirements
- JWT stored in httpOnly cookies via @supabase/ssr
- Auto-refresh handled by Supabase client (1hr expiry, 7-day refresh)
- Server Components access session via createServerClient
- Client Components via createBrowserClient
- Middleware checks for valid session on protected routes, redirects to /login if absent
- onAuthStateChange() listener in root layout syncs auth across tabs — logout in one tab redirects all
- Email verification check: redirect unverified users to "Check your email" page

## Acceptance Criteria
- [ ] Session persists across page navigation
- [ ] Session refreshes before JWT expiry
- [ ] Logging out in one tab logs out all tabs
- [ ] Unverified email users see verification page
- [ ] Protected routes redirect to login without session
- [ ] `pnpm test` passes

## Technical Notes
- JWT stored in httpOnly cookies (secure, sameSite=strict)
- Use @supabase/ssr package for cookie-based auth
- Middleware runs on every request to protected routes
- onAuthStateChange with { multiTab: true } syncs state
- Redirect unverified users in middleware before reaching page

## Files Expected
- apps/web/src/lib/supabase/server.ts (createServerClient)
- apps/web/src/lib/supabase/client.ts (createBrowserClient)
- apps/web/src/middleware.ts (auth middleware)
- apps/web/src/app/(authenticated)/layout.tsx (auth listener)
- apps/web/src/app/auth/verify-email/page.tsx
- apps/web/src/__tests__/session-management.test.ts

## Attempts
0
