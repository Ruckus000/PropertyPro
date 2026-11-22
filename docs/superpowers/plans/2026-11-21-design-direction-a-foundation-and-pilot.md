# Design Direction, Plan A: Foundation and Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest page kit the pilot needs and an owner-only preview gate, then rebuild Emergency Alerts, Packages and Visitors on it so the owner can judge the design direction in the real app before anything else is migrated.

**Architecture:** New kit parts are added beside the existing ones in `packages/ui/src/components/shared/`; nothing existing is edited there and `packages/ui` gains no new package dependency, so admin cannot change. Each pilot page keeps its current view and gains a second one that renders only for users on an environment allow-list, so customers see no change. Task 19 deletes the old views and the gate once the owner has decided; until then every branch point carries a `ponytail:` marker.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind with container-query variants, Vitest (jsdom for `packages/ui`), Playwright, `lucide-react`, `tsx` guard scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-page-anatomy-design.md`. Section numbers below (§) refer to it. Read §0, §3, §5, §11, §13, §14 and §16 before any task.

**This is Plan A of five.** The spec's rollout (§17) has nine workstreams. Plan A covers workstreams 1 to 3. The others are written after the owner approves the pilot, because the pilot fixes two layout thresholds and may change the design:

| Plan | Workstreams | Written when |
|---|---|---|
| A (this) | 1 kit and guard, 2 preview gate, 3 pilot | now |
| B | 4 shell, fixed coral, "Next deadline", the time-left chip, icons | pilot approved |
| C | 5 dashboard and settings, 6 lists, details, forms | pilot approved |
| D | 7 overlays and the help dialog | Plan C under way |
| E | 8 help center and outside frames | Plan C under way |

## Out of this plan

A part is built in the plan that first uses it. These have no user among the pilot pages, so do not build them here:

- **`daysLeft`, `formatTimeLeft`, `TimeLeft` (Plan B).** No pilot page shows a deadline. They arrive with "Next deadline", in the same pull request that moves `compliance-checklist-item.tsx` and `meeting-status.ts` onto the one formatter, so the app never holds a fourth rounding rule. Plan B must also decide where `TimeLeft` lives: `packages/ui` depends only on `@propertypro/tokens` today, and `EscalationTier` already exists in `packages/ui/src/tokens/compliance.ts`.
- **`Icon`, the icon registry and `guard:icons` (Plan B).** Web imports 124 distinct `lucide-react` icons across 232 files. A single registry map would put every one of them in each page's bundle, and `perf-check` has about 31 KiB of headroom. Plan B designs this with the shell. Here each pilot page passes the icon `nav-config.ts` already uses for its section.
- **`SectionRow`, `SectionGroup`, `SectionLinkRow` (Plan C).** They are the Settings shapes. Plan C re-points `apps/web/src/components/settings/settings-layout.tsx` onto the Section kit and deletes its six bodies in the same pull request, so the app does not keep two kits.
- **`PageTabs`.** Not built. Radix `Tabs` (`apps/web/src/components/ui/tabs.tsx`) already has the keyboard behaviour and the 44px floor; the Visitors pilot styles it.
- **`guard:panel-copy`.** Replaced by a type: a panel's "About" accepts only the value `describeAccess` returns (Tasks 7 and 10).
- **The hand-built-box count** from §16 (Plan C, when there are kit parts to migrate boxes onto).
- `RecordCard`, `StepStrip`, `StatuteChip` and the canvas section kinds (Plan C); the plan-locked, lapsed, denied and read-only states and the banner slot (Plan C; pilot pages keep their `FeatureGate` wrapper); the shell and fixed coral (Plan B); overlays and the help dialog (Plan D); print and outside frames (Plan E).
- **Rewriting `DESIGN.md` around the direction.** Done after the owner approves the pilot (Task 19). Plan A corrects only statements its own code makes false.

## What the pilot will not show

Say this to the owner when handing over the pilot, so its absence is not read as a result:

1. **The time-left chip.** None of the three pilot features has a deadline.
2. **The side panel beside a table on a laptop.** Packages and Visitors are table pages, whose panel moves beside the table only when the content box reaches 1280px. At a 1440px window with the rail open it stays a strip above. Emergency Alerts (rows) shows the panel beside the list.
3. **A "residents reachable" figure on Emergency Alerts.** The mockup drew one. Computing it means three whole-table reads on every page load, for an audience and severity the list page does not have, and the send rule (`emergency-broadcast-service.ts:203`) also requires a verified phone and consent. The pilot shows the recipient count of the last sent alert, which the page already loads.

## Pull requests

Six, opened and merged in this order, rebasing between each. The kit merges unused; if the owner rejects the pilot, Task 19 removes it.

| PR | Tasks | Contents |
|---|---|---|
| 1 | 2, 5, 6, 7, 8, 9 | the kit, and `PageHeader` painting inside a layout |
| 2 | 10, 11 | `describeAccess` and the preview gate |
| 3 | 13, 14 | Packages, both views |
| 4 | 15, 16a, 16b | Emergency Alerts: list, detail, new |
| 5 | 16c | Visitors |
| 6 | 12, 17 | `guard:page-template` and the proof at real size |

Task 12 runs after the pilot pages on purpose: its baseline is then written once, with the five pilot `page.tsx` files already passing.

## Global Constraints

- Work on branch `claude/component-design-modernization-2999df`.
- **No admin change.** Do not edit any existing file under `packages/ui/src/components/ui/`, any existing file in `packages/ui/src/components/shared/`, `packages/ui/src/constants/status.ts`, `packages/ui/package.json` or `packages/ui/tsup.config.ts`. Add new files only.
- Import kit parts by file path (`@propertypro/ui/components/shared/<file>`), never through the package barrel. Inside the kit, import `cn` from `../../utils/cn`. A server page that imports the barrel pulls every `'use client'` module into its route bundle (measured +40 KiB on `/settings`; see the comment at the top of `settings-layout.tsx`).
- Semantic token classes only. No raw hex, no slash-opacity on semantic tokens, no arbitrary pixel values. Every colour class must exist in `apps/web/tailwind.config.ts`.
- All sizes on the existing rem scale; nothing smaller than `text-xs`. Page title and headline figures `text-3xl`; rows, cells and meta `text-sm`; labels and stamps `text-xs` (§11.2).
- Coral (`bg-interactive`, `text-content-link`) only on the one primary button and on links. Selected states use ink (§11.3).
- Status is always a glyph plus a word (§13).
- Heading levels: `h1` page title, `h2` section titles and panel positions (§11.2).
- Controls are 44px below `md`; standalone links and icon buttons get `min-h-11 md:min-h-0` (§13).
- A pilot view states only what the current view already states or what its loaded data proves. Do not add a figure, a status or a warning the code does not compute today.
- Run one test file with `pnpm test <path>` (no `--`). For `packages/ui` use `pnpm --filter @propertypro/ui exec vitest run <path>`. Do not pipe a test command when you need its exit status.
- Never run integration tests against `.env.local` (it is production). Use `pnpm test:integration:local`.
- Every fix-shaped test gets a revert-check, recorded in the commit message (`.claude/rules/verification.md`).
- A deliberate shortcut carries a `ponytail:` comment naming the limit and an observable trigger.
- Before every push: run a security review and a code review of the diff (owner's standing rule).
- End commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Each task starts with a **pre-check**: one grep or read confirming the files and names it depends on still exist as written here. `main` moves fast. If a pre-check fails, stop and report; do not improvise.

## Review Focus

1. **A viewer who may not read a figure.** An owner on Emergency Alerts must not see recipient counts or the delivery report; a resident on Packages must not see management figures (pinned in Tasks 14, 15 and 16a).
2. **An "About" sentence that overclaims.** Residents see only their own packages and owners only the alerts sent to them; the sentence must say so, for every community type (pinned in Task 10).
3. **Zero records.** Every pilot page must render its header and a first-run section with no records, without a blank main column (pinned in Tasks 13 to 16).
4. **Very long text at the app's real size.** A 90-character package description must not make the page scroll sideways at 1280 and 1440 with large text on (pinned in Task 17).
5. **The preview gate failing or leaking.** If the check throws, the page renders the current view. The development-only cookie must do nothing in a production build (pinned in Task 11).

---

### Task 1: moved to Plan B

`daysLeft` and `formatTimeLeft` have no user among the pilot pages. See "Out of this plan". The number is kept so references in other tasks stay valid.

---

### Task 2: `StatusGlyph`

**Files:**
- Create: `packages/ui/src/components/shared/status-glyph.tsx`
- Test: `packages/ui/src/components/shared/__tests__/status-glyph.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export type StatusGlyphKind = 'not-started' | 'in-progress' | 'attention' | 'overdue' | 'done';
  export interface StatusGlyphProps { kind: StatusGlyphKind; label: string; hideLabel?: boolean; className?: string }
  export function StatusGlyph(props: StatusGlyphProps): JSX.Element;
  ```

Rules (§11.1, §13): the svg is `aria-hidden`, 1rem square (`size-4`), `stroke="currentColor"`. Colour by kind: `not-started` `text-content-tertiary`; `in-progress` `text-status-info`; `attention` `text-status-warning`; `overdue` `text-status-danger`; `done` `text-status-success`. The label always renders: visible in `text-sm` beside the glyph, or with `sr-only` when `hideLabel`. Shapes: dashed ring; ring with the right half filled; ring with an exclamation mark; solid disc with an exclamation mark in the card colour; solid disc with a check in the card colour.

- [ ] **Step 1: Pre-check.** `ls packages/ui/src/components/shared/__tests__` shows `empty-state.test.tsx`; open it for the render and import conventions.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusGlyph } from '../status-glyph';

describe('StatusGlyph', () => {
  it('always renders its word', () => {
    render(<StatusGlyph kind="overdue" label="Overdue" />);
    expect(screen.getByText('Overdue')).toBeVisible();
  });
  it('keeps the word for assistive tech when hidden', () => {
    render(<StatusGlyph kind="done" label="Posted" hideLabel />);
    expect(screen.getByText('Posted')).toHaveClass('sr-only');
  });
  it('hides the drawing from assistive tech', () => {
    const { container } = render(<StatusGlyph kind="in-progress" label="In progress" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('requires a label', () => {
    // @ts-expect-error label is required: status is never a glyph alone
    render(<StatusGlyph kind="done" />);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm --filter @propertypro/ui exec vitest run src/components/shared/__tests__/status-glyph.test.tsx` — FAIL, module not found.
