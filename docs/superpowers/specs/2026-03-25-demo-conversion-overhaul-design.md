# Demo-to-Paying-Client Conversion Overhaul

**Status:** Approved
**Date:** 2026-03-25
**Scope:** Strategic redesign of the demo conversion lifecycle — self-service upgrade path, 14+7 trial model, conversion analytics, post-conversion UX, and P0 engineering fixes.
**Approach:** Incremental layering (3 phases) on top of the existing conversion infrastructure. Each phase ships independently.

## Context

An audit of the demo-to-paying-client conversion flow identified 30+ issues across software engineering, UX, data, and observability dimensions. The core conversion machinery (idempotent webhook handler, HMAC-secured demo sessions, encrypted token storage) is sound. The biggest gaps are:

1. No self-service conversion path — prospects cannot upgrade themselves; admin must initiate
2. 30-day trial duration (industry data shows 14 days converts 71% better)
3. Hard lockout at expiry (no grace period to create conversion pressure)
4. Zero conversion funnel analytics
5. Post-conversion page has no CTA and no contextual onboarding

### Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Conversion model | Hybrid (admin + self-service) | Best of both worlds — sales-assisted for high-touch, PLG for self-serve |
| Trial end behavior | 14-day trial + 7-day grace + lockout | Creates urgency without permanent free tier complexity |
| Compliance as conversion hook | One of several value drivers | Balanced messaging; compliance is key but not the only selling point |
| Pricing model | Plan tiers with unit ranges (future) | Keep current plan-based model; unit-based pricing deferred to own spec |
| Trial backfill for existing demos | Retroactive grace | Existing demos older than 14 days enter grace immediately on rollout |
| Price history | Current config only | Mutable singleton rows in stripe_prices; no historical tracking |

---

## Section 1: Data Model & Event Tracking

### 1A. `stripe_prices` — Replaces env-var price mapping

Mutable singleton config table. One row per `(plan_id, community_type, billing_interval)`.

```sql
CREATE TABLE stripe_prices (
  id bigserial PRIMARY KEY,
  plan_id text NOT NULL
    CHECK (plan_id IN ('essentials', 'professional', 'operations_plus')),
  community_type text NOT NULL
    CHECK (community_type IN ('condo_718', 'hoa_720', 'apartment')),
  billing_interval text NOT NULL
    CHECK (billing_interval IN ('month')),
  stripe_price_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, community_type, billing_interval)
);
```

**Key constraints:**
- `plan_id`, `community_type`, `billing_interval` all have CHECK constraints against canonical values from `packages/shared/src/plans/types.ts` and `signup-schema.ts`
- `stripe_price_id UNIQUE` prevents duplicate Stripe prices across rows
- `billing_interval` locked to `'month'` only — annual pricing out of scope until interval selection is designed into checkout UX
- No `is_active` column — this is mutable singleton config, not a history table. Price changes are UPDATEs.
- No unit ranges — unit-based pricing deferred until a canonical `billing_unit_count` model is defined

**RLS:** Global exclusion. `RLS_GLOBAL_TABLE_EXCLUSIONS`: 8 → 9. `RLS_EXPECTED_TENANT_TABLE_COUNT` stays 48.

**`getPriceId()` replaced by `resolveStripePrice()`:**

```typescript
async function resolveStripePrice(
  planId: PlanId,
  communityType: CommunityType,
  interval: 'month' = 'month'
): Promise<string> {
  const row = await db.select({ stripePriceId: stripePrices.stripePriceId })
    .from(stripePrices)
    .where(and(
      eq(stripePrices.planId, planId),
      eq(stripePrices.communityType, communityType),
      eq(stripePrices.billingInterval, interval),
    ))
    .limit(1);
  if (!row.length) throw new AppError('BILLING_CONFIG_MISSING', 500, ...);
  return row[0].stripePriceId;
}
```

**All three checkout paths migrate:**

