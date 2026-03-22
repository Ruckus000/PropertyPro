# Phase 4 Remaining: CSRF Protection (M-06) + Self-Service Resident Signup (U-06)

**Date:** 2026-03-22
**Branch:** `phase-4-csrf-resident-signup`
**Audit codes:** M-06, U-06
**Depends on:** Phase 4 demo lifecycle (merged PR #59), B-01 plan gating (merged PR #58)

---

## 1. Overview

Two remaining Phase 4 items from `docs/platform-data-flow-audit.md`:

1. **M-06 (CSRF hardening):** Add Origin/Referer enforcement on state-changing API routes. Currently `isAllowedOrigin()` controls CORS response headers but doesn't reject unknown-origin mutations. Existing mitigations (SameSite=Lax, CSP `form-action 'self'`) cover most vectors; this is defense-in-depth.

2. **U-06 (self-service resident signup):** Public page where residents can request access to their community. Admin reviews and approves/denies. Today the only path is admin-initiated invitation — no self-registration exists.

---

## 2. M-06: CSRF Origin Enforcement

### 2.1 Current State

| Layer | Protection | Status |
|-------|-----------|--------|
| SameSite=Lax cookies | Blocks cross-origin scripted POST/PATCH/DELETE | ✅ Supabase default |
| CSP `form-action 'self'` | Blocks cross-origin form submissions from page | ✅ `security-headers.ts:141` |
| CORS `Access-Control-Allow-Origin` | Only set for `isAllowedOrigin()` matches | ✅ `security-headers.ts:75` |
| Origin header rejection on mutations | Reject request if Origin present + not allowed | ❌ Missing |

### 2.2 What We're Adding

A single check in `middleware.ts` for all `/api/v1/` routes using POST/PATCH/PUT/DELETE:

```
if (method is state-changing AND path starts with /api/v1/) {
  if (Origin header present AND !isAllowedOrigin(origin)) → 403
  if (Origin absent AND Referer present AND !isAllowedReferer(referer)) → 403
  // If neither header present: allow (some legitimate clients omit both)
}
```

### 2.3 Exempt Routes

Routes that use their own authentication (not session cookies):

| Route | Auth Mechanism | Why Exempt |
|-------|---------------|------------|
| `POST /api/v1/webhooks/stripe` | Stripe signature verification | No cookies, external origin |
| `POST /api/v1/webhooks/twilio` | HMAC signature verification | No cookies, external origin |
| `POST /api/v1/esign/sign/[...]` | Unauthenticated, submission-scoped | Public signing endpoint |

These are already in `TOKEN_AUTH_ROUTES` in middleware.ts. The CSRF check will skip any route matching that list.

### 2.4 Implementation

- **File:** `apps/web/src/middleware.ts` — add ~15 lines after the OPTIONS preflight block (line ~310)
- **Helper:** Reuse `isAllowedOrigin()` from `security-headers.ts`. Add `isAllowedReferer()`:

```typescript
// security-headers.ts
export function isAllowedReferer(referer: string): boolean {
  try {
    const url = new URL(referer);
    return isAllowedOrigin(url.origin);
  } catch {
    return false;
  }
}
```

- **CSRF exemption:** Routes in `TOKEN_AUTH_ROUTES` (and routes matched by `isTokenAuthenticatedApiRoute()`) are exempt from the CSRF check. This includes webhooks, esign signing routes, and the new U-06 public access-request routes. These routes use token/signature auth rather than session cookies, so CSRF does not apply.
- **Tests:** Add cases to existing middleware test suite
- **No new dependencies, no DB changes, no env vars**

### 2.5 Edge Cases

- **Missing both Origin and Referer:** Allow. Some privacy proxies strip both headers. Blocking would break legitimate users. SameSite cookies still protect these requests.
- **Localhost in development:** `isAllowedOrigin()` already allows `localhost` and `127.0.0.1`.
- **Vercel preview deployments:** Covered by `NEXT_PUBLIC_APP_URL` check in `isAllowedOrigin()`.
- **Admin app cross-origin requests:** Admin app at `admin.propertyprofl.com` hits web API. This is a subdomain of `PRODUCTION_DOMAIN` — already allowed by `isAllowedOrigin()`.

---

## 3. U-06: Self-Service Resident Signup

### 3.1 User Flow

```
1. Resident visits [slug].propertyprofl.com/request-access
   (or follows a shareable link with ?ref=<tracking-code>)
2. Fills form: full name, email, unit number, owner/tenant toggle
3. Receives 6-digit OTP code via email (Resend, not Supabase auth)
4. Enters OTP on the same page to verify email ownership
5. System creates access_requests row (status: pending)
6. Admin receives notification (in-app + email)
7. Admin reviews request in dashboard → approve or deny
8. Approve: creates user + user_role + Supabase auth account, sends welcome email
9. Deny: sends denial email with optional reason
```

### 3.2 Why OTP Instead of Supabase Auth

We verify email ownership before creating the request, but we do NOT create a Supabase auth account until approval. This avoids:
- Orphan auth accounts for denied/expired requests
- Supabase auth user limits being consumed by spam requests
- Complexity of managing pre-approval auth state

A simple 6-digit OTP stored in the `access_requests` row (hashed, with expiry + attempt limit) handles verification without touching Supabase auth.

### 3.3 Database: `access_requests` Table

**Migration:** `0114_access_requests.sql` (journal idx 114)

```sql
CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" bigserial PRIMARY KEY,
  "community_id" bigint NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "full_name" varchar(255) NOT NULL,
  "phone" varchar(50),
  "unit_id" bigint REFERENCES "units"("id") ON DELETE SET NULL,
  "claimed_unit_number" varchar(100),
  "role_requested" varchar(20) NOT NULL DEFAULT 'resident',  -- always 'resident'; owner vs tenant determined by is_unit_owner
  "is_unit_owner" boolean NOT NULL DEFAULT false,  -- true = owner, false = tenant
  "status" varchar(20) NOT NULL DEFAULT 'pending_verification',
  "otp_hash" varchar(255),
  "otp_expires_at" timestamp with time zone,
  "otp_attempts" integer NOT NULL DEFAULT 0,
  "email_verified_at" timestamp with time zone,
  "reviewed_by" uuid REFERENCES "users"("id"),
  "reviewed_at" timestamp with time zone,
  "denial_reason" text,
  "ref_code" varchar(50),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone
);

-- Indexes
CREATE INDEX idx_access_requests_community_status
  ON access_requests(community_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_access_requests_email
  ON access_requests(email) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;

-- Tenant-scoped policies (all access goes through createScopedClient)
-- Public routes call createScopedClient(communityId) where communityId is
-- resolved from the request body. This sets app.community_id GUC, satisfying
-- both the RLS policies and the write-scope trigger below.
-- (Same pattern as invitation acceptance: see api/v1/invitations/route.ts)
CREATE POLICY "access_requests_tenant_insert"
  ON access_requests FOR INSERT
  WITH CHECK (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "access_requests_tenant_select"
  ON access_requests FOR SELECT
  USING (community_id = current_setting('app.community_id', true)::bigint);

CREATE POLICY "access_requests_tenant_update"
  ON access_requests FOR UPDATE
  USING (community_id = current_setting('app.community_id', true)::bigint);

-- Write-scope trigger (standard tenant isolation)
CREATE TRIGGER enforce_community_scope
  BEFORE INSERT OR UPDATE ON access_requests
  FOR EACH ROW EXECUTE FUNCTION enforce_community_write_scope();

-- Partial unique index: prevent duplicate pending requests per email per community
CREATE UNIQUE INDEX idx_access_requests_unique_pending
  ON access_requests(community_id, email)
  WHERE status IN ('pending_verification', 'pending') AND deleted_at IS NULL;
```

**Status values:** `pending_verification` → `pending` → `approved` / `denied` / `expired`

**Role model clarification:** The V2 role model uses 3 roles: `resident`, `manager`, `pm_admin`. The old UI labels "owner"/"tenant" map to `resident` + `isUnitOwner: true/false`. Self-service signup only supports the `resident` role — requesting manager/admin roles requires admin invitation. The form shows an "I am a unit owner" toggle which sets `is_unit_owner`. On approval, the service creates a `user_roles` row with `role: 'resident'` and `isUnitOwner` from the request.

### 3.4 Drizzle Schema

**File:** `packages/db/src/schema/access-requests.ts`

```typescript
import { bigint, bigserial, boolean, integer, pgTable, timestamp, uuid, varchar, text, index } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

export const accessRequests = pgTable('access_requests', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' }).notNull().references(() => communities.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, { onDelete: 'set null' }),
  claimedUnitNumber: varchar('claimed_unit_number', { length: 100 }),
  roleRequested: varchar('role_requested', { length: 20 }).notNull().default('resident'),
  isUnitOwner: boolean('is_unit_owner').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('pending_verification'),
  otpHash: varchar('otp_hash', { length: 255 }),
  otpExpiresAt: timestamp('otp_expires_at', { withTimezone: true }),
  otpAttempts: integer('otp_attempts').notNull().default(0),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  denialReason: text('denial_reason'),
  refCode: varchar('ref_code', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
// NOTE: Partial indexes (WHERE deleted_at IS NULL) and the unique partial index
// are defined in the migration SQL only. Drizzle's index() builder does not
// support WHERE clauses. The Drizzle schema omits these indexes — they are
// migration-managed, which is the standard pattern in this codebase.
```

### 3.5 API Routes

All under `apps/web/src/app/api/v1/access-requests/`:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/v1/access-requests` | Public (rate-limited) | Submit access request + send OTP |
| `POST` | `/api/v1/access-requests/verify` | Public (rate-limited) | Verify OTP, transition to `pending` |
| `POST` | `/api/v1/access-requests/[id]/approve` | Authenticated (admin) | Approve request, create user |
| `POST` | `/api/v1/access-requests/[id]/deny` | Authenticated (admin) | Deny request with reason |
| `GET` | `/api/v1/access-requests` | Authenticated (admin) | List pending requests for community |

**Route authentication:**

| Route | Auth | Registration |
|-------|------|-------------|
| `POST /api/v1/access-requests` | Public (rate-limited) | Add to `TOKEN_AUTH_ROUTES` |
| `POST /api/v1/access-requests/verify` | Public (rate-limited) | Add to `TOKEN_AUTH_ROUTES` |
| `GET /api/v1/access-requests` | Session (admin) | Standard protected route (no registration needed) |
| `POST /api/v1/access-requests/[id]/approve` | Session (admin) | Standard protected route (no registration needed) |
| `POST /api/v1/access-requests/[id]/deny` | Session (admin) | Standard protected route (no registration needed) |

The two public POST routes go in `TOKEN_AUTH_ROUTES` as exact `{ path, method }` tuples. The admin routes (approve/deny/list) use standard session auth and do NOT need `TOKEN_AUTH_ROUTES` entries — they are under `/api/v1/` which is already a protected prefix. The dynamic `[id]` segments in approve/deny are handled by Next.js routing, not by middleware path matching.

Both public routes are also exempt from CSRF Origin enforcement (see §2.4) since they are in `TOKEN_AUTH_ROUTES`.

### 3.6 OTP Verification Details

- **Generation:** `crypto.randomInt(100000, 999999)` → 6-digit code
- **Storage:** bcrypt hash in `otp_hash`, expiry in `otp_expires_at` (10 minutes)
- **Attempts:** Max 5 per OTP. After 5 failures, must request new OTP.
- **Rate limit:** Max 3 OTP sends per email per community per hour (prevents spam)
- **Resend:** Same POST endpoint; if existing request has `pending_verification` status, regenerate OTP instead of creating duplicate
- **Timing safety:** bcrypt comparison is inherently constant-time; no additional `timingSafeEqual` wrapper needed

### 3.7 Admin Review UI

**Location:** New section in the existing residents management area.

- Badge on sidebar "Residents" nav item showing pending request count
- "Access Requests" tab on residents page with filterable list
- Each request shows: name, email, claimed unit, requested role, submitted date
- Unit match indicator: green check if claimed unit exists and is unoccupied, yellow warning if occupied, red X if unit doesn't exist
- Approve button: opens confirmation dialog with role/unit assignment
- Deny button: opens dialog with optional denial reason text field

### 3.8 Email Templates

| Email | Trigger | Recipient |
|-------|---------|-----------|
| OTP verification | Request submitted | Requesting resident |
| Request pending notification | OTP verified | Community admins (board_president, cam, site_manager) |
| Approval welcome | Admin approves | New resident |
| Denial notification | Admin denies | Requesting resident |

### 3.9 Shareable Link

Admins can copy a link from the residents page: `[slug].propertyprofl.com/request-access?ref=<code>`

The `ref` code is a short alphanumeric string (8 chars, generated per-admin). It's stored in `ref_code` on the access request for analytics (which admin's link drove signups). It is NOT a secret — the page is public regardless of whether `ref` is present.

### 3.10 Edge Cases

| Case | Handling |
|------|----------|
| Duplicate request (same email, same community, pending) | Return existing request ID, resend OTP |
| Email already belongs to a community member | Reject with "already a member" message |
| Claimed unit doesn't exist | Allow request but flag for admin |
| Request expires (30 days, not reviewed) | Cron job marks as `expired` (extend existing daily cron) |
| Admin approves but Supabase auth creation fails | Return error, keep request in `pending`, admin can retry |
| Multiple communities: same email requests access to 2 communities | Allowed — requests are community-scoped |

### 3.11 Request-Access Page

**File:** `apps/web/src/app/(public)/[slug]/request-access/page.tsx`

Public page (no auth required). Community resolved from the `[slug]` route param by the page component itself (NOT by middleware — `shouldResolveTenant` only runs for protected prefixes). The page uses `createScopedClient` after resolving the community by slug, same pattern as the transparency page at `apps/web/src/app/(public)/[subdomain]/transparency/page.tsx`.

- Community branding (logo, colors) displayed at top
- Form fields: full name, email, unit number (with autocomplete from public units list), owner/tenant toggle
- After submit: OTP input field appears inline
- After verification: success message ("Your request has been submitted. An administrator will review it shortly.")
- If community has `selfRegistrationEnabled: false` (future setting): show "This community does not accept self-registration" message

### 3.12 Security Considerations

- **No auth account until approval:** Prevents Supabase auth user count inflation from spam
- **OTP is hashed (bcrypt):** Not stored in plaintext
- **Rate limiting:** 3 OTP sends/hour/email/community at API layer
- **No PII in URL:** Only community slug and optional non-secret ref code
- **Audit trail:** All approvals/denials logged via `logAuditEvent()`
- **Tenant isolation:** `access_requests` uses standard community_id scoping + RLS + write trigger

---

## 4. Files Changed Summary

### M-06 (CSRF)
| File | Change |
|------|--------|
| `apps/web/src/middleware.ts` | Add Origin/Referer check for mutating API routes (~15 lines) |
| `apps/web/src/lib/middleware/security-headers.ts` | Add `isAllowedReferer()` helper (~8 lines) |
| `apps/web/__tests__/middleware/csrf.test.ts` | New test file for CSRF enforcement |

### U-06 (Resident Signup)
| File | Change |
|------|--------|
| `packages/db/migrations/0114_access_requests.sql` | New migration |
| `packages/db/migrations/meta/_journal.json` | Add entry idx 114 |
| `packages/db/src/schema/access-requests.ts` | New Drizzle schema |
| `packages/db/src/schema/index.ts` | Export new schema |
| `apps/web/src/app/api/v1/access-requests/route.ts` | POST (submit) + GET (list) |
| `apps/web/src/app/api/v1/access-requests/verify/route.ts` | POST (OTP verify) |
| `apps/web/src/app/api/v1/access-requests/[id]/approve/route.ts` | POST (approve) |
| `apps/web/src/app/api/v1/access-requests/[id]/deny/route.ts` | POST (deny) |
| `apps/web/src/app/(public)/[slug]/request-access/page.tsx` | Public request form |
| `apps/web/src/lib/services/access-request-service.ts` | Business logic |
| `apps/web/src/middleware.ts` | Add access-request routes to TOKEN_AUTH_ROUTES |
| `packages/email/src/templates/otp-verification.tsx` | OTP email template |
| `packages/email/src/templates/access-request-pending.tsx` | Admin notification |
| `packages/email/src/templates/access-request-approved.tsx` | Welcome email |
| `packages/email/src/templates/access-request-denied.tsx` | Denial email |
| `scripts/verify-scoped-db-access.ts` | Add allowlist entries (see below) |

**DB access guard allowlist additions** (`scripts/verify-scoped-db-access.ts`):

- `WEB_UNSAFE_IMPORT_ALLOWLIST`: Add `src/lib/services/access-request-service.ts` (needs `@propertypro/db/supabase/admin` for Supabase auth account creation on approval, same pattern as `src/lib/services/onboarding-service.ts`)
- `NO_RLS_ALLOWLIST`: Add `0114_access_requests.sql` (standard for all new migrations)
| `apps/web/__tests__/access-requests/` | Unit tests for all routes + service |

---

## 5. Migration Safety

- **Next migration number:** 0114 (after 0113_demo_lifecycle.sql)
- **Journal index:** 114 (after idx 113)
- **No conflicts:** No other branches reserve this range
- **RLS included:** Policies in migration SQL
- **Write trigger included:** Standard `enforce_community_write_scope`
- **Soft delete:** `deleted_at` column included

---

## 6. Out of Scope

- Custom domain support (future extension — tenant resolver is already extensible)
- Self-registration toggle per community (setting stub mentioned but not implemented)
- Bulk approve/deny (single-request operations only for V1)
- Document upload with request (e.g., lease proof) — future enhancement
