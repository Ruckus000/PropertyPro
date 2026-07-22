# Wave 1a — Trust & Activation Pipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Public GA activation truthful and navigable: 30-day card-required trial copy matches Stripe, `/login` works, command-palette orphans are gone, and marketing no longer overclaims.

**Architecture:** Single shared `SIGNUP_TRIAL_DAYS = 30` constant in `@propertypro/shared` drives Stripe Checkout and marketing copy. Next.js permanent redirect fixes `/login`. Feature-registry hrefs are repointed or removed to live routes only. Dev-only routes already 404 in production for agent-login; harden remaining `/dev/*` and `/pdfjs-test`. Checkout recovery UX gets a light branded pass (back links already exist). **Out of scope:** Wave 1b lifecycle/grace, Wave 2 aha/nav slim, transparency default-on.

**Tech Stack:** Next.js 15 App Router, Vitest, Stripe Checkout Embedded, `@propertypro/shared`

**Spec:** [docs/superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md](../specs/2026-07-10-public-ga-shippable-prd-design.md) §7 Wave 1a

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/shared/src/billing/signup-trial.ts` (create) | `SIGNUP_TRIAL_DAYS` + short marketing copy helpers |
| `packages/shared/src/index.ts` (or billing barrel) | Re-export constant |
| `apps/web/src/lib/services/stripe-service.ts` | Use `SIGNUP_TRIAL_DAYS` in `subscription_data.trial_period_days` |
| `apps/web/src/components/marketing/hero-section.tsx` | Trial copy from shared helper |
| `apps/web/src/components/marketing/pricing-section.tsx` | Trial + card-required copy |
| `apps/web/src/components/marketing/logo-proof-section.tsx` | Label placeholders (not “Trusted by” as fact) |
| `apps/web/src/components/marketing/faq-section.tsx` | Add trial/card FAQ |
| `apps/web/next.config.ts` | Permanent `/login` → `/auth/login` redirect |
| `apps/web/src/lib/constants/feature-registry.ts` | Fix/remove orphan hrefs |
| `apps/web/src/middleware.ts` (light) | Block `/pdfjs-test` and non-essential `/dev/*` in production if not already |
| `apps/web/src/app/(public)/signup/checkout/page.tsx` | Branded missing-id empty state (copy/layout only) |
| `apps/web/__tests__/billing/stripe-service.test.ts` | Assert trial days = 30 |
| `apps/web/__tests__/marketing/landing-page.test.tsx` | Assert no “no card required”; 30-day copy |
| `apps/web/__tests__/lib/feature-registry-hrefs.test.ts` (create) | Assert registry hrefs resolve to known live patterns |

---

### Task 1: Shared trial constant

**Files:**
- Create: `packages/shared/src/billing/signup-trial.ts`
- Modify: `packages/shared/src/index.ts` (or existing billing export path used by web)
- Test: `packages/shared/src/__tests__/signup-trial.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/__tests__/signup-trial.test.ts
import { describe, expect, it } from 'vitest';
import {
  SIGNUP_TRIAL_DAYS,
  signupTrialMarketingLine,
  signupTrialHeroBullet,
} from '../billing/signup-trial';

describe('signup trial constants', () => {
  it('is 30 days for Public GA', () => {
    expect(SIGNUP_TRIAL_DAYS).toBe(30);
  });

  it('marketing line states card required and omits no-card claims', () => {
    const line = signupTrialMarketingLine();
    expect(line).toMatch(/30-day/i);
    expect(line).toMatch(/card required/i);
    expect(line.toLowerCase()).not.toContain('no card');
  });

  it('hero bullet is short and truthful', () => {
    expect(signupTrialHeroBullet()).toMatch(/30-day/i);
    expect(signupTrialHeroBullet().toLowerCase()).not.toContain('no card');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @propertypro/shared exec vitest run src/__tests__/signup-trial.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement constant + helpers**

```typescript
// packages/shared/src/billing/signup-trial.ts
/** Stripe Checkout trial length for self-serve signup (Public GA). */
export const SIGNUP_TRIAL_DAYS = 30 as const;

/** Pricing-section subcopy — must stay aligned with Stripe Checkout. */
export function signupTrialMarketingLine(): string {
  return `${SIGNUP_TRIAL_DAYS}-day free trial; card required to start.`;
}

/** Hero checklist bullet. */
export function signupTrialHeroBullet(): string {
  return `${SIGNUP_TRIAL_DAYS}-day free trial`;
}
```

Export from the package public entry — `packages/shared/src/index.ts` already has `export * from './billing/permissions';` so add:

```typescript
export * from './billing/signup-trial';
```

Do not create a second source of truth.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @propertypro/shared exec vitest run src/__tests__/signup-trial.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/billing/signup-trial.ts packages/shared/src/__tests__/signup-trial.test.ts packages/shared/src/index.ts
git commit -m "$(cat <<'EOF'
feat(shared): add SIGNUP_TRIAL_DAYS=30 for Public GA truth

Single source for Stripe trial length and marketing copy helpers.
EOF
)"
```

