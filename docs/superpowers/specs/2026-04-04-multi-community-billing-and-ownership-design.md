# Multi-Community Billing & Ownership Design

**Date:** 2026-04-04
**Status:** Draft for review
**Owner:** Product + Engineering

## Problem Statement

PropertyPro's current billing model assumes **one community = one subscription = one customer**. This creates friction in two directions:

1. **Property Managers managing multiple communities** must sign up, pay, and be invoiced separately for each community. A PM with 15 communities gets 15 invoices, 15 credit card charges, and no volume incentive to consolidate on PropertyPro. This caps revenue growth and makes churn easy.
2. **Owners in multiple communities** (e.g. owning a condo in one building and a house in an HOA) must create separate accounts per community. No unified view, no cross-community notifications, and joining is admin-gated only.

This spec defines a comprehensive solution covering:

- **Billing Groups** with consolidated Stripe billing and volume discounts
- **Add Community flow** for existing PMs
- **Payment update mechanics** for volume tier changes
- **Unified Owner Dashboard** across multiple communities
- **Cross-community notifications**
- **Self-service community linking** via join requests

## Goals

- Enable PMs to add communities without per-community signup friction
- Incentivize portfolio consolidation via volume discounts (10/15/20%)
- Maintain per-community plan flexibility (different tiers per community)
- Give multi-community owners a unified cross-community experience
- Let owners discover and request to join their own communities

## Non-Goals (v1)

- Migrating existing PMs with separate Stripe Customers into a single consolidated customer (separate migration task)
- Per-unit or per-seat pricing within a community
- Annual billing discounts (orthogonal concern)
- White-label billing for PM companies (future)

---

## 1. Pricing Model

### Per-Community Plans with Volume Discounts

Each community keeps its own plan tier (Essentials / Professional / Operations Plus). Mixed plans within a PM's portfolio are fully supported. Volume discount is applied as a percentage across all subscriptions in the billing group.

| Communities in Group | Discount | Example (Professional $349) |
|---|---|---|
| 1–2 | 0% | $349.00/mo |
| 3–5 | 10% | $314.10/mo |
| 6–10 | 15% | $296.65/mo |
| 11+ | 20% | $279.20/mo |

**Key properties:**

- Discounts are **retroactive** across all communities in the group. Adding a 3rd community reduces the bill on the existing 2 as well.
- Discounts are **recalculated on every group membership change** (add or remove).
- Trial period (14 days) applies only to the first community in a signup flow, not to additional communities added by an existing PM.

### Comparison with Industry Standards

Buildium, AppFolio, and Rent Manager all use per-property billing with volume discounts. This model is familiar to PMs and aligns with their mental model of "one property, one line item."

---

## 2. Data Model

### New Table: `billing_groups`

```sql
CREATE TABLE billing_groups (
  id              bigserial PRIMARY KEY,
  name            text NOT NULL,
  stripe_customer_id text UNIQUE NOT NULL,
  owner_user_id   uuid NOT NULL REFERENCES users(id),
  volume_tier     text NOT NULL DEFAULT 'none'
                    CHECK (volume_tier IN ('none', 'tier_10', 'tier_15', 'tier_20')),
  active_community_count integer NOT NULL DEFAULT 0,
  coupon_sync_status text NOT NULL DEFAULT 'synced'
                    CHECK (coupon_sync_status IN ('synced', 'pending', 'failed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX idx_billing_groups_owner ON billing_groups(owner_user_id);
CREATE INDEX idx_billing_groups_stripe ON billing_groups(stripe_customer_id);
```

### Column Added to `communities`

```sql
ALTER TABLE communities ADD COLUMN billing_group_id bigint
  REFERENCES billing_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_communities_billing_group ON communities(billing_group_id);
```

A NULL `billing_group_id` means the community is a standalone subscription (backwards compatible).

### New Table: `community_join_requests`

