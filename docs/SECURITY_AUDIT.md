# Security Audit — P4-56

**Date:** 2026-02-24
**Branch:** `codex/p4-56-security-audit`
**Auditor:** PropertyPro Engineering
**Scope:** Web application (`apps/web`) — middleware hardening, input validation, error sanitization, dependency scan

---

## 1. Executive Summary

This audit establishes the application security baseline for Gate 4. It covers:

- CORS origin restriction and preflight handling
- Content-Security-Policy (CSP) headers for page responses
- Universal security response headers
- Zod-based input validation on API endpoints
- Structured, sanitized error responses (no stack traces or internal details leaked)
- Dependency vulnerability scan results

All identified remediations have been implemented in this task (P4-56). Residual risks and follow-up items are documented in Section 7.

---

## 2. Audit Scope and Methodology

### Files Inspected

| Area | Files |
|------|-------|
| Middleware | `apps/web/src/middleware.ts` |
| Security headers | `apps/web/src/lib/middleware/security-headers.ts` |
| Error handling | `apps/web/src/lib/api/error-handler.ts`, `src/lib/api/errors/` |
| Input validation | `apps/web/src/lib/validation/zod-schemas.ts`, `src/lib/api/zod/error-formatter.ts` |
| API routes (sample) | `api/v1/meetings`, `api/v1/documents`, `api/v1/announcements`, `api/v1/leases`, `api/v1/contracts`, `api/v1/compliance`, `api/v1/audit-trail`, `api/v1/maintenance-requests`, `api/v1/residents`, `api/v1/pm/*` |
| Tests | `apps/web/__tests__/security/` |

### Commands Run

```bash
# Full unit test suite (including new P4-56 security tests)
cd apps/web && pnpm exec vitest run

# Dependency vulnerability scan
pnpm audit --audit-level=high
pnpm audit

# Lint + type check (see Section 6)
pnpm lint
pnpm typecheck
```

---

## 3. Findings and Remediations

### 3.1 CORS — Origin Restriction

**Finding:** Before P4-56, CORS headers were not controlled by middleware. Any origin could make cross-origin requests to the API.

**Risk:** High — browsers would allow cross-origin JS to read API responses from any origin, enabling credential theft and CSRF-adjacent attacks.

**Remediation Implemented:**

`apps/web/src/lib/middleware/security-headers.ts` implements:

- `isAllowedOrigin(origin)` — allowlist-based check:
  - `localhost` / `127.0.0.1` (local development)
  - `propertyprofl.com` and any subdomain (production)
  - `NEXT_PUBLIC_APP_URL` hostname (Vercel preview deployments, if configured)
  - All other origins → rejected (no CORS headers emitted)
- `buildCorsHeaders(origin)` — returns headers only for allowed origins:
  - `Access-Control-Allow-Origin: <reflected allowed origin>` (never wildcard)
  - `Access-Control-Allow-Credentials: true`
  - `Vary: Origin` to prevent CDN poisoning
- OPTIONS preflight handled in `middleware.ts` before session/auth processing:
  - Allowed origins → 204 with CORS headers
  - Unknown origins → 403

**Tests:** `apps/web/__tests__/security/security-headers.test.ts` — 22 assertions covering localhost, production domain, subdomains, NEXT_PUBLIC_APP_URL matching, wildcard rejection, and subdomain-prefix attacks.

---

### 3.2 Content-Security-Policy (CSP)

**Finding:** No CSP header was present on any response, leaving the app vulnerable to XSS via injected scripts.

**Risk:** High — CSP absence removes a critical defense-in-depth layer against XSS.

**Remediation Implemented:**

`buildCspHeader()` in `security-headers.ts` emits a CSP applied to all HTML page responses (not JSON API responses):

