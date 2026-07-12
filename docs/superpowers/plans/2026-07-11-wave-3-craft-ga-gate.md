# Wave 3 — Craft Parity & GA Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Essentials default-nav destination meets loading/empty/error/success craft bar; billing lifecycle is visible in-app (trialing, grace, soft lock); mobile and apartment paths are GA-ready; PRD §3.5 checklist is evidenced and signed off.

**Architecture:** Billing UX extends existing `app-shell.tsx` banners and `page-shell-context.ts` subscription fields — add `subscriptionCurrentPeriodEndAt` from Stripe webhooks for “days left” copy. Craft pass reuses `DESIGN.md` patterns (`EmptyState`, skeletons, `AlertBanner`) per visible nav route without new nav matrix changes. `maxAdmins` enforced at `assignPropertyManager` API boundary with user-facing copy on Settings → Team.

**Tech Stack:** Next.js 15 App Router, Vitest, Playwright, Drizzle ORM, `@propertypro/shared`, `@propertypro/ui`

**Spec:** [docs/superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md](../specs/2026-07-10-public-ga-shippable-prd-design.md) §7 Wave 3, §3.5

**Handoff:** [docs/superpowers/handoffs/2026-07-11-post-pr764-wave3.md](../handoffs/2026-07-11-post-pr764-wave3.md)

