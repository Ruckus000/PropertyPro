# Account Lifecycle Management — Design Spec

**Date:** 2026-03-23
**Status:** Draft
**Approach:** Dedicated Lifecycle Service (Approach B)

---

## 1. Problem Statement

PropertyPro lacks platform admin controls for managing community access periods and account deletion. Specifically:

- No mechanism for platform admins to grant free access for a configurable period
- No self-service account deletion (current UI says "Contact support")
- No community deletion workflow
- No admin visibility into deletion requests or access plan status
- The admin app (`apps/admin/`) is undocumented in CLAUDE.md and AGENTS.md

## 2. Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Who grants free access | Platform admin only | Operational tool, not self-service |
| Expiry behavior | Soft grace (configurable) + auto-convert nudge | Smooth runway, not a cliff |
| Conversion UX | Email milestones + self-service banner + admin controls | Multi-channel nudge |
| Email infra | Resend with new templates + new cron | Existing pattern |
| Grace period | Configurable per community by platform admin | Flexibility per deal |
| Retroactive grants | Any community (new, existing, lapsed) | Goodwill, partnerships |
| Deletion model | Full self-service, 6-month PII retention, recovery | GDPR-aligned |
| User data on delete | PII scrub only — never hard-delete user row | FK integrity preserved |
| Community deletion | Hybrid — admin initiates + cooling period, platform admin notified + can intervene | Balance autonomy + oversight |
| Grant UI model | Structured access plan (future: discounted rates) | Future-proof without building discounting now |
| Subscription guard | Column on communities (`free_access_expires_at`) | Single query, no join |
| Onboarding funnel | Out of scope | Separate effort |

## 3. Data Model

### 3.1 New Table: `access_plans`

Platform admin table (NOT tenant-scoped via RLS). Must be added to `RLS_GLOBAL_TABLE_EXCLUSIONS` in `packages/db/src/schema/rls-config.ts`, like `platform_admin_users`.

**WARNING:** Do NOT add this table to `RLS_TENANT_TABLES`. That array is guarded by a hardcoded `RLS_EXPECTED_TENANT_TABLE_COUNT` invariant (currently 46). Adding to the wrong list will break CI with a confusing count mismatch. This table belongs exclusively in `RLS_GLOBAL_TABLE_EXCLUSIONS`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `bigserial` | PK | |
| `community_id` | `bigint` | FK → communities, NOT NULL | Target community |
| `expires_at` | `timestamp(tz)` | NOT NULL | Source of truth for when free access ends |
| `grace_ends_at` | `timestamp(tz)` | NOT NULL | Source of truth for when grace period ends |
| `duration_months` | `integer` | NOT NULL | Informational — what admin entered |
| `grace_period_days` | `integer` | NOT NULL, DEFAULT 30 | Informational — what admin entered |
| `stripe_coupon_id` | `text` | nullable | Future: Stripe coupon sync |
| `granted_by` | `uuid` | FK → users, NOT NULL | Platform admin who created this plan (including extension plans) |
| `notes` | `text` | nullable | Reason, context |
| `converted_at` | `timestamp(tz)` | nullable | Terminal: community subscribed |
| `revoked_at` | `timestamp(tz)` | nullable | Terminal: manually revoked |
| `revoked_by` | `uuid` | FK → users, nullable | Who revoked |
| `email_14d_sent_at` | `timestamp(tz)` | nullable | Idempotency: 14-day warning email |
| `email_7d_sent_at` | `timestamp(tz)` | nullable | Idempotency: 7-day warning email |
| `email_expired_sent_at` | `timestamp(tz)` | nullable | Idempotency: expired notice email |
| `created_at` | `timestamp(tz)` | NOT NULL, DEFAULT now() | |

