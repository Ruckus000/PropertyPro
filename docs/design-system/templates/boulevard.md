# Boulevard

Mid-century Floridian. Broad horizontal bands, geometric rhythm, and confident primary-color calls to action. Best for HOA communities that want a practical civic bulletin-board feel without losing polish.

## Default preset

`palm-shadow` — seeded in layout metadata for `boulevard`.

## Source

[`apps/web/src/components/public-site/layouts/Boulevard.tsx`](../../../apps/web/src/components/public-site/layouts/Boulevard.tsx).

## Composition

- `PublicSiteHeader` (existing community-header component, theme-driven).
- `<main>` with id `main-content` for skip-to-content links.
- Empty-state hero with a two-column desktop composition when no `hero` block is present.
- Block iteration: ordered by `blockOrder` ascending and dispatched through `blockRendererRegistry`.
- Unknown block types are skipped silently.
- `PublicSiteFooter` (existing footer component).

## Token usage

All colors are consumed through theme-backed classes:
- `bg-secondary` for the page and empty-state hero surface.
- `bg-primary` for the resident-login CTA.
- `border-edge` for geometric separators.
- `font-heading` and `font-body` for the preset typography.

## Accessibility constraints

- Single `<h1>` per page (empty-state hero OR a PM-authored hero block).
- `:focus-visible` styling is present on the resident-login CTA.
- Body copy is 16px or larger.

## When to recommend Boulevard

- HOA communities.
- Neighborhood associations that want a clear civic resource hub.
- Defaults to Boulevard for `community_type = hoa_720`.
