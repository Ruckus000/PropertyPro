<important if="creating or modifying API routes">

# API Route Patterns

## Route Structure

All API routes live under `apps/web/src/app/api/v1/`. Tenant scoping is handled by middleware (not URL params).

## Required Patterns

Every API route handler must:
1. Wrap in `withErrorHandler` for consistent error responses
2. Call `requirePermission(resource, action)` for authorization
3. Validate request bodies with Zod schemas
4. Use `createScopedClient(communityId)` for all DB access
5. Log mutations via `logAuditEvent()` for compliance trail

## Middleware

`apps/web/src/middleware.ts` handles: Supabase session refresh, tenant resolution, auth redirects, email verification checks, request tracing (`X-Request-ID`), rate limiting, and header sanitization.

- Protected paths: `/dashboard`, `/settings`, `/documents`, `/maintenance`, `/api/v1`, etc.
- Token-authenticated routes (no session): `/api/v1/invitations`, `/api/v1/auth/signup`, `/api/v1/webhooks/stripe`, cron endpoints

## Route Catalog

```
# Core resources
GET/POST /api/v1/documents, /meetings, /announcements, /leases, /residents
GET      /api/v1/compliance

# E-Sign
GET/POST /api/v1/esign/templates, /submissions
POST     /api/v1/esign/sign/[submissionExternalId]/[slug]  (unauthenticated)

# Calendar
GET      /api/v1/calendar/events, /meetings.ics, /my-meetings.ics

# PM dashboard
GET      /api/v1/pm/communities, /dashboard/summary, /reports/[reportType]
POST     /api/v1/pm/bulk/announcements, /bulk/documents

# Account lifecycle
GET/POST /api/v1/admin/access-plans          (admin: list/grant free access)
DELETE   /api/v1/admin/access-plans/[id]     (admin: revoke)
POST     /api/v1/admin/access-plans/[id]/extend (admin: extend)
GET      /api/v1/admin/deletion-requests     (admin: list deletion requests)
POST     /api/v1/admin/deletion-requests/[id]/intervene, /recover
POST     /api/v1/account/delete              (user: request own deletion)
DELETE   /api/v1/account/delete              (user: cancel own deletion)
POST     /api/v1/communities/delete          (admin: request community deletion)
DELETE   /api/v1/communities/delete          (admin: cancel community deletion)
POST     /api/v1/subscribe                   (user: Stripe checkout for subscription)
POST     /api/v1/internal/account-lifecycle  (cron: daily lifecycle processing)

# Move checklists, packages, visitors — under /api/v1/
# Auth & onboarding — /api/v1/auth/signup, /onboarding/condo, /onboarding/apartment
# Webhooks — /api/v1/webhooks/stripe
```

</important>
