# Multi-Community Billing & Ownership Design

**Date:** 2026-04-04
**Status:** Draft for review (v2 — rewritten after hostile review)
**Owner:** Product + Engineering
**Pre-launch:** Yes. No production customers exist. We can break existing endpoints without migration.

## Problem Statement

PropertyPro's billing model assumes **one community = one subscription = one customer**. Two issues:

1. **PMs managing multiple communities** can currently add communities via `POST /api/v1/pm/communities` **for free** (no payment gate). This is a revenue leak that must be plugged before launch. Even once plugged, the model has no portfolio incentives — a PM with 15 communities gets 15 invoices and no reason to consolidate on PropertyPro.
2. **Owners in multiple communities** must create separate accounts per community with no unified experience.

This spec covers:

- **Billing Groups** with consolidated Stripe billing and volume discounts
- **Gated add-community flow** that replaces the current free-add endpoint
- **Stripe payment update mechanics** with downgrade confirmation UX
- **Unified Owner Dashboard** across multiple communities
- **Cross-community notifications**
- **Self-service community linking** via join requests

## Verified Environment

- **Stripe SDK:** `stripe@^20.3.1`, API version `2026-01-28.clover`
- **API surface:** Modern `discounts[]` array on subscriptions (NOT the legacy `coupon` field)
- **Existing endpoint:** `POST /api/v1/pm/communities` at `apps/web/src/app/api/v1/pm/communities/route.ts` directly creates communities with zero payment — **must be gated in v1**
- **Existing PM dashboard:** `/pm/dashboard` (inside `(authenticated)` route group). `pm.getpropertypro.com` is a RESERVED subdomain and is NOT routed as a tenant (`apps/web/src/middleware.ts:423`).
- **Current provisioning flow:** `pending_signups` → Stripe checkout → webhook → `provisioning_jobs` state machine. We reuse this pattern.

## Goals

- Gate the existing free-community hole before launch
- Enable PMs to add communities via a paid checkout flow
- Incentivize portfolio consolidation via volume discounts (10/15/20%)
- Protect PMs from surprise price hikes when communities leave the group
- Give multi-community owners a unified cross-community experience
- Let owners discover and request to join their own communities

## Non-Goals (v1)

- Legacy PM migration (pre-launch, no customers)
- Per-unit or per-seat pricing within a community
- Annual billing discounts (orthogonal)
- White-label billing for PM companies

---

## 1. Pricing Model

### Per-Community Plans with Recalculating Volume Discounts

Each community keeps its own plan tier (Essentials $199 / Professional $349 / Operations Plus $499). Volume discount applies as a percentage to every subscription in the billing group.

| Communities in Group | Discount | Example (Professional $349) |
|---|---|---|
| 1–2 | 0% | $349.00/mo |
| 3–5 | 10% | $314.10/mo |
| 6–10 | 15% | $296.65/mo |
| 11+ | 20% | $279.20/mo |

**Key properties:**

- Discounts apply **retroactively** across all communities when they increase.
- Discounts **recalculate down** when communities leave the group (e.g. 6→5 drops from 15% to 10%).
- **Downgrade requires PM confirmation.** The UI shows exact $-impact on remaining communities before the change is committed.
- **Affected community admins are notified** when a downgrade is initiated (CAM, board president, etc.).
- Trial period (14 days) applies only to the signup flow's first community, never to subsequent adds.

### Downgrade UX (Critical)

When a PM initiates a cancellation that would cross a discount tier:

1. PM clicks "Cancel community" on Community X
2. System calculates: "Canceling Community X will drop your portfolio from 6 to 5 communities. Your volume discount decreases from 15% to 10%. This will increase the monthly cost of your 5 remaining communities by $17.45 each, totaling **$87.25/mo more**."
3. Modal shows: breakdown per community, total impact, next billing date for each affected sub.
4. PM must type "CONFIRM" or click a two-step confirm button (not a single click).
5. On confirmation:
   - Community X's subscription is canceled in Stripe
   - `recalculateVolumeTier()` runs
   - In-app notification fires to `pm_admin`, `board_president`, `cam`, and `site_manager` roles on ALL remaining communities in the group: *"Your portfolio volume discount changed from 15% to 10% because [Community X] was canceled. Next invoice will reflect the new rate."*
   - Email notification fires to the same roles (reusing existing notification infrastructure)
6. If PM aborts, nothing happens.

---

