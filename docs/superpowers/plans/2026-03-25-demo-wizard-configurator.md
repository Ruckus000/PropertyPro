# Demo Wizard Side-by-Side Configurator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the demo creation wizard into a side-by-side configurator with resizable split panes, live preview panel, pill stepper, and 15 UX improvements.

**Architecture:** Resizable split layout (55/45 default) wrapping the existing step components. New `ResizableSplit` container, `PreviewPanel` (right side), `PreviewModal` (expand), and `PillStepper` (replacing dot stepper). Existing step components get targeted refactors (content focus cards, segmented control, validate-on-Next). Page-level state management unchanged — config object flows down, mutations via callbacks.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, @propertypro/ui (Button, Card, PhoneFrame), existing compilation pipeline (`/api/admin/demos/preview`)

**Spec:** `docs/superpowers/specs/2026-03-25-demo-wizard-configurator-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `apps/admin/src/components/demo/ResizableSplit.tsx` | Resizable split pane container with drag handle + localStorage persistence |
| `apps/admin/src/components/demo/PreviewPanel.tsx` | Right-side live preview: browser chrome, phone frame, loading/empty states, expand button |
| `apps/admin/src/components/demo/PreviewModal.tsx` | Full-viewport modal overlay with public/mobile tabs for expanded preview |
| `apps/admin/src/components/demo/PillStepper.tsx` | Pill-badge step indicator replacing WizardStepper |
| `apps/admin/src/components/demo/ReviewStep.tsx` | Summary card + quick-edit chips (replaces PreviewStep's role on step 4) |

### Modified Files
| File | Change |
|------|--------|
| `apps/admin/src/components/demo/BasicsStep.tsx` | Content focus 2x2 card grid, segmented control for type, focus first input on mount, validate-on-Next |
| `apps/admin/src/components/demo/WizardFooter.tsx` | Add Cancel link, `loading` prop, group Back+Cancel left |
| `apps/admin/src/components/demo/PreviewStep.tsx` | Gut internal Back/Generate buttons, export preview-loading logic as hook for PreviewPanel |
| `apps/admin/src/components/demo/PublicSiteStep.tsx` | Already has context line — no changes needed (verified) |
| `apps/admin/src/components/demo/MobileStep.tsx` | Already has context line — no changes needed (verified) |
| `apps/admin/src/app/demo/new/page.tsx` | Full rewrite: ResizableSplit layout, PillStepper, PreviewPanel, debounced preview, step validation, Enter-to-advance, scroll reset, beforeunload guard, step transition animations, errorSteps computation |

### Deleted Files
| File | Reason |
|------|--------|
| `apps/admin/src/components/demo/WizardStepper.tsx` | Replaced by PillStepper |

---

## Task 1: ResizableSplit Container

**Files:**
- Create: `apps/admin/src/components/demo/ResizableSplit.tsx`

- [ ] **Step 1: Create ResizableSplit component**

Create `apps/admin/src/components/demo/ResizableSplit.tsx`:

```tsx
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultRatio?: number;       // 0-100, default 55
  minLeft?: number;            // minimum % for left, default 40
  maxLeft?: number;            // maximum % for left, default 75
  storageKey?: string;         // localStorage key for persistence
  className?: string;
}
```

Render a flex container with:
- Left panel: `flex: 0 0 {ratio}%`
- Drag handle: 6px wide, `cursor: col-resize`, `role="separator"`, `aria-label="Resize panels"`, `aria-valuenow={ratio}`, `aria-valuemin={minLeft}`, `aria-valuemax={maxLeft}`, dot-pattern visual (5 dots vertically). Focusable (`tabIndex={0}`).
- Right panel: `flex: 1`
- Mouse drag: `onMouseDown` on handle → `onMouseMove` on document → calculate ratio from `clientX` relative to container width → clamp to min/max → update state
- Keyboard: Arrow Left/Right on focused handle adjusts by 2%
- localStorage: read initial ratio from `storageKey` on mount, write on drag end
- Cleanup: remove mousemove/mouseup listeners on unmount

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/ResizableSplit.tsx
git commit -m "feat(demo): ResizableSplit container with drag handle and localStorage persistence"
```

---

## Task 2: PillStepper Component

**Files:**
- Create: `apps/admin/src/components/demo/PillStepper.tsx`

- [ ] **Step 1: Create PillStepper component**

Create `apps/admin/src/components/demo/PillStepper.tsx`:

```tsx
'use client';

import { Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PillStep {
  id: string;
  label: string;
}

interface PillStepperProps {
  steps: PillStep[];
  currentStep: string;
  completedSteps: Set<string>;
  errorSteps?: Set<string>;
  onStepClick: (stepId: string) => void;
}
```

