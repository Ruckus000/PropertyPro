# Public-Site Layouts

Layouts own the page chrome of public community sites. Three legacy layouts keep rendering the sites
that use them, and four looks (website builder Phase 2B) are what managers pick from:

| Slug         | File              | Status               | Brand fit                                                                                  |
|--------------|-------------------|----------------------|--------------------------------------------------------------------------------------------|
| tidewater    | `Tidewater.tsx`   | **Shipped (PR #1b)** | Coastal editorial — golden-hour palette, Fraunces italic display, hairline rules.          |
| boulevard    | `Boulevard.tsx`   | **Shipped (PR #7)**  | Mid-century Floridian — MiMo geometry, Newsreader italic, ochre accents.                   |
| sable        | `Sable.tsx`       | **Shipped (PR #7)**  | Refined contemporary — linen and oxidized bronze, Cormorant Garamond hairline italic.      |
| bayfront     | `Bayfront.tsx`    | Look                 | Photo-led and modern — full-bleed photo hero, alternating section bands, pill buttons.     |
| heritage     | `Heritage.tsx`    | Look                 | Formal and official — words beside a framed photo, ruled headings, square corners.         |
| palm-grove   | `PalmGrove.tsx`   | Look                 | Warm and friendly — the welcome on a card over a wide photo, alternating bands, rounded.   |
| plain-simple | `PlainSimple.tsx` | Look                 | No photos needed — a text hero, every text size one step up, hairline rules.               |

A look's id, layout id and preset slug are the same string. How a look draws its hero, its section
rhythm, its corners and its accent is `LOOK_STYLES` in `look-styles.ts`, read by `HeroBlock` and
`SiteChrome`; its colours and fonts are its `site_theme_presets` row (migration 0097).

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
5. Add a layout integration test under `apps/web/__tests__/components/public-site/layouts/<LayoutName>.test.tsx`.

## Constraints

- Tokens MUST be consumed via CSS variables (`var(--theme-primary)`, `var(--theme-secondary)`, ...) — never hardcoded hex.
- Body text MUST be ≥ 16px (per `.claude/rules/design.md`).
- All interactive elements MUST show `:focus-visible` (never suppress).
- Heading hierarchy MUST be valid (one `<h1>`, then descending).
- Image alt text comes from the block content; layouts do not generate alt text themselves.

## Default fallback

All seeded v1 layout IDs are registered. If a future `LayoutId` is added without a component, `public-site/page.tsx` still falls back to the hardcoded pre-registry markup instead of crashing.

## What layouts are not

- Layouts are NOT customer-authorable. PMs pick from the registry; they cannot upload custom layouts.
- Layouts are NOT skinned via custom CSS in v1. Pro+ custom CSS overrides apply only to token values, not layout structure (Section 11 PR scope).
- Layouts are NOT compiled at runtime. They ship as code in this directory; the platform-admin panel only edits metadata.
