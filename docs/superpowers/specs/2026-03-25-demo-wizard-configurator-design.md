# Demo Wizard — Side-by-Side Configurator Design

**Status:** Approved
**Date:** 2026-03-25
**Supersedes:** `2026-03-25-demo-wizard-ux-redesign.md` (kept the 4-step wizard concept but replaces the layout with a side-by-side configurator)

## Problem

The current 4-step wizard uses a single-column layout where the user configures settings blind and only sees the result on the final Preview step. This creates "configure then hope" anxiety. The content focus pills lack descriptions. The split between config and preview is ~100/0 until the last step.

## Solution

A **side-by-side configurator** with a resizable split layout: configuration form on the left (~55%), live preview panel on the right (~45%). The preview compiles and updates as the user makes choices, giving immediate visual feedback at every step.

## Architecture

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Demos                                        │
│  Create Demo                                            │
│  [1 Basics] [2 Public] [3 Mobile] [4 Review]           │
├──────────────────────┬──┬───────────────────────────────┤
│                      │▪▪│                               │
│   Config Panel       │▪▪│   Live Preview Panel          │
│   (55% default)      │▪▪│   (45% default)               │
│                      │▪▪│                               │
│   Step-specific      │▪▪│   Public site preview         │
│   form content       │▪▪│   (browser chrome)            │
│                      │▪▪│                               │
│                      │▪▪│   Mobile preview              │
│                      │▪▪│   (phone frame)               │
│                      │▪▪│                               │
├──────────────────────┴──┴───────────────────────────────┤
│  Cancel    [← Back]                  [Next: Label →]    │
└─────────────────────────────────────────────────────────┘
```

### Resizable Split Panes

- Default ratio: **55% config / 45% preview**
- Draggable resize handle between panels (6px grip with dot pattern for affordance)
- Min width constraints: config min 40%, preview min 25%
- Resize state persisted in `localStorage` across step transitions

### Expand-to-Modal Preview

- Expand button (arrows icon) in the preview panel header
- Opens a modal overlay showing the preview at full viewport size
- Modal has close button and tabs to switch between public/mobile
- Available on all steps

### Pill-Style Stepper

Replaces the current dot stepper with pill badges:
- **Active:** Blue background, white text, numbered badge
- **Completed:** Green background, checkmark icon, clickable (backward navigation only)
- **Upcoming:** Gray background, numbered badge, not clickable
- Completed pills that become invalid (e.g., user goes back and clears name) show error state. New prop: `errorSteps: Set<string>` — pills in this set render with `border-status-danger` + `text-status-danger` and a warning icon instead of checkmark

### Footer (all steps)

Per Carbon's right-aligned primary action pattern and PatternFly's Cancel requirement:
- **Left group:** Cancel (tertiary text link) + Back button (secondary, with ArrowLeft icon). Back hidden on Step 1.
- **Right:** Next/primary button. Label changes per step:
  - Step 1: "Next: Choose Template →"
  - Step 2: "Next: Mobile Template →"
  - Step 3: "Next: Review →"
  - Step 4: "Create Demo" (primary, larger)
- Sticky at bottom with `bg-surface-card` + top border

## Step 1: Basics

**Config panel content:**
- **Community Name** — required input, auto-focused on mount (Carbon: focus first input, not heading). Helper text: "Appears on the demo's public website and mobile app." Inline validation on blur AND on Next press (PatternFly: validate on button press).
- **Community Type** — segmented control (Condo / HOA / Apartment). Full words, no abbreviations. Changing type resets template selections + content strategy + clears completed state for Steps 2-3.
- **Content Focus** — 2x2 card grid (not bare pills). Each card uses the `label` and `description` fields from the `ContentStrategy` data model in `packages/shared/src/demo-content-strategies.ts`. Selected card gets `border-interactive-primary` + `bg-interactive-subtle`. Note: the UI label is "Content Focus" but the underlying config field remains `contentStrategy: ContentStrategyId` — this is a display label only, not a field rename.
- **Branding** — collapsible row. Collapsed shows: label + 3 color swatches + font name + "Customize ›". Expands with animated height (`grid-template-rows: 0fr → 1fr`). Contains `BrandingFormFields`.
- **CRM Link & Notes** — collapsible row, labeled "Optional". Same animation pattern.

**Preview panel:** Shows default template previews using the community name and branding colors. Updates when name or branding changes. **Debounce strategy:** preview compilation triggers **500ms after the last change** (keystroke, color pick, etc.) to avoid flooding the server. While debouncing, the preview panel shows a subtle shimmer overlay on the existing content (not a full skeleton replacement). If community name is empty (initial mount), the preview panel shows a placeholder state: "Enter a community name to see the preview" with a muted illustration.

**Preview panel empty state (Step 1 initial mount):** The preview API requires `prospectName` to be non-empty. Until the user types a name, the preview shows a centered placeholder: muted text "Enter a community name to see a preview" with the default gradient as a background hint. Once the user types at least 1 character and 500ms debounce fires, the first compilation occurs.

## Step 2: Public Site Template

**Config panel content:**
- Context line: "For **{name}** ({type})"
- Template card grid: `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`
- Each card: thumbnail gradient, template name, bestFor description, tags
- Selected card: `border-interactive-primary` + checkmark badge (top-right)
- Pre-selected to default template for the community type

**Preview panel:** Compiles the selected public template via `POST /api/admin/demos/preview`. Green "Live" dot indicator. Shows compiled public site in browser chrome. Mobile preview below (smaller, from previous default or current selection).

## Step 3: Mobile Template

**Config panel content:** Same layout as Step 2, filtered to `variant: 'mobile'` templates.

**Preview panel:** Public site preview **dims to 50% opacity**. Mobile preview gets a **blue highlight ring** — visual focus follows the current step's subject. Mobile preview shows compiled template.

## Step 4: Review

**Config panel content:**
- Header: "Here's what {name} will see"
- Summary card (muted surface, 3x2 grid): Community, Type, Content Focus, Branding (color swatches + font), Public Template, Mobile Template
- Quick-edit chips below summary: "Edit Basics", "Change Public Template", "Change Mobile Template" — each navigates back to the respective step
- No additional form inputs

**Preview panel:** Both public and mobile previews shown at full prominence (no dimming). The expand-to-modal button here is especially useful for a final full-size review before generating.

**CTA:** "Create Demo" (primary, slightly larger text weight)

## UX Improvements from Research

### From PatternFly Wizard Guidelines
1. **Validate on Next press** — not just blur. If user clicks Next without touching a required field, show all errors and prevent navigation.
2. **Cancel always visible** — footer includes Cancel as tertiary link on every step.
3. **Step error states** — if user navigates back and invalidates a completed step, the stepper pill reflects the error.
4. **"Next" becomes "Create Demo"** on the final step — clear terminal action naming.

### From IBM Carbon Form Patterns
5. **Focus first input on mount** — `prospect-name` input gets focus on Step 1, not the heading. Headings get focus on Steps 2-4 (no primary input).
6. **Right-aligned primary actions** — Next button right, Cancel + Back grouped left.
7. **Helper text over placeholder** — input helper text is always visible below the field. Placeholders are hints only.

### From Front-End Design Checklist
8. **All button states** — normal, hover, focused, pressed, loading, disabled. Next button shows loading spinner during compilation/generation.
9. **Required/optional indicators** — required asterisk on Community Name; "Optional" badge on CRM/Notes section.

### From Magic UI / Micro-interactions
10. **Animated connector** — pill stepper transitions: completed pill animates from numbered to checkmark with scale(0→1) at 150ms.
11. **Step transition** — content fades/slides with 250ms `--duration-standard` ease. Respects `prefers-reduced-motion`.
12. **Scroll to top** — every step transition scrolls config panel to top.

### Additional UX
13. **Enter key triggers Next** — when form is valid and a single-line `<input>` is focused, Enter advances to next step. Does NOT apply to `<textarea>` elements (CRM Notes) where Enter creates newlines.
14. **Unsaved changes guard** — `beforeunload` handler warns if user tries to navigate away mid-wizard.
15. **aria-live announcements** — screen reader announces step transitions via `aria-live="polite"` region.

## Creating State

After "Create Demo" is clicked:
- Footer buttons disabled, primary shows spinner + "Creating..."
- Config panel shows phased progress: "Configuring community → Building templates → Finalizing..."
- Preview panel stays visible (last compiled state)
- On success, redirects to `/demo/{id}/preview`

## Files Changed

| File | Change |
|------|--------|
| `apps/admin/src/app/demo/new/page.tsx` | Rewrite: side-by-side layout, resizable panes, step routing |
| `apps/admin/src/components/demo/WizardStepper.tsx` | Replace dot stepper with pill stepper |
| `apps/admin/src/components/demo/WizardFooter.tsx` | Add Cancel link, group Back+Cancel left. Add `loading?: boolean` prop — when true, primary button shows spinner + "Creating..." text and all buttons are disabled. |
| `apps/admin/src/components/demo/BasicsStep.tsx` | Segmented control for type, content focus card grid, input focus on mount, validate-on-Next |
| `apps/admin/src/components/demo/PublicSiteStep.tsx` | Context line, template grid (unchanged from current) |
| `apps/admin/src/components/demo/MobileStep.tsx` | Same as PublicSiteStep for mobile variant |
| `apps/admin/src/components/demo/PreviewStep.tsx` | Refactor into ReviewStep: file rename `PreviewStep.tsx` → `ReviewStep.tsx`, component name `PreviewStep` → `ReviewStep`. Step ID stays `'preview'` (internal, not user-facing). Add summary card + quick-edit chips. Remove own Back/Generate buttons — use shared `WizardFooter` instead. The `onBack` and `onGenerated` callbacks move to the page-level step navigation. |
| `apps/admin/src/components/demo/PreviewPanel.tsx` | **New** — right-side preview with browser chrome + phone frame, expand-to-modal, dimming logic |
| `apps/admin/src/components/demo/ResizableSplit.tsx` | **New** — resizable split pane container with drag handle + localStorage persistence |
| `apps/admin/src/components/demo/PreviewModal.tsx` | **New** — full-viewport modal for expanded preview with public/mobile tabs |

## Out of Scope

- Template visual builder/editor
- Real-time collaborative editing
- Dark mode (admin app doesn't have it)
- Mobile responsive breakpoints for admin (desktop-only)
- Changing the existing template registry or compilation pipeline
- New API endpoints (uses existing `/api/admin/demos/preview`)

## Edge Cases

- **Community type change resets progress:** Changing type on Step 1 after completing Steps 2/3 resets template selections to new defaults AND clears completed state for Steps 2-3.
- **Resize handle keyboard accessible:** Handle is focusable with `aria-label="Resize panels"`, `role="separator"`, `aria-valuenow` (current % of config panel), `aria-valuemin="40"`, `aria-valuemax="75"`. Arrow Left/Right adjust width in 2% increments (scales with viewport).
- **Preview compilation failure:** Show error state in preview panel with retry button. Don't block step navigation.
- **Slow compilation:** Show skeleton shimmer in preview panel during compilation. User can continue configuring while preview loads.
- **Browser chrome dots:** The macOS-style dots (`#ff5f57`, `#febc2e`, `#28c840`) are decorative and exempt from semantic token requirements.
- **localStorage resize persistence:** If saved ratio is outside min/max bounds (e.g., screen size changed), clamp to nearest valid ratio.

## Acceptance Criteria

1. Side-by-side layout with 55/45 default split
2. Resize handle is draggable and persists ratio in localStorage
3. Expand button opens preview in full-viewport modal
4. Pill stepper shows completed/active/upcoming/error states
5. Content focus uses descriptive 2x2 card grid (not bare pills)
6. Community type uses segmented control with full words
7. Preview panel updates live as configuration changes
8. Step 3 dims public preview and highlights mobile preview
9. Review step has summary card + quick-edit chips
10. Footer has Cancel + Back (left) and Next/Create (right) on all steps
11. Validate on Next press (not just blur)
12. Focus first input on Step 1 mount
13. Enter key advances to next step when valid
14. Scroll to top on step transitions
15. All interactive elements have `:focus-visible` ring
16. Animations respect `prefers-reduced-motion`