```sql
CREATE TABLE community_join_requests (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id),
  community_id    bigint NOT NULL REFERENCES communities(id),
  unit_identifier text NOT NULL,
  resident_type   text NOT NULL CHECK (resident_type IN ('owner', 'tenant')),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'withdrawn')),
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_join_requests_user ON community_join_requests(user_id);
CREATE INDEX idx_join_requests_community_status ON community_join_requests(community_id, status);
CREATE UNIQUE INDEX idx_join_requests_unique_pending
  ON community_join_requests(user_id, community_id)
  WHERE status = 'pending';
```

RLS policies:
- Users can read/insert their own requests
- Community admins can read/update requests for their community
- The `createScopedClient` for the community admin path scopes to `community_id`

---

## 3. Add Community Flow

### User Experience

**Entry point:** PM dashboard (`pm.getpropertypro.com`) → "Add Community" button.

**Steps:**

1. **Community setup form** — name, address, type (condo_718 / hoa_720 / apartment), plan selection
2. **Pricing preview** — live preview showing the plan price with volume discount applied, and a note that the discount will apply to all communities in the group
3. **Embedded Stripe Checkout** — attached to the billing group's existing `stripe_customer_id`, no trial
4. **Webhook fires** `checkout.session.completed` with metadata `{ billingGroupId, communityType, selectedPlan }`
5. **Provisioning** — reuses existing state machine, with added steps for billing group linking and tier recalculation
6. **Volume tier recalculation** — runs atomically (see Section 4)
7. **PM redirected** to new community's dashboard

### Billing Group Creation

If the PM has no existing billing group, one is auto-created on their first add-community action:

- Looks up the PM's existing Stripe Customer from their first community's `stripeCustomerId`
- Creates `billing_groups` row with that customer ID
- Backfills the PM's existing community with the new `billing_group_id`
- Proceeds with add-community flow

If the PM already has a billing group, the new community joins it.

### API Endpoint

```
POST /api/v1/pm/communities
Body: { name, address, communityType, planId }
Auth: Requires pm_admin role
Returns: { checkoutSessionClientSecret, billingGroupId }
```

This endpoint:
1. Validates the PM has `pm_admin` role somewhere
2. Resolves or creates the billing group
3. Creates a Stripe Checkout session on the group's customer
4. Records a `pending_signups`-equivalent for the new community (reuses existing provisioning infrastructure with new `kind='add_to_group'` flag)

---

## 4. Stripe Payment Update Flow

### Coupons (Static, Created Once)

Four Stripe Coupon objects, created via seed script:

| ID | percent_off | duration |
|---|---|---|
| `volume_10pct` | 10 | forever |
| `volume_15pct` | 15 | forever |
| `volume_20pct` | 20 | forever |

These are `percent_off` coupons applied to each individual subscription in a billing group (not attached to the Customer object). Attaching per-subscription gives us explicit control when swapping coupons on tier changes.

### Tier Recalculation Logic

```typescript
async function recalculateVolumeTier(billingGroupId: number) {
  // Acquire advisory lock to prevent concurrent updates
  await db.execute(sql`SELECT pg_advisory_xact_lock(${billingGroupId})`);

  const group = await getBillingGroup(billingGroupId);
  const activeCount = await countActiveCommunities(billingGroupId);

  const newTier = determineTier(activeCount);
  // 1-2 → 'none', 3-5 → 'tier_10', 6-10 → 'tier_15', 11+ → 'tier_20'

  if (newTier === group.volume_tier) {
    // No tier change; just ensure new subscription has correct coupon
    return;
  }

  const subscriptions = await getAllActiveStripeSubscriptions(group.stripe_customer_id);
  const newCouponId = tierToCouponId(newTier); // null for 'none'

  // Mark sync pending before updates
  await updateBillingGroup(billingGroupId, { coupon_sync_status: 'pending' });

  try {
    for (const sub of subscriptions) {
      // Remove existing coupon, then apply new (if any)
      await stripe.subscriptions.update(sub.id, { coupon: '' });
      if (newCouponId) {
        await stripe.subscriptions.update(sub.id, { coupon: newCouponId });
      }
    }
    await updateBillingGroup(billingGroupId, {
      volume_tier: newTier,
      active_community_count: activeCount,
      coupon_sync_status: 'synced',
    });
  } catch (error) {
    await updateBillingGroup(billingGroupId, { coupon_sync_status: 'failed' });
    throw error; // Picked up by retry worker
  }
}
```