**Design notes:**
- No `status` column. Status is computed at query time via `computeAccessPlanStatus(plan)` to avoid drift (same pattern as compliance engine).
- No `updated_at`. Records are immutable after creation. Extensions create a NEW plan + revoke the old one — audit trail shows full history.
- No `plan_type` or `discount_percent`. Ship free-only. Add `-- future: 'discounted' type with Stripe coupon sync` comment.
- `expires_at` and `grace_ends_at` are the sources of truth. `duration_months` and `grace_period_days` are informational metadata (what the admin entered). The service computes dates on insert; the dates are never re-derived from the metadata.
- `granted_by` always stores the platform admin who created the plan. For extension plans (where an old plan is revoked and a new one created), `granted_by` is the admin who performed the extension. The service parameter is always `grantedBy` — there is no separate `extendedBy` field.

**Status computation** (`computeAccessPlanStatus`):
```
if revoked_at   → 'revoked'
if converted_at → 'converted'
if now < expires_at     → 'active'
if now < grace_ends_at  → 'in_grace'
else                    → 'expired'
```

### 3.2 New Table: `account_deletion_requests`

Platform-level table (NOT tenant-scoped). Must be added to `RLS_GLOBAL_TABLE_EXCLUSIONS`.

**WARNING:** Do NOT add this table to `RLS_TENANT_TABLES`. Same rationale as `access_plans` above — belongs exclusively in `RLS_GLOBAL_TABLE_EXCLUSIONS`.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | `bigserial` | PK | |
| `request_type` | `text` | NOT NULL, CHECK IN ('user', 'community') | |
| `user_id` | `uuid` | FK → users, NOT NULL | Requesting user |
| `community_id` | `bigint` | FK → communities, nullable | Set for community deletions |
| `status` | `text` | NOT NULL, CHECK IN ('cooling', 'soft_deleted', 'purged', 'cancelled', 'recovered') | |
| `cooling_ends_at` | `timestamp(tz)` | NOT NULL | 30 days from request |
| `scheduled_purge_at` | `timestamp(tz)` | nullable | 6 months after soft-delete |
| `purged_at` | `timestamp(tz)` | nullable | When PII was scrubbed |
| `cancelled_at` | `timestamp(tz)` | nullable | |
| `cancelled_by` | `uuid` | FK → users, nullable | User or platform admin |
| `recovered_at` | `timestamp(tz)` | nullable | When recovered post-soft-delete |
| `platform_admin_notified_at` | `timestamp(tz)` | nullable | For community deletions |
| `intervention_notes` | `text` | nullable | Admin's reason for intervening |
| `confirmation_email_sent_at` | `timestamp(tz)` | nullable | Idempotency: initiation email |
| `execution_email_sent_at` | `timestamp(tz)` | nullable | Idempotency: soft-delete notification email |
| `created_at` | `timestamp(tz)` | NOT NULL, DEFAULT now() | |

**Indexes:**
- `(user_id, status)` — fast lookup for "does this user have a pending deletion?"
- `(community_id, status)` — fast lookup for community deletions
- `(status, cooling_ends_at)` — cron query for transitions
- `(status, scheduled_purge_at)` — cron query for purges

### 3.3 Modified Table: `communities`

Add one column:

| Column | Type | Notes |
|--------|------|-------|
| `free_access_expires_at` | `timestamp(tz)`, nullable | Denormalized from access_plans for fast subscription guard check |

**No NEW columns added to `users` table.** The existing `users.deletedAt` column (already present in schema) is used by the service to mark soft-deleted users. Deletion workflow state (cooling period, purge schedule, cancellation) lives exclusively in `account_deletion_requests` — no new columns needed on `users`.

### 3.4 PII Purge Strategy

On purge (6 months after soft-delete, or on customer request):
1. Scrub `users` row: `email → 'deleted-{uuid}@redacted'`, `fullName → 'Deleted User'`, `phone → null`, `avatarUrl → null`
2. Ban in Supabase auth (existing pattern from demo expiry) or delete from `auth.users`
3. Mark request as `purged`
4. User row remains for FK integrity — all references survive