Render a horizontal flex row of pill badges:
- **Active pill:** `bg-[var(--interactive-primary)]` white text, numbered badge circle inside (white/30% opacity background)
- **Completed pill:** `bg-[color:var(--status-success-bg,#dcfce7)]` green text, Check icon (12px), clickable → calls `onStepClick`
- **Error pill:** `border-2 border-[var(--status-danger)]` danger text, AlertTriangle icon, clickable
- **Upcoming pill:** `bg-[var(--surface-muted)]` secondary text, numbered badge, not clickable (`pointer-events-none`)
- All pills: `rounded-full px-3.5 py-1.5 text-xs font-medium`, flex row with `gap-2`
- Completed pills get `cursor-pointer`, upcoming get `cursor-default`
- `aria-current="step"` on active pill

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/PillStepper.tsx
git commit -m "feat(demo): PillStepper component with completed/active/error/upcoming states"
```

---

## Task 3: PreviewPanel Component

**Files:**
- Create: `apps/admin/src/components/demo/PreviewPanel.tsx`

- [ ] **Step 1: Create PreviewPanel component**

Create `apps/admin/src/components/demo/PreviewPanel.tsx`:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { PhoneFrame } from '@propertypro/ui';

interface PreviewPanelProps {
  publicHtml: string | null;
  mobileHtml: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onExpand: () => void;
  /** Which preview to visually emphasize: 'public' | 'mobile' | 'both' */
  emphasis?: 'public' | 'mobile' | 'both';
  /** When true, show placeholder instead of compiled preview */
  empty?: boolean;
  emptyMessage?: string;
}
```

Render:
- Header bar: "LIVE PREVIEW" label (uppercase, 10px, letter-spacing) + green dot when not loading/error + expand button (Maximize2 icon, 24px bordered square)
- Empty state (when `empty=true`): centered muted text message with default gradient background hint
- Loading state: shimmer overlay on existing content (or skeleton if no content yet)
- Error state: danger alert with retry button
- Public site preview: browser chrome (3 macOS dots — `#ff5f57`, `#febc2e`, `#28c840` — these are decorative, exempt from tokens) + iframe with `srcDoc={publicHtml}`, `sandbox="allow-scripts allow-same-origin"`. Label above: "Public Website — {templateName}" with green dot when emphasis is 'public' or 'both'.
- Mobile preview: PhoneFrame with blob URL built from `mobileHtml`. Label above. When `emphasis='mobile'`, add `ring-2 ring-[var(--interactive-primary)]` around the phone frame and dim public preview to `opacity-50`.
- When `emphasis='public'` or `'both'`, both at full opacity.
- Blob URL management: create on html change, revoke on unmount/change via `useEffect` cleanup.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/PreviewPanel.tsx
git commit -m "feat(demo): PreviewPanel with browser chrome, phone frame, emphasis modes, and empty/loading/error states"
```

---

## Task 4: PreviewModal Component

**Files:**
- Create: `apps/admin/src/components/demo/PreviewModal.tsx`

- [ ] **Step 1: Create PreviewModal component**

Create `apps/admin/src/components/demo/PreviewModal.tsx`:

Follow the same hand-rolled modal pattern as `ConvertDemoDialog.tsx` (no shadcn dialog in admin app):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PhoneFrame } from '@propertypro/ui';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  publicHtml: string | null;
  mobileHtml: string | null;
}
```

Render (when `isOpen`):
- Backdrop: fixed inset-0, `bg-black/60`, `z-50`, click-to-close
- Modal: fixed, centered, `max-w-[960px] w-[90vw] max-h-[90vh]`, `rounded-[var(--radius-lg)]`, `bg-surface-card`, `shadow-[var(--elevation-e3)]`
- Header: "Preview" title + tab buttons ("Public Site" / "Mobile App") + close button (X icon)
- Tab content — Public: full-width iframe in browser chrome, `height: 70vh`. Mobile: centered PhoneFrame at full scale.
- Trap focus inside modal (`useEffect` with keydown listener for Escape → close)
- Body scroll lock: `document.body.style.overflow = 'hidden'` on open, restore on close
- Blob URL management for mobile iframe (same pattern as PreviewPanel)

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/PreviewModal.tsx
git commit -m "feat(demo): PreviewModal full-viewport overlay with public/mobile tabs"
```

---

## Task 5: WizardFooter Updates

**Files:**
- Modify: `apps/admin/src/components/demo/WizardFooter.tsx`

- [ ] **Step 1: Update WizardFooter props and layout**

Modify `apps/admin/src/components/demo/WizardFooter.tsx`:
- Add props: `onCancel: () => void`, `loading?: boolean`
- Layout: left group = Cancel (text link, `text-xs text-[var(--text-secondary)]`) + Back button (existing). Right = Next button (existing).
- When `loading=true`: primary button shows `Loader2` spinner + "Creating...", all buttons `disabled`
- Cancel is always visible (hidden on no-op — parent passes empty handler or omits)

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/WizardFooter.tsx
git commit -m "refactor(demo): WizardFooter — add Cancel link, loading state, left-grouped Back+Cancel"
```