---

### Task 2: Stripe Checkout uses 30-day trial

**Files:**
- Modify: `apps/web/src/lib/services/stripe-service.ts` (~line 123)
- Modify: `apps/web/__tests__/billing/stripe-service.test.ts`

- [ ] **Step 1: Extend existing stripe-service test to assert trial days**

In the happy-path test for `createEmbeddedCheckoutSession`, after the mock create call, add:

```typescript
expect(checkoutSessionsCreateMock).toHaveBeenCalledWith(
  expect.objectContaining({
    subscription_data: expect.objectContaining({
      trial_period_days: 30,
    }),
  }),
);
```

If the existing test only checks `toHaveBeenCalled`, replace/narrow the assertion to include `trial_period_days: 30` (import `SIGNUP_TRIAL_DAYS` and use that value in the expect).

- [ ] **Step 2: Run test — expect FAIL (still 14)**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/billing/stripe-service.test.ts`

Expected: FAIL on `trial_period_days`

- [ ] **Step 3: Wire constant into stripe-service**

In `createEmbeddedCheckoutSession`, replace:

```typescript
    subscription_data: {
      trial_period_days: 14,
    },
```

with:

```typescript
    subscription_data: {
      trial_period_days: SIGNUP_TRIAL_DAYS,
    },
```

Add: `import { SIGNUP_TRIAL_DAYS } from '@propertypro/shared';` (or the precise export path this package already uses).

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/billing/stripe-service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/services/stripe-service.ts apps/web/__tests__/billing/stripe-service.test.ts
git commit -m "$(cat <<'EOF'
fix(billing): use 30-day signup trial in Stripe Checkout

Align Embedded Checkout with Public GA SIGNUP_TRIAL_DAYS.
EOF
)"
```

---

### Task 3: Marketing copy truth

**Files:**
- Modify: `apps/web/src/components/marketing/hero-section.tsx`
- Modify: `apps/web/src/components/marketing/pricing-section.tsx`
- Modify: `apps/web/src/components/marketing/logo-proof-section.tsx`
- Modify: `apps/web/src/components/marketing/faq-section.tsx`
- Modify: `apps/web/__tests__/marketing/landing-page.test.tsx`

- [ ] **Step 1: Add/adjust landing-page tests**

```typescript
describe('PricingSection trial truth', () => {
  it('states card required and does not claim no card', () => {
    const html = renderToStaticMarkup(<PricingSection />);
    expect(html.toLowerCase()).toContain('card required');
    expect(html.toLowerCase()).not.toContain('no card required');
    expect(html).toMatch(/30-day/i);
  });
});

describe('HeroSection trial truth', () => {
  it('shows 30-day trial without no-card claim', () => {
    const html = renderToStaticMarkup(<HeroSection />);
    expect(html).toMatch(/30-day/i);
    expect(html.toLowerCase()).not.toContain('no card');
  });
});

describe('LogoProofSection', () => {
  it('labels illustrative names, not unverifiable trust claim', () => {
    const html = renderToStaticMarkup(<LogoProofSection />);
    expect(html.toLowerCase()).not.toContain('trusted by management companies across florida');
    // Accept either "illustrative" or "examples" framing
    expect(
      html.toLowerCase().includes('illustrative') ||
        html.toLowerCase().includes('example'),
    ).toBe(true);
  });
});
```

Update any existing `LogoProofSection` test that expects “Trusted by…” / “management companies” as a trust claim.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx`

Expected: FAIL on pricing/hero/logo assertions

- [ ] **Step 3: Update components**

`hero-section.tsx` — replace hard-coded `14-day free trial` bullet with `{signupTrialHeroBullet()}` (client/server: if this file is a server component, import from shared is fine; if client, shared helpers are pure strings — OK).

`pricing-section.tsx` — replace:

```tsx
Every plan includes statute compliance monitoring, hosting, and SSL.
14-day free trial, no card required.
```

with copy that includes `signupTrialMarketingLine()` (or equivalent JSX using `SIGNUP_TRIAL_DAYS`).

`logo-proof-section.tsx` — change eyebrow to something like:

```tsx
<p className="mk-logo-eyebrow">
  Illustrative management-company names (examples)