| Path | File | Change |
|------|------|--------|
| Self-service subscribe | `subscribe/route.ts` | `getPriceId(planId)` → `resolveStripePrice(planId, communityType, 'month')` |
| Admin demo convert | `admin/demo/[slug]/convert/route.ts` | Same migration |
| Signup embedded checkout | `stripe-service.ts` `createEmbeddedCheckoutSession()` | Same migration |

After all three are migrated, `getPriceId()` and `STRIPE_PRICE_*` env vars are deleted. No fallback, no dual-read.

**Route-level plan validation (two distinct failure modes):**

Both `subscribe` and `admin/demo/convert` routes must:
1. Load `communities.communityType` alongside existing community query
2. Validate `planId` against `SIGNUP_PLAN_OPTIONS[communityType]` — if invalid: `throw new AppError('INVALID_PLAN_FOR_COMMUNITY_TYPE', 400, 'This plan is not available for your community type')`
3. Then call `resolveStripePrice()` — if missing: `throw new AppError('BILLING_CONFIG_MISSING', 500, ...)` (ops error, not user error)

Signup flow already validates via `signup-schema.ts` (line 94) — no change needed there.

**Display prices are non-authoritative copy.** `plan-features.ts` `monthlyPriceUsd` values exist for UI rendering only and do not determine what Stripe charges. Add documentation comment:

```typescript
/**
 * Display prices for UI rendering only. These do NOT determine what Stripe charges.
 * Authoritative pricing lives in the stripe_prices table → Stripe price objects.
 * When updating prices: change both this file AND the stripe_prices row.
 * The /api/v1/internal/readiness endpoint validates stripe_prices completeness.
 */
```

### 1B. `conversion_events` — Append-only funnel analytics

```sql
CREATE TABLE conversion_events (
  id bigserial PRIMARY KEY,
  demo_id bigint REFERENCES demo_instances(id),
  community_id bigint REFERENCES communities(id),
  event_type text NOT NULL CHECK (event_type IN (
    'demo_created',
    'demo_entered',
    'conversion_initiated',
    'checkout_completed',
    'checkout_session_expired',
    'founding_user_created',
    'grace_started',
    'demo_soft_deleted',
    'self_service_upgrade_started',
    'self_service_upgrade_completed'
  )),
  source text NOT NULL CHECK (source IN (
    'admin_app', 'web_app', 'stripe_webhook', 'cron'
  )),
  dedupe_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  stripe_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}' CHECK (
    metadata->>'email' IS NULL AND
    metadata->>'customerEmail' IS NULL AND
    metadata->>'customer_id' IS NULL
  )
);

CREATE INDEX idx_ce_demo ON conversion_events(demo_id);
CREATE INDEX idx_ce_community ON conversion_events(community_id);
CREATE INDEX idx_ce_type_occurred ON conversion_events(event_type, occurred_at);
```

**Design principles:**
- `dedupe_key NOT NULL UNIQUE` — every event must have a dedupe key. No nullable unique trick.
- `occurred_at` vs `recorded_at` — Stripe events use `event.created`; cron events use the transition timestamp; app events use `now()`.
- `user_id` is nullable plain `uuid` (not FK) — demo users get banned/deleted; FK would block lifecycle ops or cascade-delete analytics.
- PII constraint at DB level — no emails, customer IDs, or names in metadata.
- No UI analytics events (prompt_shown, prompt_clicked) — those belong in a product analytics tool, not server-side conversion events.
- `demo_role_switched` collapsed into `demo_entered` with `metadata.role` — server can't distinguish fresh entry from role switch (DemoBanner and landing page both POST to same endpoint with only target role).

**Dedupe key patterns:**