- [ ] **Step 4: Implement** `StatusGlyph` as specified. No `"use client"`.
- [ ] **Step 5: Run to verify pass.** Same command — PASS, 4 tests. Then `pnpm --filter @propertypro/ui typecheck` — exit 0 (proves the `@ts-expect-error` is live).
- [ ] **Step 6: Commit.** `git commit -m "ui: StatusGlyph, five status marks that always carry a word"`

---

### Task 3: moved to Plan B

`TimeLeft` has no user among the pilot pages. See "Out of this plan". The number is kept so references in other tasks stay valid.

---

### Task 4: moved to Plan B

`Icon` and the icon registry need a bundle-size design first. See "Out of this plan". The number is kept so references in other tasks stay valid.

---

### Task 5: Section kit

**Files:**
- Create: `packages/ui/src/components/shared/section.tsx`
- Test: `packages/ui/src/components/shared/__tests__/section.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function Section(props: React.HTMLAttributes<HTMLElement> & { bare?: boolean }): JSX.Element; // <section>; bare drops border and background
  export function SectionHeader(props: { title: string; description?: React.ReactNode; action?: React.ReactNode }): JSX.Element;
  export function SectionToolbar(props: { filters?: React.ReactNode; search?: React.ReactNode; bulk?: React.ReactNode }): JSX.Element;
  export function SectionFooter(props: { note?: React.ReactNode; children?: React.ReactNode }): JSX.Element;
  export function SectionFirstRun(props: { title: string; description: string; action?: React.ReactNode; example?: React.ReactNode; exampleLabel?: string }): JSX.Element;
  export function SectionError(props: { message: string; onRetry?: () => void }): JSX.Element;
  ```

Classes (§5.5, §11.4): `Section` `overflow-hidden rounded-md border border-edge bg-surface-card`; `SectionHeader` `flex items-center justify-between gap-3 border-b border-edge-strong px-4 py-3` with an `<h2 className="text-base font-semibold text-content">`; `SectionToolbar` `flex items-center gap-3 border-b border-edge px-4`, `filters` in a `min-w-0 flex-1 overflow-x-auto` strip marked `data-filters`, `bulk` shown in place of `filters` when present; `SectionFooter` `flex items-center justify-between gap-3 border-t border-edge px-4 py-2 text-xs text-content-secondary`.

`SectionFirstRun` (§7) is the one first-run shape every pilot page uses: an `<h3 className="text-base font-semibold">`, the sentence in `text-sm text-content-secondary`, the action, then, when `example` is given, the example under a `text-xs` label reading `exampleLabel` with `aria-hidden` on the example itself (it is an illustration, not a record). `SectionError` renders `role="alert"` with the message and, when `onRetry` is given, a "Try again" button. Neither needs `"use client"`.

- [ ] **Step 1: Pre-check.** `grep -n "^export function" apps/web/src/components/settings/settings-layout.tsx` lists the six Settings parts; they are left untouched here. `sed -n 1,60p apps/web/src/components/shared/setup-guide/setup-slot.tsx`: `SetupSlot` is a per-file upload slot inside the multi-step `SetupGuide`, not a first-run block for a one-action page, so `SectionFirstRun` does not reuse it. If that file has since gained a generic example or placeholder part, use it for `example` and report.
- [ ] **Step 2: Write the failing tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Section, SectionError, SectionFirstRun, SectionFooter, SectionHeader, SectionToolbar } from '../section';