## 2. Data Model

### New Table: `billing_groups`

```sql
CREATE TABLE billing_groups (
  id                     bigserial PRIMARY KEY,
  name                   text NOT NULL,
  stripe_customer_id     text UNIQUE NOT NULL,
  owner_user_id          uuid NOT NULL REFERENCES users(id),
  volume_tier            text NOT NULL DEFAULT 'none'
                           CHECK (volume_tier IN ('none', 'tier_10', 'tier_15', 'tier_20')),
  active_community_count integer NOT NULL DEFAULT 0,
  coupon_sync_status     text NOT NULL DEFAULT 'synced'
                           CHECK (coupon_sync_status IN ('synced', 'pending', 'failed')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);

CREATE INDEX idx_billing_groups_owner ON billing_groups(owner_user_id);
```

### Column on `communities`

```sql
ALTER TABLE communities ADD COLUMN billing_group_id bigint
  REFERENCES billing_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_communities_billing_group ON communities(billing_group_id);
```

NULL = standalone subscription (signup flow). Set = part of a PM's portfolio.

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

CREATE UNIQUE INDEX idx_join_requests_unique_pending
  ON community_join_requests(user_id, community_id)
  WHERE status = 'pending';
CREATE INDEX idx_join_requests_community_status
  ON community_join_requests(community_id, status);
```

RLS: Users read/write own requests. Community admins read/update requests scoped to their `community_id`.

---

## 3. Gated Add-Community Flow

### Endpoint Reuse

The existing `POST /api/v1/pm/communities` is **repurposed**, not deleted:

- **Before:** Directly called `createCommunityForPm()`, inserted rows, returned 201 with community data.
- **After:** Creates a `pending_signups` row with `kind='add_to_group'`, creates a Stripe Checkout session on the billing group's `stripe_customer_id`, returns `{ checkoutSessionClientSecret, pendingSignupId }` with 202.

The existing `createCommunityForPm()` function is NOT deleted — it's called from the provisioning webhook handler after payment clears (same pattern as signup).

### Flow

1. PM on `/pm/dashboard` clicks "Add Community" → opens form modal
2. Form fields: name, address, type, plan (validated against community type via existing `PLAN_IDS` logic)
3. **Pricing preview** updates live: shows the selected plan price with the volume discount already applied, with a note: *"Adding this community brings your portfolio to N. Your discount rate: X%."*
4. PM submits → `POST /api/v1/pm/communities` creates `pending_signups` + Stripe checkout session
5. Embedded Stripe Checkout UI opens (matches signup UX)
6. On payment success, webhook `checkout.session.completed` fires with metadata `{ pendingSignupId, billingGroupId, communityType, selectedPlan, kind: 'add_to_group' }`
7. Webhook handler:
   - Records subscription on the billing group's customer
   - Enqueues `provisioning_jobs` row
   - Calls `createCommunityForPm()` inside the existing provisioning state machine
   - Links new community to `billing_group_id`
   - Runs `recalculateVolumeTier()` with an advisory lock
8. PM redirected to the new community's dashboard

### Billing Group Creation

If the PM has no existing billing group (first non-signup community add):

- System checks: does the PM's signup-created community have a `stripeCustomerId`?
- If yes: creates `billing_groups` row using that customer ID, backfills the signup community's `billing_group_id`
- If no: creates a new Stripe Customer scoped to the PM, creates billing group

Pre-launch simplification: the PM's signup creates a Stripe Customer. The billing group is lazily created on the **second** community. All logic handles the "upgrading standalone → group" transition atomically.

---

## 4. Stripe Payment Update Flow

### Coupons (Static, Created Once)

Four Stripe Coupon objects, created via seed script:

| Stripe Coupon ID | percent_off | duration |
|---|---|---|
| `volume_10pct` | 10 | forever |
| `volume_15pct` | 15 | forever |
| `volume_20pct` | 20 | forever |
| (no coupon for `tier='none'`) | — | — |

### Discount Application (Modern Stripe API)

This project uses Stripe API `2026-01-28.clover`, which uses the `discounts[]` array on subscriptions. A subscription can hold multiple discounts, but we apply **exactly one volume discount** per subscription, tagged with metadata `{ origin: 'volume_discount' }` so we can identify and replace it cleanly.

### Tier Recalculation

```typescript
async function recalculateVolumeTier(
  billingGroupId: number,
  trigger: 'add' | 'remove'
) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(${billingGroupId})`);

  const group = await getBillingGroup(billingGroupId);
  const activeCount = await countActiveCommunitiesInGroup(billingGroupId);
  const newTier = determineTier(activeCount);

  if (newTier === group.volume_tier) {
    // No tier change; if adding, attach current tier's discount to the new sub only
    return;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: group.stripe_customer_id,
    status: 'active',
  });

  await updateBillingGroup(billingGroupId, { coupon_sync_status: 'pending' });

  try {
    for (const sub of subscriptions.data) {
      // Find existing volume discount (tagged via our metadata convention)
      const existingVolumeDiscount = sub.discounts?.find(
        (d) => typeof d !== 'string' && d.coupon?.metadata?.origin === 'volume_discount'
      );

      // Remove old volume discount (if any)
      if (existingVolumeDiscount) {
        await stripe.subscriptions.deleteDiscount(sub.id);
      }

      // Add new discount (if tier isn't 'none')
      const couponId = tierToCouponId(newTier);
      if (couponId) {
        await stripe.subscriptions.update(sub.id, {
          discounts: [{ coupon: couponId }],
        });
      }
    }
    await updateBillingGroup(billingGroupId, {
      volume_tier: newTier,
      active_community_count: activeCount,
      coupon_sync_status: 'synced',
    });
  } catch (error) {
    await updateBillingGroup(billingGroupId, { coupon_sync_status: 'failed' });
    throw error;
  }
}
```