### Triggers for Recalculation

- **Community added** → after provisioning completes
- **Community subscription canceled** → webhook `customer.subscription.deleted`
- **Community removed from group** (admin action) → immediate

### Retry Worker

A scheduled job (`/api/v1/internal/coupon-sync-retry`) runs every 10 minutes, finds billing groups with `coupon_sync_status='failed'` or `'pending'` older than 5 minutes, and retries. The route uses `COUPON_SYNC_RETRY_CRON_SECRET` as its canonical bearer secret in deployed environments.

### Proration

Stripe handles proration automatically. When a tier change happens mid-cycle:
- Coupons are applied immediately
- Next invoice reflects the new discount for the full upcoming cycle
- Current cycle is NOT credited retroactively (standard Stripe coupon behavior)

---

## 5. Unified Owner Dashboard

### Route

- `/dashboard/overview` — visible only to users with `user_roles` in 2+ communities
- Users with 1 community redirect to `/dashboard` (existing single-community path)
- Users with 2+ communities default to `/dashboard/overview` after login

### Layout

Two-column layout:

- **Left column:** Property cards (one per community) with compliance score, urgent items count, and quick-nav link
- **Right column:** Activity feed (documents, announcements) + upcoming events (meetings, votes, e-signs due)

### Data Queries

All queries run in parallel and use `@propertypro/db/unsafe` with explicit `user_id`-based authorization. This breaks the standard `createScopedClient` pattern and requires a dedicated query module:

```typescript
// apps/web/src/lib/queries/cross-community.ts
export async function getUserCommunities(userId: string) { ... }
export async function getCrossCommunityDocuments(userId: string, days: number) { ... }
export async function getCrossCommunityMeetings(userId: string, days: number) { ... }
export async function getCrossCommunityComplianceSummaries(userId: string) { ... }
```

Each function:
1. First queries `user_roles` to get the authorized `community_id` list for `userId`
2. Then queries the target table with `community_id IN (list)` filter
3. Returns data tagged with `{ communityId, communityName }` per row

### Caching

TanStack Query cache keys: `['cross-community', userId, 'documents']` with 30-second stale time. Invalidated on community switch or explicit refresh.

---

## 6. Cross-Community Notifications

### API Endpoint

```
GET /api/v1/notifications/all
Query params: ?unreadOnly=true&limit=50&cursor=...
Returns: { notifications: [...], nextCursor, totalUnread }
```

Each notification includes a `community: { id, name, slug }` field.

### Realtime Updates

Existing `useNotifications` hook extended:
- Accepts a `mode: 'community' | 'cross'` parameter
- In `cross` mode, removes the `community_id` filter from the Supabase realtime subscription
- Realtime still filters by `user_id`

### UI

- Notification bell on `/dashboard/overview` → dropdown with cross-community feed
- Notification bell on any `/dashboard` (single community) → per-community feed (unchanged)
- Dropdown groups notifications by community with per-community "mark all read" actions
- Filter chips: All / per-community / by type

---

## 7. Self-Service Community Linking

### Discovery

Public search endpoint:

```
GET /api/v1/public/communities/search?q=sunset&city=miami
Returns: [{ id, name, city, state, communityType, memberCount }]
```

Does NOT expose: street address, admin names, financial data, document counts.

### Submit Request

```
POST /api/v1/account/join-requests
Body: { communityId, unitIdentifier, residentType }
Auth: Requires authenticated user
Rate limit: 5 requests per user per 24h
Returns: { requestId, status: 'pending' }
```

Creates `community_join_requests` row. Denies if:
- User already has a role in that community
- User has a pending request for that community
- User has been denied for that community in the last 30 days

### Admin Review

Community admins (board/CAM) see pending requests at `/admin/join-requests`:

```
GET /api/v1/admin/join-requests
Returns: [{ id, user: {...}, unitIdentifier, residentType, createdAt }]

POST /api/v1/admin/join-requests/:id/approve
Body: { notes?: string }
→ Creates user_roles row with role='owner' or 'tenant'
→ Notifies requester (in-app + email)

POST /api/v1/admin/join-requests/:id/deny
Body: { notes?: string }
→ Marks denied, notifies requester
```