```
default-src 'self';
script-src 'self' 'unsafe-inline' ['unsafe-eval' in dev only];
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://<supabase-host>;
connect-src 'self' https://<supabase-host> wss://<supabase-host>
            https://*.ingest.sentry.io https://api.stripe.com;
font-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

**Known Limitations:**
- `'unsafe-inline'` is required for Next.js 15 App Router hydration inline scripts. Nonce-based strict CSP is the recommended upgrade path (tracked as a future hardening item — see Section 7).
- `'unsafe-eval'` is only emitted in `NODE_ENV=development`.

**Tests:** `security-headers.test.ts` — assertions for all required directives.

---

### 3.3 Universal Security Headers

**Finding:** Missing standard security headers on all responses.

**Risk:** Medium — absence of `X-Frame-Options` allows clickjacking; missing `X-Content-Type-Options` enables MIME sniffing attacks.

**Remediation Implemented:**

`buildSecurityHeaders()` in `security-headers.ts` applies to all responses:

| Header | Value | Rationale |
|--------|-------|-----------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (redundant with CSP `frame-ancestors` but defense-in-depth) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Denies browser feature access |
| `X-DNS-Prefetch-Control` | `off` | Prevents DNS prefetch leakage |

Note: `Strict-Transport-Security` (HSTS) is omitted from middleware — Vercel applies HSTS at the edge for production deployments (configured in `vercel.json`). Adding it in middleware risks HSTS on non-HTTPS local dev.

---

### 3.4 Inbound Header Sanitization

**Finding:** No validation that client-supplied `x-community-id`, `x-tenant-slug`, `x-tenant-source`, and `x-user-id` headers would be silently accepted and forwarded to route handlers.

**Risk:** High — a malicious client could forge tenant context headers to bypass multi-tenant isolation.

**Remediation Implemented:**

`sanitizeForwardedHeaders()` in `middleware.ts` strips all four headers from inbound requests before forwarding. Route handlers only receive these headers as set by the middleware itself after authentication and tenant resolution.

---

### 3.5 Input Validation — Zod Coverage

**Finding:** API route handlers using raw `req.json()` or `req.body` without structured validation were at risk of type confusion and unexpected data shapes reaching business logic.

**Risk:** Medium-High — unvalidated inputs can cause unexpected behavior, SQL injection via ORM misuse, or business logic bypass.

**Audit Results:**

All touched API routes (`/meetings`, `/documents`, `/announcements`, `/leases`, `/contracts`, `/maintenance-requests`, `/residents`, `/compliance`, `/audit-trail`, `/pm/branding`, `/pm/communities`) use Zod schemas for body and query parameter validation.

Shared Zod primitives exposed from `apps/web/src/lib/validation/zod-schemas.ts`:
- `positiveIntSchema` — database IDs (rejects 0, negatives, floats)
- `isoDateStringSchema` — date fields
- `emailSchema` — email addresses
- `passwordSchema` — passwords (min 8, max 72 chars per bcrypt limit)
- `uuidSchema` — user/resource UUIDs
- `paginationOffsetSchema` / `paginationLimitSchema` — pagination (max 200)

All routes use `schema.safeParse()` and throw typed `UnprocessableEntityError` (422) or `BadRequestError` (400) — never raw unhandled rejections.

**Tests:** `apps/web/__tests__/security/input-validation.test.ts` — 11+ assertions on Zod primitives + meetings POST validation path.

---

### 3.6 Error Response Sanitization

**Finding:** Unhandled errors in route handlers could leak stack traces, database connection strings, or internal error messages to clients.

**Risk:** High — stack traces can reveal file paths, library versions, and database schemas, aiding targeted attacks.

**Remediation Implemented:**

All API routes wrap handlers in `withErrorHandler` from `apps/web/src/lib/api/error-handler.ts`:

- **Known `AppError` subclasses** → structured JSON with correct HTTP status and `code`
- **Unknown errors** → `500 INTERNAL_ERROR` with generic message "An unexpected error occurred" — original error is logged server-side and reported to Sentry with `request_id` correlation
- **All error responses** include `X-Request-ID` for incident correlation

Error class taxonomy:
| Class | Status | Code |
|-------|--------|------|
| `BadRequestError` | 400 | `BAD_REQUEST` |
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `UnprocessableEntityError` | 422 | `UNPROCESSABLE_ENTITY` |
| `RateLimitError` | 429 | `RATE_LIMIT_EXCEEDED` |
| `DataIntegrityError` | 409 | `DATA_INTEGRITY_ERROR` |
| (unknown) | 500 | `INTERNAL_ERROR` |

**Tests:** `input-validation.test.ts` — verifies that a thrown error containing `postgres://user:secret@host/db` does not appear in the `500` response body.

---

### 3.7 Rate Limiting

**Finding:** (Pre-existing implementation from P2-42 — documented for completeness.)

Rate limiting is applied at middleware level via `checkRateLimit` in `apps/web/src/lib/middleware/rate-limit-config.ts`:
- Auth/public routes: limited by IP
- Authenticated API routes: limited by user ID (IP fallback for anonymous)

