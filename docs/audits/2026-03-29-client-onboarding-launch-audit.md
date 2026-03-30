# Client onboarding and launch-readiness audit

**Date:** March 29, 2026  
**Environment:** Production (`https://www.getpropertypro.com/`), browser agent + HTTP checks + code review  
**Constraints:** No paid signup, no new tenants, no production credentials for authenticated matrix.

---

## 1. Executive summary

**Launch-ready:** **No.** The marketing site and signup/login/legal flows are reachable and coherent enough for a soft preview, but several **P0/P1** issues block a confident public launch: broken post-provisioning login URL (`/login`), pricing and trial copy that do not match the signup funnel, “native mobile app” claims vs a web mobile surface, legal pages still marked DRAFT, checkout dead-ends without navigation, and **unverified** end-to-end billing/subscription linkage for net-new communities. Authenticated product verification on production **www** was **structurally limited** (reserved-host behavior), and **tenant subdomains** tested returned **DEPLOYMENT_NOT_FOUND**, so Phase C could not be executed against a live tenant host from this session.

**Top five blockers**

1. **Welcome email / bookmark URL:** Provisioning builds `loginUrl` as `${NEXT_PUBLIC_APP_URL}/login` ([`apps/web/src/lib/services/provisioning-service.ts`](../../apps/web/src/lib/services/provisioning-service.ts)), but production **`/login` returns HTTP 404** (only [`/auth/login`](../../apps/web/src/app/auth/login/page.tsx) exists). New customers clicking the email CTA hit an error experience.
2. **Marketing vs signup economics:** Landing pricing shows **$99 / $199 / $349** tiers ([`pricing-section.tsx`](../../apps/web/src/components/marketing/pricing-section.tsx)); signup offers **Essentials $199** and **Professional $349** for condo/HOA ([`signup-schema.ts`](../../apps/web/src/lib/auth/signup-schema.ts)) — **no $99** tier and different naming.
3. **Trial / card copy:** Marketing states **14-day trial** and **“No credit card required to start”**; signup says **“Billing checkout opens after email verification”** ([`signup/page.tsx`](../../apps/web/src/app/(auth)/signup/page.tsx)) — inconsistent and high-risk for trust and chargebacks.
4. **“Native mobile app” / push:** Marketing promises native apps and push ([`features-section.tsx`](../../apps/web/src/components/marketing/features-section.tsx)); product documentation describes **web-only `/mobile/`** ([`CLAUDE.md`](../../CLAUDE.md)). This is a **material** positioning gap.
5. **Stripe subscription ↔ community row:** Provisioning does **not** set `communities.stripe_customer_id` or `stripe_subscription_id`. Those IDs are set in **demo conversion** ([`demo-conversion.ts`](../../apps/web/src/lib/services/demo-conversion.ts)). Webhook handlers for **`customer.subscription.*`** and invoice events look up communities **by `stripe_subscription_id`** ([`stripe/route.ts`](../../apps/web/src/app/api/v1/webhooks/stripe/route.ts)). If net-new signups never persist those IDs, **billing lifecycle, portal, and plan sync** may not attach to the tenant — requires **staging verification with Stripe test mode** (not proven in prod here).

---

## 2. New client journey (observed vs blocked)

