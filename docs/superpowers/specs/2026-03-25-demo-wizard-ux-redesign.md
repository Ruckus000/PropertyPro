# Demo Wizard UX Redesign

**Status:** Approved
**Date:** 2026-03-25
**Scope:** Redesign the demo creation wizard from a 2-step long-scroll form into a 4-step focused wizard with design system compliance.
**Supersedes:** `2026-03-25-demo-wizard-redesign.md` (the original spec covered template registry architecture + wizard UX together; this spec replaces the wizard UX portions only — the template registry, compilation pipeline, and content strategy architecture from that spec remain authoritative).

## Problem

The current wizard (`apps/admin/src/app/demo/new/page.tsx`) has 15 UX issues identified in audit:
- Progress bar is unstyled text with 10px dots
- No navigation buttons between steps; CTA is below the fold
- Hand-rolled buttons/cards instead of design system components
- BrandingFormFields uses raw Tailwind colors, not semantic tokens
- Template cards missing bestFor text, fixed at 180px
- No form validation feedback, broken semantics, no animations

## Solution

Replace the 2-step Configure → Preview flow with a 4-step wizard: **Basics → Public Site → Mobile → Preview**. Each step fits in the viewport with a sticky footer for navigation.

## Architecture

### State Management

Single `config` state object (unchanged from current) lifted to the page component. A `step` state variable cycles through `'basics' | 'public-site' | 'mobile' | 'preview' | 'creating'`. Each step renders as a separate component receiving `config` + `setConfig` + navigation callbacks.

```
DemoNewPage (state owner)
├── WizardStepper (step indicator)
├── BasicsStep
├── PublicSiteStep
├── MobileStep
├── PreviewStep (existing, extracted)
└── WizardFooter (sticky, Back/Next)
```

### Step 1: Basics

**Content:**
- Community name input (required)
  - Inline validation: on blur, if empty, show error text below field in `--status-danger` + `--border-error` on input
  - Next button disabled when name is empty; no tooltip needed (error is inline)
- Community type toggle: Condo / HOA / Apartment (full words, no abbreviations)
  - Uses `Button` secondary variant in a toggle group; active gets primary styling
  - Changing type resets template selections + content strategy to defaults for new type
- Content focus pill selector
  - Pills use `border-2 --interactive-primary` + `bg-interactive-subtle` + `font-weight: 500` for selected state
  - Each pill shows description on hover via `title` attribute (existing behavior)
- Branding summary row
  - Compact row showing 3 color swatches + font names + "Customize" text link
  - Clicking "Customize" expands `BrandingFormFields` below with animated height transition
  - Uses `--duration-standard` (250ms) + `--ease-standard`; respects `prefers-reduced-motion`
- Optional fields section (collapsible)
  - CRM URL input + Internal notes textarea
  - Collapsed by default with animated expand

**Validation gate:** Next button disabled until `prospectName.trim()` is non-empty.

### Step 2: Public Site Template

**Content:**
- Context line: "For **{prospectName}** ({communityTypeLabel})"
- Responsive template card grid
  - `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`
  - Each card uses design system `Card` component with `interactive` + `selected` props
  - Card contents: TemplateThumbnail (existing), template name, **bestFor text**, tags
  - Selected card: `border-interactive-primary` + `bg-interactive-subtle` + checkmark badge (top-right)
- Pre-selected to the default template for the community type (existing behavior)

**Validation gate:** Always valid — a template is always selected.

### Step 3: Mobile Template

**Content:** Same layout as Step 2, filtered to `variant: 'mobile'` templates.

**Validation gate:** Always valid.

### Step 4: Preview

**Content:** Largely unchanged from existing `PreviewStep` component:
- Summary card (muted surface, 2x2 grid): type, content focus, public template, mobile template
- Public website preview in browser chrome iframe (existing)
- Mobile preview in `PhoneFrame` component (existing)
- Loading/error/success states (existing)

**CTA:** "Generate Demo" button using `Button` primary variant (not hand-rolled success green). Generate flow unchanged.

### WizardStepper Component

New component replacing the current `ProgressBar`:
- Four steps with numbered dots (28px circles), labels, and flex connector lines
- States: `complete` (green bg + checkmark), `active` (primary bg + number), `upcoming` (muted bg + number)
- Completed steps are clickable (navigate back); upcoming steps are not
- Connector lines: `flex: 1`, green when step is complete, `--border-default` otherwise
- Proper `aria-current="step"` on active, `aria-label` on clickable completed steps

### WizardFooter Component

Sticky footer on every step:
- Uses `position: sticky; bottom: 0` with `--surface-card` background and top border
- **Back button:** `Button` secondary variant with `ArrowLeft` icon from lucide-react. Hidden on Step 1.
- **Next button:** `Button` primary variant. Label changes per step:
  - Step 1: "Next: Choose Template →"
  - Step 2: "Next: Mobile Template →"
  - Step 3: "Preview Demo →"
  - Step 4: "Generate Demo" (primary variant, not success green)