---

## 4. Dependency Vulnerability Scan

**Command run:** `pnpm audit` (2026-02-24)

**Results: 3 vulnerabilities found — 2 moderate, 1 high**

| Severity | Package | Advisory | Path | Resolution |
|----------|---------|----------|------|------------|
| **High** | `minimatch <10.2.1` | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26) — ReDoS via repeated wildcards | `.>@vitest/coverage-v8>test-exclude>minimatch` | **Dev/test dependency only.** Not in production bundle. No user-controlled input reaches this code path. Remediate by upgrading `@vitest/coverage-v8` when a version with `minimatch>=10.2.1` is available. |
| Moderate | `esbuild <=0.24.2` | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) — dev server CORS | `packages__db>drizzle-kit>@esbuild-kit/esm-loader>esbuild` | **Dev-only tool (`drizzle-kit`).** Not in production. Remediate when `drizzle-kit` ships with `esbuild>=0.25.0`. |
| Moderate | `ajv >=7.0.0-alpha <8.18.0` | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) — ReDoS with `$data` option | `apps__web>@sentry/nextjs>@sentry/webpack-plugin>webpack>schema-utils>ajv` | **Build-time only (`@sentry/nextjs` webpack plugin).** Not in runtime production bundle. Remediate when Sentry ships with `ajv>=8.18.0`. |

**Assessment:** No production runtime vulnerabilities. All three are in dev/build toolchain dependencies. No immediate blocker to Gate 4.

**Follow-up:** Reassess before Gate 4 sign-off. If unresolved, document in Gate 4 evidence artifact.

---

## 5. Multi-Tenancy and Auth Boundary Review

The following architectural controls were verified in scope (P4-56 audit boundary — full RBAC matrix is P4-57):

| Control | Verified | Evidence |
|---------|----------|---------|
| Inbound tenant headers stripped | ✓ | `sanitizeForwardedHeaders()` in middleware |
| `x-community-id` set only by middleware after DB resolution | ✓ | Middleware flow: query → validate → set header |
| Negative-cache for invalid tenant slugs (30s TTL) | ✓ | `TENANT_NEGATIVE_CACHE_TTL_MS` in middleware |
| 404 for reserved subdomains | ✓ | `isReservedSubdomain` check before auth |
| Auth check before tenant header forwarding | ✓ | Auth flows in middleware sequence |
| Service-role DB access pattern | ✓ | Documented in AGENTS.md + P4-55 RLS policies |

---

## 6. Test Coverage for P4-56

Test files:
- `apps/web/__tests__/security/security-headers.test.ts` — CORS, security headers, CSP
- `apps/web/__tests__/security/input-validation.test.ts` — Zod validation, error sanitization

All tests pass: `pnpm exec vitest run` → **1419 tests passing, 0 failing** (as of 2026-02-24).

---

## 7. Residual Risks and Follow-up Items

| Item | Risk | Priority | Owner |
|------|------|----------|-------|
| `'unsafe-inline'` in CSP script-src | Medium — weakens XSS protection | Implement nonce-based CSP when Next.js supports it natively | P4-57+ |
| HSTS header not in middleware | Low — Vercel handles at edge for production | Verify Vercel HSTS config in `vercel.json` before Gate 4 | P4-60 |
| `minimatch` ReDoS in test deps | Low — dev/test only | Upgrade `@vitest/coverage-v8` when fix available | P4-59 CI |
| `esbuild` dev server CORS in drizzle-kit | Low — dev/build tool | Upgrade `drizzle-kit` when fix available | Maintenance |
| `ajv` ReDoS in Sentry webpack plugin | Low — build time | Upgrade `@sentry/nextjs` when fix available | P4-59 CI |
| RBAC matrix enforcement at route level | High | Full audit in P4-57 | P4-57 |

---

## 8. Gate 4 Checklist Contribution

| Checklist Item | Status |
|----------------|--------|
| Dependency scan reports no critical/high vulnerabilities in production runtime | ✓ (1 high, dev-only) |
| Security audit baseline doc exists with remediations tracked | ✓ (this document) |
| Middleware/API hardening checks covered by tests | ✓ |
| CORS restricted to known origins | ✓ |
| CSP headers present and reasonably strict | ✓ |
| Input validation via Zod on touched endpoints | ✓ |
| Sanitized error responses (no stack traces to clients) | ✓ |
