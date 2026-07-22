# Wave 2 — Aha, Slim Nav & Public Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Founding `root_manager` on Essentials completes readiness movement + live **host** public URL in one session — slim default nav, compliance-oriented dashboard aha, one-click transparency, canonical host public routes.

**Architecture:** Slim nav is a presentation layer on top of existing `getVisibleItemsWithPlanGate` — no change to role × type × plan intersection. Founding aha reuses compliance checklist + transparency PATCH API (ack on first enable). Public wedge deprecates path `(public)/[subdomain]` in favor of middleware host rewrites to `/public-site` and `/public-transparency`.

**Tech Stack:** Next.js 15 App Router, Vitest, `@propertypro/shared`, `@propertypro/ui` NavRail

**Spec:** [docs/superpowers/specs/2026-07-10-public-ga-shippable-prd-design.md](../specs/2026-07-10-public-ga-shippable-prd-design.md) §2, §5, §7 Wave 2

**Depends on:** Wave 1a + 1b (PR #764)

**Out of scope:** Wave 3 craft pass, `transparencyEnabled` schema default change, PM portfolio GA

---

## Locked decisions

| Decision | Choice |
|----------|--------|
| Transparency aha | **One-click enable** with inline ack — DB stays `transparency_enabled = false` at provision |
| Slim nav audience | `root_manager` × `essentials` only; Professional+ keeps full sidebar |
| Public canonical URL | `https://{slug}.getpropertypro.com/` and `/transparency` on host |
| Path `(public)/[subdomain]` | 308 redirect to host canonical (GA deprecation) |
| Disabled transparency | Intentional empty state — never generic 500 |

---

## Slice B1 — Slim Essentials nav

### Nav tier matrix (`navTier` on `NavItemConfig`)

| Tier | Item IDs |
|------|----------|
| `default` | dashboard, documents, meetings, announcements, compliance, residents, units, website |
| `more` | board, operations, leases, packages, visitors, payments, violations-report, contracts, esign, violations-inbox, arc-requests, move-in-out, audit-trail |

Plan-gated items in `more` stay visible with Pro pill (not hidden).

### Files

- `apps/web/src/components/layout/nav-config.ts` — `navTier`, `shouldUseSlimNav`, `buildSlimNavSections`
- `apps/web/src/components/layout/app-sidebar.tsx` — branch on slim nav
- `apps/web/__tests__/layout/nav-config-slim.test.ts` — matrix snapshots

### Verify

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/layout/nav-config-slim.test.ts
```

---

## Slice B2 — Founding aha + one-click transparency

### Target flow (PRD §2.2)

1. Land on compliance-oriented dashboard (readiness % prominent)
2. Action 1: Link/upload one required record → readiness updates
3. Action 2: One-click transparency (inline ack) → success opens **host** URL
4. Remaining checklist → "Strengthen your community" (optional)

### Files

- `apps/web/src/components/onboarding/founding-aha-panel.tsx` — new
- `apps/web/src/app/(authenticated)/dashboard/page.tsx` — reorder for `root_manager` × essentials
- `apps/web/src/components/onboarding/onboarding-checklist.tsx` — `variant="secondary"` title
- `apps/web/__tests__/onboarding/founding-aha-panel.test.tsx` — unit tests

### Verify

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/onboarding/founding-aha-panel.test.tsx
```

---

## Slice B3 — Public host reliability

### Middleware

- Host `/transparency` → rewrite `/public-transparency` (mirror `/` → `/public-site`)
- Path `/{slug}/*` on apex → 308 to `https://{slug}.{rootDomain}/*`

### Files

- `apps/web/src/app/public-transparency/page.tsx` — host renderer
- `apps/web/src/middleware.ts` — transparency rewrite + path deprecation
- `apps/web/src/lib/tenant/redirect-canonical-host.ts` — shared redirect helper
- `apps/web/src/app/(public)/[subdomain]/**` — redirect to host
- `apps/web/src/components/transparency/transparency-toggle.tsx` — host preview URLs
- `apps/web/__tests__/middleware-host-transparency.test.ts` — rewrite unit tests

### Verify

```bash
pnpm --filter @propertypro/web exec vitest run __tests__/middleware-host-transparency.test.ts
```

---

## Slice B4 — Verification gate

```bash
pnpm --filter @propertypro/web typecheck
pnpm test
```

**Manual staging checklist:**

- [ ] `root_manager` Essentials: slim nav matches spec
- [ ] Upload doc → readiness % moves on dashboard
- [ ] One-click transparency → host URL opens
- [ ] Path `/[subdomain]/transparency` redirects to host
- [ ] Disabled transparency shows intentional empty state

Update PR #764 body: Wave 2 complete; Wave 3 craft pass TODO.
