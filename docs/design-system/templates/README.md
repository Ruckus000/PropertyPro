# Site Layout Templates

Layouts are React server components that own the page chrome of a public community site. Each layout has:
- A React component at `apps/web/src/components/public-site/layouts/<LayoutName>.tsx`
- A metadata row in the `site_layout_metadata` DB table
- A doc file in this directory (added alongside the layout's PR)

## v1 layout catalog

| Slug      | Default preset  | Tier         | PR  | Doc                                              |
|-----------|-----------------|--------------|-----|---------------------------------------------------|
| tidewater | bay-light       | Essentials   | #1b | [tidewater.md](./tidewater.md) *(added in PR #1b)* |
| boulevard | palm-shadow     | Essentials   | #7  | [boulevard.md](./boulevard.md)                    |
| sable     | linen-bronze    | Essentials   | #7  | [sable.md](./sable.md)                            |

## Constraints (all layouts must honor)

- Server components only. No client islands except where strictly required.
- Tokens via CSS variables (`var(--theme-primary)`); never hardcoded hex.
- Body text ≥ 16px (per `.claude/rules/design.md`).
- `:focus-visible` never suppressed.
- Heading hierarchy valid (one `<h1>` per page, descending after).
- Image alt text comes from the block content; layouts do not invent alt text.

## How a layout differs from a block

- A **layout** owns the page chrome (header, footer, hero treatment, section wrapping, typography rhythm).
- A **block** is a content unit rendered inside the layout (hero panel, document list, contact card, etc.).
- The same `blocks` array renders the same way regardless of layout — only the surrounding chrome changes.

## Authoring a new layout

See [apps/web/src/components/public-site/layouts/README.md](../../../apps/web/src/components/public-site/layouts/README.md).