---

## Task 6: BasicsStep Refactor

**Files:**
- Modify: `apps/admin/src/components/demo/BasicsStep.tsx`

- [ ] **Step 1: Replace content focus pills with 2x2 card grid**

In `BasicsStep.tsx`, replace the content focus pills section. Instead of `<button>` pills, render a 2x2 grid of cards using the `label` and `description` fields from `getContentStrategies()`:

```tsx
<div className="grid grid-cols-2 gap-2">
  {contentStrategies.map((s) => {
    const isSelected = s.id === config.contentStrategy;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => onConfigChange((prev) => ({ ...prev, contentStrategy: s.id }))}
        className={cn(
          'rounded-[10px] p-3 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]',
          isSelected
            ? 'border-2 border-[var(--interactive-primary)] bg-[var(--interactive-subtle)]'
            : 'border border-[var(--border-default)] bg-[var(--surface-card)]',
        )}
        aria-pressed={isSelected}
      >
        <div className={cn('text-sm font-semibold', isSelected ? 'text-[var(--interactive-primary)]' : 'text-[var(--text-primary)]')}>
          {s.label}
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-1">{s.description}</div>
      </button>
    );
  })}
</div>
```

- [ ] **Step 2: Replace community type toggle with segmented control**

Replace the `Button` toggle group with a single segmented control container:

```tsx
<div className="flex border border-[var(--border-default)] rounded-[10px] overflow-hidden">
  {COMMUNITY_TYPES.map(({ type, label }) => (
    <button
      key={type}
      type="button"
      onClick={() => onCommunityTypeChange(type)}
      className={cn(
        'flex-1 py-2.5 text-sm font-medium transition-colors text-center',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--interactive-primary)]',
        config.communityType === type
          ? 'bg-[var(--interactive-primary)] text-white'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]',
        type !== COMMUNITY_TYPES[0].type && 'border-l border-[var(--border-default)]',
      )}
      aria-pressed={config.communityType === type}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Focus first input on mount (not heading)**

Change `headingRef` focus to `inputRef` focus:

```tsx
const inputRef = useRef<HTMLInputElement>(null);

useEffect(() => {
  inputRef.current?.focus();
}, []);

// On the input element:
<input ref={inputRef} id="prospect-name" ... />
```

Remove the `headingRef` and its `tabIndex={-1}` from the `<h2>`.

- [ ] **Step 4: Add validate-on-Next support**

Add a new prop `validateOnNext?: boolean` and a callback `onValidationFail?: () => void`. Export a `validate()` function or use an imperative handle. Simpler approach: add `triggerValidation` prop (number that increments when Next is pressed). When it changes, force-show validation errors:

```tsx
const [forceValidation, setForceValidation] = useState(false);

useEffect(() => {
  if (triggerValidation > 0) setForceValidation(true);
}, [triggerValidation]);

const nameError = (nameBlurred || forceValidation) && !config.prospectName.trim();
```

Add `triggerValidation?: number` to BasicsStep props.

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/components/demo/BasicsStep.tsx
git commit -m "refactor(demo): BasicsStep — content focus card grid, segmented control, input focus, validate-on-Next"
```

---

## Task 7: ReviewStep Component

**Files:**
- Create: `apps/admin/src/components/demo/ReviewStep.tsx`

- [ ] **Step 1: Create ReviewStep component**

Create `apps/admin/src/components/demo/ReviewStep.tsx` — the summary/review content for Step 4:

```tsx
'use client';

import { useRef, useEffect } from 'react';
import {
  getTemplateById,
  getStrategyById,
  type CommunityType,
} from '@propertypro/shared';
import type { BrandingValues } from './BrandingFormFields';

interface ReviewStepConfig {
  prospectName: string;
  communityType: CommunityType;
  publicTemplateId: string;
  mobileTemplateId: string;
  contentStrategy: string;
  branding: BrandingValues;
}

interface ReviewStepProps {
  config: ReviewStepConfig;
  onEditStep: (stepId: string) => void;
}
```