| Event | Dedupe Key | Rationale |
|-------|-----------|-----------|
| `demo_created` | `demo:{demoId}:created` | One-time per demo |
| `demo_entered` | `demo:{demoId}:entered:{targetUserId}:{requestId}` | Per-request UUID prevents collapsing rapid re-entries |
| `conversion_initiated` | `demo:{demoId}:conversion_initiated:{stripeSessionId}` | One per checkout session |
| `checkout_completed` | `stripe:{stripeEventId}` | Stripe idempotency |
| `checkout_session_expired` | `stripe:{stripeEventId}` | Stripe idempotency |
| `founding_user_created` | `demo:{demoId}:founding_user` | One-time per demo |
| `grace_started` | `demo:{demoId}:grace_started` | One-time transition |
| `demo_soft_deleted` | `demo:{demoId}:soft_deleted` | One-time transition |
| `self_service_upgrade_started` | `community:{communityId}:upgrade:{stripeSessionId}` | One per checkout session |
| `self_service_upgrade_completed` | `stripe:{stripeEventId}` | Stripe idempotency |

**Event writes are awaited best-effort:**

```typescript
try {
  await db.insert(conversionEvents).values({ ... })
    .onConflict(sql`(dedupe_key) DO NOTHING`);
} catch (err) {
  console.warn('[conversion-events] failed to record event:', err);
}
```

Non-fatal: primary operation succeeds regardless. But awaited, not fire-and-forget — ensures insert completes before response is sent.

**`/api/v1/auth/demo-login` does NOT emit `demo_entered`.** That route is admin preview tooling, not prospect-facing. Only `/api/v1/demo/[slug]/enter` emits this event.

**RLS:** Global exclusion. `RLS_GLOBAL_TABLE_EXCLUSIONS`: 9 → 10.

### 1C. Demo Lifecycle — One-field model with `trial_ends_at`

```sql
ALTER TABLE communities ADD COLUMN trial_ends_at timestamptz;

ALTER TABLE communities ADD CONSTRAINT chk_demo_trial_ordering
  CHECK (
    NOT is_demo
    OR trial_ends_at IS NULL
    OR demo_expires_at IS NULL
    OR trial_ends_at <= demo_expires_at
  );
```

**Create-path enforcement trigger** (INSERT only — not a general invariant):

```sql
CREATE OR REPLACE FUNCTION enforce_demo_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_demo = true AND (NEW.trial_ends_at IS NULL OR NEW.demo_expires_at IS NULL) THEN
    RAISE EXCEPTION 'Demo communities must have both trial_ends_at and demo_expires_at';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_demo_timestamps
  BEFORE INSERT ON communities
  FOR EACH ROW
  EXECUTE FUNCTION enforce_demo_timestamps();
```

Both timestamps must be set on the initial INSERT in `seedCommunity()` (demo creation is two-step in admin demos route).

**Lifecycle model:**

- `demo_expires_at` stays as the hard lockout boundary. All 5 existing consumers unchanged.
- `trial_ends_at` is the new field. Only new code reads it. Marks when full-feature access ends.
- Grace period = `trial_ends_at` to `demo_expires_at` (derived, not stored).
- New demos: `trial_ends_at = now + 14 days`, `demo_expires_at = now + 21 days`.
- Conversion clears both in the same UPDATE that sets `is_demo = false`.

**Status computation:**

```typescript
type DemoLifecycleStatus =
  | 'active_trial'   // now < trial_ends_at
  | 'grace_period'   // trial_ends_at <= now < demo_expires_at
  | 'converted'      // is_demo = false
  | 'expired';       // deleted_at set OR now >= demo_expires_at

function computeDemoStatus(community: {
  isDemo: boolean;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  deletedAt: Date | null;
}): DemoLifecycleStatus {
  if (!community.isDemo) return 'converted';
  if (community.deletedAt) return 'expired';
  const now = new Date();
  if (!community.demoExpiresAt) return 'expired';
  if (community.trialEndsAt && now < community.trialEndsAt) return 'active_trial';
  if (now < community.demoExpiresAt) return 'grace_period';
  return 'expired';
}
```