- Next button disabled state controlled by step validation gate
- Back button always enabled (navigates to previous step)

### Back Link

Replace unicode `←` with `Button` ghost variant + `ArrowLeft` icon from lucide-react. Links to `/demo`.

### BrandingFormFields Token Fix

Replace all raw Tailwind colors with semantic CSS variables:
- `text-gray-500` → `text-[var(--text-secondary)]`
- `border-gray-200` → `border-[var(--border-default)]`
- `bg-blue-50/40` → `bg-[var(--interactive-subtle)]`
- `focus:border-blue-500` → `focus:border-[var(--interactive-primary)]`
- `text-blue-600` → `text-[var(--interactive-primary)]`
- All other hardcoded colors mapped to nearest semantic token

### Semantic HTML Fixes

- `SectionLabel` `<p>` → `<h2>` with same styling
- Remove `<span id>` wrapper inside — `id` goes directly on the `<h2>`
- `aria-labelledby` on `<section>` elements references the `<h2>` id

### Animation

Collapsible sections (branding expand, optional fields) use animated height transitions:
- Wrap content in a div with `overflow: hidden` and transition on `max-height` or use `grid-template-rows: 0fr → 1fr` pattern
- Duration: `var(--duration-standard)` (250ms)
- Easing: `var(--ease-standard)` (cubic-bezier(0.4, 0, 0.2, 1))
- Respects `prefers-reduced-motion: reduce` (instant transition)

## Files Changed

| File | Change |
|------|--------|
| `apps/admin/src/app/demo/new/page.tsx` | Refactor into 4-step wizard with extracted step components |
| `apps/admin/src/components/demo/WizardStepper.tsx` | **New** — step indicator component |
| `apps/admin/src/components/demo/WizardFooter.tsx` | **New** — sticky footer with Back/Next |
| `apps/admin/src/components/demo/BasicsStep.tsx` | **New** — Step 1 content |
| `apps/admin/src/components/demo/PublicSiteStep.tsx` | **New** — Step 2 content |
| `apps/admin/src/components/demo/MobileStep.tsx` | **New** — Step 3 content |
| `apps/admin/src/components/demo/TemplateCard.tsx` | Add bestFor text, use Card component, responsive sizing |
| `apps/admin/src/components/demo/PreviewStep.tsx` | **New** — extracted from page.tsx (existing PreviewStep function) |
| `apps/admin/src/components/demo/BrandingFormFields.tsx` | Replace raw Tailwind with semantic tokens |
| `apps/admin/src/components/demo/BrandingEditSection.tsx` | Same token fixes as BrandingFormFields (confirmed: uses `text-gray-400`, `bg-blue-600`, `border-gray-300`, `text-red-600`, `text-green-600`) |

## Out of Scope

- Template visual builder/editor
- Template marketplace or user uploads
- A/B testing templates
- Analytics on template conversion
- New design system components (we use existing Button, Card, Badge)
- Dark mode support (admin app doesn't have it yet)
- Mobile responsive breakpoints for admin (admin is desktop-only)

## Edge Cases

- **Community type change on Step 1 after completing Steps 2/3:** Changing community type resets template selections to defaults for the new type AND resets wizard progress back to Step 1 (stepper shows Steps 2-4 as upcoming, not completed). This prevents stale template state.
- **Stepper navigation:** Completed steps are clickable for backward navigation only. You cannot jump forward past the current step. If on Step 3, you can click Steps 1 or 2 but not Step 4.
- **Focus management on step transitions:** When transitioning between steps, focus moves to the step's heading element (`<h2>`) for keyboard accessibility.
- **Browser chrome decorative colors:** The macOS-style dots (`#ff5f57`, `#febc2e`, `#28c840`) in the preview browser chrome are decorative and exempt from the semantic token requirement.
- **`--status-error` bug:** The existing code uses `--status-error` for the required asterisk, but this token doesn't exist. Fix to `--status-danger` during implementation.
- **CreatingState component:** Stays inline in `page.tsx` (small, no reason to extract).

## Acceptance Criteria

1. Wizard has 4 distinct steps, each fitting in the viewport without scrolling (when collapsible sections are collapsed)
2. Sticky footer with Back/Next buttons visible on every step
3. Stepper shows numbered dots with completed/active/upcoming states
4. All buttons use `Button` from `@propertypro/ui`
5. Template cards use `Card` from `@propertypro/ui` with `interactive` + `selected`
6. Template cards display bestFor text
7. Template card grid is responsive (not fixed 180px)
8. BrandingFormFields uses only semantic CSS variables (no raw hex/Tailwind colors)
9. Section labels use `<h2>` with proper `aria-labelledby`
10. Collapsible sections animate with `--duration-standard`, respect `prefers-reduced-motion`
11. Community type toggle shows "Apartment" not "Apt"
12. Empty community name shows inline validation error on blur
13. All interactive elements have `:focus-visible` ring
14. No regressions: preview compilation, demo generation, and branding upload still work
