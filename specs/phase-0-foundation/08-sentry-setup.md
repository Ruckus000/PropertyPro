# Spec: P0-08 — Sentry Setup

> Configure Sentry for error tracking and performance monitoring across the Next.js application.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-07

## Functional Requirements
- Install @sentry/nextjs package with types
- Configure Sentry in sentry.client.config.ts for client-side error capture and performance monitoring
- Configure Sentry in sentry.server.config.ts for server-side error capture (API routes, Server Components)
- Configure Sentry in sentry.edge.config.ts for Edge Runtime (middleware)
- Add Sentry to next.config.ts via withSentryConfig wrapper to enable automatic instrumentation
- Capture unhandled exceptions from withErrorHandler API wrapper
- Include communityId and userId as Sentry context on every error
- Include X-Request-ID as a tag for request correlation across logs and APM
- Configure source maps upload for production builds
- Set up environment-based DSN: Sentry enabled in production/staging only; disabled in local dev
- Set sample rate for transaction performance monitoring (tracesSampleRate)
- Redact sensitive headers (authorization, cookie, x-api-key) from Sentry payload

## Acceptance Criteria
- [ ] Errors thrown in API routes appear in Sentry dashboard with correct context
- [ ] Errors from Server Components are captured by Sentry
- [ ] Performance transactions are recorded with correct timing
- [ ] Source maps resolve correctly in Sentry dashboard (stack traces are readable)
- [ ] Sentry does not run in local development unless SENTRY_DSN is explicitly set in .env.local
- [ ] communityId and userId are included as Sentry context when available
- [ ] X-Request-ID tag appears on all error events for correlation
- [ ] Sensitive headers are redacted from Sentry request context
- [ ] `pnpm build` succeeds with Sentry config enabled
- [ ] `pnpm dev` runs without Sentry overhead in local development

## Technical Notes
- @sentry/nextjs automatically integrates with Next.js App Router, no manual instrumentation needed in most cases.
- Use init() in each config file with appropriate environment filtering.
- Set tracesSampleRate to 0.1 (10%) in production to control cost — adjust based on traffic.
- Source map upload requires Sentry API token — configure in CI/CD only, not local builds.
- Use Sentry's breadcrumbs to track user actions before errors occur.
- Set userId via Sentry.setUser({ id: userId }) in Server Components and API routes when available.
- Consider setting release version via SENTRY_RELEASE environment variable for better version tracking.

## Files Expected
- apps/web/sentry.client.config.ts
- apps/web/sentry.server.config.ts
- apps/web/sentry.edge.config.ts
- apps/web/next.config.ts (update with withSentryConfig)
- apps/web/src/instrumentation.ts (optional, for custom instrumentation)
- apps/web/middleware.ts (update to set request ID in Sentry context)
- .env.example (update with SENTRY_DSN, SENTRY_AUTH_TOKEN, SENTRY_RELEASE)
- tests/sentry-setup.integration.test.ts (optional, verify Sentry integration)

## Attempts
0