No `locked_out` state — cron soft-deletes at `demo_expires_at`.

**Backfill (retroactive grace):**

```sql
UPDATE communities
SET trial_ends_at = demo_expires_at - interval '7 days'
WHERE is_demo = true
  AND deleted_at IS NULL
  AND demo_expires_at IS NOT NULL;
```

Existing demos older than ~14 days immediately enter grace when degradation UI ships.

**Backfill `grace_started` events** (one-off migration job, runs after trial_ends_at backfill):

```sql
INSERT INTO conversion_events (
  demo_id, community_id, event_type, source, dedupe_key,
  occurred_at, recorded_at, metadata
)
SELECT
  di.id, c.id, 'grace_started', 'cron',
  'demo:' || di.id || ':grace_started',
  c.trial_ends_at, now(), '{}'::jsonb
FROM communities c
JOIN demo_instances di ON di.seeded_community_id = c.id
WHERE c.is_demo = true
  AND c.deleted_at IS NULL
  AND c.trial_ends_at IS NOT NULL
  AND c.trial_ends_at < now()
ON CONFLICT (dedupe_key) DO NOTHING;
```

---

## Section 2: Self-Service Upgrade Path + Demo Trial UX

### 2A. `DemoTrialBanner` — Replaces `DemoBanner`

Single adaptive bottom bar combining role-switching, trial countdown, and upgrade CTA.

**Props:**

```typescript
interface DemoTrialBannerProps {
  isDemoMode: boolean;
  currentRole: 'board' | 'resident';
  slug: string;
  status: DemoLifecycleStatus;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  communityType: CommunityType;
}
```

**State 1: Active Trial** (`status === 'active_trial'`)
- Left: role label + switch button (existing DemoBanner behavior)
- Right: progress bar (`role="progressbar"`, `aria-valuenow`, visual fill based on days elapsed / 14), days remaining text, "Upgrade" button (primary blue)
- Background: `bg-gray-900/90` (existing DemoBanner style)
- "Upgrade" navigates to `/demo/[slug]/upgrade` — no conversion event emitted on click

**State 2: Grace Period** (`status === 'grace_period'`)
- Left: warning icon + "Limited access — some features disabled"
- Right: days remaining ("X days until lockout"), "Subscribe Now" button (white on danger)
- Background: `bg-red-900`
- Role-switcher hidden — focus is conversion, not exploration
- "Subscribe Now" navigates to `/demo/[slug]/upgrade`

**State 3: Converted / Expired** — not rendered.

**Accessibility:** `role="status"`, `aria-label`, focus-visible rings, progress bar with full ARIA attributes. Color + icon + text per design system status rules.

### 2B. Demo Upgrade Page — `/demo/[slug]/upgrade`

New page at `apps/web/src/app/demo/[slug]/upgrade/page.tsx`.