**Why not hard-delete the user row:** 20+ tables reference `users.id`. Some use `onDelete: 'cascade'` (forum_threads, poll_votes, amenity_reservations, arc_submissions, etc.), some use `onDelete: 'set null'`, one uses `onDelete: 'restrict'` (compliance_audit_log). Hard-deleting would either cascade-destroy data or throw FK violations. PII scrub achieves the same privacy goal without touching FK infrastructure.

**FK tables verified with CASCADE (data would be destroyed on hard-delete):**
- `amenity_reservations.userId`, `forum_threads.authorUserId`, `forum_replies.authorUserId`
- `poll_votes.userId`, `notification_preferences.userId`, `calendar_sync_tokens.userId`
- `arc_submissions.submittedByUserId`, `esign_consent.userId`
- `announcement_delivery_log.userId`, `emergency_broadcast_recipients.userId`
- `election_proxies.grantorUserId`, `election_proxies.proxyHolderUserId`

**FK table verified with RESTRICT (would throw error on hard-delete):**
- `compliance_audit_log.userId`

## 4. Service Layer

### 4.1 Account Lifecycle Service

**Location:** `apps/web/src/lib/services/account-lifecycle-service.ts`

**Access pattern:** The admin app (`apps/admin/`, port 3001) calls the web app's API routes via HTTP with CORS — it does NOT import the service directly. This follows the existing pattern (demo conversion uses `/api/v1/admin/demo/[slug]/convert` with CORS from admin app).

#### Free Access Operations

**`grantFreeAccess(communityId, { durationMonths, gracePeriodDays, notes, grantedBy })`**
- IN TRANSACTION:
  - Creates `access_plans` row with computed `expires_at` and `grace_ends_at`
  - Sets `communities.free_access_expires_at`
- Syncs to Stripe (creates trial sub or coupon) if community has `stripeCustomerId`
- Logs to `compliance_audit_log`

**`revokeFreeAccess(planId, { revokedBy, reason })`**
- IN TRANSACTION:
  - Sets `revoked_at` on plan
  - Recalculates `communities.free_access_expires_at` (checks for other active plans — if none, clears the column)
- Cancels Stripe trial if synced
- Sends notification email to community admins

**`extendFreeAccess(planId, { additionalMonths, grantedBy, notes })`**
- IN TRANSACTION:
  - Revokes existing plan (sets `revoked_at`, `revoked_by = grantedBy`)
  - Creates NEW plan with extended dates (new `granted_by`, new `notes`)
  - Updates `communities.free_access_expires_at`
- Syncs new end date to Stripe
- Audit trail: Plan A revoked, Plan B created — who, when, why all captured

**`computeAccessPlanStatus(plan)`**
- Pure function, no DB call
- See status computation in Section 3.1

#### User Deletion Operations

**`requestUserDeletion(userId)`**
- Creates deletion request (`status: 'cooling'`, `cooling_ends_at: now + 30d`)
- Sends confirmation email with cancel link
- Returns request id

**`cancelUserDeletion(requestId, cancelledBy)`**
- Sets `status: 'cancelled'`, `cancelled_at`
- Sends "deletion cancelled" email

**`executeUserSoftDelete(requestId)`** (called by cron)
- IN TRANSACTION:
  - Sets `users.deletedAt`
  - Sets `status: 'soft_deleted'`, `scheduled_purge_at: now + 6 months`
- Bans in Supabase auth (non-transactional, non-fatal on failure)
- Sends "account deleted, recoverable for 6 months" email
- Guards: `confirmation_email_sent_at` check before re-sending

**`recoverUser(requestId, recoveredBy)`**
- IN TRANSACTION:
  - Clears `users.deletedAt`
  - Sets `status: 'recovered'`, `recovered_at`
- Unbans in Supabase auth
- Sends "account recovered" email

**`purgeUserPII(requestId)`** (called by cron)
- Guards: `purged_at IS NULL` (idempotent — safe if cron runs twice)
- Scrubs users row (see Section 3.4)
- Bans or deletes from `auth.users`
- Sets `status: 'purged'`, `purged_at`
- Does NOT re-send email if `confirmation_email_sent_at` already set

