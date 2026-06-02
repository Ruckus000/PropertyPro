# Tidewater

Coastal editorial. Golden-hour palette, Fraunces italic display set against warm ivory, hairline rules, dated entries laid out like a printed program. Best for waterfront condominium associations.

## Default preset

`bay-light` — primary `#0e3338` (mineral teal), secondary `#f6f1e6` (warm ivory), accent `#c66f49` (terracotta), heading `Fraunces`, body `Manrope`.

## Source

[`apps/web/src/components/public-site/layouts/Tidewater.tsx`](../../../apps/web/src/components/public-site/layouts/Tidewater.tsx).

## Composition

- `PublicSiteHeader` (existing community-header component, theme-driven).
- `<main>` with id `main-content` for skip-to-content links.
- Empty-state hero (community name as `<h1>` + Resident Login CTA) when no `hero` block is present. Suppressed once a `hero` block exists.
- Block iteration: ordered by `blockOrder` ascending. Each block dispatched through `blockRendererRegistry` via the `hasRenderer` type guard. Unknown block types are skipped silently.
- `PublicSiteFooter` (existing footer component).

## Token usage

All colors via CSS variables — never hardcoded hex:
- `var(--theme-primary)` — surface fills for the hero band.
- `var(--theme-secondary)` — page background.
- `var(--theme-accent)` — section-divider rules, accents.
- `var(--font-heading)` — `<h1>`, `<h2>` text via the `font-heading` Tailwind class.
- `var(--font-body)` — body text via the `font-body` class.

## Accessibility constraints

- Body text ≥ 16px (per `.claude/rules/design.md`).
- Single `<h1>` per page (either the empty-state hero OR a PM-authored hero block — never both).
- `:focus-visible` styling preserved on every interactive element (CTA links, login buttons).
- Color contrast on the `bay-light` preset verified at WCAG AA against the primary surface.

## Photographic guidance

When PMs upload a hero image (PR #2's upload pipeline):
- 1600×900 minimum, JPG/PNG/WebP only.
- Warm, late-afternoon coastal palette pairs best with `bay-light` accents.
- Avoid overly compressed images — Tidewater's hero panel renders the image without overlay treatments, so artifacts are visible.

## When to recommend Tidewater

- Waterfront condominium associations.
- Communities prioritizing an editorial / refined visual register.
- Defaults to Tidewater for `community_type = condo_718`.

Ship PR: [#1b — feat: Tidewater + Hero vertical slice](https://github.com/Ruckus000/PropertyPro/pulls?q=is%3Apr+1b+Tidewater).