**Important:** The coupons have `metadata.origin = 'volume_discount'` set at seed time. This lets us distinguish our volume discounts from any future promo coupons on the same subscription without risk of overwriting them.

### Retry Worker

`POST /api/v1/internal/coupon-sync-retry` (cron, every 10 min):
- Finds `billing_groups` with `coupon_sync_status IN ('failed', 'pending')` older than 5 min
- Re-runs `recalculateVolumeTier()`
- After 3 failures, fires ops alert (existing notification infrastructure)

### Idempotency

All Stripe calls use idempotency keys: `volume-sync-{billingGroupId}-{subId}-{newTier}-{timestamp}`. Stripe dedupes identical operations for 24h.

---

## 5. Unified Owner Dashboard

### Route & Eligibility

- `/dashboard/overview` — visible only to users with `user_roles` in 2+ communities
- Default landing page for multi-community users (overrides `/dashboard`)
- Single-community users never see this route

### Cross-Community Query Strategy

**This is the hardest engineering problem in the spec.** The project's core safety model is `createScopedClient(communityId)` + FORCE RLS at the DB layer, enforced by CI (`scripts/verify-scoped-db-access.ts`). Cross-community reads break this model.

**Proposed approach: Parallel scoped queries + explicit authorization contract.**

```typescript
// apps/web/src/lib/queries/cross-community.ts
// Allowlisted unsafe access — documented contract
async function getAuthorizedCommunityIds(userId: string): Promise<number[]> {
  // Single unscoped query: SELECT community_id FROM user_roles WHERE user_id = ?
  // This is the ONLY authorization check. After this, all queries run scoped per community.
}

export async function getCrossCommunityData(userId: string, opts: QueryOpts) {
  const communityIds = await getAuthorizedCommunityIds(userId);
  // Run N scoped queries in parallel (one per authorized community)
  const results = await Promise.all(
    communityIds.map((cId) => {
      const scoped = createScopedClient(cId);
      return scoped.query(...); // standard scoped query
    })
  );
  // Merge and tag each row with { communityId, communityName }
  return flattenAndTag(results, communityIds);
}
```

**Performance honesty:** For a user with 10 communities × 4 data widgets (compliance, documents, meetings, actions) = 40 scoped queries. At ~20ms each running in parallel, that's ~50-80ms p50. Not fast, but acceptable for a dashboard that's cached 30s. **If any user hits 15+ communities, we revisit with a materialized view.**

**Why not a single unscoped query with `community_id IN (...)`?** That would bypass RLS and expand the unsafe surface area. Keeping scoped clients per community preserves the RLS guarantee; we just accept the latency cost for a rare user cohort.

### Layout (Design-System Aligned)

Two-column layout using `Stack` + `HStack` primitives from `packages/ui/src/primitives`:

