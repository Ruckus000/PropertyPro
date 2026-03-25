# Implementation Plan: Demo Wizard UX Redesign

**Spec:** `docs/superpowers/specs/2026-03-25-demo-wizard-ux-redesign.md`
**Approach:** Incremental refactor — extract components one at a time, verify nothing breaks between each step.

## Pre-flight

- [ ] Create feature branch: `feat/wizard-ux-redesign`
- [ ] Run `pnpm typecheck && pnpm lint && pnpm build` to confirm clean baseline
- [ ] Verify dev server starts and current wizard works end-to-end

## Phase 1: Design System Component Adoption (no behavior changes)

### Task 1.1: Fix BrandingFormFields tokens
**File:** `apps/admin/src/components/demo/BrandingFormFields.tsx`
**Do:** Replace all raw Tailwind colors with semantic CSS variables. No layout or behavior changes.
**Verify:** Component renders identically; `pnpm typecheck` passes.

### Task 1.1b: Fix BrandingEditSection tokens
**File:** `apps/admin/src/components/demo/BrandingEditSection.tsx`
**Do:** Same token fixes — `text-gray-400` → `text-[var(--text-disabled)]`, `bg-blue-600` → `bg-[var(--interactive-primary)]`, `border-gray-300` → `border-[var(--border-strong)]`, `text-red-600` → `text-[var(--status-danger)]`, `text-green-600` → `text-[var(--status-success)]`.
**Verify:** Component renders identically; `pnpm typecheck` passes.

### Task 1.2: Fix TemplateCard — add bestFor, use Card component, responsive grid
**File:** `apps/admin/src/components/demo/TemplateCard.tsx`
**Do:**
- Import and use `Card` from `@propertypro/ui` with `interactive` + `selected` props
- Add `bestFor` text between name and tags
- Remove fixed `w-[180px]` wrapper from parent (page.tsx) — card fills grid cell
**Verify:** Cards render with bestFor text, selection works, `pnpm typecheck` passes.

### Task 1.3: Fix community type labels
**File:** `apps/admin/src/app/demo/new/page.tsx`
**Do:** Change `COMMUNITY_TYPES` array: `'Apt'` → `'Apartment'`
**Verify:** Toggle shows full word.

## Phase 2: Extract Step Components

### Task 2.1: Create WizardStepper component
**File:** `apps/admin/src/components/demo/WizardStepper.tsx` (new)
**Do:**
- Accept `steps` array, `currentStep`, `onStepClick` props
- Render numbered dots (28px), labels, flex connector lines
- States: complete (green + checkmark), active (primary + number), upcoming (muted)
- Completed steps clickable, upcoming not
- `aria-current="step"` on active, `aria-label` on completed
- Use `Button` from `@propertypro/ui` or styled `<button>` for completed step dots
**Verify:** Renders correctly in isolation (can test by dropping into current page temporarily).

### Task 2.2: Create WizardFooter component
**File:** `apps/admin/src/components/demo/WizardFooter.tsx` (new)
**Do:**
- Accept `onBack`, `onNext`, `nextLabel`, `nextDisabled`, `showBack` props
- `position: sticky; bottom: 0` with `bg-surface-card` + top border
- Back: `Button` secondary + `ArrowLeft` icon. Hidden when `showBack=false`.
- Next: `Button` primary with dynamic label
**Verify:** Sticky behavior works in scroll context.

### Task 2.3: Create BasicsStep component
**File:** `apps/admin/src/components/demo/BasicsStep.tsx` (new)
**Do:**
- Extract prospect name input, community type toggle, content focus pills from page.tsx
- Add inline validation: on blur, if empty, show error below input
- Add branding summary row with "Customize" expand/collapse (animated height)
- Add optional fields collapsible section (animated height)
- Section labels as `<h2>` with `id` for `aria-labelledby`
- Use `Button` for community type toggle (secondary variant, active styling)
**Verify:** All fields update config state correctly; validation fires on blur.