| Step | Production observation | Notes |
| --- | --- | --- |
| Marketing `/` | **200** — Hero, features, compliance, pricing, footer render; CTAs present | Full text captured via browser snapshot (native app, push, $99 tier, trial copy). |
| Signup `/signup` | **200** — Form, condo/HOA/apartment, **Essentials $199** / **Professional $349**, subdomain, terms | Matches code; **does not** match marketing card prices. |
| Login `/auth/login` | **200** | Works on www. |
| Login `/login` | **404** | Matches code gap vs welcome email URL. |
| Legal `/legal/terms`, `/legal/privacy` | **200** | Both show **DRAFT / placeholder** banners — not launch-final. |
| Checkout `/signup/checkout` (no query) | Renders **“Missing signup request ID.”** | **No** “Return to signup” link ([`checkout/page.tsx`](../../apps/web/src/app/(public)/signup/checkout/page.tsx)). |
| Checkout return `/signup/checkout/return` (no `session_id`) | **“Invalid return URL”** | **No** recovery link ([`checkout/return/page.tsx`](../../apps/web/src/app/(public)/signup/checkout/return/page.tsx)); “not completed” state **does** include Return to signup. |
| Email verify → Stripe → webhook → provisioning | **Not executed** | Would require real email + payment or staging. |
| Post-pay login | **Risk:** email points to **`/login`** | **404** on www (see blocker 1). |
| `/dashboard` on **www** | **404** | **Expected** for reserved apex host: middleware treats **`www` as reserved** and returns **not found** for tenant-resolved protected routes ([`middleware.ts`](../../apps/web/src/middleware.ts) + [`subdomain-router.ts`](../../packages/shared/src/middleware/subdomain-router.ts)). Users are expected on **community subdomains** or `communityId` query context — not clearly explained on marketing. |
| `/select-community` on www | **307 → `/auth/login?returnTo=...`** | Correct unauthenticated behavior. |
| `/mobile` on www | **404** | Same reserved-subdomain + protected-path behavior as dashboard when host is **www** (host subdomain `www` is reserved → `notFoundResponse`). |
| Tenant subdomain (e.g. `sunset-condos.getpropertypro.com`) | **`DEPLOYMENT_NOT_FOUND`** (Vercel) | Cannot validate authenticated UI on a tenant host from this environment; may be DNS/project configuration outside www. |

---

## 3. Marketing accuracy (claims vs implementation)

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Florida compliance / documents / notices / penalties | **Plausible** (product has compliance engine per repo) | Not re-tested end-to-end in prod. |
| **Compliance Basic $99/mo** | **Inaccurate vs signup** | Pricing section; signup starts at **$199** Essentials. |
| **14-day trial, no card to start** | **Conflicts with signup** | Pricing footer vs signup checkout-after-verify. |
| **Native mobile application** | **Overstated** | Marketing copy; repo documents web `/mobile/` not app stores. |
| **Push notifications** | **Unverified** | Requires push infra; not validated. |
| **Property Manager** tier / Contact Sales | **Partial** | `/signup?type=pm` exists in marketing; not traced in browser here. |
| Owner portal for **new payer** | **Role mismatch** | Provisioning assigns **`pm_admin`**, not owner — owner experience is **invitation/access-request** driven ([`provisioning-service.ts`](../../apps/web/src/lib/services/provisioning-service.ts)). |

---

## 4. Feature matrix (marketed vs technical)

| Theme | Expected surface (from plan) | Prod www result | Code / notes |
| --- | --- | --- | --- |
| Document management | `/documents` | **404** on www (reserved host) | Route exists in app for proper tenant context. |
| Meetings / notices | `.../meetings`, public notices | Not exercised | Requires tenant host + auth. |
| Owner portal | `/dashboard`, etc. | **404** on www without tenant | Use community subdomain or `communityId`. |
| “Mobile app” | `/mobile/*` | **404** on www | Web mobile routes; not native store apps. |
| Compliance | `.../compliance` | Not exercised | Excluded for apartments via `getFeaturesForCommunity`. |
| PM tools | `/pm/...` | Not exercised | `pm` is **reserved** subdomain — same class of host issues as `www` for some routes. |
| Violations / e-sign / finance | gated routes | Not exercised | `getEffectiveFeaturesForPage` + plan matrix ([`plan-guard.ts`](../../apps/web/src/lib/middleware/plan-guard.ts)). |

**Phase C conclusion:** Without a **working tenant hostname** and **session**, marketed features could not be smoke-tested on production from this pass. Recommend **staging + test Stripe + demo tenant** for the matrix.

---

## 5. Bugs and gaps (severity)

