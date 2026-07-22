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
- Create: `packages/db/migrations/0025_subscription_current_period_end.sql` (renumbered from 0024 — prod's 0024 slot is #763's `0024_canonicalize_onboarding_checklist_trigger`, applied 2026-07-03)
- Modify: `packages/db/src/schema/communities.ts`
- Modify: `apps/web/src/lib/services/stripe-webhook-service.ts` — `updateCommunitySubscriptionFromStripe`
- Modify: `apps/web/src/app/api/v1/webhooks/stripe/route.ts` — pass period end from `retrieveSubscription`

- [x] **Step 1: Add migration** (idx 25; idx 24 gap reserved for the already-applied #763 trigger migration)
- [x] **Step 2: Extend webhook update helper** — accept optional `subscriptionCurrentPeriodEndAt: Date | null`
- [x] **Step 3: On `customer.subscription.updated` / checkout complete** — set from `subscription.current_period_end`
- [x] **Step 4: Run migration** — `pnpm --filter @propertypro/db db:migrate`

### C1.2 Shell context + shared banners

**Files:**
- Create: `apps/web/src/components/billing/subscription-billing-banners.tsx`
- Modify: `apps/web/src/lib/api/community-membership.ts`
- Modify: `apps/web/src/lib/request/page-shell-context.ts`
- Modify: `apps/web/src/app/(authenticated)/layout.tsx`
- Modify: `apps/web/src/components/layout/app-shell.tsx` — delegate to shared component
- Modify: `apps/web/src/app/mobile/layout.tsx` — render shared banners for admins
- Test: `apps/web/__tests__/billing/subscription-billing-banners.test.tsx`

- [x] **Step 1: Write failing tests** — trialing shows days left; grace/lock/past_due unchanged; demo suppresses paid trialing banner
- [x] **Step 2: Implement `TrialingBanner`**
- [x] **Step 3: Wire through layout props**

### Verify

```bash
pnpm --filter @propertypro/db db:migrate
pnpm --filter @propertypro/web exec vitest run __tests__/billing/subscription-billing-banners.test.tsx
pnpm --filter @propertypro/web exec vitest run __tests__/billing/stripe-webhook.test.ts
```

---

## Slice C2 — Essentials craft pass (PRD §3.1) — ✅ DONE (`e38419f8`…`f294d740`)

Priority order per PRD: **Compliance → Documents → Meetings → Announcements → Residents → Settings/Billing → Help → Website**

For each route, ensure: loading skeleton, intentional empty state, error recovery (retry CTA), success toast on mutations, mobile-acceptable layout at `max-w-[1400px]`.

### C2.1 Compliance (`/compliance`)

**Files:** `apps/web/src/app/(authenticated)/compliance/page.tsx`, related list components

- [x] Audit loading/empty/error — align with `DESIGN.md` EmptyState pattern — `e38419f8`
- [x] Add or extend unit test if page uses client fetch hooks — `e38419f8`

### C2.2 Documents (`/documents`)

**Files:** documents page + upload empty state

- [x] Empty: “No documents yet” + primary upload CTA (founding aha may have linked one — list still handles zero) — `18c8c3fe`

### C2.3 Meetings (`/meetings`)

- [x] Skeleton table; empty “Schedule your first meeting” CTA — `f9cf02b9`

### C2.4 Announcements (`/announcements`)

- [x] Empty state + error boundary with retry — `6df0bdbf`

### C2.5 Residents (`/residents`)

- [x] Empty + import CTA; error recovery on failed fetch — `07789ba5`

### C2.6 Settings / Billing (`/settings/billing`)

- [x] Trialing/grace status card matches shell banners (no contradictory copy) — `e2123666`

### C2.7 Help (`/help` or contextual)

- [x] Community-scoped help loads; no 404 for Essentials slim nav users — `40b804a1`

### C2.8 Website (`/website` or site editor entry)

- [x] Empty draft vs published states distinct — `f294d740`

### Verify (per slice or batch)

```bash
pnpm --filter @propertypro/web typecheck
pnpm test
# Optional: extend wave-2-ga-staging.spec.ts with spot-check navigation to each route
```

---

## Slice C3 — Mobile web polish (PRD §3.3) — ✅ DONE (`ebb2e861`)

**Files:**
- `apps/web/src/app/mobile/layout.tsx` — subscription banners (C1)
- `apps/web/src/components/mobile/FeatureCard.tsx` — compliance card → tappable link (C3)
- `apps/web/src/components/mobile/MobileProfileContent.tsx` — “More” menu dead-link a11y (C3)
- Tests: `apps/web/__tests__/mobile/feature-card.test.tsx`, `mobile-profile-content.test.tsx`

- [x] Subscription banners visible on mobile for billing admins — C1 (`b16bb533`)
- [x] Founding aha CTA reachable from mobile dashboard — mobile compliance score card is now a `Link` into `/communities/[id]/compliance` — `ebb2e861`
- [x] No `href`-less “Coming soon” rows without `aria-disabled` + explanation — audit found no live dead rows; hardened the href-less fallback with `aria-disabled` + explanatory title — `ebb2e861`

### Verify

```bash
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts e2e/wave-2-ga-staging.spec.ts --grep "slim nav"
# Manual: mobile viewport 390px on founding_admin dashboard
```

---

## Slice C4 — Apartment secondary path (PRD §3.4) — ✅ DONE (`9e936eec`)

**Files:**
- `apps/web/src/app/(authenticated)/dashboard/page.tsx` — apartment branch (redirect already shipped P2-36/38)
- `apps/web/__tests__/app/dashboard/apartment-redirect.test.ts` — regression lock (C4)

- [x] Post-provision apartment community lands on apartment dashboard (not condo compliance aha) — `dashboard/page.tsx` redirects to `/dashboard/apartment` before the founding-aha branch; regression test added — `9e936eec`
- [x] Marketing homepage remains board-first (no apartment hero regression — `marketing-smoke.spec.ts`)

### Verify

```bash
pnpm --filter @propertypro/web exec playwright test -c playwright.config.ts e2e/marketing-smoke.spec.ts
# Manual: seed sunset-ridge-apartments + owner login
```

---

## Slice C5 — maxAdmins invite UX (PRD §3.5) — ✅ DONE (API `b16bb533`, UI `24525af2`)

**Files:**
- `apps/web/src/lib/services/role-management-service.ts` — `assignPropertyManager` (cap enforcement + `ADMIN_LIMIT_REACHED` code)
- `apps/web/src/lib/api/errors/ForbiddenError.ts` — optional `code`/`details` so the reason survives the 403
- `apps/web/src/hooks/use-role-management.ts` — raw-fetch `useAssignPropertyManager` → typed `AssignPropertyManagerError`
- `apps/web/src/components/settings/RolesAccessClient.tsx` — Settings → Roles `MembersSection` upsell banner
- Tests: `role-management-service.test.ts`, `roles-access-client.test.tsx`, `use-role-management.test.tsx`

- [x] **Step 1: Count admin-tier roles** (`root_manager` + `property_manager`) before assign — `b16bb533`
- [x] **Step 2: Throw `ForbiddenError`** with upsell copy when `count >= PLAN_FEATURES[planId].maxAdmins` — tagged `ADMIN_LIMIT_REACHED` + `{ maxAdmins }` — `24525af2`
- [x] **Step 3: Surface error in UI** — plan-driven “Your plan includes up to N administrators” + **View billing & upgrade** link (non-capacity failures keep a plain error) — `24525af2`

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

- [~] Marketing ↔ Stripe ↔ emails consistent — in-app trialing/grace banners done (C1); signup→provision server logic unit/integration-tested. **GATE:** one-time live signup→Stripe browser E2E (external Stripe test secrets) → see [GA sign-off](../../audits/2026-07-12-ga-go-no-go.md#remaining-gate--live-stripe-test-mode-e2e-external-secrets)
- [x] Lifecycle matrix documented
- [x] Mutation guard inventory reviewed
- [~] Signup→provision→aha E2E — seeded path done (`wave-2-ga-staging.spec.ts`); **GATE:** live signup→Stripe browser run (same external gate as above)
- [x] Public host transparency loads
- [x] Zero orphan registry links
- [x] Soft lock enforced + UI banners — shared `SubscriptionBillingBanners` (trialing/grace/lock/past_due) on desktop + mobile (C1 `b16bb533`); mobile compliance CTA parity (C3 `ebb2e861`)
- [x] `/login` redirect
- [x] Slim nav + Essentials craft pass signed off — slim nav (Wave 2) + 8-route craft pass (C2 `e38419f8`…`f294d740`) + mobile polish (C3 `ebb2e861`)
- [x] `maxAdmins: 3` verified — API enforcement (C1 `b16bb533`) + UI surfacing/upsell (C5 `24525af2`)
- [x] Tenant isolation CI green — `guard:db-access` + `guard:tenant-scope` clean; `tenant-isolation-game-day` + `multi-tenant-isolation` integration tests run on PR CI
- [x] Support runbook published

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

**Wave 3 exit:** All in-app/craft/lifecycle/isolation boxes checked with evidence.
Decision recorded 2026-07-12: **CONDITIONAL GO** — see
[GA go/no-go sign-off](../../audits/2026-07-12-ga-go-no-go.md). Sole remaining
gate = one-time live Stripe test-mode E2E (external secrets); no code work
remains for Wave 3.

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