#### Community Deletion Operations

**`requestCommunityDeletion(communityId, requestedBy)`**
- Creates deletion request (`status: 'cooling'`, `cooling_ends_at: now + 30d`)
- Notifies platform admins (email + sets `platform_admin_notified_at`)
- Sends confirmation email to requesting admin

**`interveneCommunityDeletion(requestId, { adminUserId, notes })`**
- Platform admin cancels during cooling period
- Sets `status: 'cancelled'`, `cancelled_at`, `intervention_notes`
- Notifies community admin

**`executeCommunitySoftDelete(requestId)`** (called by cron)
- IN TRANSACTION:
  - Sets `communities.deletedAt`
  - Cancels Stripe subscription if active
  - Sets `status: 'soft_deleted'`, `scheduled_purge_at: now + 6 months`

**`recoverCommunity(requestId, adminUserId)`**
- Platform admin only, within 6-month window
- IN TRANSACTION:
  - Clears `communities.deletedAt`
  - Sets `status: 'recovered'`, `recovered_at`
- Notifies community admin

**`purgeCommunityData(requestId)`** (called by cron)
- Guards: `purged_at IS NULL` (idempotent)
- Scrubs PII for community-only users (users with no roles in other communities)
- Does NOT delete community row (FK integrity)
- Sets `status: 'purged'`, `purged_at`

### 4.2 Explicit Design Decision: Free Access Overrides Locked Subscription

Scenario: Community has active Stripe subscription → admin grants 3 months free as goodwill → community cancels Stripe → `subscriptionStatus` goes to `canceled` → free access still has 2 months left.

**Decision:** Community stays unlocked. Free access overrides locked subscription status. This is intentional.

When free access eventually expires, the community is in `canceled` status with no subscription. The conversion email must handle the "re-subscribe" case (existing customer without active subscription), not just "first-time subscribe."

### 4.3 API Routes

#### Admin-Facing Routes (called by admin app via CORS)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/admin/access-plans` | Grant free access |
| POST | `/api/v1/admin/access-plans/[id]/extend` | Extend free access (revokes old plan, creates new — atomic) |
| DELETE | `/api/v1/admin/access-plans/[id]` | Revoke free access |
| GET | `/api/v1/admin/access-plans` | List all plans (with computed status) |
| GET | `/api/v1/admin/access-plans/community/[id]` | Plans for a specific community |
| GET | `/api/v1/admin/deletion-requests` | List all deletion requests |
| POST | `/api/v1/admin/deletion-requests/[id]/intervene` | Cancel community deletion (platform admin) |
| POST | `/api/v1/admin/deletion-requests/[id]/recover` | Recover soft-deleted user or community (platform admin). Route reads `request_type` from the request record to determine which service function to call (`recoverUser` vs `recoverCommunity`). No request body needed — the request record carries all context. |

All require platform admin auth. CORS allowed from `localhost:3001` and `ADMIN_APP_URL` (matching existing demo convert route pattern).