Render:
- Heading: "Here's what {name} will see" + subtitle
- Summary card (`bg-surface-muted`, rounded-12, p-4): 3x2 grid with muted labels + values. Community, Type, Content Focus, Branding (3 color swatches + font name), Public Template, Mobile Template.
- Quick-edit chips below: "Edit Basics", "Change Public Template", "Change Mobile Template" — each calls `onEditStep('basics')`, `onEditStep('public-site')`, `onEditStep('mobile')`.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/demo/ReviewStep.tsx
git commit -m "feat(demo): ReviewStep with summary card and quick-edit navigation chips"
```

---

## Task 8a: Page Layout Rewrite

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx`

- [ ] **Step 1: Replace layout with ResizableSplit**

Rewrite page.tsx to use `ResizableSplit`:
- Left panel: header + PillStepper + step content + WizardFooter
- Right panel: PreviewPanel
- Import all new components: `ResizableSplit`, `PillStepper`, `PreviewPanel`, `PreviewModal`, `ReviewStep`
- Remove old imports: `WizardStepper`

- [ ] **Step 2: Add debounced preview compilation**

Add preview state and debounced fetch:

```tsx
const [previewHtml, setPreviewHtml] = useState<{ publicHtml: string; mobileHtml: string } | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);
const [previewError, setPreviewError] = useState<string | null>(null);
const debounceRef = useRef<ReturnType<typeof setTimeout>>();

function fetchPreview() {
  if (!config.prospectName.trim()) return;
  setPreviewLoading(true);
  setPreviewError(null);
  fetch('/api/admin/demos/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      communityType: config.communityType,
      publicTemplateId: config.publicTemplateId,
      mobileTemplateId: config.mobileTemplateId,
      prospectName: config.prospectName,
      branding: config.branding,
    }),
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error.message ?? 'Preview failed');
      setPreviewHtml(data);
    })
    .catch((err: Error) => setPreviewError(err.message))
    .finally(() => setPreviewLoading(false));
}

// Debounce: 500ms after last config change
useEffect(() => {
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(fetchPreview, 500);
  return () => clearTimeout(debounceRef.current);
}, [config.prospectName, config.communityType, config.publicTemplateId, config.mobileTemplateId, config.branding]);
```

- [ ] **Step 3: Wire PreviewModal and emphasis**

```tsx
const [modalOpen, setModalOpen] = useState(false);
const previewEmphasis = step === 'mobile' ? 'mobile' : step === 'public-site' ? 'public' : 'both';
const previewEmpty = !config.prospectName.trim();
```

Wire `onExpand={() => setModalOpen(true)}` to PreviewPanel. Render `<PreviewModal>` with html props.

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/demo/new/page.tsx
git commit -m "feat(demo): page layout rewrite — ResizableSplit, PillStepper, debounced preview, PreviewPanel"
```

---

## Task 8b: UX Enhancements

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx`

- [ ] **Step 1: Wire validate-on-Next for Basics step**

```tsx
const [basicsTrigger, setBasicsTrigger] = useState(0);

function goNext() {
  if (step === 'basics') {
    if (!config.prospectName.trim()) {
      setBasicsTrigger(prev => prev + 1);
      return;
    }
  }
  // ... existing step advancement logic
}
```

Pass `triggerValidation={basicsTrigger}` to `BasicsStep`.

- [ ] **Step 2: Compute errorSteps for stepper**

When the user navigates back and invalidates a completed step, reflect it in the stepper:

```tsx
const errorSteps = new Set<string>();
if (completedSteps.has('basics') && !config.prospectName.trim()) {
  errorSteps.add('basics');
}
```

Pass `errorSteps={errorSteps}` to `PillStepper`.

- [ ] **Step 3: Add Enter key handler (single-line inputs only)**

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      goNext();
    }
  }
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [step, config]);
```

- [ ] **Step 4: Add scroll reset + beforeunload + aria-live**

```tsx
// Scroll reset
const contentRef = useRef<HTMLDivElement>(null);
// In goNext and goBack:
contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

// Beforeunload
useEffect(() => {
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (config.prospectName.trim() || step !== 'basics') {
      e.preventDefault();
    }
  }
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [config.prospectName, step]);

// Aria-live region in JSX:
<div aria-live="polite" className="sr-only">
  {`Step ${STEP_ORDER.indexOf(step) + 1} of ${STEP_ORDER.length}: ${WIZARD_STEPS.find(s => s.id === step)?.label}`}
