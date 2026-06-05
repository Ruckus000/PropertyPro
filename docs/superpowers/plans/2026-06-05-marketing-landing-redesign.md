# Marketing Landing Page Redesign ("Florida Modern", PM-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the public marketing homepage (`apps/web/src/app/(marketing)`) as the warm, property-manager-first "Florida Modern" design, showing the product, adding social proof / how-it-works / FAQ, and keeping the Florida-statute compliance wedge — without touching the authenticated app's global design tokens.

**Architecture:** A marketing-scoped CSS theme (`marketing-theme.css`, all selectors under `.marketing-theme`) plus the Fraunces display font loaded only on marketing routes provide the warm visual layer. The page is composed of small, single-responsibility server components under `components/marketing/`, with two client/logic units: a pure `compliance-obligation` rules module and a `compliance-checker` client component. Existing presentational components are rewritten (copy + look change wholesale); new sections are added. Tests use `renderToStaticMarkup` (matching the existing `__tests__/marketing/landing-page.test.tsx`) plus RTL for the interactive checker and Vitest unit tests for the rules module.

**Tech Stack:** Next.js 15 App Router, React 19 (server components by default), TypeScript, Tailwind + a scoped plain-CSS theme file, `next/font/google` (Fraunces), Vitest + React Testing Library.

---

## Design tokens (warm palette — reference for all tasks)

Defined once in `marketing-theme.css` (Task 1). Components reference the `mk-*` classes, never raw hex.

| Token | Value | Use |
|---|---|---|
| `--mk-cream` | `#fdf6ee` | page background |
| `--mk-cream-2` | `#fbeee1` | alt band gradient end |
| `--mk-card` | `#fffdfb` | cards |
| `--mk-line` | `#efe2d4` | borders |
| `--mk-ink` | `#241712` | primary text |
| `--mk-ink-soft` | `#6b574c` | secondary text (verify ≥4.5:1 on cream — Task 18) |
| `--mk-coral` | `#c2533a` | primary action bg |
| `--mk-coral-d` | `#a8412c` | primary action hover / coral text on cream |
| `--mk-teal` | `#2f8f83` | positive/success |
| `--mk-gold` | `#e3a93c` | highlight/urgency |

Display font: Fraunces (`--font-fraunces`). Body/UI font: Inter (already global `--font-sans`).

---

## File structure

**Create:**
- `apps/web/src/app/(marketing)/marketing-theme.css` — scoped warm theme (tokens + `mk-*` classes)
- `apps/web/src/lib/marketing/compliance-obligation.ts` — pure obligation rules (testable)
- `apps/web/src/components/marketing/marketing-nav.tsx` — sticky nav w/ in-page anchors
- `apps/web/src/components/marketing/portfolio-card.tsx` — hero/features product UI (multi-association portfolio)
- `apps/web/src/components/marketing/compliance-checker.tsx` — `'use client'` interactive checker
- `apps/web/src/components/marketing/logo-proof-section.tsx`
- `apps/web/src/components/marketing/how-it-works-section.tsx`
- `apps/web/src/components/marketing/testimonial-section.tsx`
- `apps/web/src/components/marketing/faq-section.tsx`
- `apps/web/src/components/marketing/final-cta-section.tsx`
- `apps/web/__tests__/lib/marketing/compliance-obligation.test.ts`
- `apps/web/__tests__/components/marketing/compliance-checker.test.tsx`

**Modify (rewrite):**
- `apps/web/src/app/(marketing)/layout.tsx` — load Fraunces, import theme CSS, wrap children in `.marketing-theme`
- `apps/web/src/app/(marketing)/page.tsx` — compose all sections; use `MarketingNav`
- `apps/web/src/components/marketing/hero-section.tsx`
- `apps/web/src/components/marketing/features-section.tsx`
- `apps/web/src/components/marketing/compliance-urgency-section.tsx` (→ relief framing + checker)
- `apps/web/src/components/marketing/pricing-section.tsx`
- `apps/web/src/components/marketing/footer.tsx`
- `apps/web/__tests__/marketing/landing-page.test.tsx` — evolve per-section describe blocks to new copy/anchors

**Reference (do not change):** `apps/web/src/app/layout.tsx` (font pattern), `.claude/rules/design.md`, `.claude/rules/florida-compliance.md`.

**Conventions:** Marketing sections are server components (plain exported functions, no `'use client'`) EXCEPT `compliance-checker.tsx`. Keep inline SVGs `aria-hidden="true"`. Real hrefs in this codebase: signup `/signup`, login `/auth/login`, `/legal/terms`, `/legal/privacy`, `/transparency`, `mailto:support@getpropertypro.com`.

**Commands:**
- Single test file: `pnpm --filter @propertypro/web exec vitest run __tests__/<path>`
- All marketing tests: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing __tests__/components/marketing __tests__/lib/marketing`
- Typecheck: `pnpm --filter @propertypro/web typecheck`
- Build (run once at the end — client-import + CSS issues are build-only): `pnpm --filter @propertypro/web build`

---

## Task 1: Marketing theme CSS + Fraunces font + scoped layout wrapper

**Files:**
- Create: `apps/web/src/app/(marketing)/marketing-theme.css`
- Modify: `apps/web/src/app/(marketing)/layout.tsx`

This is foundation/config — verified by typecheck + the page rendering in preview, not a unit test.

- [ ] **Step 1: Create the scoped theme CSS**

Create `apps/web/src/app/(marketing)/marketing-theme.css`:

```css
/* Warm "Florida Modern" theme — scoped to the marketing route group only.
   Does NOT change global app tokens. All selectors live under .marketing-theme. */

.marketing-theme {
  --mk-cream:#fdf6ee; --mk-cream-2:#fbeee1; --mk-card:#fffdfb; --mk-line:#efe2d4;
  --mk-ink:#241712; --mk-ink-soft:#6b574c;
  --mk-coral:#c2533a; --mk-coral-d:#a8412c; --mk-teal:#2f8f83; --mk-gold:#e3a93c;
  --mk-shadow:0 18px 40px -20px rgba(80,40,20,.35);
  --mk-shadow-sm:0 8px 24px -12px rgba(80,40,20,.28);
  --mk-maxw:1680px; --mk-gutter:56px;

  background:var(--mk-cream); color:var(--mk-ink);
  font-family:var(--font-sans),Inter,system-ui,sans-serif; line-height:1.55;
}
html:has(.marketing-theme){scroll-behavior:smooth}

/* layout */
.marketing-theme .mk-wrap{max-width:var(--mk-maxw);margin:0 auto;padding:0 var(--mk-gutter);width:100%}
.marketing-theme .mk-band{padding:64px 0;position:relative}
.marketing-theme .mk-band-alt{background:linear-gradient(180deg,var(--mk-cream),var(--mk-cream-2))}
.marketing-theme section[id]{scroll-margin-top:80px}
.marketing-theme .mk-sec-head{max-width:40em}
.marketing-theme .mk-sec-head h2{font-size:46px;margin:12px 0}
.marketing-theme .mk-sec-head p{font-size:18px}
.marketing-theme .mk-center{margin-left:auto;margin-right:auto;text-align:center}

/* type */
.marketing-theme .mk-display{font-family:var(--font-fraunces),Georgia,serif;font-weight:600;letter-spacing:-.01em;line-height:1.05}
.marketing-theme .mk-eyebrow{font-weight:700;font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mk-coral-d)}
.marketing-theme .mk-muted{color:var(--mk-ink-soft)}