**Left column — Property Cards** (one `Card` per community, `E0` elevation, radius `md`):
- Community name (Text `heading-sm`)
- Compliance score as `StatusPill` (uses `getStatusConfig()` from design system constants)
- Urgent item count (uses 4-tier escalation: `calm`/`aware`/`urgent`/`critical`)
- Quick-nav button to enter that community (Button `secondary`, size `sm`)

**Right column — Activity Feed & Upcoming:**
- `SectionHeader` + activity rows (`DataRow` pattern)
- Each row tagged with community `Badge` (visual attribution)
- `EmptyState` when no activity (uses config from `docs/design-system/constants/empty-states.ts`)
- Skeleton loading state (not spinner) while queries resolve

**States covered** (per DESIGN_LAWS):
- Loading: Skeleton shells matching card and row shapes
- Empty: "No recent activity across your communities" with helpful CTA
- Error: `AlertBanner` danger variant with retry action
- Success: Data rendered with community attribution badges

---

## 6. Cross-Community Notifications

### API

```
GET /api/v1/notifications/all
Query: ?unreadOnly=true&limit=50&cursor=...
Returns: { notifications: [...with community field], nextCursor, totalUnread }
```

Uses the same cross-community query strategy as Section 5. The `in_app_notifications` table already has `user_id` — query by `user_id` with `community_id IN (authorizedIds)`.

**Realtime subscription:**
- Existing `useNotifications` hook extended with `mode: 'community' | 'cross'` param
- In `cross` mode: Supabase realtime subscription filters only by `user_id` (removes `community_id` filter)
- Current limitation (documented in MEMORY.md): realtime only listens to INSERT, not UPDATE/DELETE. Same limitation applies to cross mode.

### UI

- Notification bell on `/dashboard/overview` — cross-community feed with community badges
- Single-community notification bell unchanged
- Filter chips: "All communities" / per-community / by type
- Per-community "Mark all read" actions in dropdown

---

## 7. Self-Service Community Linking

### Discovery

```
GET /api/v1/public/communities/search?q=sunset&city=miami
Auth: Public (rate limited)
Returns: [{ id, name, city, state, communityType, memberCount }]
```

**Exposed:** name, city, state, community type, approximate member count (rounded to nearest 10)
**Hidden:** street address, admin names, financial data, document counts, exact member count

Rate limit: 30 searches per IP per minute.

### Submit Request

```
POST /api/v1/account/join-requests
Auth: Authenticated user
Body: { communityId, unitIdentifier, residentType }
Rate limit: 5 requests per user per 24h
```

Rejected if:
- User already has a role in that community
- Pending request exists (unique constraint)
- User was denied for that community in the last 30 days

### Admin Review

`/admin/join-requests` (new page, uses existing admin app shell):

```
GET    /api/v1/admin/join-requests                       (list pending)
POST   /api/v1/admin/join-requests/:id/approve           (creates user_roles row)
POST   /api/v1/admin/join-requests/:id/deny              (marks denied)
```

Admin review UI uses `DataRow` pattern with columns: user name/email, unit identifier, resident type, submitted date, action buttons.

Approval creates a `user_roles` row with the matching role (`owner` or `tenant`) and fires an in-app + email notification to the requester.

---

## 8. Design System Alignment

Per `docs/design-system/DESIGN_LAWS.md`:

- **Spacing:** All components use token spacing (`inline`/`stack`/`inset` micro, `section`/`page` macro). No ad-hoc values.
- **Surfaces:** Cards use `E0` elevation, borders first. Modals (confirmation dialogs) use `E3` + radius `lg`.
- **Typography:** Body text `base` (16px) minimum. Caption (11px) reserved for metadata.
- **Status:** Volume tier badge uses the 4-tier escalation (`calm` for none/10%, `aware` for 15%, `urgent` for 20% — non-critical, visual only). Never color alone — always icon + text + color. Use `getStatusConfig()` from `docs/design-system/constants/status.ts`.
- **Touch targets:** 44px mobile, 36px desktop for all interactive elements.
- **Focus:** All interactive elements show `:focus-visible`. Never suppressed.
- **Motion:** Tier-change confirmations use `attention` timing. Respects `prefers-reduced-motion`.

### Component Reuse

- Pricing preview → `Card` + `StatusPill` + `DataRow`
- Downgrade confirmation → `Dialog` (shadcn) + `AlertBanner` (danger variant) + two-step `Button`
- Property cards → `Card` + `Stack` primitive
- Activity feed → `SectionHeader` + `DataRow`
- Empty states → `EmptyState` pattern with configs from `docs/design-system/constants/empty-states.ts`

