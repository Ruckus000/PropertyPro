# Sable

Refined contemporary. Restrained spacing, a quiet framed hero treatment, and a more formal editorial tone. Best for apartment and professionally managed rental communities that need calm, readable public pages.

## Default preset

`linen-bronze` — seeded in layout metadata for `sable`.

## Source

[`apps/web/src/components/public-site/layouts/Sable.tsx`](../../../apps/web/src/components/public-site/layouts/Sable.tsx).

## Composition

- `PublicSiteHeader` (existing community-header component, theme-driven).
- `<main>` with id `main-content` for skip-to-content links.
- Empty-state hero with an accent rule when no `hero` block is present.
- Block iteration: ordered by `blockOrder` ascending and dispatched through `blockRendererRegistry`.
- Unknown block types are skipped silently.
- `PublicSiteFooter` (existing footer component).

## Token usage

All colors are consumed through theme-backed classes:
- `bg-surface` and `bg-surface-card` for the page and hero surface.
- `border-accent` and `text-accent` for the formal accent rule.
- `bg-primary` for the resident-login CTA.
- `font-heading` and `font-body` for the preset typography.

## Accessibility constraints

- Single `<h1>` per page (empty-state hero OR a PM-authored hero block).
- `:focus-visible` styling is present on the resident-login CTA.
- Body copy is 16px or larger.

## When to recommend Sable

- Apartment communities.
- Properties that want a contemporary management-company feel.
- Defaults to Sable for `community_type = apartment`.