**Depends on:** Wave 1a + 1b + 2 (PR #764, `991b9dc4`)

**Out of scope:** PM portfolio GA, native apps, schema default `transparency_enabled`, signup→trialing automated E2E (deferred)

---

## Locked decisions

| Decision | Choice |
|----------|--------|
| Trial end source | Persist Stripe `current_period_end` as `subscription_current_period_end_at` on `communities` |
| Trialing banner audience | Paid communities (`!isDemo`) with `subscriptionStatus === 'trialing'`; demo keeps `DemoTrialBanner` |
| Grace / lock banners | Keep existing `GraceBanner`, `SoftLockBanner`, `past_due` — extract shared `SubscriptionBillingBanners` for desktop + mobile |
| Craft scope | **Visible** Essentials default-nav destinations only (see §3.1 order) |
| `maxAdmins` | Count `root_manager` + `property_manager` roles; block assign at API with `PLAN_FEATURES[plan].maxAdmins` |
| GA sign-off | Binary checklist in §3.5 with linked test/doc evidence — not conversion metrics |

---

## Slice C1 — Billing banners & period end (PRD §3.2)

### C1.1 Schema + webhook persistence

**Files:**
- Create: `packages/db/migrations/0024_subscription_current_period_end.sql`
- Modify: `packages/db/src/schema/communities.ts`
- Modify: `apps/web/src/lib/services/stripe-webhook-service.ts` — `updateCommunitySubscriptionFromStripe`
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — pass period end from `retrieveSubscription`

- [ ] **Step 1: Add migration**

```sql
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS subscription_current_period_end_at timestamptz;
```

- [ ] **Step 2: Extend webhook update helper** — accept optional `subscriptionCurrentPeriodEndAt: Date | null`

- [ ] **Step 3: On `customer.subscription.updated` / checkout complete** — set from `subscription.current_period_end` (Unix seconds → Date)

- [ ] **Step 4: Run migration** — `pnpm --filter @propertypro/db db:migrate`

### C1.2 Shell context + shared banners

**Files:**
- Create: `apps/web/src/components/billing/subscription-billing-banners.tsx`
- Modify: `apps/web/src/lib/api/community-membership.ts`
- Modify: `apps/web/src/lib/request/page-shell-context.ts`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx` — delegate to shared component
- Modify: `apps/web/src/app/mobile/layout.tsx` — render shared banners for admins
- Test: `apps/web/__tests__/billing/subscription-billing-banners.test.tsx`

- [ ] **Step 1: Write failing tests** — trialing shows days left; grace/lock/past_due unchanged; demo suppresses paid trialing banner

- [ ] **Step 2: Implement `TrialingBanner`** — `differenceInCalendarDays(periodEnd, now)` + link to `/settings/billing` or portal

- [ ] **Step 3: Wire through layout props**

### Verify

```bash
pnpm --filter @propertypro/db db:migrate
pnpm --filter @propertypro/web exec vitest run __tests__/billing/subscription-billing-banners.test.tsx
pnpm --filter @propertypro/web exec vitest run __tests__/billing/stripe-webhook.test.ts
```

---

## Slice C2 — Essentials craft pass (PRD §3.1)

Priority order per PRD: **Compliance → Documents → Meetings → Announcements → Residents → Settings/Billing → Help → Website**

For each route, ensure: loading skeleton, intentional empty state, error recovery (retry CTA), success toast on mutations, mobile-acceptable layout at `max-w-[1400px]`.

### C2.1 Compliance (`/compliance`)

**Files:** `apps/web/src/app/(authenticated)/compliance/page.tsx`, related list components

- [ ] Audit loading/empty/error — align with `DESIGN.md` EmptyState pattern
- [ ] Add or extend unit test if page uses client fetch hooks

### C2.2 Documents (`/documents`)

**Files:** documents page + upload empty state

- [ ] Empty: “No documents yet” + primary upload CTA (founding aha may have linked one — list still handles zero)

### C2.3 Meetings (`/meetings`)

- [ ] Skeleton table; empty “Schedule your first meeting” CTA

### C2.4 Announcements (`/announcements`)

- [ ] Empty state + error boundary with retry

### C2.5 Residents (`/residents`)

- [ ] Empty + import CTA; error recovery on failed fetch

### C2.6 Settings / Billing (`/settings/billing`)

- [ ] Trialing/grace status card matches shell banners (no contradictory copy)

### C2.7 Help (`/help` or contextual)

- [ ] Community-scoped help loads; no 404 for Essentials slim nav users

### C2.8 Website (`/website` or site editor entry)

- [ ] Empty draft vs published states distinct

### Verify (per slice or batch)

```bash
pnpm --filter @propertypro/web typecheck
pnpm test
# Optional: extend wave-2-ga-staging.spec.ts with spot-check navigation to each route
```

---

## Slice C3 — Mobile web polish (PRD §3.3)

**Files:**
- `apps/web/src/app/mobile/layout.tsx` — subscription banners (C1)
- `apps/web/src/app/mobile/**/page.tsx` — audit “More” menu rows for dead links
- `apps/web/e2e/mobile-billing-banner.spec.ts` (new, optional)

- [ ] Subscription banners visible on mobile for billing admins
- [ ] Founding aha CTA reachable from mobile dashboard (link to compliance / transparency flow)
- [ ] No `href`-less “Coming soon” rows without `aria-disabled` + explanation

### Verify

```bash
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts e2e/wave-2-ga-staging.spec.ts --grep "slim nav"
# Manual: mobile viewport 390px on founding_admin dashboard
```

---

## Slice C4 — Apartment secondary path (PRD §3.4)

**Files:**
- `apps/web/src/app/(authenticated)/dashboard/page.tsx` — apartment branch
- Apartment onboarding wizard (existing)

- [ ] Post-provision apartment community lands on apartment dashboard (not condo compliance aha)
- [ ] Marketing homepage remains board-first (no apartment hero regression — `marketing-smoke.spec.ts`)

### Verify

```bash
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts e2e/marketing-smoke.spec.ts
# Manual: seed sunset-ridge-apartments + owner login
```

---

## Slice C5 — maxAdmins invite UX (PRD §3.5)

**Files:**
- Modify: `apps/web/src/lib/services/role-management-service.ts` — `assignPropertyManager`
- Modify: Settings team UI (locate via `role-assignments` consumer)
- Test: `apps/web/__tests__/services/role-management-max-admins.test.ts`

- [ ] **Step 1: Count admin-tier roles** (`root_manager` + `property_manager`) before assign

- [ ] **Step 2: Throw `ForbiddenError`** with upsell copy when `count >= PLAN_FEATURES[planId].maxAdmins`

- [ ] **Step 3: Surface error in UI** — “Essentials includes up to 3 administrators”

### Verify

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/services/role-management-max-admins.test.ts
```

---

## Slice C6 — GA gate & support runbook (PRD §3.5)

**Files:**
- `docs/support/ga-support-runbook.md`
- Update: `docs/superpowers/handoffs/2026-07-11-post-pr764-wave3.md` — flip checklist rows to Done with PR links

### GA checklist (track here)

- [ ] Marketing ↔ Stripe ↔ emails consistent
- [ ] Lifecycle matrix documented
- [ ] Mutation guard inventory reviewed
- [ ] Signup→provision→aha E2E (seeded path; signup flow documented/deferred)
- [ ] Public host transparency loads
- [ ] Zero orphan registry links
- [ ] Soft lock enforced + UI banners
- [ ] `/login` redirect
- [ ] Slim nav + Essentials craft pass signed off
- [ ] `maxAdmins: 3` verified
- [ ] Tenant isolation CI green
- [ ] Support runbook published

### Final verification gate

```bash
scripts/with-env-local.sh pnpm seed:demo
pnpm --filter @propertypro/web test:e2e:tenant
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts \
  e2e/activation-smoke.spec.ts e2e/marketing-smoke.spec.ts
pnpm test
pnpm lint
pnpm typecheck
```

**Wave 3 exit:** All §3.5 boxes checked with evidence → Public GA go decision.

---

## PR sequencing suggestion

| PR | Contents |
|----|----------|
| Docs handoff | `handoffs/2026-07-11-post-pr764-wave3.md` + this plan |
| `feat/wave-3-craft-ga-gate` C1 | Migration + billing banners |
| `feat/wave-3-craft-ga-gate` C2 | Craft pass (may split per route) |
| `feat/wave-3-craft-ga-gate` C3–C6 | Mobile, apartment, maxAdmins, runbook |

---

## Document control

- **Supersedes:** Informal “what’s next” from PR #764 staging work
- **Does not replace:** Wave 2 plan locked decisions
- **Next step after plan approval:** Execute C1 on `feat/wave-3-craft-ga-gate`