---

## 8. Migration & Rollout

### Phase 1: Data Model

- Create `billing_groups`, `community_join_requests` tables
- Add `billing_group_id` column to `communities`
- Create 4 Stripe Coupon objects via seed script
- Ship behind feature flags: `BILLING_GROUPS_ENABLED`, `CROSS_COMMUNITY_UX_ENABLED`

### Phase 2: Add Community Flow

- Implement `POST /api/v1/pm/communities`
- Auto-create billing group on first add for existing PMs
- Webhook extensions for billing group metadata
- Coupon sync retry worker

### Phase 3: Cross-Community Owner UX

- Unified dashboard at `/dashboard/overview`
- Cross-community notifications endpoint and UI
- Community switcher in nav (small, cross-cutting)

### Phase 4: Join Requests

- Public community search endpoint
- Join request submission UI in account settings
- Admin review UI at `/admin/join-requests`

### Backwards Compatibility

- All existing communities with `billing_group_id=NULL` continue to work identically
- Existing `/api/v1/subscribe` endpoint unchanged for standalone upgrades
- The `createScopedClient` contract is unchanged; new cross-community queries use a separate documented unsafe path

---

## 9. Error Handling & Edge Cases

### Coupon Sync Failures

- If Stripe API call fails mid-batch, `coupon_sync_status` is set to `'failed'`
- Retry worker picks up failed groups every 10 minutes
- Admin alerting via existing ops notification system if sync fails 3+ times for the same group

### Race Conditions

- PostgreSQL advisory locks (`pg_advisory_xact_lock(billing_group_id)`) prevent concurrent tier recalculation
- Stripe's own idempotency keys used on subscription updates (key format: `coupon-sync-{groupId}-{subId}-{newTier}`)

### Community Removal

When a community is soft-deleted (`deleted_at` set):
- Its Stripe subscription is canceled
- `recalculateVolumeTier` runs on the billing group (may downgrade tier)
- If tier decreases (e.g., 6→5 crosses threshold), remaining communities' coupons are swapped

### PM Ownership Transfer

If `owner_user_id` changes on a billing group (PM sells their company, admin succession):
- Separate admin-gated flow (not v1)
- Requires legal review (contract assignment)

### Mixed Standalone + Grouped Communities

A PM can have both. If their first community is standalone and they add a second, the flow creates a billing group and backfills the first community's `billing_group_id`. The Stripe Customer is reused.

---

## 10. Testing Strategy

### Unit Tests

- Tier calculation logic (`determineTier(count)` boundary tests: 2, 3, 5, 6, 10, 11)
- Coupon ID mapping
- Join request eligibility checks

### Integration Tests

- Add community flow end-to-end (Stripe test mode)
- Tier recalculation on community add (1→2→3 crossing threshold)
- Tier recalculation on community removal (6→5 crossing threshold)
- Coupon sync retry after simulated Stripe failure
- Cross-community query authorization (user cannot see communities they don't belong to)
- Join request flow: submit → approve → verify user_roles row exists
- Join request denial and 30-day re-request block

### Manual QA

- Stripe dashboard verification: coupons applied correctly on all subscriptions in a group
- Invoice preview: consolidated invoice shows all communities with discount line
- Dashboard UX: community switcher, overview layout, notification dropdown
- Join request flow from owner discovery through admin approval

---

## 11. Open Questions / Future Work

- **Annual billing discounts:** Not in scope; would stack with volume discounts if added
- **Franchise/white-label billing:** PM companies may want their own branding on invoices (future)
- **Existing PM consolidation migration:** Migrating PMs who currently have separate Stripe Customers per community to a single consolidated Customer (separate project, requires customer outreach)
- **Per-tenant seats:** If a community wants to cap board member count, that's a per-community feature, not billing-group level
- **Dunning for billing groups:** When one subscription in a group fails payment, should the whole group be flagged? (v1: per-subscription dunning, unchanged from today)