| ID | Severity | Finding | Location / repro |
| --- | --- | --- | --- |
| B1 | **P0** | Post-provisioning **login URL** uses **`/login`** (404); should be **`/auth/login`**. | [`provisioning-service.ts`](../../apps/web/src/lib/services/provisioning-service.ts) `stepEmailSent`; verify `curl -I https://www.getpropertypro.com/login` → 404. |
| B2 | **P0** | **`signupRequestId`** only set from **successful API response** (`setSignupRequestId` after POST). On **email delivery failure**, retries can send a **new** server UUID → subdomain exclusion bug documented in [`2026-03-28-signup-flow-fixes.md`](../superpowers/plans/2026-03-28-signup-flow-fixes.md). | [`signup-form.tsx`](../../apps/web/src/components/signup/signup-form.tsx) |
| B3 | **P1** | Checkout **error** UI has **no** link back to signup (missing `signupRequestId` or session errors). | [`checkout/page.tsx`](../../apps/web/src/app/(public)/signup/checkout/page.tsx); [`checkout/return/page.tsx`](../../apps/web/src/app/(public)/signup/checkout/return/page.tsx) partial fix only. |
| B4 | **P1** | **Pricing / trial / checkout** copy inconsistent across marketing and signup. | Marketing vs [`signup/page.tsx`](../../apps/web/src/app/(auth)/signup/page.tsx) |
| B5 | **P1** | **Legal** still **DRAFT** on public URLs. | `/legal/terms`, `/legal/privacy` |
| B6 | **P1** | **Native app + push** claims vs web mobile — regulatory/trust risk. | [`features-section.tsx`](../../apps/web/src/components/marketing/features-section.tsx) |
| B7 | **P1** | **Stripe IDs** may not attach to **self-serve** communities; webhooks key off `stripe_subscription_id`. | [`provisioning-service.ts`](../../apps/web/src/lib/services/provisioning-service.ts); [`stripe/route.ts`](../../apps/web/src/app/api/v1/webhooks/stripe/route.ts) — **needs staging proof**. |
| B8 | **P2** | **`www` + `/dashboard` = 404** is **by design** but **confusing** for users landing from marketing; document “open your community URL” or redirect with explanation. | [`middleware.ts`](../../apps/web/src/middleware.ts), [`reserved-subdomains.ts`](../../packages/shared/src/middleware/reserved-subdomains.ts) |

---

## 6. Recommended follow-ups

1. **Fix B1** — Change welcome email `loginUrl` to `/auth/login` (or add a **Next.js redirect** from `/login` → `/auth/login` on apex and subdomains).
2. **Fix B2** — Generate **`signupRequestId` client-side on mount** (UUID) and always POST it, per internal fix plan.
3. **Fix B3** — Add **Return to signup** (and support contact) on all checkout error branches.
4. **Align marketing** — Either update pricing tiers to match **`SIGNUP_PLAN_OPTIONS`** or change signup UI to match marketing; reconcile **trial / credit card** language with Stripe configuration.
5. **Honest mobile story** — Replace “native mobile application” with **mobile-friendly web / PWA** (or ship native) and adjust push claims.
6. **Legal** — Remove DRAFT banners before launch or gate marketing CTAs until counsel sign-off.
7. **Staging E2E** — Full path: signup → verify → Stripe test card → webhook → provisioning → login on **tenant host** → onboarding wizard → billing portal; assert **`communities` Stripe columns** populated.
8. **Ops** — Confirm Vercel/DNS for **community subdomains** (production returned **DEPLOYMENT_NOT_FOUND** for tested patterns) so customers receive a working hostname.

---

## 7. Verification commands / references (for QA)

```bash
curl -sI "https://www.getpropertypro.com/login" | head -3
curl -sI "https://www.getpropertypro.com/auth/login" | head -3
curl -sI "https://www.getpropertypro.com/dashboard" | head -3
curl -sI "https://www.getpropertypro.com/signup/checkout" | head -3
```

---

*This audit followed the agreed plan: production-safe browsing, no destructive signup, code cross-check for provisioning, signup, checkout, Stripe, and middleware.*