describe('Section kit', () => {
  it('titles a section with an h2', () => {
    render(<Section><SectionHeader title="Sent alerts" description="Newest first" /></Section>);
    expect(screen.getByRole('heading', { level: 2, name: 'Sent alerts' })).toBeVisible();
    expect(screen.getByText('Newest first')).toBeVisible();
  });
  it('shows bulk actions in place of filters when something is selected', () => {
    render(<SectionToolbar filters={<span>All</span>} search={<input aria-label="Search" />} bulk={<button>Export 3</button>} />);
    expect(screen.queryByText('All')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export 3' })).toBeVisible();
    expect(screen.getByLabelText('Search')).toBeVisible();
  });
  it('lets filters scroll rather than wrap', () => {
    const { container } = render(<SectionToolbar filters={<span>All</span>} />);
    expect(container.querySelector('[data-filters]')).toHaveClass('overflow-x-auto');
  });
  it('drops its box when bare', () => {
    const { container } = render(<Section bare>cards</Section>);
    expect(container.firstChild).not.toHaveClass('border');
  });
  it('puts the note left and actions right in a footer', () => {
    render(<SectionFooter note="Showing 4"><button>Load more</button></SectionFooter>);
    expect(screen.getByText('Showing 4')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible();
  });
  it('labels a first-run example and hides it from assistive tech', () => {
    render(<SectionFirstRun title="No packages logged yet" description="Log the first delivery." example={<p>FedEx box</p>} exampleLabel="Example of a logged package" />);
    expect(screen.getByRole('heading', { level: 3, name: 'No packages logged yet' })).toBeVisible();
    expect(screen.getByText('Example of a logged package')).toBeVisible();
    expect(screen.getByText('FedEx box').closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('announces an error and retries', () => {
    const onRetry = vi.fn();
    render(<SectionError message="We couldn't load packages." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load packages.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**, **Step 4: implement**, **Step 5: run to verify pass**; then `pnpm guard:class-resolution` — exit 0.
- [ ] **Step 6: Commit.** `git commit -m "ui: Section kit (header, toolbar, footer, first-run, error)"`

---

### Task 6: `RecordRow`

**Files:**
- Create: `packages/ui/src/components/shared/record-row.tsx`
- Test: `packages/ui/src/components/shared/__tests__/record-row.test.tsx`

**Interfaces:**
- Consumes: `StatusGlyph` (Task 2).
- Produces:
  ```ts
  export interface RecordRowProps {
    lead: React.ReactNode;            // a <StatusGlyph hideLabel>, or null
    title: React.ReactNode;
    statusWord: string;               // rendered first in the meta line
    meta?: string[];                  // joined with " · " after the status word
    preview?: string;
    outcome?: React.ReactNode;
    outcomeTone?: 'plain' | 'problem';
  }
  export function RecordRow(props: RecordRowProps): JSX.Element;   // renders an <li>
  export function RecordList(props: React.HTMLAttributes<HTMLUListElement>): JSX.Element; // <ul> with hairlines between rows
  ```

Rules (§5.5): title `text-sm font-medium text-content`, `min-w-0 truncate`; preview one line, `truncate text-sm text-content-secondary`; meta `text-xs text-content-secondary`; outcome right-aligned `text-sm`, `text-status-warning font-medium` only when `outcomeTone="problem"`. Below `cq-sm` the outcome drops under the meta line.

- [ ] **Step 1: Pre-check.** `grep -n "cq-sm\|cq-md\|cq-lg" apps/web/tailwind.config.ts` shows the three variants.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecordList, RecordRow } from '../record-row';
import { StatusGlyph } from '../status-glyph';

describe('RecordRow', () => {
  it('puts the status word first in the meta line', () => {
    render(<RecordList><RecordRow lead={<StatusGlyph kind="attention" label="Urgent" hideLabel />} title="Water shut-off" statusWord="Urgent" meta={['Nov 12, 7:30 AM', 'Text + email']} /></RecordList>);
    expect(screen.getByText('Urgent · Nov 12, 7:30 AM · Text + email')).toBeVisible();
  });
  it('marks an outcome only when something went wrong', () => {
    const { rerender } = render(<RecordList><RecordRow lead={null} title="A" statusWord="Info" outcome="Delivered to all 48" /></RecordList>);
    expect(screen.getByText('Delivered to all 48')).not.toHaveClass('text-status-warning');
    rerender(<RecordList><RecordRow lead={null} title="A" statusWord="Info" outcome="5 not reached" outcomeTone="problem" /></RecordList>);
    expect(screen.getByText('5 not reached')).toHaveClass('text-status-warning');
  });
  it('truncates a long title instead of widening the row', () => {
    render(<RecordList><RecordRow lead={null} title={'x'.repeat(90)} statusWord="Info" /></RecordList>);
    expect(screen.getByText('x'.repeat(90))).toHaveClass('truncate');
  });
});
```

- [ ] **Step 3 to 5:** run to fail, implement, run to pass.
- [ ] **Step 6: Commit.** `git commit -m "ui: RecordRow for narrative records"`

---

### Task 7: `SidePanel`

**Files:**
- Create: `packages/ui/src/components/shared/side-panel.tsx`
- Test: `packages/ui/src/components/shared/__tests__/side-panel.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type Slot = React.ReactNode;
  /** The only value a panel's "About" accepts. Produced by `describeAccess` (Task 10), never written by hand. */
  export type AccessSentence = string & { readonly __brand: 'AccessSentence' };
  export type SidePanelProps =
    | { template: 'list' | 'canvas'; glance?: Slot; attention?: Slot; shortcuts?: Slot; about?: AccessSentence }
    | { template: 'detail'; details?: Slot; attention?: Slot; related?: Slot; about?: AccessSentence }
    | { template: 'form'; preview?: Slot; attention?: Slot; about?: AccessSentence }
    | { template: 'help'; onThisPage?: Slot; related?: Slot };
  export interface PanelRegion { heading: string; content: React.ReactNode }
  /** Positions 1-2 and 3-4, in order, with their headings. Empty positions are dropped. */
  export function panelRegions(props: SidePanelProps): { lead: PanelRegion[]; trail: PanelRegion[] };
  /** False when the panel would hold only "About" (§5.3). */
  export function isPanelWorthDrawing(props: SidePanelProps): boolean;
  export function PanelRegions(props: { regions: PanelRegion[]; label: string }): JSX.Element; // <aside aria-label>, each region an <h2 class="text-xs"> plus content
  export function PanelGlance(props: { figure: string; unit: string; of?: [number, number]; lines?: [string, string][]; source: string }): JSX.Element;
  export function PanelAttention(props: { lead: string; title: string; action?: React.ReactNode } | { none: string }): JSX.Element;
  export function PanelLinks(props: { children: React.ReactNode }): JSX.Element; // at most four children
  ```

Headings by slot: `glance` "At a glance"; `details` "Details"; `preview` "Preview"; `onThisPage` "On this page"; `attention` "Needs attention"; `shortcuts` "Shortcuts"; `related` "Related"; `about` "About". `lead` is positions 1 and 2, `trail` positions 3 and 4. `PanelGlance` renders the figure in `font-display text-3xl`, the unit in `text-sm text-content-secondary`, a proportion bar when `of` is given, and `data-source={source}` on its root (§14.1: every figure names the function it comes from). `PanelAttention` with `lead`/`title` renders an alert icon, `<strong>{lead}:</strong> {title}`, a left rule `border-l-2 border-status-warning`, no tinted background; with `none`, one `text-sm text-content-secondary` sentence.

- [ ] **Step 1: Pre-check.** `grep -n "display:" apps/web/tailwind.config.ts` shows the `display` font family (line 15), so the class is `font-display`.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type AccessSentence, isPanelWorthDrawing, PanelAttention, PanelGlance, panelRegions } from '../side-panel';

const about = (s: string) => s as AccessSentence; // tests only; pages get one from describeAccess

describe('SidePanel', () => {
  it('orders positions regardless of how props are written', () => {
    const r = panelRegions({ template: 'list', about: about('a'), shortcuts: 's', attention: 'n', glance: 'g' });
    expect(r.lead.map((x) => x.heading)).toEqual(['At a glance', 'Needs attention']);
    expect(r.trail.map((x) => x.heading)).toEqual(['Shortcuts', 'About']);
  });
  it('renames positions per template', () => {
    const r = panelRegions({ template: 'detail', details: 'd', related: 'r' });
    expect([...r.lead, ...r.trail].map((x) => x.heading)).toEqual(['Details', 'Related']);
  });
  it('is not worth drawing with only About', () => {
    expect(isPanelWorthDrawing({ template: 'list', about: about('Managers can send alerts.') })).toBe(false);
    expect(isPanelWorthDrawing({ template: 'list', glance: 'g' })).toBe(true);
    expect(isPanelWorthDrawing({ template: 'list' })).toBe(false);
  });
  it('rejects a position that belongs to another template', () => {
    // @ts-expect-error a detail panel has no shortcuts
    panelRegions({ template: 'detail', shortcuts: 's' });
  });
  it('refuses a hand-written About sentence', () => {
    // @ts-expect-error About comes from describeAccess, not from a string literal
    panelRegions({ template: 'list', about: 'Managers can send alerts.' });
  });
  it('names where a figure comes from', () => {
    const { container } = render(<PanelGlance figure="7" unit="awaiting pickup" source="usePackages" />);
    expect(container.firstChild).toHaveAttribute('data-source', 'usePackages');
    expect(screen.getByText('7')).toBeVisible();
  });
  it('gives attention an icon and a leading word, or a quiet none', () => {
    const { rerender, container } = render(<PanelAttention lead="Deadline" title="2 records are due this week" />);
    expect(screen.getByText('Deadline:')).toBeVisible();
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<PanelAttention none="Nothing needs attention." />);
    expect(screen.getByText('Nothing needs attention.')).toBeVisible();
  });
});
```

- [ ] **Step 3 to 5:** run to fail, implement, run to pass, `pnpm --filter @propertypro/ui typecheck`.
- [ ] **Step 6: Commit.** `git commit -m "ui: SidePanel with a closed set of positions per template"`

---

### Task 8: `PageLayout` and the `cq-xl` variant

**Files:**
- Create: `packages/ui/src/components/shared/page-layout.tsx`
- Modify: `apps/web/tailwind.config.ts` (add `cq-xl` beside `cq-lg`, near line 310)
- Test: `packages/ui/src/components/shared/__tests__/page-layout.test.tsx`

**Interfaces:**
- Consumes: `SidePanelProps`, `panelRegions`, `isPanelWorthDrawing`, `PanelRegions` (Task 7).
- Produces:
  ```ts
  export type PageTemplate = 'list' | 'detail' | 'form' | 'settings' | 'canvas' | 'focus';
  export interface PageLayoutProps {
    template: PageTemplate;
    records?: 'rows' | 'table' | 'cards';   // default 'rows'
    header: React.ReactNode;
    banner?: React.ReactNode;
    tabs?: React.ReactNode;
    panel?: SidePanelProps;
    children: React.ReactNode;
  }
  export function PageLayout(props: PageLayoutProps): JSX.Element;
  export function useInPageLayout(): boolean;                       // true under a PageLayout
  ```

Rules (§5.1, §5.4, §13): the root is `<div data-page-template={template} class="cq flex flex-col gap-5">`. Order in the document: banner, header, tabs, then a grid holding lead regions (`<aside aria-label="Summary">`), the main column, trail regions (`<aside aria-label="More about this page">`) — in that DOM order, always. Layout: with `records` `rows` or `cards`, the grid is one column by default and `cq-lg:grid-cols-[minmax(0,1fr)_17.5rem]` with lead and trail both placed in column 2 by `grid-column`/`grid-row`, main spanning both rows in column 1. With `records="table"` the same switch happens at `cq-xl:` and not at `cq-lg:`. No `order-*` utilities and no reversed flex: placement is by grid lines only. When `panel` is absent or `isPanelWorthDrawing` is false, neither aside renders; if the panel had an `about`, it renders as a `text-sm text-content-secondary` paragraph directly under the header. `template="focus"` ignores `panel` and centres children at `max-w-2xl`. The `tabs` slot takes whatever the page passes; the kit ships no tab component (Task 16c passes a Radix `TabsList`).

`cq-xl` is `@container cq (min-width: 1280px)`.

- [ ] **Step 1: Pre-check.** `sed -n 300,312p apps/web/tailwind.config.ts` shows the three `addVariant("cq-…")` lines.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLayout, useInPageLayout } from '../page-layout';
import type { AccessSentence } from '../side-panel';

const about = (s: string) => s as AccessSentence;

function Probe() { return <span>{useInPageLayout() ? 'in' : 'out'}</span>; }

describe('PageLayout', () => {
  it('keeps summary, main, more in reading order', () => {
    const { container } = render(
      <PageLayout template="list" header={<h1>Packages</h1>} panel={{ template: 'list', glance: 'g', shortcuts: 's' }}><div data-testid="main">rows</div></PageLayout>,
    );
    const order = [...container.querySelectorAll('aside, [data-testid="main"]')].map((e) => e.getAttribute('aria-label') ?? 'main');
    expect(order).toEqual(['Summary', 'main', 'More about this page']);
  });
  it('holds the panel back to a wider box on table pages', () => {
    const { container, rerender } = render(<PageLayout template="list" records="rows" header={null} panel={{ template: 'list', glance: 'g' }}>x</PageLayout>);
    expect(container.querySelector('[data-page-grid]')!.className).toMatch(/cq-lg:grid-cols/);
    rerender(<PageLayout template="list" records="table" header={null} panel={{ template: 'list', glance: 'g' }}>x</PageLayout>);
    const cls = container.querySelector('[data-page-grid]')!.className;
    expect(cls).toMatch(/cq-xl:grid-cols/);
    expect(cls).not.toMatch(/cq-lg:grid-cols/);
  });
  it('never reorders with CSS', () => {
    const { container } = render(<PageLayout template="list" header={null} panel={{ template: 'list', glance: 'g', about: about('a') }}>x</PageLayout>);
    expect(container.innerHTML).not.toMatch(/\border-(first|last|\d)/);
  });
  it('folds an About-only panel into a line under the header', () => {
    const { container } = render(<PageLayout template="list" header={<h1>Forum</h1>} panel={{ template: 'list', about: about('Anyone on the board can post.') }}>x</PageLayout>);
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByText('Anyone on the board can post.')).toBeVisible();
  });
  it('tells descendants they are inside a layout', () => {
    render(<><Probe /><PageLayout template="list" header={<Probe />}>x</PageLayout></>);
    expect(screen.getAllByText(/in|out/).map((e) => e.textContent)).toEqual(['out', 'in']);
  });
});
```

- [ ] **Step 3 to 5:** run to fail; add the `cq-xl` variant; implement (`page-layout.tsx` needs `"use client"` for the context — it is the only kit file that does); run to pass; `pnpm guard:class-resolution && pnpm exec tsx scripts/verify-shared-side-effects.ts --root packages/ui/src` — the last must report no finding other than `"use client"` prologues and `displayName` assignments.
- [ ] **Step 6: Commit.** `git commit -m "ui: PageLayout; table pages hold the panel to a wider box"`

---

### Task 9: `PageHeader` paints inside a `PageLayout`

**Files:**
- Modify: `apps/web/src/components/shared/page-header.tsx`, `.claude/rules/design.md` (the one paragraph this makes false)
- Test: `apps/web/__tests__/components/shared/page-header.test.tsx` (extend; keep every existing case)

**Interfaces:**
- Consumes: `useInPageLayout` (Task 8).
- Produces: `PageHeaderProps` gains `icon?: React.ReactNode` and `status?: React.ReactNode`. Outside a `PageLayout` the component behaves exactly as today. The icon is a ready element (`<Package />`), not a component and not a nav id: an element can cross from a server page to this client component, and looking the icon up in `nav-config.ts` put that file in every page's client chunk (+5.7 KiB on the Settings route, 0.6 KiB under the hard budget). The caller passes the same icon `nav-config.ts` uses for that section; a `ponytail:` marker in the file hands single-sourcing to Plan B's icon design.

Rules (§5.2): inside a layout the `<h1>` is `font-display text-3xl font-medium tracking-tight text-content` with no `sr-only`; `description` renders as `text-sm text-content-secondary` under it; `icon` renders the place mark before the title: a `size-9 rounded-md bg-surface-inverse text-content-inverse` tile holding the icon at `size-5` with `strokeWidth={1.6}` and `aria-hidden`; `status` renders after the title; the block has `border-b border-edge-strong pb-4`. `children`, `actions` and the Help button keep their current positions. `data-page-header="true"` stays on the root: `shell-breadcrumbs.tsx:58` reads the title through it.

- [ ] **Step 1: Pre-check.** `sed -n 40,78p apps/web/src/components/shared/page-header.tsx` shows `'use client'`, an `h1.sr-only`, `_description` unused, and a toolbar of `children`, `actions` and Help; `grep -n "export const NAV_ITEMS\|^import" apps/web/src/components/layout/nav-config.ts` finds the list and shows the file imports nothing server-only (the client sidebar already imports it); `grep -n "does not paint" .claude/rules/design.md` finds the paragraph.
- [ ] **Step 2: Add the failing tests** (below the existing ones)

```tsx
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';

it('paints the title, description and place mark inside a PageLayout', () => {
  const { container } = render(<PageLayout template="list" header={<PageHeader title="Packages" description="Log deliveries as they arrive." icon={<svg data-testid="mark" />} />}>x</PageLayout>);
  const h1 = screen.getByRole('heading', { level: 1, name: 'Packages' });
  expect(h1).not.toHaveClass('sr-only');
  expect(screen.getByText('Log deliveries as they arrive.')).toBeVisible();
  expect(container.querySelector('[data-page-header] svg')).toHaveAttribute('aria-hidden', 'true');
});
it('draws no place mark without an icon', () => {
  const { container } = render(<PageLayout template="list" header={<PageHeader title="X" hideHelpButton />}>x</PageLayout>);
  expect(container.querySelector('[data-page-header] svg')).toBeNull();
});
it('still hides the title and drops the description outside a PageLayout', () => {
  render(<PageHeader title="Packages" description="Log deliveries as they arrive." />);
  expect(screen.getByRole('heading', { level: 1, name: 'Packages' })).toHaveClass('sr-only');
  expect(screen.queryByText('Log deliveries as they arrive.')).toBeNull();
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm test apps/web/__tests__/components/shared/page-header.test.tsx` — the first new test FAILS on `sr-only`; all earlier tests pass.
- [ ] **Step 4: Implement.** Rewrite the file's docblock to describe both behaviours. In `.claude/rules/design.md`, change the "`PageHeader` does not paint its title or description" paragraph to say it paints inside a `PageLayout` and stays hidden on every page not yet moved; change nothing else there.
- [ ] **Step 5: Run to verify pass**, then `pnpm guard:page-header && pnpm guard:breadcrumbs` — exit 0.
- [ ] **Step 6: Revert-check.** Remove the `useInPageLayout()` branch; the first new test goes red, the second and all older tests stay green; restore.
- [ ] **Step 7: Commit.** `git commit -m "web: PageHeader paints its title and description only inside a PageLayout"`

---

### Task 10: `describeAccess`

**Files:**
- Create: `apps/web/src/lib/access/describe-access.ts`
- Test: `apps/web/__tests__/lib/access/describe-access.test.ts`

**Interfaces:**
- Consumes: `RBAC_MATRIX`, `RBAC_RESOURCES`, `MATRIX_ROLES`, `COMMUNITY_TYPES`, `RbacResource`, `CommunityType` from `@propertypro/shared`; `AccessSentence` from `@propertypro/ui/components/shared/side-panel` (Task 7).
- Produces:
  ```ts
  /** What a resident's read covers. The matrix cannot express this, so the page states it. */
  export type ResidentScope = 'all' | 'own' | 'sent-to-them';
  export function describeAccess(communityType: CommunityType, resource: RbacResource, residentScope?: ResidentScope): AccessSentence; // residentScope defaults to 'all'
  ```

Rules (§14.2): the matrix is `RBAC_MATRIX[communityType][role][resource]` with `read` and `write` booleans (`rbac-matrix.ts:124-127`). Each role's capability is `write`, else `read`, else none. A role with none is never named. When `owner` and `tenant` have the same capability they are named together as "Residents"; otherwise "Owners" and "Tenants" get a sentence each. The manager sentence comes first. Sentences are joined by one space.

| Who | Capability | Sentence |
|---|---|---|
| manager | write | `Managers can add and change these.` |
| manager | read | `Managers can see these.` |
| residents | write | `{Name} can add and change {object}.` |
| residents | read | `{Name} can see {object}.` |

`{object}` is `them` for scope `all`, `only their own` for `own`, `only the ones sent to them` for `sent-to-them`.

- [ ] **Step 1: Pre-check.** `sed -n 122,128p packages/shared/src/rbac-matrix.ts` shows `MATRIX_ROLES` and the `Record<CommunityType, Record<MatrixRole, Record<RbacResource, RbacCell>>>` shape.
- [ ] **Step 2: Write the failing tests**

```ts
import { COMMUNITY_TYPES, MATRIX_ROLES, RBAC_MATRIX, RBAC_RESOURCES } from '@propertypro/shared';
import { describe, expect, it } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';

const WORD = { manager: 'Managers', owner: 'Owners', tenant: 'Tenants' } as const;
const cases = COMMUNITY_TYPES.flatMap((type) => RBAC_RESOURCES.map((resource) => [type, resource] as const));

describe('describeAccess', () => {
  it.each(cases)('%s %s names exactly the roles the matrix admits', (type, resource) => {
    const sentence = describeAccess(type, resource);
    for (const role of MATRIX_ROLES) {
      const canRead = RBAC_MATRIX[type][role][resource].read;
      const named = sentence.includes(WORD[role]) || (role !== 'manager' && sentence.includes('Residents'));
      expect(named, `${role}: "${sentence}"`).toBe(canRead);
    }
  });
  it.each(cases)('%s %s says Residents only when owners and tenants can do the same', (type, resource) => {
    if (!describeAccess(type, resource).includes('Residents')) return;
    const { owner, tenant } = RBAC_MATRIX[type];
    expect(owner[resource]).toEqual(tenant[resource]);
    expect(owner[resource].read).toBe(true);
  });
  it('says when residents see only their own', () => {
    expect(describeAccess('condo_718', 'packages', 'own')).toBe('Managers can add and change these. Residents can see only their own.');
  });
  it('says when owners see only what was sent to them, and never names tenants who cannot read', () => {
    expect(describeAccess('condo_718', 'emergency_broadcasts', 'sent-to-them')).toBe('Managers can add and change these. Owners can see only the ones sent to them.');
  });
  it('never claims something can be undone', () => {
    for (const [type, resource] of cases) expect(describeAccess(type, resource)).not.toMatch(/undo|undone|restore/i);
  });
});
```

- [ ] **Step 3 to 5:** run `pnpm test apps/web/__tests__/lib/access/describe-access.test.ts` to fail, implement, run to pass.
- [ ] **Step 6: Revert-check.** Make the function ignore `residentScope`; the two scope tests go red, the matrix tests stay green; restore.
- [ ] **Step 7: Commit.** `git commit -m "web: describeAccess builds the About sentence from the permission matrix"`

---

### Task 11: The preview gate

**Files:**
- Create: `apps/web/src/lib/design-preview.ts`
- Modify: `.env.example` (document `DESIGN_PREVIEW_USER_IDS`)
- Test: `apps/web/__tests__/lib/design-preview.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const DESIGN_PREVIEW_COOKIE = 'pp_design_preview';
  /** True when the user is on the allow-list, or, outside a production build, when the cookie is "1". Never throws. */
  export async function isDesignPreviewOn(userId: string): Promise<boolean>;
  ```

Rules: the allow-list is env `DESIGN_PREVIEW_USER_IDS`, comma-separated Supabase user ids, whitespace trimmed, empty means nobody. The cookie is read with `cookies()` from `next/headers` and is honoured only when `process.env.NODE_ENV !== 'production'`; it exists so Playwright can switch the pilot on per browser context without restarting the dev server. The whole body is in a `try`; any error returns `false`. There is no stored preference, no API route and no settings control.

Above the function:

```ts
// ponytail: an env allow-list, so the owner cannot flip between old and new on one
// account (compare with a second account or a second browser profile). Trigger: the
// owner asks to flip back, or anyone other than the owner needs the preview.
```

- [ ] **Step 1: Pre-check.** `grep -rn "from 'next/headers'" apps/web/src/lib | head -3` shows `cookies`/`headers` used from server code in this app.
- [ ] **Step 2: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }));
import { isDesignPreviewOn } from '@/lib/design-preview';

describe('design preview gate', () => {
  beforeEach(() => {
    vi.stubEnv('DESIGN_PREVIEW_USER_IDS', 'u-1, u-2');
    vi.stubEnv('NODE_ENV', 'production');
    cookieGet.mockReset().mockReturnValue(undefined);
  });
  it('is on only for listed users', async () => {
    expect(await isDesignPreviewOn('u-2')).toBe(true);
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('is off for everyone when the list is unset', async () => {
    vi.stubEnv('DESIGN_PREVIEW_USER_IDS', '');
    expect(await isDesignPreviewOn('u-1')).toBe(false);
    expect(await isDesignPreviewOn('')).toBe(false);
  });
  it('ignores the cookie in a production build', async () => {
    cookieGet.mockReturnValue({ value: '1' });
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('honours the cookie in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cookieGet.mockReturnValue({ value: '1' });
    expect(await isDesignPreviewOn('u-9')).toBe(true);
    cookieGet.mockReturnValue({ value: 'true' });
    expect(await isDesignPreviewOn('u-9')).toBe(false);
  });
  it('is off, not an error, when reading cookies throws', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cookieGet.mockImplementation(() => { throw new Error('no request scope'); });
    await expect(isDesignPreviewOn('u-9')).resolves.toBe(false);
  });
});
```

- [ ] **Step 3 to 5:** run `pnpm test apps/web/__tests__/lib/design-preview.test.ts` to fail; implement; run to pass.
- [ ] **Step 6: Revert-check.** Remove the `NODE_ENV !== 'production'` condition; "ignores the cookie in a production build" goes red, the rest stay green; restore.
- [ ] **Step 7: Commit.** `git commit -m "web: owner-only design preview gate (env allow-list; dev-only cookie for e2e)"`

The owner sets the list with `vercel env add DESIGN_PREVIEW_USER_IDS --no-sensitive` on the web project (their Supabase user id), then redeploys.

---

### Task 12: `guard:page-template`

Runs after Task 16, in the last pull request, so the baseline is written once.

**Files:**
- Create: `scripts/verify-page-template.ts`, `scripts/page-template-baseline.json`
- Modify: `package.json` (script `guard:page-template`), `scripts/run-lint-guards.mjs` (register it), `CLAUDE.md` (guard list; count 35 to 36, with the date)
- Test: `scripts/__tests__/verify-page-template.test.ts`

**Interfaces:**
- The script exports a pure `scan(root: string): Result` and decides whether to run with `isMainModule(import.meta.url)` from `scripts/lib/is-main-module.ts`. It accepts `--root <dir>` through `scripts/lib/root-arg.ts` and `--write-baseline`. Exit 0 clean, 1 violations, 2 could not check (missing root, zero pages scanned, parse failure).

Rules (§16): roots under `apps/web/src/app`: `(authenticated)`, `(help)`, `auth`, `(auth)`, `sign`, `(print)`, `(site-editor)`, `public-transparency`, `demo`. `mobile` is excluded with the printed reason "phone app is a separate programme". A `page.tsx` passes when:

- it contains a JSX `PageLayout` element; or
- it carries a top-of-file `// page-template: delegated to <path>[, <path>…]` comment and **every** named file exists and contains a JSX `PageLayout` element (a page with a staff view and a resident view names both); or
- it contains a `redirect(` call and no JSX element; or
- it carries `// page-template:exempt — <reason>`.

Every other page must be listed in the per-file baseline. A baselined file that now passes is a stale entry and fails. The script prints: pages scanned, compliant, redirect-only, baselined, exempt.

At the top of the script:

```ts
// ponytail: proves a page HAS a PageLayout view, not that customers are served it
// (a pilot page still renders its old view to everyone off the allow-list).
// Trigger: Task 19 removes the gate; delete this note then.
```

- [ ] **Step 1: Pre-check.** `sed -n 1,40p scripts/verify-page-padding.ts` and `cat scripts/lib/root-arg.ts scripts/lib/is-main-module.ts` for the house pattern; `grep -n "guard:page-padding" package.json scripts/run-lint-guards.mjs` for where to register; `ls apps/web/src/app` still lists all nine roots.
- [ ] **Step 2: Write the failing tests**, with fixtures built under `fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))` (never inside the repo):
  - passes on the real repo with its baseline: `scan(repoRoot)` returns no violations and a scanned count above zero;
  - a fixture `page.tsx` returning `<div>hi</div>` is reported by path;
  - a fixture with `redirect('/x')` and no JSX passes;
  - a fixture delegating to `./a, ./b` passes when both hold `<PageLayout`, and fails naming `./b` when only `a` does, and fails when `./b` does not exist;
  - a baseline entry for a file that now passes is reported as stale;
  - `scan` of an empty temp directory, and of a missing one, yields status 2.
- [ ] **Step 3: Run to verify failure.** `pnpm test scripts/__tests__/verify-page-template.test.ts` — FAIL, module not found.
- [ ] **Step 4: Implement** with the TypeScript parser (`ts.createSourceFile`), not regular expressions over raw text.
- [ ] **Step 5: Add the delegated comments** to the five pilot `page.tsx` files (Packages, Visitors, and the Emergency list, detail and new pages; Packages names both of its views), naming the view files Tasks 13 to 16 created. Then seed: `pnpm exec tsx scripts/verify-page-template.ts --write-baseline`; read the file; confirm none of the five pilot pages is in it and print the counts.
- [ ] **Step 6: Run to verify pass**, then `pnpm lint` — exit 0, and its summary lists 36 guards.
- [ ] **Step 7: Commit.** `git commit -m "guards: page-template, with a shrink-only baseline"`

---

### Task 13: Pilot — Packages, staff view

**Files:**
- Create: `apps/web/src/components/packages/PackagePickupDialog.tsx`, `apps/web/src/components/packages/packages-staff-page.tsx`
- Modify: `apps/web/src/components/packages/PackageStaffView.tsx` (use the extracted dialog; no behaviour change), `apps/web/src/app/(authenticated)/dashboard/packages/page.tsx` (branch on the gate)
- Test: `apps/web/__tests__/packages/package-pickup-dialog.test.tsx`, `apps/web/__tests__/packages/packages-staff-page.test.tsx`

**Interfaces:**
- Consumes: `PageLayout` (Task 8), `PageHeader` (Task 9), `Section*` (Task 5), `PanelGlance` (Task 7), `describeAccess` (Task 10), `isDesignPreviewOn` (Task 11), `usePackages`, `usePickupPackage`, `PackageListItem` from `@/hooks/use-packages`, the existing `DataTable`, `QuickFilterTabs`, `getPackageColumns`, `PackageLogForm`.
- Produces:
  ```ts
  export function PackagePickupDialog(props: { communityId: number; pkg: PackageListItem | null; onClose: () => void }): JSX.Element;
  export function PackagesStaffPage(props: { communityId: number; about: AccessSentence }): JSX.Element; // client component
  ```

Decisions (§5, §14.1):

- **Extract first.** The "Mark as Picked Up" dialog, its name field and `handlePickup` live inline in `PackageStaffView.tsx:107-145`. Move them, unchanged, into `PackagePickupDialog` (it owns the name state and calls `usePickupPackage`), and make `PackageStaffView` render it. Both views then share one dialog.
- `PageLayout template="list" records="table"`.
- Header: title "Packages", `icon={<Package />}` (the icon `nav-config.ts` uses for `packages`), description "Log deliveries as they arrive. Residents are told when a package is ready to collect.", one primary "Log a package" opening the existing `PackageLogForm`.
- Toolbar filters: the existing three, relabelled "Awaiting pickup" (`pending`), "Picked up" (`picked_up`), "All", with counts from the loaded list. No search: the current view has none.
- Footer: "Showing N". No "of M".
- Panel position 1: figure = count of packages whose `status !== 'picked_up'`, unit "awaiting pickup", `source="usePackages"`, from the same query result as the table. One line: "Picked up" with the count of `picked_up`.
- Panel positions 2 and 3: **omitted.** The code has no rule for a package waiting too long, and the current page links nowhere else.
- Panel position 4: the `about` prop. `page.tsx` builds it with `describeAccess(membership.communityType, 'packages', 'own')` and passes it down, so the client component does not import the matrix.
- States: loading uses the `DataTable`'s own skeleton inside the section, with `aria-busy` on the section; error renders `SectionError` with the query's `refetch`; zero packages renders `SectionFirstRun` with title "No packages logged yet", description "Log the first delivery and the resident gets a notice straight away.", the primary action, `exampleLabel` "Example of a logged package" and an example built from the real columns; a filter with no matches renders "Nothing matches this filter" with a "Show all" button.
- `page.tsx`: after resolving `userId`, `const preview = await isDesignPreviewOn(userId)`. When `preview && isStaff`, render `<PackagesStaffPage … />` inside the existing `FeatureGate`, in place of the current `PageHeader` and `PackageStaffView`. Above the branch:

  ```ts
  // ponytail: two views of this page while the pilot is judged. Trigger: the owner
  // approves or rejects the pilot (plan Task 19), or 30 days after the pilot merges.
  ```

- [ ] **Step 1: Pre-check.** `sed -n 99,147p apps/web/src/components/packages/PackageStaffView.tsx` shows the inline pickup dialog; `sed -n 15,35p apps/web/src/hooks/use-packages.ts` shows the `status` union `'received' | 'notified' | 'picked_up'` and whether `usePackages` returns `error` and `refetch`; `grep -rn "PackageStaffView" apps/web/__tests__` lists the tests that must stay green after the extraction.
- [ ] **Step 2: Write the failing tests** (mock `@/hooks/use-packages` with `vi.hoisted`).
  - `PackagePickupDialog`: with a package, the description names the recipient and carrier; "Confirm Pickup" is disabled until a name is typed; confirming calls the mutation with `{ packageId, pickedUpByName }` trimmed, then `onClose`; with `pkg={null}` no dialog is in the document.
  - `PackagesStaffPage`, three packages (two `received`, one `picked_up`): the `h1` "Packages" is visible; the glance figure reads `2` with "awaiting pickup" and its root has `data-source="usePackages"`; the "Awaiting pickup" filter shows `2`; the footer reads "Showing 3" on "All".
  - the figure and the table agree: after the mock returns four `received`, the figure reads `4` and the table has four body rows.
  - clicking a row's "Mark picked up" action opens the pickup dialog for that package.
  - zero packages: the heading "No packages logged yet" and "Example of a logged package" are visible, the glance figure reads `0`, and exactly one button named "Log a package" exists.
  - loading: the section has `aria-busy="true"` and the `h1` is already visible.
  - error: an element with `role="alert"` is visible and clicking "Try again" calls `refetch` once.
  - there is no "Needs attention" heading.
  - axe: `expect(await axe(container)).toHaveNoViolations()` on the three-package render, after asserting the table has rows.
- [ ] **Step 3 to 5:** run both files to fail; extract the dialog and re-run the existing `PackageStaffView` tests from Step 1 (green, unchanged); implement the page; run to pass.
- [ ] **Step 6:** `pnpm guard:design-tokens && pnpm guard:class-resolution && pnpm guard:page-header` — exit 0.
- [ ] **Step 7: Commit.** `git commit -m "packages: staff page on the page kit, behind the design preview"`

---

### Task 14: Pilot — Packages, resident view

**Files:**
- Create: `apps/web/src/components/packages/packages-resident-page.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/packages/page.tsx`
- Test: `apps/web/__tests__/packages/packages-resident-page.test.tsx`

**Interfaces:**
- Consumes: as Task 13, plus `RecordList`, `RecordRow` (Task 6), `StatusGlyph` (Task 2), `useMyPackages`.
- Produces: `export function PackagesResidentPage({ communityId }: { communityId: number }): JSX.Element`.

Decisions (§5.8): `PageLayout template="list" records="rows"` with **no panel**. Title "My packages", description "Packages logged for your unit, and whether they are ready to collect." No primary action. Each package is a `RecordRow`: lead `StatusGlyph` (`in-progress` "Ready to collect" for `received`/`notified`, `done` "Picked up"), title = carrier and description as the current resident view composes them, meta = received date. First-run: `SectionFirstRun` with title "No packages for you yet" and description "When staff log a delivery for your unit it appears here and you get a notice.", no action and no example. `page.tsx` renders it when `preview && !isStaff`, under the same `ponytail:` marker as Task 13.

- [ ] **Step 1: Pre-check.** Read `apps/web/src/components/packages/PackageResidentView.tsx` for which fields it shows and how it words them; keep that wording.
- [ ] **Step 2: Write the failing tests:** no `aside` is rendered; no management figure text ("awaiting pickup") appears; a `received` package shows the words "Ready to collect"; zero packages shows the first-run heading and no button; axe passes on a two-package render.
- [ ] **Step 3 to 6:** run to fail, implement, run to pass, commit `"packages: resident page on the page kit, no management figures"`.

---

### Task 15: Pilot — Emergency Alerts list

**Files:**
- Create: `apps/web/src/components/emergency/emergency-list-page.tsx`
- Modify: `apps/web/src/app/(authenticated)/emergency/page.tsx`
- Test: `apps/web/__tests__/emergency/emergency-list-page.test.tsx`

**Interfaces:**
- Consumes: the kit; `describeAccess`; `isDesignPreviewOn`; the page's existing `broadcasts` mappings (both branches) and `membership.timezone`.
- Produces (server component, no `"use client"`):
  ```ts
  type Row = { id: number; title: string; severity: string; initiatedAt: string; completedAt: string | null; canceledAt: string | null };
  export function EmergencyListPage(props:
    | { view: 'manager'; broadcasts: Array<Row & { recipientCount: number }>; canWrite: boolean; communityId: number; timeZone: string; about: AccessSentence }
    | { view: 'recipient'; broadcasts: Row[]; communityId: number; timeZone: string }
  ): JSX.Element;
  ```

Decisions. The page states only what `BroadcastHistoryTable` states today: a title, a severity, a recipient count and one of three statuses. It adds no delivery or reach figure.

- `PageLayout template="list" records="rows"`. Title "Emergency Alerts", `icon={<Siren />}` (as `nav-config.ts`), description "Send urgent notices to residents. Every alert is logged with who it went to."
- **Manager view.** Primary "Send alert" linking to `/emergency/new?communityId=…`, only when `canWrite`. Each alert is a `RecordRow` whose title links to `/emergency/{id}?communityId=…`:
  - status word and glyph, by the same precedence as `getStatusLabel` in `BroadcastHistoryTable.tsx`: `canceledAt` → `not-started` "Canceled"; `completedAt` → `done` "Sent"; otherwise `in-progress` "Draft";
  - meta: the severity word, capitalised, then the date and time of `initiatedAt` formatted with `Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone })`;
  - outcome: `"{recipientCount} recipients"`, plain tone.
  Footer "Showing N".
- Panel position 1, only when at least one alert has `completedAt` and no `canceledAt`: figure = that newest alert's `recipientCount`, unit "recipients on the last alert", one line "Sent" with its date, `source="emergencyBroadcasts.recipientCount"`.
- Panel positions 2 and 3: omitted. The list loads nothing that says a resident was not reached; that is on the detail page.
- Panel position 4: `about`, built in `page.tsx` with `describeAccess(membership.communityType, 'emergency_broadcasts', 'sent-to-them')`.
- **Recipient view** (the page's existing `!membership.isAdmin` branch): no panel, no recipient counts, no primary. Rows show status "Sent", severity and date only. First-run: `SectionFirstRun` title "No alerts yet", description "Alerts sent to you appear here."
- First-run, manager: title "No alerts sent yet", description "When you send one it appears here with who it went to.", the primary action when `canWrite`, `exampleLabel` "Example of a sent alert" and one example `RecordRow`.
- `page.tsx`: compute `preview` once after `userId`; in **both** returns (recipient and manager) render `EmergencyListPage` when it is on, under the Task 13 `ponytail:` marker. The no-`communityId` return is unchanged.

- [ ] **Step 1: Pre-check.** `sed -n 26,34p apps/web/src/components/emergency/BroadcastHistoryTable.tsx` shows `getStatusLabel` with the Canceled, Sent, Draft precedence; `grep -n "isAdmin\|canWrite\|recipientCount" "apps/web/src/app/(authenticated)/emergency/page.tsx"` shows the two branches and the mapping; `grep -n "timezone" apps/web/src/lib/api/community-membership.ts` shows the field.
- [ ] **Step 2: Write the failing tests.**
  - manager view: a sent row's meta reads "Sent · Urgent · " followed by the date in the given zone (render with `timeZone="America/New_York"` and an instant that is the previous calendar day in UTC-5, and assert the New York date); its outcome reads "48 recipients"; a draft reads "Draft"; a cancelled one reads "Canceled".
  - the glance figure equals the newest sent alert's `recipientCount`, ignoring a newer draft and a newer cancelled alert; with only drafts there is no `aside`.
  - no text matching `/delivered|reachable|not reached/i` anywhere.
  - `canWrite={false}`: no link named "Send alert".
  - **recipient view:** no `aside`, no text matching `/recipients/i`, no link named "Send alert".
  - zero alerts, manager: first-run heading, example label and exactly one "Send alert" link.
  - axe on the manager render.
- [ ] **Step 3 to 5:** run to fail, implement, wire both branches in `page.tsx`, run to pass.
- [ ] **Step 6: Revert-check.** In the recipient branch pass the manager rows through (so `recipientCount` renders); the recipient test goes red on `/recipients/i`; the others stay green; restore.
- [ ] **Step 7:** `pnpm guard:design-tokens && pnpm guard:class-resolution && pnpm guard:page-header`; commit `"emergency: alerts list on the page kit; owners see no recipient figures"`.

---

### Task 16: Pilot — Emergency alert detail, new alert, and Visitors

Three small pages that prove the detail and form templates and tabs. 16a and 16b go in the Emergency pull request, 16c in its own.

**16a. Alert detail**

- Files: create `apps/web/src/app/(authenticated)/emergency/[id]/broadcast-detail-client.tsx` and `apps/web/src/components/emergency/emergency-detail-page.tsx`; modify `apps/web/src/app/(authenticated)/emergency/[id]/page.tsx`; test `apps/web/__tests__/emergency/emergency-detail-page.test.tsx`.
- **The page is a client component today** (`"use client"` on line 9) and cannot call the gate. First move its whole body, unchanged, into `broadcast-detail-client.tsx` as `BroadcastDetailClient` (use `git mv`, then rename the export). `page.tsx` becomes a server component: read `communityId` from `searchParams`, resolve `userId` and `membership` exactly as `emergency/page.tsx` does, call `requirePermission(membership, 'emergency_broadcasts', 'read')`, then render `<EmergencyDetailPage about={…} isAdmin={membership.isAdmin} />` when the gate is on and `<BroadcastDetailClient />` otherwise, under the Task 13 `ponytail:` marker. Give `page.tsx` a top-of-file `// breadcrumbs:exempt — delegated to ./broadcast-detail-client.tsx`.
- `EmergencyDetailPage` (client): `PageLayout template="detail" records="table"`. Title = the alert's title; `status` = the same glyph and word as the list (Task 15); no primary. Main: a "Message" section with the body, then, for admins only, a "Delivery" section holding the existing `DeliveryReport` unchanged. Panel `details`, admins only: Severity, Sent (community time zone, passed from `page.tsx`), and any other field the current page already shows above the report; `about` as in Task 15. Non-admins get no "Delivery" section and no panel.
- It loads through `useEmergencyBroadcast`; the panel reads that same hook's data.
- Pre-check: `sed -n 9,70p "apps/web/src/app/(authenticated)/emergency/[id]/page.tsx"` for the fields the page shows today and how it tells an admin response from a recipient one; `pnpm guard:breadcrumbs` is green before the change.
- Tests: the `h1` is the alert title; "Details" lists Severity and Sent; a non-admin render has no "Delivery" heading and no `aside`; loading shows `aria-busy`; a failed load shows `role="alert"`; axe passes. After the move, `pnpm guard:breadcrumbs && pnpm guard:page-header` — exit 0.

**16b. New alert**

- Files: create `apps/web/src/components/emergency/emergency-new-page.tsx`; modify `apps/web/src/app/(authenticated)/emergency/new/page.tsx`; test `apps/web/__tests__/emergency/emergency-new-page.test.tsx`.
- `PageLayout template="form"`. Title "New alert", description "Write the alert, choose who gets it, and review it before sending." The header has only a "Cancel" link back to the list. The existing `BroadcastComposer` renders in the main column with the props `page.tsx` passes today, including `smsEnabled={isSmsDispatchGloballyEnabled() && membership.smsDispatchEnabled}`; its own submit button is the primary. **No panel**: the composer already holds its SMS preview, and moving that out would mean changing the composer.
- Pre-check: `grep -n "SmsPreview\|type=\"submit\"\|<Button" apps/web/src/components/emergency/BroadcastComposer.tsx` confirms the composer renders its own preview and submit; do not change the composer.
- Tests (mock `BroadcastComposer` to a stub that records its props): the stub receives the same four props as today; the header contains a "Cancel" link and no button; there is no `aside`; axe passes.

**16c. Visitors**

- Files: create `apps/web/src/components/visitors/visitors-staff-page.tsx`; modify `apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx`; test `apps/web/__tests__/visitors/visitors-staff-page.test.tsx`.
- `PageLayout template="list" records="table"`, wrapped in the existing Radix `<Tabs>` root so the list and the panels can sit in different slots: the `tabs` slot holds `<TabsList>` with "Visitors" and "Denied list"; the main column holds the two `<TabsContent>`, each rendering that tab's existing table (`DataTable` with its `QuickFilterTabs`, and `DeniedVisitorsTab`) inside a `Section`. The selected trigger is marked with `data-[state=active]:border-b-2 data-[state=active]:border-content` (ink, not coral); pass it by `className` and do not edit `components/ui/tabs.tsx`.
- The selected tab starts from `?tab=` (default `visitors`) and each change calls `window.history.replaceState`, the way `components/meetings/meetings-page-shell.tsx` does. No navigation, so no server round trip.
- Header: title "Visitors", `icon={<Users />}` (as `nav-config.ts`), description "Expected visitors and the people who may not be let in." The header primary is the selected tab's existing action. Every dialog and mutation the staff view has today is reused by importing it; if one is inline in `VisitorStaffView.tsx`, extract it to its own file first, unchanged, exactly as Task 13 does for the pickup dialog.
- Panel position 1: only if `VisitorStaffView` already computes a count from its loaded list, show that count with `source` naming the hook; otherwise no glance. Position 4: `describeAccess(membership.communityType, 'visitors', 'own')`, built in `page.tsx`.
- Pre-check: `sed -n 60,220p apps/web/src/components/visitors/VisitorStaffView.tsx` for the tabs, tables, actions and any inline dialog; `grep -n "replaceState" apps/web/src/components/meetings/meetings-page-shell.tsx` for the pattern; `grep -n "listActorUnitIds" "apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx"` confirms residents are scoped to their own units, which is what `'own'` claims.
- Tests: two elements with `role="tab"`; the selected one has `aria-selected="true"` and no class containing `interactive`; rendering with `?tab=denied` shows the denied table and the denied-list action as the primary; selecting the other tab calls `history.replaceState` with a URL containing `tab=visitors`; axe passes.

For each of 16a to 16c: write the failing tests, run to fail, implement, run to pass, run `pnpm guard:design-tokens && pnpm guard:class-resolution && pnpm guard:page-header`, commit.

---

### Task 17: Proof at the app's real size

**Files:**
- Create: `apps/web/e2e/design-direction-pilot.spec.ts`
- Modify: `apps/web/e2e/ci-safe-specs.json` (add the spec and raise `expectedTestCount` by the number of blocks it adds, counted with `playwright test --config playwright.ci.config.ts --list | grep -c chromium` before and after)

**Interfaces:**
- Consumes: `loginAs(page, role, { communitySlug })` from `apps/web/e2e/helpers/dev-login.ts`, the overflow helper in `helpers/overflow.ts`, `DESIGN_PREVIEW_COOKIE` (Task 11).

Decisions (§17 proof, Review Focus 1, 3 and 4):

- Each block logs in, then switches the pilot on with `context.addCookies([{ name: 'pp_design_preview', value: '1', url: baseURL }])`. The dev server honours that cookie because it is not a production build; no server env changes and no other spec is affected.
- As `cam` pinned to `sunset-condos`, for each of `/dashboard/packages`, `/emergency`, `/dashboard/visitors` at 1280 and 1440 wide with large text on (the default):
  - the painted `h1` is visible (proves the pilot view rendered, so the next assertions are not vacuous);
  - no page-level horizontal overflow and no table that scrolls sideways;
  - from bounding boxes, the "Summary" region sits either to the right of the main column or wholly above it. Record which, per route and width, with `test.info().annotations`.
  - attach a full-page screenshot with `testInfo.attach`, so the twelve stills come out of the report.
- One block logs a package whose description is 90 characters through the app's own "Log a package" form, reloads, and re-asserts no overflow at both widths.
- One block logs in as `owner` pinned to `sunset-condos` and asserts `/emergency` shows no text matching `/recipients/i` and no "Send alert" link.
- One block, without the cookie, asserts `/dashboard/packages` still has an `h1` with class `sr-only` (customers see the current page).

- [ ] **Step 1: Pre-check.** `sed -n 30,60p apps/web/e2e/responsive-overflow.spec.ts` for `VIEWPORTS` and the overflow helper's name; `grep -n "expectedTestCount" apps/web/e2e/ci-safe-specs.json` for the current floor (69 when this was written); `grep -rln "dashboard/packages\|/emergency" apps/web/e2e` lists existing specs that touch the pilot routes and must stay green.
- [ ] **Step 2:** Write the spec. Start the sandbox with `pnpm agent:env:prepare` then `pnpm agent:live:web` (check `docker exec <any container> cat /proc/pressure/memory` first; stop idle stacks if `full` is well above zero).
- [ ] **Step 3:** Run `pnpm exec playwright test apps/web/e2e/design-direction-pilot.spec.ts --config apps/web/playwright.ci.config.ts`; expected: all blocks pass. If a table scrolls sideways beside the panel, that is a finding about §5.4's thresholds, not a test to loosen: report the measured widths.
- [ ] **Step 4: Anti-vacuity probe.** Temporarily make `isDesignPreviewOn` return `false`; the "painted `h1`" assertions go red and the no-cookie block stays green; restore and confirm the file is unchanged with `git diff --stat`.
- [ ] **Step 5:** `pnpm build && pnpm perf:check`; record the pilot routes' sizes and the aggregate before and after in the pull request description. Expected: exit 0.
- [ ] **Step 6: Commit.** `git commit -m "e2e: pilot pages hold at 1280 and 1440 in large text"`

---

### Task 18: folded into other tasks

The factual corrections moved to the tasks that cause them: the `PageHeader` paragraph in `.claude/rules/design.md` (Task 9) and the guard count in `CLAUDE.md` (Task 12). Writing the direction into `DESIGN.md` waits for the owner's decision (Task 19).

---

### Task 19: After the owner decides — remove the second copy

Not started until the owner has reviewed the pilot. One pull request either way. Until it merges, a fix to a pilot page must be made in both views.

**If the pilot is approved:**

- Delete the old views and anything only they used: `PackageStaffView.tsx`, `PackageResidentView.tsx`, `BroadcastHistoryTable.tsx`, `emergency/[id]/broadcast-detail-client.tsx`, `VisitorStaffView.tsx` and the resident visitor view if Task 16c replaced it. Before each deletion, `grep -rn "<name>" apps/web/src apps/web/__tests__ apps/web/e2e scripts/help-capture` and move or delete every reference.
- Delete `apps/web/src/lib/design-preview.ts`, its test, the `DESIGN_PREVIEW_USER_IDS` line in `.env.example`, every `isDesignPreviewOn` branch and every `ponytail:` marker Tasks 11 to 16 added. Remove the cookie step and the no-cookie block from `design-direction-pilot.spec.ts` and lower `expectedTestCount` by one. Ask the owner to remove the Vercel env var.
- Write spec §0 and a short "Page templates" section into `DESIGN.md` and `.claude/rules/design.md`.
- Check: `grep -rn "isDesignPreviewOn\|pp_design_preview\|DESIGN_PREVIEW" apps packages scripts` prints nothing; `pnpm lint && pnpm typecheck && pnpm test` exit 0; `pnpm guard:page-template` still lists the five pilot pages as compliant.

**If the pilot is rejected:** delete the six new view files, the gate, the branches and markers, and the kit files from Tasks 2 and 5 to 8; revert Task 9 and add the five pages back to Task 12's baseline; keep the extracted `PackagePickupDialog` (it is a plain refactor).

---

## After this plan

1. The owner adds their user id to `DESIGN_PREVIEW_USER_IDS` in production and reviews the six pilot screens on Sunset Condos, with the three points under "What the pilot will not show" in hand.
2. The owner decides the two open items in the spec (§4, decisions 12 and 13) and either approves the pilot or asks for changes.
3. Task 19 runs. Only then are Plans B to E written, using the thresholds and any design changes the pilot produced.