</div>
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/demo/new/page.tsx
git commit -m "feat(demo): UX enhancements — validate-on-Next, errorSteps, Enter key, scroll reset, beforeunload, aria-live"
```

---

## Task 8c: ReviewStep Wiring + Generation + Animations

**Files:**
- Modify: `apps/admin/src/app/demo/new/page.tsx`
- Modify: `apps/admin/src/components/demo/PillStepper.tsx` (add animation)

- [ ] **Step 1: Wire ReviewStep for step 4**

When `step === 'preview'`, render `<ReviewStep>` with summary card + quick-edit chips. Move the generation fetch-and-redirect logic from PreviewStep into page.tsx:

```tsx
const [generating, setGenerating] = useState(false);
const [generateError, setGenerateError] = useState('');

async function handleGenerate() {
  setGenerating(true);
  setGenerateError('');
  try {
    const res = await fetch('/api/admin/demos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType: config.communityType,
        prospectName: config.prospectName,
        branding: config.branding,
        publicTemplateId: config.publicTemplateId,
        mobileTemplateId: config.mobileTemplateId,
        contentStrategy: config.contentStrategy,
        externalCrmUrl: config.crmUrl || undefined,
        prospectNotes: config.notes || undefined,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message ?? 'Failed');
    router.push(`/demo/${data.id ?? data.demoId}/preview`);
  } catch (err) {
    setGenerateError(err instanceof Error ? err.message : 'Something went wrong');
    setGenerating(false);
  }
}
```

Wire WizardFooter: `nextLabel="Create Demo"`, `loading={generating}`, `onNext={handleGenerate}` when on review step.

- [ ] **Step 2: Add phased progress for Creating state**

When `generating` is true, show phased progress in the left panel above the ReviewStep content:

```tsx
{generating && (
  <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-muted)] p-4 mb-4">
    <div className="flex items-center gap-3">
      <div className="h-5 w-5 rounded-full border-2 border-[var(--border-default)] border-t-[var(--interactive-primary)] animate-spin" />
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Creating demo...</p>
        <p className="text-xs text-[var(--text-secondary)]">Configuring community → Building templates → Finalizing</p>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Add step transition animation**

Wrap step content in an animated container. Use CSS transition on opacity + transform:

```tsx
<div
  key={step}
  className="animate-in fade-in slide-in-from-right-2 duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:animate-none"
>
  {/* step content */}
</div>
```

If `tailwindcss-animate` is not available, use inline CSS transition with a state toggle:

```tsx
const [visible, setVisible] = useState(true);

// On step change: set visible=false, wait 100ms, change step, set visible=true
// Or simpler: use key={step} to force React to remount with CSS animation
```

The simpler approach: use `key={step}` on the wrapper div and define a CSS `@keyframes fadeSlideIn` in the admin app's globals.css:

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
.step-animate { animation: fadeSlideIn var(--duration-standard, 250ms) ease; }
@media (prefers-reduced-motion: reduce) { .step-animate { animation: none; } }
```

- [ ] **Step 4: Add pill stepper completion animation**

In `PillStepper.tsx`, add transition to the completed pill checkmark:

```tsx
// Completed pill check icon wrapper:
<span className="inline-flex transition-transform duration-150 ease-out motion-reduce:transition-none"
      style={{ transform: 'scale(1)' }}>
  <Check size={12} />
</span>
```

The animation fires naturally via React remount when a pill transitions from numbered to checkmark (the `key` on each pill already causes this). For a more explicit scale-in, add:

```css
@keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
```

And apply `animate-[scaleIn_150ms_ease-out]` to the Check icon wrapper with `motion-reduce:animate-none`.

- [ ] **Step 5: Verify typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/app/demo/new/page.tsx apps/admin/src/components/demo/PillStepper.tsx apps/admin/src/styles/globals.css
git commit -m "feat(demo): ReviewStep wiring, phased creating progress, step transition + pill animations"
```

---

## Task 9: Cleanup & Verify

- [ ] **Step 1: Delete old WizardStepper**

```bash
rm apps/admin/src/components/demo/WizardStepper.tsx
```

Verify no remaining imports reference it:

Run: `grep -r "WizardStepper" apps/admin/src/`
Expected: No matches

- [ ] **Step 2: Clean up old PreviewStep if fully replaced**

If `PreviewStep.tsx` is no longer imported anywhere, delete it. If parts are reused (preview-loading hook), keep it but remove the dead UI code.

Run: `grep -r "PreviewStep" apps/admin/src/`

- [ ] **Step 3: Run full verification**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

Run: `pnpm build 2>&1 | grep "Compiled successfully"`
Expected: `✓ Compiled successfully` (pre-existing build failure in `/api/admin/demos` route is unrelated)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(demo): cleanup — remove old WizardStepper, dead PreviewStep code"
```