---

## 9. Migration & Rollout

Pre-launch, so "migration" means rollout order, not customer data migration.

### Phase 1: Data model + hole-plugging (blocking for launch)

- Create `billing_groups`, `community_join_requests` tables
- Add `billing_group_id` to `communities`
- Create 4 Stripe Coupon objects via seed script
- **Gate `POST /api/v1/pm/communities` behind Stripe checkout** (this is the launch blocker)
- Feature flag: `BILLING_GROUPS_ENABLED` (verify feature flag infra exists; if not, env var gate)

### Phase 2: Volume discount mechanics

- Implement `recalculateVolumeTier()` with advisory locks
- Downgrade confirmation UX (two-step confirm, $-impact preview)
- Admin notifications on tier downgrades
- Coupon sync retry worker

### Phase 3: Cross-community owner UX

- `/dashboard/overview` route
- `cross-community` query module with allowlisted unsafe access
- Community switcher in nav

### Phase 4: Notifications + join requests

- `GET /api/v1/notifications/all` endpoint + UI
- Join request submission + admin review
- Public community search

---

## 10. Edge Cases

### Coupon sync partial failure

Mid-batch Stripe API failure → `coupon_sync_status='failed'`, retry worker runs every 10 min, ops alert after 3 failures.

### Race: Two communities added simultaneously

Advisory lock on `billing_group_id` serializes recalculation. Second request waits, reads fresh count, applies tier correctly.

### PM cancels during checkout

`pending_signups.status='checkout_abandoned'`. No billing impact. User can restart.

### Tier change during open invoice cycle

Stripe applies discount changes immediately. Current open invoice is NOT credited retroactively (standard Stripe behavior). Next invoice reflects new rate. Confirmation modal explicitly states this.

### PM deletes last community in group

Billing group has zero active subscriptions but is not automatically deleted. Stripe Customer is preserved (PM can re-add later). Group is soft-deleted only on explicit PM action.

### Subscription already has a non-volume discount

Our `metadata.origin = 'volume_discount'` tag lets us identify and replace only our discounts, never touching promo codes or legal discounts.

### Cross-community query with no communities

User logs in with 0 `user_roles` → redirects to `/welcome` (existing flow, no cross-community dashboard shown).

### User has 15+ communities

Performance degrades (N parallel scoped queries). Documented as known limitation; revisit with materialized view if/when a user hits this.

### Admin approves a join request for a removed user

`user_roles` insert will conflict with existing row or fail constraint. Review UI shows warning if user already has a role.

---

## 11. Testing Strategy

### Unit

- `determineTier(count)` boundaries: 0, 1, 2, 3, 5, 6, 10, 11, 100
- `tierToCouponId(tier)` mapping
- Join request eligibility logic (duplicates, 30-day re-request block)
- Cross-community query authorization (user_id → community_ids mapping)

### Integration (hit real DB)

- Add community flow end-to-end with Stripe test mode
- Tier upgrade: 2 → 3 communities (triggers 10%)
- Tier downgrade: 6 → 5 communities (triggers 15%→10%, confirmation, notifications)
- Coupon sync retry after simulated Stripe failure
- Cross-community query rejects unauthorized community_ids
- Join request lifecycle: submit → approve → user_roles created
- Denied re-request blocked within 30 days, allowed after

### E2E (Playwright)

- PM adds community: form → pricing preview → checkout → provisioning → visible in dashboard
- PM cancels community that triggers downgrade: two-step confirm, notification fires
- Owner joins second community: search → request → admin approves → dashboard overview visible
- Cross-community notification dropdown shows aggregate feed

### Manual QA

- Stripe dashboard verification: 4 coupons created, applied correctly per subscription
- Consolidated invoice shows all communities with discount line item
- Community switcher on overview dashboard navigates correctly

---

## 12. Open Questions / Future Work

- **Annual billing:** Stacks with volume discounts? (v2)
- **White-label invoices for PMs:** PM branding on Stripe invoices (v2)
- **Per-tenant seats within a community:** Orthogonal (v2)
- **Dunning strategy for groups:** v1 uses per-subscription dunning (unchanged). Group-level dunning is v2.
- **Materialized view for heavy cross-community users:** Add when a user hits 15+ communities.
- **Feature flag infrastructure:** Verify existing infra before Phase 1; fall back to env var if needed.