#### User/Community-Facing Routes

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/v1/account/delete` | Authenticated user (self only) | User requests own account deletion |
| POST | `/api/v1/account/delete/cancel` | Authenticated user (self only) | User cancels during cooling |
| GET | `/api/v1/account/delete/status` | Authenticated user (self only) | Check if user has pending deletion |
| POST | `/api/v1/communities/delete` | `requirePermission('community', 'delete')` — restricted to board_president, cam, property_manager_admin. Deliberately excludes board_member (insufficient authority for community destruction) and site_manager (apartment context, deletion goes through PM admin). | Community admin requests deletion |
| POST | `/api/v1/communities/delete/cancel` | Same permission as above | Community admin cancels during cooling |
| POST | `/api/v1/billing/subscribe` | Authenticated user, admin-tier role | Smart subscribe endpoint. Checks if community has `stripeCustomerId`: if yes, redirects to Stripe billing portal; if no, creates a new Stripe checkout session. This is the single CTA target for the free access banner. |

### 4.4 Subscription Guard Modification

**File:** `apps/web/src/lib/middleware/subscription-guard.ts`

Change: add `freeAccessExpiresAt` to the select clause. Free access check happens BEFORE locked status check.

```typescript
export async function requireActiveSubscriptionForMutation(
  communityId: number,
): Promise<void> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      subscriptionStatus: communities.subscriptionStatus,
      freeAccessExpiresAt: communities.freeAccessExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const status = rows[0]?.subscriptionStatus ?? null;
  const freeAccessExpiresAt = rows[0]?.freeAccessExpiresAt ?? null;

  // Free access overrides locked subscription status
  if (freeAccessExpiresAt && freeAccessExpiresAt > new Date()) {
    return;
  }

  if (status !== null && LOCKED_STATUSES.has(status)) {
    throw new AppError(
      'Your subscription is no longer active. Please reactivate to continue.',
      403,
      'SUBSCRIPTION_REQUIRED',
      { subscriptionStatus: status },
    );
  }
}
```

### 4.5 Cron Job

**Single route:** `/api/v1/internal/account-lifecycle`
**Schedule:** Daily
**Auth:** `ACCOUNT_LIFECYCLE_CRON_SECRET` via `requireCronSecret`

Handles in sequence:
1. **Deletion cooling → soft-delete**: `cooling_ends_at < now()` AND `status = 'cooling'` → calls `executeUserSoftDelete` or `executeCommunitySoftDelete`. Email guarded by `execution_email_sent_at IS NULL`.
2. **Deletion purge**: `scheduled_purge_at < now()` AND `status = 'soft_deleted'` AND `purged_at IS NULL` → calls `purgeUserPII` or `purgeCommunityData`.
3. **Free access 14-day warning**: `expires_at` between now and now+14d AND `email_14d_sent_at IS NULL` → sends warning, sets `email_14d_sent_at`.
4. **Free access 7-day warning**: `expires_at` between now and now+7d AND `email_7d_sent_at IS NULL` → sends warning, sets `email_7d_sent_at`.
5. **Free access expired notice**: `expires_at < now()` AND `grace_ends_at > now()` AND `email_expired_sent_at IS NULL` → sends expiry notice, sets `email_expired_sent_at`.

Each step logs counts. Returns summary JSON. All email sends are idempotent via dedicated timestamp columns — safe if cron runs twice (Vercel cron retries on timeout).

### 4.6 Email Templates (5 new, in `packages/email`)

| Template | Trigger | Content |
|----------|---------|---------|
| `free-access-expiring` | Cron (14d and 7d milestones) | "Your free access ends in {days} days. Subscribe to continue uninterrupted." + Subscribe CTA |
| `free-access-expired` | Cron (expired, in grace) | "Your free access has ended. Subscribe to continue." Handles both first-time and re-subscribe cases. |
| `account-deletion-initiated` | User requests deletion | "Your account deletion is scheduled. Cancel anytime in the next 30 days. After deletion, your data is recoverable for 6 months. After {purge_date}, your personal data will be permanently removed." |
| `account-deletion-executed` | Cron (cooling ended) | "Your account has been deleted. You have until {purge_date} to request recovery by contacting support." |
| `account-recovered` | Admin recovers account | "Your account has been restored." |

## 5. UI Layer

### 5.1 Admin App (`apps/admin/`)

#### New Tab: Access (in ClientWorkspace)

**File:** `apps/admin/src/components/clients/ClientWorkspace.tsx`

Add `'access'` to the `Tab` type union and both tab arrays (apartment and non-apartment). The access tab is always visible — all community types can receive free access.

**Access tab content:**
- Status indicator showing current plan state (active=green, in_grace=amber, expired=red, none=gray) with remaining days
- "Grant Free Access" button → inline form (matching admin app's existing inline pattern, NOT an extracted dialog component):
  - Duration (months) — number input
  - Grace period (days) — number input, default 30
  - Notes — textarea
  - Confirm button
- History table of all plans for this community with computed status per row
- "Extend" action on active plans (inline form: additional months, notes — calls `/api/v1/admin/access-plans/[id]/extend`)
- "Revoke" action on active plans (inline confirmation with reason field)
- Stripe sync status if community has `stripeCustomerId`

**State handling (per design system rules):**
- Loading: Skeleton placeholder for status + table
- Empty: "No access plans yet. Grant free access to get this community started." with Grant CTA
- Error: AlertBanner danger with retry

#### New Page: Deletion Requests (`/deletion-requests`)

**New route:** `apps/admin/src/app/(authenticated)/deletion-requests/page.tsx`

- Filterable/sortable table of all deletion requests across the platform
- Columns: type (user/community), requester email, target (user email or community name), status badge, requested date, cooling ends / purge scheduled
- Filter by status: cooling / soft_deleted / all
- Filter by type: user / community
- Row actions:
  - `cooling` community requests → "Intervene" button (inline confirmation with notes field)
  - `soft_deleted` requests → "Recover" button (inline confirmation)
  - Terminal statuses (`purged`, `cancelled`, `recovered`) → read-only

**State handling:**
- Loading: Table skeleton
- Empty: "No deletion requests. All accounts are active."
- Error: AlertBanner danger with retry

#### Sidebar Modification

**File:** `apps/admin/src/components/Sidebar.tsx`

Add to `NAV_ITEMS`:
```typescript
{ href: '/deletion-requests', label: 'Deletions', icon: UserX }
```

Badge showing count of `status='cooling'` requests. This is the first dynamic sidebar content in the admin app — fetch count in the layout server component, pass to sidebar as prop. No polling; updates on page navigation.

#### Dashboard Additions

**File:** `apps/admin/src/components/dashboard/PlatformDashboard.tsx`

Add two stat cards to existing dashboard:
- "Active Free Access" — count of communities with active access plans
- "Pending Deletions" — count of requests with `status='cooling'`
- Quick action links to the relevant pages

#### Component Count (Reduced)

Per admin app conventions (verified: demo management uses inline modals, not extracted components), keep dialogs inline. Extracted components:

| Component | Justification |
|-----------|---------------|
| `AccessPlanHistory` | Reusable table with computed status, date formatting |
| `DeletionRequestsClient` | Full page client component with filtering/sorting state |

All confirmation modals (grant, revoke, intervene, recover) are inline state within their parent — matching existing admin app patterns.

### 5.2 Web App (`apps/web/`)

#### Account Settings — Danger Zone Rewrite

**File:** `apps/web/src/components/settings/account-settings-client.tsx`

The existing Danger Zone section (line 417-434) currently says:
- "Permanently remove your account and all associated data. This action cannot be undone."
- "Contact support to delete your account."

Replace with:
- Updated copy: "Request account deletion. Your account will enter a 30-day cooling period, during which you can cancel. After deletion, your personal data is recoverable for 6 months. After that, personal data is permanently scrubbed."
- "Delete My Account" button → opens inline confirmation section
- Confirmation requires typing "DELETE" to proceed
- If active deletion request exists: show status (cooling countdown with date, or soft-deleted with purge date) + "Cancel Deletion" button (only during cooling)

#### Community Deletion — New Section in Account Settings

**Location decision:** The web app has no "community settings" page for community admins (board presidents, CAMs). Community configuration happens in the admin app. Adding a new page just for one delete button is overkill.

**Solution:** Add a "Community" section to the existing account settings page (`account-settings-client.tsx`), visible only to admin-tier roles. It's already a stacked `max-w-2xl` layout with Profile, Password, and Danger Zone sections — adding one more is natural.

Content:
- "Delete Community" subsection within Danger Zone (below "Delete Account")
- Only visible to users with community deletion authority (board_president, cam, property_manager_admin). Deliberately excludes board_member (insufficient authority) and site_manager (apartment deletion goes through PM admin).
- Confirmation requires typing the community name
- Note: "Platform administrators will be notified and may contact you during the 30-day cooling period."
- If active request exists: show status + "Cancel Deletion" button

#### Free Access Banner — New Component

**File:** `apps/web/src/components/layout/free-access-banner.tsx` (new)

There is NO existing subscription banner component to modify. The `app-shell.tsx` has a hardcoded inline conditional for `past_due` (line 154). This is a new component rendered in `ShellInner` alongside the existing `past_due` alert.

**Rendering logic (in `app-shell.tsx`):**

The `ShellInner` component in `apps/web/src/components/layout/app-shell.tsx` already receives `subscriptionStatus` as a prop. Add `freeAccessExpiresAt` to `AppShellProps` (same pattern). The server component that renders `AppShell` (the authenticated layout) already queries community data — add `free_access_expires_at` to that query.

**Props addition to `AppShellProps`:**
```typescript
freeAccessExpiresAt?: string | null; // ISO timestamp string
```

**Render condition:** Only renders when `freeAccessExpiresAt` is set AND subscription is not `active` or `trialing` (avoid showing banner alongside an active subscription).

**Banner states:**
- `>14 days remaining`: Info tone — "Free access — {days} days remaining"
- `≤14 days remaining`: Warning tone — "Free access expires in {days} days. Subscribe to continue."
- `expired, in grace`: Alert/danger tone — "Free access has ended. Subscribe now to avoid losing access."
- Each includes "Subscribe" CTA button

**Subscribe CTA:** Links to `POST /api/v1/billing/subscribe` (defined in Section 4.3). This single route handles both cases server-side:
1. Community has `stripeCustomerId` → redirects to Stripe billing portal
2. Community has no `stripeCustomerId` → creates a new Stripe checkout session

This avoids leaking `stripeCustomerId` to the client.

## 6. Documentation Updates

### 6.1 CLAUDE.md

Add to Project Structure section:
```
apps/admin/            # Platform admin console (super_admin only, port 3001)
```

Add to Development Commands:
```bash
pnpm --filter @propertypro/admin dev  # Run admin app (port 3001)
```

### 6.2 AGENTS.md

Add new section:

```markdown
## 8. Admin App (`apps/admin/`)