/* buttons */
.marketing-theme .mk-pill{display:inline-flex;align-items:center;gap:8px;border-radius:999px;font-weight:600;font-size:15px;padding:13px 22px;transition:.18s;cursor:pointer;border:none;text-decoration:none}
.marketing-theme .mk-pill-primary{background:var(--mk-coral);color:#fff;box-shadow:var(--mk-shadow-sm)}
.marketing-theme .mk-pill-primary:hover{background:var(--mk-coral-d);transform:translateY(-1px)}
.marketing-theme .mk-pill-ghost{background:#fff;color:var(--mk-ink);border:1px solid var(--mk-line)}
.marketing-theme .mk-pill-ghost:hover{border-color:var(--mk-coral);color:var(--mk-coral-d)}

/* cards */
.marketing-theme .mk-card{background:var(--mk-card);border:1px solid var(--mk-line);border-radius:18px;box-shadow:var(--mk-shadow-sm)}

/* nav */
.marketing-theme.mk-has-nav{padding-top:0}
.marketing-theme .mk-nav{position:sticky;top:0;z-index:50;background:rgba(253,246,238,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--mk-line)}
.marketing-theme .mk-nav-in{display:flex;align-items:center;justify-content:space-between;height:70px}
.marketing-theme .mk-logo{display:flex;align-items:center;gap:10px;font-family:var(--font-fraunces),serif;font-weight:600;font-size:21px;color:var(--mk-ink)}
.marketing-theme .mk-logo-dot{width:30px;height:30px;border-radius:9px;background:linear-gradient(140deg,var(--mk-coral),var(--mk-gold));display:grid;place-items:center;color:#fff;font-size:16px}
.marketing-theme .mk-nav-links{display:flex;gap:34px;font-weight:500;font-size:15px;color:var(--mk-ink-soft)}
.marketing-theme .mk-nav-links a{position:relative;padding:4px 0;text-decoration:none;color:inherit}
.marketing-theme .mk-nav-links a:hover{color:var(--mk-ink)}
.marketing-theme .mk-nav-right{display:flex;align-items:center;gap:18px;font-weight:600;font-size:15px}

/* hero */
.marketing-theme .mk-hero{padding:62px 0 40px;overflow:hidden}
.marketing-theme .mk-hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center}
.marketing-theme .mk-badge{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--mk-line);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;color:var(--mk-teal)}
.marketing-theme .mk-badge .mk-pulse{width:8px;height:8px;border-radius:50%;background:var(--mk-teal)}
.marketing-theme .mk-h1{font-size:70px;margin:24px 0 20px}
.marketing-theme .mk-h1 .mk-swash{font-style:italic;color:var(--mk-coral-d)}
.marketing-theme .mk-lede{font-size:20px;max-width:32em}
.marketing-theme .mk-hero-cta{display:flex;gap:14px;margin:30px 0 14px;flex-wrap:wrap}
.marketing-theme .mk-hero-sub{font-size:14px;color:var(--mk-ink-soft);margin-bottom:14px}
.marketing-theme .mk-trust{display:flex;gap:24px;font-size:14px;color:var(--mk-ink-soft);font-weight:500;flex-wrap:wrap}
.marketing-theme .mk-trust span{display:flex;align-items:center;gap:7px}
.marketing-theme .mk-check{color:var(--mk-teal);font-weight:800}
.marketing-theme .mk-sun{position:absolute;top:-160px;right:-160px;width:700px;height:700px;border-radius:50%;background:radial-gradient(circle at 50% 50%,rgba(227,169,60,.20),rgba(194,83,58,.05) 55%,transparent 70%);pointer-events:none}

/* device / portfolio + product panels */
.marketing-theme .mk-device{background:var(--mk-card);border:1px solid var(--mk-line);border-radius:22px;box-shadow:var(--mk-shadow);overflow:hidden;position:relative}
.marketing-theme .mk-device-top{height:44px;background:#fff;border-bottom:1px solid var(--mk-line);display:flex;align-items:center;gap:7px;padding:0 18px}
.marketing-theme .mk-device-top i{width:10px;height:10px;border-radius:50%;display:block}
.marketing-theme .mk-device-body{padding:22px}
.marketing-theme .mk-portfolio-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.marketing-theme .mk-portfolio-score{font-family:var(--font-fraunces),serif;font-size:22px;font-weight:600;color:var(--mk-teal)}
.marketing-theme .mk-row{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--mk-line);border-radius:11px;padding:12px 14px;margin-bottom:9px}
.marketing-theme .mk-row .mk-ic{width:30px;height:30px;border-radius:8px;background:#fbeee1;display:grid;place-items:center;font-size:14px;flex:0 0 auto}
.marketing-theme .mk-row .mk-nm{font-size:14px;font-weight:600;flex:1}
.marketing-theme .mk-mini-ring{width:34px;height:34px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;font-size:11px;font-weight:700;color:var(--mk-ink)}
.marketing-theme .mk-float{position:absolute;right:-14px;bottom:-16px;background:#fff;border:1px solid var(--mk-line);border-radius:14px;box-shadow:var(--mk-shadow-sm);padding:13px 17px;display:flex;align-items:center;gap:11px}
.marketing-theme .mk-float .mk-av{width:36px;height:36px;border-radius:50%;background:linear-gradient(140deg,var(--mk-teal),var(--mk-gold))}
.marketing-theme .mk-float .mk-t{font-size:12px;line-height:1.3}

/* relief / checker */
.marketing-theme .mk-relief{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-top:38px}
.marketing-theme .mk-relief-card{padding:34px}
.marketing-theme .mk-law{display:flex;gap:16px;padding:18px 0;border-bottom:1px solid var(--mk-line)}
.marketing-theme .mk-law:last-child{border-bottom:none}
.marketing-theme .mk-law .mk-n{width:36px;height:36px;border-radius:10px;background:#fbeee1;color:var(--mk-coral-d);display:grid;place-items:center;font-weight:800;flex:0 0 auto;font-family:var(--font-fraunces),serif}
.marketing-theme .mk-law h4{font-size:17px;font-weight:700}
.marketing-theme .mk-checker{background:linear-gradient(140deg,var(--mk-ink),#3a2419);color:#fff;border-radius:20px;padding:34px}
.marketing-theme .mk-checker .mk-eyebrow{color:var(--mk-gold)}
.marketing-theme .mk-checker h3{color:#fff;font-size:27px;margin:10px 0 16px}
.marketing-theme .mk-checker label{font-size:13px;font-weight:600;display:block;margin-bottom:6px}
.marketing-theme .mk-checker .mk-field{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap}
.marketing-theme .mk-checker select,.marketing-theme .mk-checker input{border-radius:12px;border:1px solid #5a4034;background:#3a2419;color:#fff;padding:13px 15px;font-size:15px;font-family:var(--font-sans),sans-serif}
.marketing-theme .mk-checker input{flex:1;min-width:120px}
.marketing-theme .mk-checker .mk-res{margin-top:18px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:13px;padding:17px;font-size:14px}
.marketing-theme .mk-checker .mk-res b{color:var(--mk-gold)}
.marketing-theme .mk-pen{display:inline-flex;align-items:baseline;gap:8px;margin-top:8px}
.marketing-theme .mk-pen .mk-big{font-family:var(--font-fraunces),serif;font-size:36px;color:var(--mk-gold);font-weight:600}

/* steps */
.marketing-theme .mk-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:38px}
.marketing-theme .mk-step{padding:30px}
.marketing-theme .mk-step .mk-num{font-family:var(--font-fraunces),serif;font-size:15px;font-weight:700;color:#fff;background:var(--mk-coral);width:36px;height:36px;border-radius:10px;display:grid;place-items:center}
.marketing-theme .mk-step h3{font-size:21px;margin:18px 0 8px}

/* features */
.marketing-theme .mk-feat-hero{display:grid;grid-template-columns:1fr 1fr;gap:0;overflow:hidden;margin-top:38px}
.marketing-theme .mk-feat-hero .mk-copy{padding:48px}
.marketing-theme .mk-feat-hero .mk-copy .mk-eyebrow{color:var(--mk-teal)}
.marketing-theme .mk-feat-hero h3{font-size:32px;margin:12px 0}
.marketing-theme .mk-feat-hero .mk-art{background:linear-gradient(140deg,#fef6ee,#fbeee1);padding:44px;display:grid;place-items:center}
.marketing-theme .mk-feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:26px}
.marketing-theme .mk-fcard{padding:28px}
.marketing-theme .mk-fcard .mk-fic{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-size:21px;margin-bottom:16px;background:#fbeee1}
.marketing-theme .mk-fcard h4{font-family:var(--font-fraunces),serif;font-size:20px;font-weight:600;margin-bottom:6px}
.marketing-theme .mk-fcard p{font-size:14.5px}

/* testimonial */
.marketing-theme .mk-quote{padding:54px;text-align:center;max-width:960px;margin:0 auto}
.marketing-theme .mk-quote .mk-q{font-family:var(--font-fraunces),serif;font-size:30px;line-height:1.35;font-weight:500}
.marketing-theme .mk-quote .mk-hl{background:linear-gradient(180deg,transparent 62%,#fce3b6 62%)}
.marketing-theme .mk-quote .mk-who{margin-top:26px;display:flex;align-items:center;justify-content:center;gap:13px}
.marketing-theme .mk-quote .mk-who .mk-av{width:48px;height:48px;border-radius:50%;background:linear-gradient(140deg,var(--mk-coral),var(--mk-gold))}

/* pricing */
.marketing-theme .mk-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:26px;margin-top:40px;align-items:start;max-width:1180px;margin-left:auto;margin-right:auto}
.marketing-theme .mk-price{padding:34px}
.marketing-theme .mk-price.mk-feat{border:2px solid var(--mk-coral);position:relative}
.marketing-theme .mk-price .mk-ribbon{position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:var(--mk-coral);color:#fff;font-size:12px;font-weight:700;padding:5px 14px;border-radius:999px}
.marketing-theme .mk-price .mk-amt{font-family:var(--font-fraunces),serif;font-size:42px;font-weight:600;margin:10px 0 2px}
.marketing-theme .mk-price .mk-amt span{font-size:15px;font-family:var(--font-sans),sans-serif;color:var(--mk-ink-soft);font-weight:500}
.marketing-theme .mk-price ul{list-style:none;margin:22px 0;padding:0;display:flex;flex-direction:column;gap:12px}
.marketing-theme .mk-price li{font-size:14px;display:flex;gap:9px}
.marketing-theme .mk-price li::before{content:"✓";color:var(--mk-teal);font-weight:800}
.marketing-theme .mk-price .mk-pill{width:100%;justify-content:center;margin-top:6px}

/* faq */
.marketing-theme .mk-faq{max-width:860px;margin:38px auto 0}
.marketing-theme .mk-qa{padding:24px 26px;margin-bottom:13px}
.marketing-theme .mk-qa h4{font-size:17px;font-weight:700;display:flex;justify-content:space-between}
.marketing-theme .mk-qa p{font-size:15px;margin-top:9px}

/* final cta */
.marketing-theme .mk-final{background:linear-gradient(140deg,var(--mk-coral),#d4663f);color:#fff;border-radius:28px;padding:64px;text-align:center;position:relative;overflow:hidden}
.marketing-theme .mk-final h2{color:#fff;font-size:48px}
.marketing-theme .mk-final p{font-size:18px;opacity:.92;margin:14px auto 26px;max-width:32em}
.marketing-theme .mk-final .mk-pill-primary{background:#fff;color:var(--mk-coral-d)}

/* footer */
.marketing-theme .mk-footer{background:var(--mk-ink);color:#d9c8bc;padding:60px 0 34px;margin-top:64px}
.marketing-theme .mk-foot-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;max-width:1300px}
.marketing-theme .mk-footer h5{color:#fff;font-size:13px;letter-spacing:.04em;margin-bottom:14px}
.marketing-theme .mk-footer a{display:block;color:#bda99c;font-size:14px;margin-bottom:9px;text-decoration:none}
.marketing-theme .mk-footer a:hover{color:#fff}
.marketing-theme .mk-foot-bot{border-top:1px solid #3a2a20;margin-top:40px;padding-top:22px;font-size:13px;color:#9c8576;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px}

/* motion */
@media(prefers-reduced-motion:no-preference){
  .marketing-theme .mk-pulse{animation:mk-pulse 2s infinite}
  .marketing-theme .mk-nav-links a::after{content:"";position:absolute;left:0;right:100%;bottom:-2px;height:2px;background:var(--mk-coral);transition:right .2s}
  .marketing-theme .mk-nav-links a:hover::after{right:0}
}
@keyframes mk-pulse{0%{box-shadow:0 0 0 0 rgba(47,143,131,.5)}70%{box-shadow:0 0 0 9px rgba(47,143,131,0)}100%{box-shadow:0 0 0 0 rgba(47,143,131,0)}}

/* responsive */
@media(max-width:1100px){.marketing-theme{--mk-gutter:32px}}
@media(max-width:880px){
  .marketing-theme .mk-hero-grid,.marketing-theme .mk-relief,.marketing-theme .mk-feat-hero,.marketing-theme .mk-foot-grid{grid-template-columns:1fr}
  .marketing-theme .mk-steps,.marketing-theme .mk-feat-grid,.marketing-theme .mk-price-grid{grid-template-columns:1fr}
  .marketing-theme .mk-h1{font-size:46px}
  .marketing-theme .mk-nav-links{display:none}
}
```

- [ ] **Step 2: Wire Fraunces + theme into the marketing layout**

Replace `apps/web/src/app/(marketing)/layout.tsx` entirely:

```tsx
import type { Metadata } from 'next';
import { Fraunces } from 'next/font/google';
import './marketing-theme.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-fraunces',
});

export const metadata: Metadata = {
  title: 'PropertyPro Florida — Florida Condo & HOA Compliance for Property Managers',
  description:
    'Run a whole portfolio of Florida condo & HOA associations compliant by default. Meet §718 and §720 website requirements before the January 2026 deadline — document management, meeting notices, owner portals, and one centralized compliance view.',
  keywords: [
    'Florida property management software',
    'Florida condo compliance',
    'Florida HOA website requirement',
    'Florida Statute 718',
    'Florida Statute 720',
    'CAM software Florida',
    'association management portfolio',
    'owner portal',
    'meeting notices',
    'document management',
  ],
  openGraph: {
    title: 'PropertyPro Florida — Compliance for Florida property managers',
    description:
      'Run a whole portfolio of Florida associations compliant by default. §718 & §720 document posting, notices, owner portals, and centralized compliance.',
    type: 'website',
    locale: 'en_US',
    siteName: 'PropertyPro Florida',
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fraunces.variable} marketing-theme`}>{children}</div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @propertypro/web typecheck`
Expected: PASS (no type errors from the layout change).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(marketing\)/marketing-theme.css apps/web/src/app/\(marketing\)/layout.tsx
git commit -m "feat(marketing): add scoped Florida Modern theme + Fraunces font"
```

---

## Task 2: Compliance obligation rules module (pure logic, TDD)

**Files:**
- Create: `apps/web/src/lib/marketing/compliance-obligation.ts`
- Test: `apps/web/__tests__/lib/marketing/compliance-obligation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/lib/marketing/compliance-obligation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getComplianceObligation } from '../../../src/lib/marketing/compliance-obligation';

describe('getComplianceObligation', () => {
  it('condo 150+ units is required now', () => {
    const r = getComplianceObligation({ type: 'condo', count: 150 });
    expect(r.status).toBe('required-now');
    expect(r.required).toBe(true);
    expect(r.deadline).toBeNull();
  });

  it('condo 25–149 units is required by Jan 1, 2026', () => {
    const r = getComplianceObligation({ type: 'condo', count: 84 });
    expect(r.status).toBe('required-2026');
    expect(r.required).toBe(true);
    expect(r.deadline).toBe('January 1, 2026');
  });

  it('condo boundary: 25 is required-2026, 24 is exempt', () => {
    expect(getComplianceObligation({ type: 'condo', count: 25 }).status).toBe('required-2026');
    expect(getComplianceObligation({ type: 'condo', count: 24 }).status).toBe('exempt');
  });

  it('condo under 25 is exempt', () => {
    const r = getComplianceObligation({ type: 'condo', count: 10 });
    expect(r.status).toBe('exempt');
    expect(r.required).toBe(false);
  });

  it('hoa 100+ parcels is required now; 99 is exempt', () => {
    expect(getComplianceObligation({ type: 'hoa', count: 100 }).status).toBe('required-now');
    expect(getComplianceObligation({ type: 'hoa', count: 99 }).status).toBe('exempt');
  });

  it('every result carries a headline and detail string', () => {
    const r = getComplianceObligation({ type: 'condo', count: 84 });
    expect(r.headline.length).toBeGreaterThan(0);
    expect(r.detail.length).toBeGreaterThan(0);
  });

  it('throws on a non-positive or non-integer count', () => {
    expect(() => getComplianceObligation({ type: 'condo', count: 0 })).toThrow();
    expect(() => getComplianceObligation({ type: 'condo', count: -5 })).toThrow();
    expect(() => getComplianceObligation({ type: 'condo', count: 1.5 })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lib/marketing/compliance-obligation.test.ts`
Expected: FAIL — cannot resolve `../../../src/lib/marketing/compliance-obligation`.

- [ ] **Step 3: Implement the rules module**

Create `apps/web/src/lib/marketing/compliance-obligation.ts`:

```ts
/**
 * Marketing-only helper that maps an association's unit/parcel count to its
 * Florida website-compliance obligation. General information for the landing
 * page checker — NOT legal advice (see .claude/rules/florida-compliance.md).
 * Thresholds mirror the facts used elsewhere in the app: condos §718.111(12)(g)
 * (150+ already required, 25–149 by Jan 1 2026, under 25 exempt); HOAs
 * §720.303 (100+ parcels required, under 100 exempt).
 */
export type AssociationType = 'condo' | 'hoa';

export interface ObligationInput {
  type: AssociationType;
  count: number;
}

export type ObligationStatus = 'required-now' | 'required-2026' | 'exempt';

export interface ObligationResult {
  required: boolean;
  status: ObligationStatus;
  headline: string;
  detail: string;
  /** Hard deadline date, or null when already required / exempt. */
  deadline: string | null;
}

const JAN_2026 = 'January 1, 2026';

export function getComplianceObligation({
  type,
  count,
}: ObligationInput): ObligationResult {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('count must be a positive integer');
  }

  if (type === 'condo') {
    if (count >= 150) {
      return {
        required: true,
        status: 'required-now',
        headline: 'Required now',
        detail:
          'Condominium associations of 150+ units are already required to maintain a compliant website with posted official records. Enforcement is active.',
        deadline: null,
      };
    }
    if (count >= 25) {
      return {
        required: true,
        status: 'required-2026',
        headline: 'Required by January 1, 2026',
        detail:
          'Condominium associations of 25–149 units must have a compliant website — document posting, meeting notices, and an owner portal — by January 1, 2026.',
        deadline: JAN_2026,
      };
    }
    return {
      required: false,
      status: 'exempt',
      headline: 'Not yet required',
      detail:
        'Condominium associations under 25 units are currently exempt, though voluntary compliance is recommended for transparency.',
      deadline: null,
    };
  }

  // HOA
  if (count >= 100) {
    return {
      required: true,
      status: 'required-now',
      headline: 'Required now',
      detail:
        'HOAs of 100+ parcels are required to maintain a website for official records and meeting notices, with the same posting requirements as condos.',
      deadline: null,
    };
  }
  return {
    required: false,
    status: 'exempt',
    headline: 'Not yet required',
    detail:
      'HOAs under 100 parcels are currently exempt, though voluntary compliance builds owner trust.',
    deadline: null,
  };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/lib/marketing/compliance-obligation.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/marketing/compliance-obligation.ts apps/web/__tests__/lib/marketing/compliance-obligation.test.ts
git commit -m "feat(marketing): compliance obligation rules for landing checker"
```

---

## Task 3: Compliance checker (client component, TDD with RTL)

**Files:**
- Create: `apps/web/src/components/marketing/compliance-checker.tsx`
- Test: `apps/web/__tests__/components/marketing/compliance-checker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/components/marketing/compliance-checker.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceChecker } from '../../../src/components/marketing/compliance-checker';

describe('ComplianceChecker', () => {
  it('renders the prompt and an initial penalty fact', () => {
    render(<ComplianceChecker />);
    expect(screen.getByText(/Is your association required to comply/i)).toBeTruthy();
    expect(screen.getByText(/\$50/)).toBeTruthy();
  });

  it('computes a condo 84-unit obligation on check', () => {
    render(<ComplianceChecker />);
    fireEvent.change(screen.getByLabelText(/units or parcels/i), {
      target: { value: '84' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    // The Jan 1 2026 date appears in BOTH the headline <b> and the detail text,
    // so use getAllByText (getByText throws on multiple matches).
    expect(screen.getAllByText(/January 1, 2026/).length).toBeGreaterThan(0);
  });

  it('shows a friendly message for empty/invalid input instead of crashing', () => {
    render(<ComplianceChecker />);
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(screen.getByText(/enter a number/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/components/marketing/compliance-checker.test.tsx`
Expected: FAIL — cannot resolve `compliance-checker`.

- [ ] **Step 3: Implement the checker**

Create `apps/web/src/components/marketing/compliance-checker.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import {
  getComplianceObligation,
  type AssociationType,
  type ObligationResult,
} from '@/lib/marketing/compliance-obligation';

/**
 * Interactive "is your association required to comply?" checker for the
 * landing page. General information only — not legal advice.
 */
export function ComplianceChecker() {
  const [type, setType] = useState<AssociationType>('condo');
  const [count, setCount] = useState('');
  const [result, setResult] = useState<ObligationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onCheck() {
    const n = Number.parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1) {
      setResult(null);
      setError('Please enter a number of units or parcels.');
      return;
    }
    setError(null);
    setResult(getComplianceObligation({ type, count: n }));
  }

  return (
    <div className="mk-checker">
      <span className="mk-eyebrow">30-second check</span>
      <h3 className="mk-display">Is your association required to comply?</h3>
      <p style={{ opacity: 0.85, fontSize: 14 }}>
        Enter the unit or parcel count — we&apos;ll tell you the exact obligation
        and deadline.
      </p>

      <div className="mk-field">
        <label htmlFor="mk-assoc-type" className="sr-only">
          Association type
        </label>
        <select
          id="mk-assoc-type"
          value={type}
          onChange={(e) => setType(e.target.value as AssociationType)}
        >
          <option value="condo">Condo</option>
          <option value="hoa">HOA</option>
        </select>

        <label htmlFor="mk-assoc-count" className="sr-only">
          Number of units or parcels
        </label>
        <input
          id="mk-assoc-count"
          inputMode="numeric"
          placeholder="e.g. 84 units"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />

        <button type="button" className="mk-pill mk-pill-primary" onClick={onCheck}>
          Check
        </button>
      </div>

      <div className="mk-res" aria-live="polite">
        {error ? (
          <span>{error}</span>
        ) : result ? (
          <>
            <b>{result.headline}.</b> {result.detail}
          </>
        ) : (
          <>
            Most <b>condos with 25+ units</b> must be fully compliant by{' '}
            <b>January 1, 2026</b>. The penalty for falling behind:
            <span className="mk-pen">
              <span className="mk-big">$50</span>
              <span style={{ opacity: 0.85 }}>per day, per association</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/components/marketing/compliance-checker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/compliance-checker.tsx apps/web/__tests__/components/marketing/compliance-checker.test.tsx
git commit -m "feat(marketing): interactive compliance checker"
```

---

## Task 4: Portfolio card (shared product UI)

**Files:**
- Create: `apps/web/src/components/marketing/portfolio-card.tsx`
- Test: add a `PortfolioCard` describe block to `apps/web/__tests__/marketing/landing-page.test.tsx`

- [ ] **Step 1: Add the failing test (new describe block, top of file)**

In `apps/web/__tests__/marketing/landing-page.test.tsx`, add this import at the top with the others and a new describe block (leave existing blocks for now — they'll be replaced in later tasks):

```tsx
import { PortfolioCard } from '../../src/components/marketing/portfolio-card';

describe('PortfolioCard', () => {
  it('renders an aggregate portfolio score and multiple communities', () => {
    const html = renderToStaticMarkup(<PortfolioCard />);
    expect(html).toContain('Portfolio compliance');
    expect(html).toContain('Sunset Condos');
    expect(html).toContain('Palm Shores');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t PortfolioCard`
Expected: FAIL — cannot resolve `portfolio-card`.

- [ ] **Step 3: Implement the portfolio card**

Create `apps/web/src/components/marketing/portfolio-card.tsx`:

```tsx
import React from 'react';

const COMMUNITIES = [
  { name: 'Sunset Condos', score: 92, ring: '#2f8f83' },
  { name: 'Palm Shores HOA', score: 88, ring: '#2f8f83' },
  { name: 'Bayfront Towers', score: 74, ring: '#e3a93c' },
];

/**
 * Hero/features product UI: a property manager's multi-association portfolio,
 * each community with its own compliance score plus an aggregate. Static demo
 * data — illustrative only.
 */
export function PortfolioCard() {
  return (
    <div className="mk-device">
      <div className="mk-device-top">
        <i style={{ background: '#f6b4a4' }} />
        <i style={{ background: '#f3d488' }} />
        <i style={{ background: '#9fd8cf' }} />
        <span
          style={{
            marginLeft: 10,
            fontSize: 12,
            color: 'var(--mk-ink-soft)',
            fontWeight: 600,
          }}
        >
          app.getpropertypro.com/portfolio
        </span>
      </div>
      <div className="mk-device-body">
        <div className="mk-portfolio-head">
          <div>
            <div style={{ fontSize: 13, color: 'var(--mk-ink-soft)' }}>
              Portfolio compliance
            </div>
            <div className="mk-portfolio-score mk-display">86% on track</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--mk-teal)',
              background: '#e7f4f1',
              padding: '4px 10px',
              borderRadius: 999,
            }}
          >
            12 communities
          </span>
        </div>
        {COMMUNITIES.map((c) => (
          <div className="mk-row" key={c.name}>
            <span className="mk-ic" aria-hidden="true">
              🏢
            </span>
            <span className="mk-nm">{c.name}</span>
            <span
              className="mk-mini-ring"
              style={{
                background: `conic-gradient(${c.ring} 0 ${c.score}%, #ece1d4 ${c.score}% 100%)`,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {c.score}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t PortfolioCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/portfolio-card.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): portfolio product card"
```

---

## Task 5: Marketing nav

**Files:**
- Create: `apps/web/src/components/marketing/marketing-nav.tsx`
- Test: add `MarketingNav` describe block to `landing-page.test.tsx`

- [ ] **Step 1: Add the failing test**

Add to `landing-page.test.tsx` (import + block):

```tsx
import { MarketingNav } from '../../src/components/marketing/marketing-nav';

describe('MarketingNav', () => {
  it('renders in-page anchor links and CTAs', () => {
    const html = renderToStaticMarkup(<MarketingNav />);
    expect(html).toContain('href="#features"');
    expect(html).toContain('href="#compliance"');
    expect(html).toContain('href="#pricing"');
    expect(html).toContain('For managers');
    expect(html).toContain('href="/auth/login"');
    expect(html).toContain('href="/signup"');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t MarketingNav`
Expected: FAIL — cannot resolve `marketing-nav`.

- [ ] **Step 3: Implement the nav**

Create `apps/web/src/components/marketing/marketing-nav.tsx`:

```tsx
import React from 'react';

const NAV_LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#compliance', label: 'Compliance' },
  { href: '#how', label: 'How it works' },
  { href: '#managers', label: 'For managers' },
  { href: '#pricing', label: 'Pricing' },
];

/** Sticky marketing nav with in-page smooth-scroll anchors. */
export function MarketingNav() {
  return (
    <nav className="mk-nav">
      <div className="mk-wrap mk-nav-in">
        <a href="#top" className="mk-logo">
          <span className="mk-logo-dot" aria-hidden="true">
            ◐
          </span>
          PropertyPro
        </a>
        <div className="mk-nav-links">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </div>
        <div className="mk-nav-right">
          <a href="/auth/login">Log in</a>
          <a
            href="/signup"
            className="mk-pill mk-pill-primary"
            style={{ padding: '10px 20px' }}
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t MarketingNav`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/marketing-nav.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): sticky nav with in-page anchors"
```

---

## Task 6: Hero section (rewrite, PM-first)

**Files:**
- Modify: `apps/web/src/components/marketing/hero-section.tsx`
- Test: replace the `HeroSection` describe block in `landing-page.test.tsx`

- [ ] **Step 1: Replace the HeroSection test block**

In `landing-page.test.tsx`, replace the entire existing `describe('HeroSection', …)` block with:

```tsx
  describe('HeroSection', () => {
    it('renders the portfolio-first headline', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('portfolio');
    });

    it('welcomes self-managed boards as a secondary line', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('self-managed board');
    });

    it('renders the primary CTA linking to signup', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('href="/signup"');
    });

    it('renders trust indicators', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('14-day free trial');
      expect(html).toContain('No setup fees');
    });

    it('embeds the portfolio product card', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('Portfolio compliance');
    });

    it('uses the #top anchor', () => {
      const html = renderToStaticMarkup(<HeroSection />);
      expect(html).toContain('id="top"');
    });
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t HeroSection`
Expected: FAIL (old hero has none of this copy / no portfolio card).

- [ ] **Step 3: Rewrite the hero**

Replace `apps/web/src/components/marketing/hero-section.tsx` entirely:

```tsx
import React from 'react';
import { PortfolioCard } from './portfolio-card';

/**
 * Hero — property-manager-first. Leads with the portfolio value prop, shows the
 * portfolio product card, and welcomes self-managed boards as a secondary line.
 */
export function HeroSection() {
  return (
    <section className="mk-hero" id="top">
      <div className="mk-sun" aria-hidden="true" />
      <div className="mk-wrap mk-hero-grid">
        <div>
          <span className="mk-badge">
            <span className="mk-pulse" aria-hidden="true" /> Built for Florida
            condos &amp; HOAs
          </span>
          <h1 className="mk-display mk-h1">
            Run your whole portfolio
            <br />
            compliant by <span className="mk-swash">2026.</span>
          </h1>
          <p className="mk-lede mk-muted">
            Florida law now requires every association you manage to post
            records, notices, and budgets online. PropertyPro keeps your entire
            book of business compliant by default — from one dashboard, across
            every community.
          </p>
          <div className="mk-hero-cta">
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get your portfolio online →
            </a>
            <a href="#how" className="mk-pill mk-pill-ghost">
              ▶ See a 2-min tour
            </a>
          </div>
          <p className="mk-hero-sub">
            Run a single building?{' '}
            <a
              href="#pricing"
              style={{ color: 'var(--mk-coral-d)', fontWeight: 600 }}
            >
              Self-managed boards are covered too →
            </a>
          </p>
          <div className="mk-trust">
            <span>
              <i className="mk-check">✓</i> Onboard a community in minutes
            </span>
            <span>
              <i className="mk-check">✓</i> 14-day free trial
            </span>
            <span>
              <i className="mk-check">✓</i> No setup fees
            </span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <PortfolioCard />
          <div className="mk-float">
            <span className="mk-av" aria-hidden="true" />
            <div className="mk-t">
              <b>12 communities</b>
              <br />
              <span className="mk-muted">compliant this quarter</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t HeroSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/hero-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): PM-first hero with portfolio card"
```

---

## Task 7: Logo proof section

**Files:**
- Create: `apps/web/src/components/marketing/logo-proof-section.tsx`
- Test: add `LogoProofSection` block to `landing-page.test.tsx`

- [ ] **Step 1: Add the failing test**

```tsx
import { LogoProofSection } from '../../src/components/marketing/logo-proof-section';

describe('LogoProofSection', () => {
  it('names management companies (placeholder)', () => {
    const html = renderToStaticMarkup(<LogoProofSection />);
    expect(html).toContain('management companies');
    expect(html).toContain('Gulfstream Management');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t LogoProofSection`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/marketing/logo-proof-section.tsx`:

```tsx
import React from 'react';

// Placeholder management-company names — swap for real customers when available.
const COMPANIES = [
  'Gulfstream Management',
  'Coastal Community Group',
  'Sabal Property Partners',
  'Bayshore CAM Co.',
  'Mangrove Association Mgmt',
];

/** Social-proof strip: management companies that run portfolios on PropertyPro. */
export function LogoProofSection() {
  return (
    <section className="mk-band" style={{ paddingTop: 22, paddingBottom: 6 }}>
      <div className="mk-wrap">
        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: 'var(--mk-ink-soft)',
            marginBottom: 18,
          }}
        >
          Trusted by management companies across Florida
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 30,
            flexWrap: 'wrap',
            alignItems: 'center',
            opacity: 0.72,
            maxWidth: 1040,
            margin: '0 auto',
          }}
        >
          {COMPANIES.map((c) => (
            <div key={c} className="mk-display" style={{ fontSize: 19 }}>
              {c}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t LogoProofSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/logo-proof-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): management-company logo proof strip"
```

---

## Task 8: Compliance / relief section (rewrite, embeds checker)

**Files:**
- Modify: `apps/web/src/components/marketing/compliance-urgency-section.tsx`
- Test: replace the `ComplianceUrgencySection` describe block

The statute facts must be preserved (compliance rule). Because the section now embeds the `'use client'` checker, the test renders the section and asserts the static statute copy + that the checker mounts.

- [ ] **Step 1: Replace the ComplianceUrgencySection test block**

Replace the existing block with:

```tsx
  describe('ComplianceUrgencySection', () => {
    it('keeps the relief framing headline', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('on autopilot');
    });

    it('retains the $50/day and 30-day statute facts', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('$50');
      expect(html).toContain('30 days');
    });

    it('references the §718/§720 framework', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('718');
      expect(html).toContain('720');
    });

    it('embeds the checker prompt', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('Is your association required to comply');
    });

    it('keeps the compliance anchor id', () => {
      const html = renderToStaticMarkup(<ComplianceUrgencySection />);
      expect(html).toContain('id="compliance"');
    });
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t ComplianceUrgencySection`
Expected: FAIL (old copy differs; no checker).

- [ ] **Step 3: Rewrite the section**

Replace `apps/web/src/components/marketing/compliance-urgency-section.tsx` entirely:

```tsx
import React from 'react';
import { ComplianceChecker } from './compliance-checker';

const LAWS = [
  {
    n: '§',
    title: 'Post records within 30 days',
    body: 'Upload once — we timestamp, categorize, and publish to each community’s owner portal automatically.',
  },
  {
    n: '14',
    title: 'Meeting notices, perfectly timed',
    body: '48-hour board and 14-day owner notices scheduled and tracked across every association.',
  },
  {
    n: '✓',
    title: 'Always audit-ready',
    body: 'A complete compliance log per community, exportable the moment the DBPR asks.',
  },
];

/**
 * "The law changed. We handle it." Reframes §718/§720 obligations as autopilot,
 * with the interactive checker. Statute facts ($50/day, 30 days, Jan 1 2026)
 * preserved — general information, not legal advice.
 */
export function ComplianceUrgencySection() {
  return (
    <section className="mk-band" id="compliance">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">The law changed. We handle it.</span>
          <h2 className="mk-display">Florida statutes, finally on autopilot.</h2>
          <p className="mk-muted">
            §718.111(12)(g) and §720.303 spell out exactly what must be online,
            and when. PropertyPro tracks every deadline across your whole
            portfolio and surfaces the one thing to do next — so a $50/day
            penalty never sneaks up on any community you manage.
          </p>
        </div>
        <div className="mk-relief">
          <div className="mk-card mk-relief-card">
            {LAWS.map((l) => (
              <div className="mk-law" key={l.title}>
                <span className="mk-n" aria-hidden="true">
                  {l.n}
                </span>
                <div>
                  <h4>{l.title}</h4>
                  <p className="mk-muted">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
          <ComplianceChecker />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t ComplianceUrgencySection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/compliance-urgency-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): relief-framed compliance section with checker"
```

---

## Task 9: How-it-works section

**Files:**
- Create: `apps/web/src/components/marketing/how-it-works-section.tsx`
- Test: add `HowItWorksSection` block

- [ ] **Step 1: Add the failing test**

```tsx
import { HowItWorksSection } from '../../src/components/marketing/how-it-works-section';

describe('HowItWorksSection', () => {
  it('renders three portfolio-scale steps with the #how anchor', () => {
    const html = renderToStaticMarkup(<HowItWorksSection />);
    expect(html).toContain('id="how"');
    expect(html).toContain('Onboard a community');
    expect(html).toContain('Bulk-load');
    expect(html).toContain('Invite boards');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t HowItWorksSection`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/marketing/how-it-works-section.tsx`:

```tsx
import React from 'react';

const STEPS = [
  {
    n: '1',
    title: 'Onboard a community',
    body: 'Add an association and it gets a branded, compliant website on its own subdomain — instantly.',
  },
  {
    n: '2',
    title: 'Bulk-load documents',
    body: 'Drag in budgets, bylaws, and minutes across communities. We sort them into the statute’s required categories.',
  },
  {
    n: '3',
    title: 'Invite boards & owners',
    body: 'Boards and owners get secure portals and mobile access. Notices and announcements go out automatically.',
  },
];

/** Three portfolio-scale steps. Fills the old dead "See How It Works" CTA. */
export function HowItWorksSection() {
  return (
    <section className="mk-band mk-band-alt" id="how">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">How it works</span>
          <h2 className="mk-display">Compliant in three steps.</h2>
          <p className="mk-muted">
            No IT person, no committee, no consultant — at one building or fifty.
          </p>
        </div>
        <div className="mk-steps">
          {STEPS.map((s) => (
            <div className="mk-card mk-step" key={s.n}>
              <span className="mk-num">{s.n}</span>
              <h3 className="mk-display">{s.title}</h3>
              <p className="mk-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t HowItWorksSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/how-it-works-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): how-it-works section"
```

---

## Task 10: Features section (rewrite — portfolio hero feature + grid)

**Files:**
- Modify: `apps/web/src/components/marketing/features-section.tsx`
- Test: replace the `FeaturesSection` describe block

- [ ] **Step 1: Replace the FeaturesSection test block**

```tsx
  describe('FeaturesSection', () => {
    it('leads with the portfolio compliance hero feature', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Portfolio compliance, one view');
    });

    it('renders the six supporting feature cards', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('Document management');
      expect(html).toContain('Meeting notices');
      expect(html).toContain('Owner portal');
      expect(html).toContain('Mobile access');
      expect(html).toContain('Announcements');
      expect(html).toContain('Compliance dashboard');
    });

    it('includes the features and managers anchors', () => {
      const html = renderToStaticMarkup(<FeaturesSection />);
      expect(html).toContain('id="features"');
      expect(html).toContain('id="managers"');
    });
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FeaturesSection`
Expected: FAIL.

- [ ] **Step 3: Rewrite the section**

Replace `apps/web/src/components/marketing/features-section.tsx` entirely:

```tsx
import React from 'react';
import { PortfolioCard } from './portfolio-card';

const FEATURES = [
  { icon: '📁', title: 'Document management', body: 'Upload, organize, and publish records with automatic compliance tracking.' },
  { icon: '🔔', title: 'Meeting notices', body: '48-hour and 14-day notices posted with the right timing, every time.' },
  { icon: '👤', title: 'Owner portal', body: 'Secure logins for owners to read documents, notices, and submit requests.' },
  { icon: '📱', title: 'Mobile access', body: 'A mobile-first portal with email reminders for residents and board members.' },
  { icon: '📣', title: 'Announcements', body: 'Reach every owner instantly — no more taped flyers in the elevator.' },
  { icon: '✅', title: 'Compliance dashboard', body: 'Per-community statutory tracking that rolls up into one portfolio score.' },
];

/**
 * Features — portfolio compliance is the hero feature (with the portfolio card),
 * supported by a grid of per-association tools. The #managers anchor lands here.
 */
export function FeaturesSection() {
  return (
    <section className="mk-band" id="features">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">Built for portfolios</span>
          <h2 className="mk-display">A whole back office, minus the binders.</h2>
        </div>

        <div className="mk-card mk-feat-hero" id="managers">
          <div className="mk-copy">
            <span className="mk-eyebrow">For property managers</span>
            <h3 className="mk-display">Portfolio compliance, one view.</h3>
            <p className="mk-muted">
              Every association you manage, every statutory deadline, one rolled-up
              score. Bulk-post documents, push white-label branding, and see the
              one community that needs attention — without logging into twelve
              sites.
            </p>
            <a href="/signup" className="mk-pill mk-pill-ghost" style={{ marginTop: 18 }}>
              Explore the portfolio dashboard →
            </a>
          </div>
          <div className="mk-art">
            <PortfolioCard />
          </div>
        </div>

        <div className="mk-feat-grid">
          {FEATURES.map((f) => (
            <div className="mk-card mk-fcard" key={f.title}>
              <div className="mk-fic" aria-hidden="true">
                {f.icon}
              </div>
              <h4>{f.title}</h4>
              <p className="mk-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FeaturesSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/features-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): portfolio-led features section"
```

---

## Task 11: Testimonial section

**Files:**
- Create: `apps/web/src/components/marketing/testimonial-section.tsx`
- Test: add `TestimonialSection` block

- [ ] **Step 1: Add the failing test**

```tsx
import { TestimonialSection } from '../../src/components/marketing/testimonial-section';

describe('TestimonialSection', () => {
  it('renders a property-manager quote and attribution', () => {
    const html = renderToStaticMarkup(<TestimonialSection />);
    expect(html).toContain('buildings');
    expect(html).toContain('Property Manager');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t TestimonialSection`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/marketing/testimonial-section.tsx`:

```tsx
import React from 'react';

/** CAM / property-manager testimonial. Placeholder quote until a real one lands. */
export function TestimonialSection() {
  return (
    <section className="mk-band mk-band-alt">
      <div className="mk-wrap">
        <div className="mk-card mk-quote">
          <div className="mk-q">
            “We manage 14 buildings. PropertyPro got every one of them{' '}
            <span className="mk-hl">compliant on a single dashboard</span> — and
            when a deadline’s coming up, it tells me which community to look at.”
          </div>
          <div className="mk-who">
            <span className="mk-av" aria-hidden="true" />
            <div style={{ textAlign: 'left', fontSize: 14 }}>
              <b style={{ display: 'block', fontSize: 15 }}>Daniel Ortiz</b>
              <span className="mk-muted">
                Property Manager · Gulfstream Management, Fort Lauderdale
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t TestimonialSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/testimonial-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): property-manager testimonial"
```

---

## Task 12: Pricing section (rewrite — PM tier primary)

**Files:**
- Modify: `apps/web/src/components/marketing/pricing-section.tsx`
- Test: replace the `PricingSection` describe block

- [ ] **Step 1: Replace the PricingSection test block**

```tsx
  describe('PricingSection', () => {
    it('renders all three tiers', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Essentials');
      expect(html).toContain('Professional');
      expect(html).toContain('Property Manager');
    });

    it('renders amounts', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('$199');
      expect(html).toContain('$349');
      expect(html).toContain("Let's talk");
    });

    it('marks the Property Manager tier as the recommended path', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('Recommended for portfolios');
    });

    it('includes the pricing anchor id and signup CTA', () => {
      const html = renderToStaticMarkup(<PricingSection />);
      expect(html).toContain('id="pricing"');
      expect(html).toContain('href="/signup"');
    });
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t PricingSection`
Expected: FAIL.

- [ ] **Step 3: Rewrite the section**

Replace `apps/web/src/components/marketing/pricing-section.tsx` entirely:

```tsx
import React from 'react';

interface Tier {
  name: string;
  price: string;
  unit?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
  ribbon?: string;
}

const TIERS: Tier[] = [
  {
    name: 'Essentials',
    price: '$199',
    unit: '/mo',
    blurb: 'Self-managed condos & HOAs getting compliant',
    features: [
      'Branded association website',
      'Document management',
      'Meeting notice tracking',
      'Owner portal',
      'Compliance dashboard',
    ],
    cta: { label: 'Start free trial', href: '/signup' },
  },
  {
    name: 'Professional',
    price: '$349',
    unit: '/mo',
    blurb: 'The full single-community toolkit',
    features: [
      'Everything in Essentials',
      'Mobile resident portal',
      'E-sign workflows',
      'Maintenance & violations',
      'Advanced reporting',
    ],
    cta: { label: 'Start free trial', href: '/signup' },
  },
  {
    name: 'Property Manager',
    price: "Let's talk",
    blurb: 'For management companies running portfolios',
    features: [
      'Multi-association portfolio',
      'Bulk operations across communities',
      'White-label branding',
      'Centralized compliance reporting',
      'Volume pricing & dedicated onboarding',
    ],
    cta: { label: 'Talk to sales', href: '/signup' },
    featured: true,
    ribbon: 'Recommended for portfolios',
  },
];

/** Pricing — Property Manager tier carries the primary emphasis. */
export function PricingSection() {
  return (
    <section className="mk-band" id="pricing">
      <div className="mk-wrap">
        <div className="mk-sec-head mk-center">
          <span className="mk-eyebrow">Simple pricing</span>
          <h2 className="mk-display">Priced for one building or fifty.</h2>
          <p className="mk-muted" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
            Every plan includes statute compliance monitoring, hosting, and SSL.
            14-day free trial, no card required.
          </p>
        </div>
        <div className="mk-price-grid">
          {TIERS.map((t) => (
            <div className={`mk-card mk-price${t.featured ? ' mk-feat' : ''}`} key={t.name}>
              {t.ribbon ? <span className="mk-ribbon">{t.ribbon}</span> : null}
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
              <div className="mk-amt mk-display">
                {t.price}
                {t.unit ? <span>{t.unit}</span> : null}
              </div>
              <p className="mk-muted" style={{ fontSize: 14 }}>
                {t.blurb}
              </p>
              <ul>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a
                href={t.cta.href}
                className={`mk-pill ${t.featured ? 'mk-pill-primary' : 'mk-pill-ghost'}`}
              >
                {t.cta.label}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t PricingSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/pricing-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): PM-first pricing"
```

---

## Task 13: FAQ section

**Files:**
- Create: `apps/web/src/components/marketing/faq-section.tsx`
- Test: add `FaqSection` block

- [ ] **Step 1: Add the failing test**

```tsx
import { FaqSection } from '../../src/components/marketing/faq-section';

describe('FaqSection', () => {
  it('answers the core board/PM objections', () => {
    const html = renderToStaticMarkup(<FaqSection />);
    expect(html).toContain('required to have a website');
    expect(html).toContain('technical');
    expect(html).toContain('secure');
    expect(html).toContain('already have a website');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FaqSection`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/marketing/faq-section.tsx`:

```tsx
import React from 'react';

const QA = [
  {
    q: 'Is my association actually required to have a website?',
    a: 'Condos with 25+ units must comply by Jan 1, 2026; 150+ units already must. HOAs with 100+ parcels are required now. Run the 30-second checker above for the exact obligation per community.',
  },
  {
    q: 'Do I need to be technical to set this up?',
    a: 'No. If you can use email, you can run PropertyPro — at one building or across a whole portfolio. Most communities are live the same afternoon, no committee or consultant required.',
  },
  {
    q: 'Is each association’s data secure?',
    a: 'Every association is fully isolated, encrypted, and backed up. Owners only see what you publish to them; sensitive records stay private to the board and manager.',
  },
  {
    q: 'What if a community already has a website?',
    a: 'Most general websites don’t meet the statute’s posting and notice requirements. PropertyPro can run alongside or replace it — and each community can use its own custom domain.',
  },
];

/** Objection-handling FAQ. Static cards (expand interaction deferred). */
export function FaqSection() {
  return (
    <section className="mk-band mk-band-alt">
      <div className="mk-wrap">
        <div className="mk-sec-head mk-center">
          <span className="mk-eyebrow">Questions, answered</span>
          <h2 className="mk-display">The things managers always ask.</h2>
        </div>
        <div className="mk-faq">
          {QA.map((item) => (
            <div className="mk-card mk-qa" key={item.q}>
              <h4>
                {item.q}
                <span className="mk-muted" aria-hidden="true">
                  ＋
                </span>
              </h4>
              <p className="mk-muted">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FaqSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/faq-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): objection-handling FAQ"
```

---

## Task 14: Final CTA section

**Files:**
- Create: `apps/web/src/components/marketing/final-cta-section.tsx`
- Test: add `FinalCtaSection` block

- [ ] **Step 1: Add the failing test**

```tsx
import { FinalCtaSection } from '../../src/components/marketing/final-cta-section';

describe('FinalCtaSection', () => {
  it('renders a closing CTA linking to signup', () => {
    const html = renderToStaticMarkup(<FinalCtaSection />);
    expect(html).toContain('Beat the deadline');
    expect(html).toContain('href="/signup"');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FinalCtaSection`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/marketing/final-cta-section.tsx`:

```tsx
import React from 'react';

/** Warm closing CTA band. */
export function FinalCtaSection() {
  return (
    <section className="mk-band">
      <div className="mk-wrap">
        <div className="mk-final">
          <h2 className="mk-display">Beat the deadline across every community.</h2>
          <p>
            Join the Florida management companies running compliant, modern,
            transparent portfolios — without the stress.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get your portfolio online →
            </a>
            <a
              href="/signup"
              className="mk-pill mk-pill-ghost"
              style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.5)' }}
            >
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t FinalCtaSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/final-cta-section.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): final CTA section"
```

---

## Task 15: Footer (rewrite, warm + PM framing)

**Files:**
- Modify: `apps/web/src/components/marketing/footer.tsx`
- Test: replace the `MarketingFooter` describe block

- [ ] **Step 1: Replace the MarketingFooter test block**

```tsx
  describe('MarketingFooter', () => {
    it('renders the company name', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('PropertyPro');
    });

    it('keeps the legal links', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('href="/legal/terms"');
      expect(html).toContain('href="/legal/privacy"');
    });

    it('keeps contact + the not-a-law-firm disclaimer', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('support@getpropertypro.com');
      expect(html).toContain('West Palm Beach, FL');
      expect(html).toContain('not a law firm');
    });

    it('keeps product anchor links', () => {
      const html = renderToStaticMarkup(<MarketingFooter />);
      expect(html).toContain('href="#features"');
      expect(html).toContain('href="#pricing"');
    });
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t MarketingFooter`
Expected: FAIL (markup/classes changed).

- [ ] **Step 3: Rewrite the footer**

Replace `apps/web/src/components/marketing/footer.tsx` entirely:

```tsx
import React from 'react';

/** Warm marketing footer. Keeps legal links, contact, and the law-firm disclaimer. */
export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mk-footer">
      <div className="mk-wrap">
        <div className="mk-foot-grid">
          <div>
            <div className="mk-logo" style={{ color: '#fff' }}>
              <span className="mk-logo-dot" aria-hidden="true">
                ◐
              </span>
              PropertyPro
            </div>
            <p style={{ marginTop: 14, maxWidth: '24em', fontSize: 14 }}>
              Compliance and community management for Florida condominium and HOA
              associations — and the property managers who run them.
            </p>
          </div>
          <div>
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#compliance">Compliance</a>
            <a href="#pricing">Pricing</a>
            <a href="#managers">For managers</a>
          </div>
          <div>
            <h5>Company</h5>
            <a href="/transparency">Community Transparency</a>
            <a href="mailto:support@getpropertypro.com">Contact</a>
          </div>
          <div>
            <h5>Legal</h5>
            <a href="/legal/terms">Terms of Service</a>
            <a href="/legal/privacy">Privacy Policy</a>
          </div>
        </div>
        <div className="mk-foot-bot">
          <span>
            © {year} PropertyPro Florida. PropertyPro is not a law firm and does
            not provide legal advice.
          </span>
          <span>West Palm Beach, FL · support@getpropertypro.com</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing/landing-page.test.tsx -t MarketingFooter`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/footer.tsx apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "feat(marketing): warm footer"
```

---

## Task 16: Compose the page

**Files:**
- Modify: `apps/web/src/app/(marketing)/page.tsx`

- [ ] **Step 1: Rewrite page.tsx**

Replace `apps/web/src/app/(marketing)/page.tsx` entirely:

```tsx
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { HeroSection } from '@/components/marketing/hero-section';
import { LogoProofSection } from '@/components/marketing/logo-proof-section';
import { ComplianceUrgencySection } from '@/components/marketing/compliance-urgency-section';
import { HowItWorksSection } from '@/components/marketing/how-it-works-section';
import { FeaturesSection } from '@/components/marketing/features-section';
import { TestimonialSection } from '@/components/marketing/testimonial-section';
import { PricingSection } from '@/components/marketing/pricing-section';
import { FaqSection } from '@/components/marketing/faq-section';
import { FinalCtaSection } from '@/components/marketing/final-cta-section';
import { MarketingFooter } from '@/components/marketing/footer';

export default function MarketingLandingPage() {
  return (
    <>
      <MarketingNav />
      <main id="main-content">
        <HeroSection />
        <LogoProofSection />
        <ComplianceUrgencySection />
        <HowItWorksSection />
        <FeaturesSection />
        <TestimonialSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <MarketingFooter />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @propertypro/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(marketing\)/page.tsx
git commit -m "feat(marketing): compose redesigned landing page"
```

---

## Task 17: Full marketing test sweep + typecheck

**Files:** none (verification).

- [ ] **Step 1: Run the full marketing test set**

Run: `pnpm --filter @propertypro/web exec vitest run __tests__/marketing __tests__/components/marketing __tests__/lib/marketing`
Expected: PASS — all describe blocks (PortfolioCard, MarketingNav, HeroSection, LogoProofSection, ComplianceUrgencySection, HowItWorksSection, FeaturesSection, TestimonialSection, PricingSection, FaqSection, FinalCtaSection, MarketingFooter, ComplianceChecker, getComplianceObligation) green. If any stale assertion from the original test file remains (e.g. "Required by Florida Law"), it belongs to a block already replaced — delete the stale leftover.

- [ ] **Step 2: Typecheck the web app**

Run: `pnpm --filter @propertypro/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit (if the sweep required any test cleanup)**

```bash
git add apps/web/__tests__/marketing/landing-page.test.tsx
git commit -m "test(marketing): finalize landing page test sweep"
```

---

## Task 18: Production build + visual & accessibility verification

This catches build-only failures (a `'use client'` boundary or CSS import that unit tests miss — see project memory on local-green/CI-red traps) and verifies the look/contrast/motion in a real browser.

**Files:** none (verification), unless a contrast fix is needed.

- [ ] **Step 1: Production build**

Run: `pnpm --filter @propertypro/web build`
Expected: PASS. The `compliance-checker` (`'use client'`) sits inside the server `ComplianceUrgencySection`, which is valid (server can render client children). If the build complains about the marketing-theme CSS import location, ensure it is imported from the layout, not a server component body.

- [ ] **Step 2: Run the dev server and screenshot top-to-bottom**

Start the dev server (`preview_start "web"`), navigate to `/`, and screenshot hero → compliance → how-it-works → features → pricing → footer at desktop width, then at mobile (375px). Confirm: portfolio card renders, the warm palette is applied (not the old blue/gray), nav anchors smooth-scroll to each section, and mobile stacks to one column.

- [ ] **Step 3: Accessibility checks**

- Verify text contrast on the warm palette meets WCAG AA: `--mk-ink` (#241712) and `--mk-ink-soft` (#6b574c) on `--mk-cream` (#fdf6ee), and white on `--mk-coral` (#c2533a). If white-on-coral is below 4.5:1 for the button label size, switch primary button backgrounds to `--mk-coral-d` (#a8412c) in `marketing-theme.css` and re-verify.
- Tab through the page: every link/button/the checker input must show a visible focus ring (do not suppress `:focus-visible`). The checker result region has `aria-live="polite"`; decorative glyphs (◐, ✓, emoji icons, the sun) are `aria-hidden`.
- Emulate `prefers-reduced-motion: reduce` and confirm the pulse + nav underline animations are gone (they are gated behind `@media (prefers-reduced-motion: no-preference)`).

- [ ] **Step 4: Commit any a11y fix**

```bash
git add apps/web/src/app/\(marketing\)/marketing-theme.css
git commit -m "fix(marketing): AA contrast on warm palette"
```

(Skip if no fix was needed.)

- [ ] **Step 5: Final full-suite gate (optional but recommended before PR)**

Run: `pnpm --filter @propertypro/web exec vitest run` and `pnpm lint`
Expected: PASS. Then the branch is ready for `superpowers:finishing-a-development-branch`.

---

## Notes for the implementer

- **Do not touch global tokens.** All new color/type lives under `.marketing-theme` in `marketing-theme.css`. The authenticated app keeps `text-content` / `bg-interactive` / Inter-only.
- **Statute facts are load-bearing.** Keep $50/day, 30-day posting, 48h/14d notices, Jan 1 2026, and the 25/150/100 thresholds accurate; the checker copy and the obligation module must agree. Keep the "not a law firm" disclaimer.
- **Placeholder content** (community names, company names, testimonial) is intentional per spec §9 — leave clearly representative names; do not invent real customers.
- **One test file** (`landing-page.test.tsx`) holds all section render tests; the checker and rules module have their own files. Add each describe block as its task lands; by Task 17 the file should contain only new-design assertions.
```