</p>
```

Keep the placeholder company list; comment already says swap for real customers later.

`faq-section.tsx` — append:

```typescript
{
  q: 'Is there a free trial? Do I need a card?',
  a: 'Yes — a 30-day trial. A card is required to start; you will not be charged until the trial ends unless you cancel.',
},
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/hero-section.tsx \
  apps/web/src/components/marketing/pricing-section.tsx \
  apps/web/src/components/marketing/logo-proof-section.tsx \
  apps/web/src/components/marketing/faq-section.tsx \
  apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "$(cat <<'EOF'
fix(marketing): align trial copy with 30-day card-required GA

Remove false no-card claims; label logo strip as illustrative.
EOF
)"
```

---

### Task 4: Permanent `/login` → `/auth/login` redirect

**Files:**
- Modify: `apps/web/next.config.ts`
- Test: `apps/web/__tests__/config/login-redirect.test.ts` (create) — **or** document a curl smoke if config tests are awkward

Next.js `redirects()` preserves query strings by default.

- [ ] **Step 1: Add redirects to next.config.ts**

```typescript
const nextConfig: NextConfig = {
  // ...existing keys
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/auth/login',
        permanent: true,
      },
    ];
  },
};
```

- [ ] **Step 2: Smoke-check locally**

With `pnpm --filter @propertypro/web dev` running:

```bash
curl -sI http://localhost:3000/login | head -5
curl -sI 'http://localhost:3000/login?returnTo=%2Fdashboard' | head -8
```

Expected: `308` or `301` to `/auth/login` (and query preserved on the second call).

- [ ] **Step 3: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "$(cat <<'EOF'
fix(web): permanently redirect /login to /auth/login

Stops Community Not Found / 404 for legacy and emailed login URLs.
EOF
)"
```

---

### Task 5: Feature-registry orphan hrefs

**Files:**
- Modify: `apps/web/src/lib/constants/feature-registry.ts`
- Create: `apps/web/__tests__/lib/feature-registry-hrefs.test.ts`

**Repoint map (live routes in this repo):**

| Registry id | Old href | New href |
|-------------|----------|----------|
| `page-voting` | `/communities/${cid}/voting` | `/communities/${cid}/board/elections` |
| `page-community-board` | `/community-board` | `(cid) => `/communities/${cid}/board/forum`` |
| `page-arc` | `/arc` | `/arc-requests` |
| `action-submit-arc` | `/arc` (if present) | `/arc-requests` |
| `page-calendar` | `/calendar` | **Remove entry** (calendar is embedded in meetings; no `/calendar` page) |
| `page-polls` | `/polls` | `(cid) => `/communities/${cid}/board/polls`` |
| `action-create-poll` | `/polls/new` | `(cid) => `/communities/${cid}/board/polls`` |
| `setting-community` | `/settings/community` | `/settings` |

- [ ] **Step 1: Write registry href guard test**

```typescript
// apps/web/__tests__/lib/feature-registry-hrefs.test.ts
import { describe, expect, it } from 'vitest';
import { FEATURE_REGISTRY } from '@/lib/constants/feature-registry';

const FORBIDDEN_EXACT = new Set([
  '/calendar',
  '/community-board',
  '/arc',
  '/polls',
  '/polls/new',
  '/settings/community',
]);

function resolveHref(href: string | ((cid: number) => string)): string {
  return typeof href === 'function' ? href(1) : href;
}

describe('FEATURE_REGISTRY hrefs', () => {
  it('does not point at known orphan paths', () => {
    for (const item of FEATURE_REGISTRY) {
      if (!('href' in item) || item.href == null) continue;
      const resolved = resolveHref(item.href as string | ((cid: number) => string));
      expect(FORBIDDEN_EXACT.has(resolved), `${item.id} → ${resolved}`).toBe(false);
      expect(resolved.includes('/voting'), `${item.id} → ${resolved}`).toBe(false);
    }
  });

  it('points voting at board elections', () => {
    const voting = FEATURE_REGISTRY.find((i) => i.id === 'page-voting');
    expect(voting).toBeTruthy();
    expect(resolveHref(voting!.href as (cid: number) => string)).toBe(
      '/communities/1/board/elections',
    );
  });
});
```

Adjust import name if the registry export is not `FEATURE_REGISTRY` — use the actual exported array name from `feature-registry.ts`.

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lib/feature-registry-hrefs.test.ts`

Expected: FAIL on forbidden paths

- [ ] **Step 3: Apply href fixes / remove calendar page entry**

Edit `feature-registry.ts` per the table above. When removing `page-calendar`, also remove any actions that only existed for that orphan.

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lib/feature-registry-hrefs.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/constants/feature-registry.ts \
  apps/web/__tests__/lib/feature-registry-hrefs.test.ts
git commit -m "$(cat <<'EOF'
fix(web): repoint feature-registry orphans to live routes

Stop command-palette discovery from sending users into 500s.
EOF
)"
```

---

### Task 6: Production-guard remaining dev surfaces

