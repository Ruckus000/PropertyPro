# Spec: P2-30 — Subdomain Routing Middleware

> Implement subdomain-based tenant routing middleware that extracts community context from the hostname.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P0-04
- P0-06

## Functional Requirements
- Middleware extracts subdomain from request hostname
- Looks up community by subdomain in database
- Sets tenant context for the request
- In development: falls back to ?tenant=xxx query parameter (localhost doesn't support subdomains)
- Validates subdomain: no special characters, not reserved (admin, api, www, mobile, pm, app, dashboard, login, signup, legal)
- Returns 404 for unknown subdomains
- Custom domains deferred to later phase

## Acceptance Criteria
- [ ] Request to palmgardens.propertyprofl.com resolves to Palm Gardens community
- [ ] Request to unknown.propertyprofl.com returns 404
- [ ] Reserved subdomains return appropriate page (not community lookup)
- [ ] Dev mode with ?tenant=palmgardens works
- [ ] pnpm test passes

## Technical Notes
- Vercel wildcard subdomains require specific configuration
- Test deployed behavior early — don't just test locally

## Files Expected
- apps/web/src/middleware.ts
- packages/shared/src/middleware/subdomain-router.ts
- packages/shared/src/middleware/reserved-subdomains.ts

## Attempts
0