The platform admin console is a separate Next.js deployment (`apps/admin/`). It runs on port 3001 and is authenticated via the `platform_admin_users` table (super_admin role only).

- **Not a monorepo shared import:** The admin app does NOT import from `apps/web/src/`. It consumes web app functionality via HTTP API routes (CORS-allowed).
- **Database access:** Uses its own Supabase clients. Queries are unscoped (platform-level, not tenant-scoped).
- **Cookie isolation:** Must use `sb-admin-auth-token` cookie name (configured in `apps/admin/src/lib/auth/cookie-config.ts`) to avoid collision with the web app's `sb-auth-token` on localhost.
- **Dev login:** `GET /dev/agent-login?as=pm_admin` (development only, hardcoded to `pm.admin@sunset.local`)
```

## 7. Migration Considerations

- Check `packages/db/migrations/` for current max migration number before creating new files
- Check `packages/db/migrations/meta/_journal.json` for current max journal index
- New tables (`access_plans`, `account_deletion_requests`) must be added to `RLS_GLOBAL_TABLE_EXCLUSIONS` in `rls-config.ts`
- New column on `communities` (`free_access_expires_at`) — standard ALTER TABLE ADD COLUMN
- New env var: `ACCOUNT_LIFECYCLE_CRON_SECRET`
- The `subscription-guard.ts` file is in the CI allowlist for unscoped DB access (uses `createUnscopedClient()`) — no allowlist change needed for the guard modification

## 8. Out of Scope

- Discounted access plans (future: add `plan_type` enum + `discount_percent` column)
- Onboarding funnel visibility / pending signup pipeline dashboard
- Stripe coupon creation/management
- Data export before deletion (potential future enhancement)
- Bulk access plan operations