### Task 2.4: Create PublicSiteStep component
**File:** `apps/admin/src/components/demo/PublicSiteStep.tsx` (new)
**Do:**
- Context line: "For **{name}** ({type})"
- Template grid with responsive `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`
- Uses updated TemplateCard from Task 1.2
- Filtered to `variant: 'public'`
**Verify:** Template selection updates config state.

### Task 2.5: Create MobileStep component
**File:** `apps/admin/src/components/demo/MobileStep.tsx` (new)
**Do:** Same as PublicSiteStep but filtered to `variant: 'mobile'`.
**Verify:** Template selection updates config state.

## Phase 3: Wire Up the Wizard

### Task 2.6: Extract PreviewStep to its own file
**File:** `apps/admin/src/components/demo/PreviewStep.tsx` (new)
**Do:** Move the existing `PreviewStep` function from `page.tsx` into its own file. Replace hand-rolled buttons with `Button` component. Fix `--status-error` → `--status-danger` on the required asterisk.
**Verify:** Preview step renders correctly; preview compilation and generate flow still work.

### Task 3.1: Refactor page.tsx into 4-step wizard
**File:** `apps/admin/src/app/demo/new/page.tsx`
**Do:**
- Change `WizardStep` type to `'basics' | 'public-site' | 'mobile' | 'preview' | 'creating'`
- Replace inline configure JSX with step component renders
- Wire WizardStepper + WizardFooter
- Replace back link with `Button` ghost variant + `ArrowLeft`
- Handle step navigation: Next advances, Back goes previous, stepper dots navigate to completed steps (backward only — cannot jump forward past current step)
- Handle community type change: if user changes type in Basics after having been to template steps, reset template selections to new defaults AND reset wizard progress back to Step 1 (clear completed state for Steps 2-3)
- Focus management: on step transition, move focus to the step's `<h2>` heading
- `CreatingState` stays inline in page.tsx
**Verify:** Full wizard flow works end-to-end: fill basics → pick public template → pick mobile template → preview → generate.

### Task 3.2: Add collapsible section animation
**Do:** Implement animated expand/collapse for branding section and optional fields in BasicsStep.
- Use `grid-template-rows: 0fr → 1fr` CSS transition pattern
- `transition: grid-template-rows var(--duration-standard) var(--ease-standard)`
- Wrapper div with `overflow: hidden` on the child
- Respect `prefers-reduced-motion` (durations go to 0ms via existing CSS)
**Verify:** Expand/collapse animates smoothly; instant with reduced motion.

## Phase 4: Cleanup & Verify

### Task 4.1: Remove dead code
**Do:**
- Delete old `ProgressBar` component from page.tsx
- Delete old `SectionLabel` component from page.tsx
- Delete old `CollapsibleSection` component from page.tsx
- Remove any unused imports
**Verify:** `pnpm typecheck && pnpm lint` pass.

### Task 4.2: Full regression test
**Do:**
- `pnpm typecheck` — all packages
- `pnpm lint` — includes DB access guard
- `pnpm build` — production build succeeds
- Manual flow: create a demo end-to-end through all 4 steps
- Verify: branding customization works, preview renders, demo generates
**Verify:** All CI checks would pass.

## Review Checkpoints

- **After Phase 1:** Design system adoption complete, no behavior changes. Good stopping point for review.
- **After Phase 2:** All step components exist. Can be reviewed individually.
- **After Phase 3:** Wizard is fully wired. Full flow works.
- **After Phase 4:** Clean, ready for PR.

## Risk Notes

- `PreviewStep` is already a separate component — minimal changes needed there
- `BrandingFormFields` has blob URL logic for logo upload pre-community-creation — don't break this
- Template defaults reset on community type change — must work correctly when type changes on Step 1 after templates were picked on Steps 2/3
- The admin app doesn't have the same design system CSS loaded as the main web app — verify that semantic CSS variables are available in the admin app's global styles