**Files:**
- Modify: `apps/web/src/middleware.ts` (early short-circuit) **or** each page — prefer one middleware check
- Verify: `apps/web/src/app/dev/agent-login/route.ts` already returns 404 in production

- [ ] **Step 1: Confirm agent-login prod 404**

```bash
rg -n "production|NODE_ENV|404" apps/web/src/app/dev/agent-login/route.ts
```

Expected: existing production 404 guard.

- [ ] **Step 2: Block `/pdfjs-test` and `/dev/site-preview`, `/dev/reset-onboarding`, `/dev/login` in production via middleware**

Near the top of the middleware handler (after request URL parse), add:

```typescript
  if (process.env.NODE_ENV === 'production') {
    const p = request.nextUrl.pathname;
    if (
      p === '/pdfjs-test' ||
      p.startsWith('/pdfjs-test/') ||
      p === '/dev/site-preview' ||
      p === '/dev/reset-onboarding' ||
      p === '/dev/login' ||
      p.startsWith('/dev/login')
    ) {
      return NextResponse.rewrite(new URL('/404', request.url)); // or notFound pattern used elsewhere in this middleware
    }
  }
```

Match whatever 404 pattern this middleware already uses for unknown tenants (do not invent a new error page). **Do not** block `/dev/agent-login` beyond its own route guard if tests rely on it only in non-production.

- [ ] **Step 3: Manual smoke in prod build optional; in dev ensure pages still load**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pdfjs-test
```

Expected in dev: `200` (still available for local). Production behavior covered by `NODE_ENV` branch.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "$(cat <<'EOF'
chore(web): hide pdfjs-test and non-agent dev routes in production

Keep local tooling; prevent accidental prod exposure.
EOF
)"
```

---

### Task 7: Checkout missing-id branded empty state (light)

**Files:**
- Modify: `apps/web/src/app/(public)/signup/checkout/page.tsx`
- Modify: `apps/web/src/app/(public)/signup/checkout/return/page.tsx` (if still raw)

- [ ] **Step 1: Improve missing-id UI copy only**

Replace bare `Missing signup request ID.` with a short branded block:

- Title: “Let’s restart checkout”
- Body: “We couldn’t find your signup session. Return to sign up to continue — your community details can be entered again.”
- Keep existing `← Back to sign up` link to `/signup`

Do **not** redesign the whole checkout flow in Wave 1a.

- [ ] **Step 2: Visual smoke**

Open `http://localhost:3000/signup/checkout` — expect branded message + back link, not a raw red string alone.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(public\)/signup/checkout/page.tsx \
  apps/web/src/app/\(public\)/signup/checkout/return/page.tsx
git commit -m "$(cat <<'EOF'
fix(signup): brand checkout missing-session empty state

Clearer recovery copy while keeping Back to sign up.
EOF
)"
```

---

### Task 8: Wave 1a verification gate

- [ ] **Step 1: Unit/typecheck slice**

```bash
pnpm --filter @propertypro/shared exec vitest run src/__tests__/signup-trial.test.ts
pnpm --filter @propertypro/web exec vitest run __tests__/billing/stripe-service.test.ts __tests__/marketing/landing-page.test.tsx __tests__/lib/feature-registry-hrefs.test.ts
pnpm --filter @propertypro/web typecheck
```

Expected: all PASS

- [ ] **Step 2: Manual activation smoke (staging or local with Stripe test mode if available)**

Checklist:

1. Marketing `/` shows 30-day + card required; no “no card required”
2. `/login` redirects to `/auth/login`
3. Command palette search for “calendar” does not navigate to `/calendar`
4. `/signup/checkout` without id shows branded recovery

Full signup→Stripe E2E may require secrets; if unavailable, record “manual Stripe E2E deferred to staging” in the PR description — do not block merge of copy/redirect/registry if unit tests pass.

- [ ] **Step 3: Open PR summarizing Wave 1a**

PR body should link the PRD Wave 1a exit criteria and explicitly list **Wave 1b still TODO** (lifecycle grace inventory).

---

## Spec coverage (self-review)

| Wave 1a requirement | Task |
|---------------------|------|
| Marketing 30-day + card required | Tasks 1, 3 |
| Stripe `trial_period_days: 30` | Tasks 1, 2 |
| `/login` redirect | Task 4 |
| Registry orphans | Task 5 |
| Dev route prod guard | Task 6 |
| Checkout missing-id recovery UX | Task 7 |
| Trusted-by logos | Task 3 (illustrative label) |
| Staging E2E signup→trialing | Task 8 (manual/staging; not blocked on local secrets) |

**Explicitly not in this plan (Wave 1b+):** grace/`grace_until`, soft lock, guard inventory, transparency default-on, nav slim, aha onboarding.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-10-wave-1a-trust-activation-pipe.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
