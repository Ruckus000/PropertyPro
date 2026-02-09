# PropertyPro Design System — Non-Negotiable Rules

## Spacing

1. No ad-hoc spacing values. Use tokens exclusively.
2. Component internals use micro tokens (`inline`/`stack`/`inset`).
3. Page composition uses macro tokens (`section`/`page`).
4. Macro spacing is constant across viewports. Only micro spacing adapts.

## Surfaces

1. Borders are primary; shadows are secondary.
2. Shadows only from the elevation scale (`E0`-`E3`).
3. Radii only from the radius scale (`sm`/`md`/`lg`/`xl`/`2xl`/`full`).
4. `E2` and `E3` are exclusively for overlays and modals.

## Typography

1. Base font size is 16px. Do not override below this for body text.
2. Compliance document content uses body or bodySmall minimum.
3. Caption (11px) is only for metadata labels, never for primary content.

## Status & Accessibility

1. Never rely on color alone. Always pair with icon + text label.
2. Status escalation follows the 4-tier system (`calm`/`aware`/`urgent`/`critical`).
3. Critical (overdue) items must be visible without scrolling on the dashboard.
4. All interactive elements meet 44px touch target on mobile, 36px on desktop.
5. All focus states use the focus ring system. No element may suppress `focus-visible`.

## Motion

1. All animations respect `prefers-reduced-motion`.
2. Motion must be functional (`feedback`, `orientation`, or `attention`). No decorative animation.
3. Status transitions use the `attention` timing profile.
