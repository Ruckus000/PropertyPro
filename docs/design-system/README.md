# PropertyPro Design System (V2)

Reliable compliance tooling for Florida condominium operations, designed for mixed-age users and mixed-device workflows.

## Design Philosophy

PropertyPro is a production compliance system, not a marketing site. Visual decisions prioritize:

- readability under deadline pressure
- clear hierarchy without visual noise
- predictable interaction behavior across tablet and desktop
- accessibility as a baseline, not an enhancement

## Dual Audience

### HOA Board Members

- often tablet-first
- readability-first typography and spacing
- larger touch targets
- straightforward status communication

### Property Managers

- desktop-heavy, multi-property workflows
- denser scanning patterns
- fast navigation and keyboard-accessible interactions
- high information throughput with clear prioritization

## Token Architecture

PropertyPro uses a three-tier token system.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ PRIMITIVE TOKENS (what exists)                                            │
│ raw scales: color, spacing, radius, motion, shadow                        │
├────────────────────────────────────────────────────────────────────────────┤
│ SEMANTIC TOKENS (how to use)                                              │
│ purpose-driven mappings: text/surface/status/elevation/spacing            │
│ spacing includes:                                                         │
│   - micro: inline / stack / inset (component internals)                   │
│   - macro: section / page (layout composition)                            │
├────────────────────────────────────────────────────────────────────────────┤
│ COMPONENT TOKENS (where to use)                                           │
│ component-specific dimensions and behavior contracts                       │
└────────────────────────────────────────────────────────────────────────────┘
```

## Typography Scale

Base typography is **16px** with an approximately 1.2 modular rhythm.

| Token | Value | Pixels |
|---|---|---|
| `xs` | `0.6875rem` | 11px |
| `sm` | `0.8125rem` | 13px |
| `base` | `1rem` | 16px |
| `lg` | `1.125rem` | 18px |
| `xl` | `1.25rem` | 20px |
| `2xl` | `1.5rem` | 24px |
| `3xl` | `1.875rem` | 30px |

Rules:

- body text uses `base` as the standard floor
- caption size is metadata-only
- compliance content should remain at body/bodySmall sizes or larger

## Surface Treatment

Border-first hierarchy is the default:

1. define surfaces with borders first
2. use elevation second, and sparingly
3. keep surfaces consistent: page, card, elevated, overlay
4. maintain strict grid alignment

## Elevation System (E0-E3)

| Level | Meaning | Usage |
|---|---|---|
| `E0` | Flat | default card/page surfaces |
| `E1` | Raised | hover lift, sticky bars |
| `E2` | Overlay | dropdowns, menus, popovers, sheets |
| `E3` | Modal | dialogs, command palettes |

Rules:

- `E2` and `E3` are only for overlays over page content
- prefer border contrast before adding shadow

## Status Escalation (Compliance-Specific)

Escalation tiers express deadline urgency with text + icon + color.

| Tier | Window | Treatment |
|---|---|---|
| `calm` | `> 30 days` | subtle |
| `aware` | `8-30 days` | standard |
| `urgent` | `1-7 days` | prominent |
| `critical` | overdue | persistent/high-visibility |

Rules:

- never communicate status by color alone
- critical (overdue) items must be visible without scrolling on dashboard views

## Responsive Density

Density is viewport-driven, not user-toggle-driven.

- mobile (`<768px`): spacious defaults, larger touch targets
- desktop (`>=768px`): tighter component internals
- macro spacing (`section`, `page`) remains constant across breakpoints

## Accessibility

V2 accessibility baseline includes:

- global `:focus-visible` ring tokens
- skip-link pattern support
- touch target minimums: 44px mobile, 36px desktop
- color + icon + text for all status presentation
- `prefers-reduced-motion` support across transition and animation durations

## Component Quick Reference

| Component | Key V2 Values |
|---|---|
| `Button` | heights: `sm 36`, `md 40`, `lg 48`; radius `md (10px)` |
| `Input` (token contract) | heights: `40 desktop / 48 mobile density`; radius `sm (6px)` |
| `Card` | radius `md (10px)`; elevation `E0` rest, `E1` hover/interactive |
| `Modal` | radius `lg (16px)`; elevation `E3` |
| `Badge` | radius `full`; touch-aware minimum target |
| `NavRail Item` | height `44px`; radius `md (10px)` |
| `DataRow` | minimum target `44px` mobile, `36px` desktop |
| `SectionHeader` | macro spacing via `section.*` tokens |

## Implementation Notes

- primitives remain the foundation layer
- semantic layers are authoritative for hierarchy and meaning
- component tokens encode usage contracts and should be updated before component-specific hardcoding

## Contributing

When making UI changes:

1. update tokens first
2. map component behavior to semantic contracts
3. avoid one-off values
4. validate focus, motion reduction, and target size behavior
5. enforce color+icon+text for status communication
