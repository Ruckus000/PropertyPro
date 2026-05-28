# Public-Site Layouts

Layouts own the page chrome of public community sites. Three ship in v1:

| Slug      | File             | Status               | Brand fit                                                                                  |
|-----------|------------------|----------------------|--------------------------------------------------------------------------------------------|
| tidewater | `Tidewater.tsx`  | **Shipped (PR #1b)** | Coastal editorial — golden-hour palette, Fraunces italic display, hairline rules.          |
| boulevard | `Boulevard.tsx`  | Planned (PR #7)      | Mid-century Floridian — MiMo geometry, Newsreader italic, ochre accents.                   |
| sable     | `Sable.tsx`      | Planned (PR #7)      | Refined contemporary — linen and oxidized bronze, Cormorant Garamond hairline italic.      |

## Architecture

- A layout is a **React server component** with `LayoutProps`: `community`, `theme`, `blocks`.
- The layout owns: header, footer, hero treatment, section wrapping, typography stack.
- The layout DOES NOT own: per-block content. It iterates `blocks` and dispatches each via the block renderer registry.
- All v1 layouts must be server components — no client islands except where genuinely required (e.g., the future calendar widget in MeetingsBlock).

## Adding a new layout

1. Create `<LayoutName>.tsx` in this directory. Use the existing layouts as references for typography and spacing rhythm.
2. Register the layout in `./registry.ts`.
3. Add a metadata row via migration: `INSERT INTO site_layout_metadata (slug, display_name, ...) VALUES (...)`.
4. Document the layout's design intent at `docs/design-system/templates/<slug>.md`.
5. Add a layout integration test under `apps/web/__tests__/public-site/layouts/<slug>.test.tsx`.

## Constraints

- Tokens MUST be consumed via CSS variables (`var(--theme-primary)`, `var(--theme-secondary)`, ...) — never hardcoded hex.
- Body text MUST be ≥ 16px (per `.claude/rules/design.md`).
- All interactive elements MUST show `:focus-visible` (never suppress).
- Heading hierarchy MUST be valid (one `<h1>`, then descending).
- Image alt text comes from the block content; layouts do not generate alt text themselves.

## Default fallback

If a community's resolved `LayoutId` has no registered layout component (`layoutRegistry[id]` returns `undefined`), `_site/page.tsx` falls back to the hardcoded markup that shipped pre-PR-#1b. This makes the rollout safe: even after Tidewater ships, removing it from the registry would NOT crash the site — it would visually regress to the pre-1b baseline.

The fallback is currently the live render path for `hoa_720` and `apartment` community types (which resolve to `boulevard` and `sable`, neither registered until PR #7). It is removed in PR #7 once all three layouts ship.

## What layouts are not

- Layouts are NOT customer-authorable. PMs pick from the registry; they cannot upload custom layouts.
- Layouts are NOT skinned via custom CSS in v1. Pro+ custom CSS overrides apply only to token values, not layout structure (Section 11 PR scope).
- Layouts are NOT compiled at runtime. They ship as code in this directory; the platform-admin panel only edits metadata.