**Auth:** Authenticates via `@supabase/ssr` server client directly (NOT middleware-stamped headers — `/demo/*` is not in middleware's protected path set). Validates session user is one of the demo instance's user IDs. No session → redirect to `/demo/[slug]`.

**Layout:** Centered card, max-width 640px. Minimal chrome.

**Content:**
1. Community name + "Choose your plan"
2. Plan cards from `SIGNUP_PLAN_OPTIONS[communityType]` with display name, price (from `PLAN_FEATURES`), key features, "Select" button. Apartments: single `operations_plus` card.
3. Selected plan → form: customer email (required), customer name (pre-filled with community name), "Start Checkout" button.
4. POST to `POST /api/v1/demo/[slug]/self-service-upgrade`.

**States:** Loading (skeleton), error (alert banner), demo expired (redirect to landing), already converted (redirect to converted page).

### 2C. Self-Service Upgrade Endpoint

`POST /api/v1/demo/[slug]/self-service-upgrade`

**Auth:** Supabase server client from cookies. Validate user is one of demo instance's user IDs.

**Request body:**
```typescript
{ planId: PlanId; customerEmail: string; customerName: string; }
```

**Process:**
1. Load demo instance by slug (join communities, check `is_demo`, `deleted_at`, expiry)
2. Validate plan against `SIGNUP_PLAN_OPTIONS[communityType]`
3. `resolveStripePrice(planId, communityType, 'month')`
4. Create Stripe checkout session with metadata: `{ demoId, communityId, planId, slug, customerEmail, customerName }` — same shape as admin convert. `handleDemoConversion()` webhook handler works unchanged.
5. Emit `self_service_upgrade_started` (awaited best-effort, dedupe key: `community:{communityId}:upgrade:{stripeSessionId}`)
6. Return `{ checkoutUrl }`

**Cancel URL:** `/demo/[slug]/upgrade` (back to plan selection, not landing page).
**Success URL:** `/demo/[slug]/converted?session_id={CHECKOUT_SESSION_ID}`.

### 2D. Admin Convert — Unchanged

Gets Section 1 fixes (plan-community validation, `resolveStripePrice()`, event emission) but no behavioral changes. The two conversion paths (admin and self-service) are independent and converge at `handleDemoConversion()`.

### 2E. Grace Period Feature Degradation

**Guard function: `assertNotDemoGrace(communityId)`**

```typescript
async function assertNotDemoGrace(communityId: number): Promise<void> {
  const community = await db.select({
    isDemo: communities.isDemo,
    trialEndsAt: communities.trialEndsAt,
    demoExpiresAt: communities.demoExpiresAt,
    deletedAt: communities.deletedAt,
  })
  .from(communities)
  .where(eq(communities.id, communityId))
  .limit(1);

  if (!community.length) return;

  const status = computeDemoStatus(community[0]);
  if (status === 'grace_period') {
    throw new AppError('DEMO_GRACE_READ_ONLY', 403,
      'Your trial has ended. Subscribe to regain full access.');
  }
}
```

**Integration point:** Called explicitly per-route, immediately after `resolveEffectiveCommunityId()`, before any write logic. Same pattern as `requirePermission()` — not middleware, not `subscriptionGuard`, not `requirePermission()`.

**Why not middleware:** Middleware doesn't have community context for body-derived routes (e.g., `upload/route.ts` resolves `communityId` from request body, `community/contact/route.ts` gates on membership).

**Routes that call `assertNotDemoGrace()`:** Every mutating `/api/v1/*` route that resolves a community ID. The implementation plan will enumerate the full inventory.

**Routes that do NOT call it (explicit exceptions):**
- `POST /api/v1/demo/[slug]/self-service-upgrade` — must create checkout during grace
- `POST /api/v1/demo/[slug]/enter` — role switching is not a write
- `POST /api/v1/admin/demo/[slug]/convert` — admin conversion must work during grace
- `POST /api/v1/subscribe` — existing subscribe path for paying communities

**Cost:** One PK-lookup SELECT per mutation in demo communities during grace. Non-demo communities short-circuit immediately (`isDemo === false`).

### 2F. Existing Subscribe Route — Enhanced

Gets Section 1 fixes only: load `communityType`, validate plan, use `resolveStripePrice()`, emit event. No behavioral changes.

---

## Section 3: Post-Conversion, Cron Changes, and Observability

### 3A. Post-Conversion Success Page — Enhanced

`/demo/[slug]/converted` becomes a server component with four distinct states:

**State 1: Demo not found.** Slug doesn't match any demo instance, or demo is soft-deleted. Return 404. This is not webhook lag — it's a bad URL.

**State 2: Checkout completed, webhook pending.** Demo exists, `isDemo` still `true`, `session_id` present, Stripe session status is `'complete'`, session metadata `slug` matches URL slug. Show "Setting up your community..." with auto-refresh (5s interval, 60s max). After 60s: "This is taking longer than expected. Check your email for login instructions." No further polling.

**State 3: Checkout terminal failure.** Session status is `'expired'` or `'open'`. Show "Checkout was not completed" with "Try again" link to `/demo/[slug]/upgrade`.

**State 4: Conversion complete.** Demo exists, `isDemo === false`.

Two rendering modes based on session binding:

- **With valid session** (`session_id` present, Stripe session complete, metadata `slug` matches): Personalized content — "We sent a welcome email to **{customerEmail}**", community-type-specific next steps, "Go to your community" CTA → `/auth/login`.
- **Without valid session** (missing, mismatched, or no session_id): Generic content only — "Your community is now live", "Check your email for login instructions", "Go to login" CTA. No email, no customer name, no community-type details. Prevents data leak from public URL.

**Community-type-specific next steps (personalized mode only):**
- Condo/HOA: Set password → Upload governing documents → Invite board members
- Apartment: Set password → Set up unit directory → Configure visitor/package logging

### 3B. Landing Page Post-Conversion Redirect

When `/demo/[slug]` loads and `isDemo === false`: server-side redirect (307) to `/demo/[slug]/converted`. Prevents dead-end entry form with buttons that would fail.

When soft-deleted (`deletedAt` set): existing "This demo has expired" message, unchanged.

### 3C. Expiry Cron — Grace-Aware

Changes to `POST /api/v1/internal/expire-demos`:

**Step 1 (new): Detect demos entering grace.** Before existing expiry logic:

```typescript
const enteringGrace = await db
  .select({
    communityId: communities.id,
    demoInstanceId: demoInstances.id,
    trialEndsAt: communities.trialEndsAt,
  })
  .from(communities)
  .innerJoin(demoInstances, eq(demoInstances.seededCommunityId, communities.id))
  .where(and(
    eq(communities.isDemo, true),
    lt(communities.trialEndsAt, now),
    gt(communities.demoExpiresAt, now),  // not yet expired — column-first, matching codebase convention
    isNull(communities.deletedAt),
    isNull(demoInstances.deletedAt),
  ));

for (const row of enteringGrace) {
  await db.insert(conversionEvents).values({
    demoId: row.demoInstanceId,
    communityId: row.communityId,
    eventType: 'grace_started',
    source: 'cron',
    dedupeKey: `demo:${row.demoInstanceId}:grace_started`,
    occurredAt: row.trialEndsAt,
    metadata: {},
  }).onConflict(sql`(dedupe_key) DO NOTHING`);
}
```

**Step 2 (modified): Expiry.** Existing soft-delete logic unchanged. After each soft-delete, emit `demo_soft_deleted` event (awaited best-effort, `ON CONFLICT DO NOTHING`).

**Step 3 (unchanged): Expire stale access requests.**

### 3D. Stripe Webhook — Event Emission

Events emitted **inside `demo-conversion.ts`**, not from the webhook route:

**`handleDemoConversion()` signature change:**
```typescript
async function handleDemoConversion(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  eventCreatedEpoch: number,  // event.created, not session.created
): Promise<void>
```

**Inside `handleDemoConversion()`, after `convertCommunity()` succeeds:**
- Emit `checkout_completed`: `dedupe_key: stripe:{stripeEventId}`, `occurred_at: new Date(eventCreatedEpoch * 1000)`, metadata: `{ planId }`

**Inside `ensureFoundingUser()`, after roles are created:**
- Emit `founding_user_created`: `dedupe_key: demo:{demoId}:founding_user`, `occurred_at: now()`

**New webhook handler: `checkout.session.expired`:**
- Stays in webhook route (new handler, no existing service)
- Only emits if session metadata contains `demoId`
- Emit `checkout_session_expired`: `dedupe_key: stripe:{stripeEventId}`

### 3E. Demo Entry + Creation — Event Emission

**Demo creation** (`POST /api/admin/demos`): `demo_created`, `source: 'admin_app'`, `dedupe_key: demo:{demoId}:created`

**Demo entry** (`POST /api/v1/demo/[slug]/enter`): `demo_entered`, `source: 'web_app'`, `dedupe_key: demo:{demoId}:entered:{targetUserId}:{requestId}` (requestId = `crypto.randomUUID()` per request), `metadata: { role }`, `user_id: targetUserId` (the demo user being entered as, not the anonymous visitor)

**Admin convert** (`POST /api/v1/admin/demo/[slug]/convert`): `conversion_initiated`, `source: 'admin_app'`, `dedupe_key: demo:{demoId}:conversion_initiated:{stripeSessionId}`

### 3F. Readiness Endpoint

`GET /api/v1/internal/readiness`

**Auth:** `Authorization: Bearer {READINESS_CHECK_SECRET}` via `requireCronSecret(req, process.env.READINESS_CHECK_SECRET)`.

**Deployment dependency:** Only meaningful after Section 1A ships (all checkout paths migrated to `resolveStripePrice()`). Do not deploy before that migration.

**Checks:**
1. **Stripe prices:** Verify every `(planId, communityType)` from `SIGNUP_PLAN_OPTIONS` has a `stripe_prices` row.
2. **Database:** `SELECT 1` connection check.
3. **Supabase auth:** `admin.auth.admin.listUsers({ perPage: 1 })`.

**Response:**
```json
{
  "status": "healthy | degraded | unhealthy",
  "checks": {
    "stripe_prices": { "status": "pass", "missing": [] },
    "database": { "status": "pass" },
    "supabase_auth": { "status": "pass" }
  }
}
```

- `healthy`: all pass
- `degraded`: DB + auth pass, stripe_prices has gaps
- `unhealthy`: DB or auth unreachable

Existing `/api/health` routes unchanged — cheap edge liveness only.

### 3G. ConvertDemoDialog Accessibility Fixes

1. Migrate from hand-rolled modal to Radix-based `Dialog` from `apps/web/src/components/ui/dialog.tsx` — provides focus trap, Escape-to-close, scroll lock
2. Add `aria-labelledby` pointing to dialog title
3. Replace raw Tailwind colors with semantic tokens (`--surface-card`, `--text-primary`, `--border-default`, `--status-danger`)

No behavioral changes.

---

## Testing Guidance

**Section 1:**
- Stripe price lookup: valid combo, invalid plan-for-community-type, missing price row
- Conversion events: dedupe on retry, PII constraint rejection, concurrent inserts
- Demo lifecycle: status computation for each state, CHECK constraint enforcement, backfill correctness

**Section 2:**
- Self-service upgrade: full flow end-to-end (banner → page → checkout → webhook → converted)
- Grace lock: upload, contact update, documents, meetings, residents mutation blocked; bypass routes exempt
- DemoTrialBanner: active trial state, grace state, converted/expired not rendered

**Section 3:**
- Converted page: valid session, missing session, mismatched slug, `open` status, `expired` status, webhook lag with timeout
- Landing page after conversion: redirect to converted page, no entry form dead-end
- Cron: repeated runs emit only one `grace_started` per demo
- Dialog: Escape closes, focus trap works, focus returns to trigger on close

---

## Implementation Phases

**Phase 1 (Foundation):** Section 1 — `stripe_prices` table, `conversion_events` table, `trial_ends_at` column + backfill, migrate all checkout paths to `resolveStripePrice()`, event emission in existing routes.

**Phase 2 (Self-Service):** Section 2 — `DemoTrialBanner`, upgrade page, self-service endpoint, `assertNotDemoGrace()` guard across all mutating routes.

**Phase 3 (Polish + Observability):** Section 3 — enhanced converted page, cron changes, webhook event emission, readiness endpoint, dialog a11y fixes.

Each phase ships independently. Phase 1 is prerequisite for Phase 2 and 3. Phases 2 and 3 can run in parallel after Phase 1.
