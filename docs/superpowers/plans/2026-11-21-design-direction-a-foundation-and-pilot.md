# Design Direction, Plan A: Foundation and Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the page kit, its guards and an owner-only preview switch, then rebuild Emergency Alerts, Packages and Visitors on it so the owner can judge the design direction in the real app before anything else is migrated.

**Architecture:** New kit parts are added beside the existing ones in `packages/ui/src/components/shared/` and nothing existing is edited there, so admin cannot change. Pure deadline logic lives in `packages/shared` so emails can later read the same answer. Each pilot page keeps its current implementation and gains a second one that renders only when a per-user preference is on, so customers see no change until the owner opens the gate.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind with container-query variants, Vitest (jsdom for `packages/ui`), Playwright, `lucide-react`, `tsx` guard scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-page-anatomy-design.md`. Section numbers below (§) refer to it. Read §0, §3, §5, §11, §12, §13, §14 and §16 before any task.

**This is Plan A of five.** The spec's rollout (§17) has nine workstreams. Plan A covers workstreams 1 to 3. The others are written after the owner approves the pilot, because the pilot fixes two layout thresholds and may change the design:

| Plan | Workstreams | Written when |
|---|---|---|
| A (this) | 1 kit and guards, 2 preview gate, 3 pilot | now |
| B | 4 shell, fixed coral, "Next deadline" | pilot approved |
| C | 5 dashboard and settings, 6 lists, details, forms | pilot approved |
| D | 7 overlays and the help dialog | Plan C under way |
| E | 8 help center and outside frames | Plan C under way |

## Out of this plan

These spec parts are deliberately left to later plans, so do not build them here: `RecordCard`, `StepStrip`, `StatuteChip` and the canvas section kinds (Plan C, with the first page that needs each); the plan-locked, lapsed, denied and read-only states and the banner slot (Plan C; the pilot pages keep their existing `FeatureGate` wrapper and its current locked screen); the shell, fixed coral and "Next deadline" (Plan B); overlays and the help dialog (Plan D); the print stylesheet and outside frames (Plan E). The compliance UI is not switched to `daysLeft` here; Task 1 only creates the formatter.

## Global Constraints

- Work on branch `claude/component-design-modernization-2999df`. One pull request per task unless a task says otherwise; open and merge them in order, rebasing between each.
- **No admin change.** Do not edit any existing file under `packages/ui/src/components/ui/`, any existing file in `packages/ui/src/components/shared/`, or `packages/ui/src/constants/status.ts`. Add new files only.
- Import kit parts by file path (`@propertypro/ui/components/shared/<file>`), never through the package barrel.
- Semantic token classes only. No raw hex, no slash-opacity on semantic tokens, no arbitrary pixel values. Every colour class must exist in `apps/web/tailwind.config.ts`.
- All sizes on the existing rem scale; nothing smaller than `text-xs`. Page title and headline figures `text-3xl`; rows, cells, meta and time-left counts `text-sm`; labels and stamps `text-xs` (§11.2).
- Geist Mono (`font-mono`) only on statute chips and keyboard hints (§11.2).
- Coral (`bg-interactive`, `text-content-link`) only on the one primary button and on links. Selected states use ink (§11.3).
- Status is always a glyph plus a word (§13). Deadlines always go through `TimeLeft` (§12).
- Heading levels: `h1` page title, `h2` section titles and panel positions (§11.2).
- Controls are 44px below `md`; standalone links and icon buttons get `min-h-11 md:min-h-0` (§13).
- Run one test file with `pnpm test <path>` (no `--`). For `packages/ui` and `packages/shared` use `pnpm --filter <pkg> exec vitest run <path>`. Do not pipe a test command when you need its exit status.
- After changing `packages/ui` or `packages/shared`, run `pnpm --filter <pkg> build` before running web tests; web reads their `dist/`.
- Never run integration tests against `.env.local` (it is production). Use `pnpm test:integration:local`.
- Every fix-shaped test gets a revert-check, recorded in the commit message (`.claude/rules/verification.md`).
- A deliberate shortcut carries a `ponytail:` comment naming the limit and an observable trigger.
- Before every push: run a security review and a code review of the diff (owner's standing rule).
- End commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Each task starts with a **pre-check**: one grep or read confirming the files and names it depends on still exist as written here. `main` moves fast (43 commits in two days). If a pre-check fails, stop and report; do not improvise.

## Review Focus

1. **A deadline within minutes of now.** One minute past must read as overdue, never as "0 hours left" or "due today" (pinned in Task 1).
2. **A viewer who may not read a figure.** An owner on Emergency Alerts must not see reach or delivery figures; a community with SMS switched off must not see a text-message figure (pinned in Tasks 14 and 15).
3. **Zero records.** Every pilot page must render its header, its panel and a first-run section with no records, without a blank main column (pinned in Tasks 13 to 16).
4. **Very long text at the app's real size.** A 90-character title and a 40-character name must not make the page scroll sideways at 1280 and 1440 with large text on (pinned in Task 17).
5. **The preview switch failing.** If the preference read throws, or the user is removed from the allow-list while their preference is on, the page renders the current implementation and does not error (pinned in Task 11).

---

### Task 1: `daysLeft` and `formatTimeLeft`

**Files:**
- Create: `packages/shared/src/time/days-left.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)
- Test: `packages/shared/__tests__/days-left.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeadlineBasis = 'statute' | 'governing-docs' | 'contract' | 'event';
  export type TimeLeftLevel = 'calm' | 'aware' | 'urgent' | 'critical';
  export type TimeLeft =
    | { kind: 'left'; unit: 'days' | 'hours'; count: number; dueToday: boolean }
    | { kind: 'overdue'; unit: 'days' | 'hours'; count: number };
  export type TimeLeftStatus =
    | TimeLeft
    | { kind: 'met-late' }
    | { kind: 'out-of-window' }
    | { kind: 'no-clock' }
    | { kind: 'not-applicable' };
  export function daysLeft(deadline: Date, now: Date, timeZone: string): TimeLeft;
  export function formatTimeLeft(status: TimeLeftStatus, basis: DeadlineBasis, form: 'long' | 'short'): string;
  ```

Rules the tests pin (§12): remaining time is exact elapsed milliseconds, never rounded up. At 48 hours or more the unit is days, `count = floor(ms / 86_400_000)`. Under 48 hours the unit is hours, `count = floor(ms / 3_600_000)`. Any negative remainder is `overdue`, with days at 24 hours or more past and hours below that. `dueToday` is true when the deadline falls on the current calendar day in `timeZone`.

Wording, long form:

| Status | `statute`, `governing-docs` | `contract` | `event` |
|---|---|---|---|
| left, days | `9 days left` | `Ends in 9 days` | `In 9 days` |
| left, 1 day | `1 day left` | `Ends in 1 day` | `In 1 day` |
| left, hours | `14 hours left` | `Ends in 14 hours` | `In 14 hours` |
| left, 0 hours | `Under 1 hour left` | `Ends in under 1 hour` | `In under 1 hour` |
| overdue, days | `2 days overdue` | `Ended` | `Past` |
| overdue, hours | `3 hours overdue` | `Ended` | `Past` |
| overdue, 0 hours | `Overdue` | `Ended` | `Past` |
| met-late | `Met late` | `Ended` | `Past` |
| out-of-window | `Out of window` | same | same |
| no-clock | `No deadline applies` | same | same |
| not-applicable | `Does not apply` | same | same |

Short form replaces ` days`/` day` with `d` and ` hours`/` hour` with `h` (`9d left`, `14h left`, `2d overdue`); every other string is unchanged.

- [ ] **Step 1: Pre-check.** `ls packages/shared/__tests__ | head -3` lists test files; `grep -n "export \* from" packages/shared/src/index.ts | head -3` shows the barrel style to copy.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { daysLeft, formatTimeLeft } from '../src/time/days-left';

const NY = 'America/New_York';
const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe('daysLeft', () => {
  const now = at('2026-11-21T15:00:00Z');
  it('uses days at exactly 48 hours', () => {
    expect(daysLeft(new Date(now.getTime() + 48 * HOUR), now, NY)).toMatchObject({ kind: 'left', unit: 'days', count: 2 });
  });
  it('switches to hours one minute under 48 hours', () => {
    expect(daysLeft(new Date(now.getTime() + 48 * HOUR - 60_000), now, NY)).toMatchObject({ kind: 'left', unit: 'hours', count: 47 });
  });
  it('never rounds 23 hours up to a day', () => {
    expect(daysLeft(new Date(now.getTime() + 23 * HOUR), now, NY)).toMatchObject({ kind: 'left', unit: 'hours', count: 23 });
  });
  it('reports under an hour as zero hours left', () => {
    expect(daysLeft(new Date(now.getTime() + 59 * 60_000), now, NY)).toMatchObject({ kind: 'left', unit: 'hours', count: 0 });
  });
  it('is overdue one minute past, not due today', () => {
    expect(daysLeft(new Date(now.getTime() - 60_000), now, NY)).toEqual({ kind: 'overdue', unit: 'hours', count: 0 });
  });
  it('counts whole days overdue', () => {
    expect(daysLeft(new Date(now.getTime() - 25 * HOUR), now, NY)).toEqual({ kind: 'overdue', unit: 'days', count: 1 });
  });
  it('counts exact elapsed time across the Nov 1 clock change', () => {
    // 2026-11-01 06:00Z is 02:00 EDT -> 01:00 EST. Ten days of real time is ten days.
    const start = at('2026-10-28T12:00:00Z');
    expect(daysLeft(new Date(start.getTime() + 10 * 24 * HOUR), start, NY)).toMatchObject({ unit: 'days', count: 10 });
  });
  it('decides "today" in the community time zone', () => {
    const deadline = at('2026-11-22T04:30:00Z'); // Nov 21, 11:30 PM in New York
    expect(daysLeft(deadline, now, NY)).toMatchObject({ dueToday: true });
    expect(daysLeft(deadline, now, 'UTC')).toMatchObject({ dueToday: false });
  });
});

describe('formatTimeLeft', () => {
  it.each([
    [{ kind: 'left', unit: 'days', count: 9, dueToday: false }, 'statute', 'long', '9 days left'],
    [{ kind: 'left', unit: 'days', count: 1, dueToday: false }, 'statute', 'long', '1 day left'],
    [{ kind: 'left', unit: 'hours', count: 0, dueToday: true }, 'statute', 'long', 'Under 1 hour left'],
    [{ kind: 'overdue', unit: 'hours', count: 0 }, 'statute', 'long', 'Overdue'],
    [{ kind: 'overdue', unit: 'days', count: 2 }, 'governing-docs', 'long', '2 days overdue'],
    [{ kind: 'overdue', unit: 'days', count: 27 }, 'contract', 'long', 'Ended'],
    [{ kind: 'left', unit: 'days', count: 24, dueToday: false }, 'contract', 'long', 'Ends in 24 days'],
    [{ kind: 'left', unit: 'days', count: 12, dueToday: false }, 'event', 'long', 'In 12 days'],
    [{ kind: 'overdue', unit: 'days', count: 3 }, 'event', 'long', 'Past'],
    [{ kind: 'met-late' }, 'statute', 'long', 'Met late'],
    [{ kind: 'no-clock' }, 'statute', 'long', 'No deadline applies'],
    [{ kind: 'left', unit: 'days', count: 9, dueToday: false }, 'statute', 'short', '9d left'],
    [{ kind: 'overdue', unit: 'days', count: 2 }, 'statute', 'short', '2d overdue'],
  ] as const)('%j %s %s -> %s', (status, basis, form, expected) => {
    expect(formatTimeLeft(status, basis, form)).toBe(expected);
  });
  it('never says overdue for a contract or an event', () => {
    for (const basis of ['contract', 'event'] as const) {
      expect(formatTimeLeft({ kind: 'overdue', unit: 'days', count: 5 }, basis, 'long')).not.toMatch(/overdue/i);
    }
  });
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm --filter @propertypro/shared exec vitest run __tests__/days-left.test.ts` — expected: FAIL, cannot resolve `../src/time/days-left`.

- [ ] **Step 4: Implement** `daysLeft` and `formatTimeLeft` in `packages/shared/src/time/days-left.ts` with the signatures above. Use `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })` to compare calendar days. No `date-fns` (it is local-calendar). Export from `packages/shared/src/index.ts`.

- [ ] **Step 5: Run to verify pass.** Same command — expected: PASS, 22 tests.

- [ ] **Step 6: Revert-check.** Change `floor` to `ceil` in the hours branch; confirm "never rounds 23 hours up" stays green and "switches to hours one minute under 48 hours" goes red with `count: 48`; restore.

- [ ] **Step 7: Commit.** `git add packages/shared/src/time/days-left.ts packages/shared/src/index.ts packages/shared/__tests__/days-left.test.ts && git commit -m "shared: one daysLeft formatter that never rounds remaining time up"`

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

### Task 3: `TimeLeft`

**Files:**
- Create: `packages/ui/src/components/shared/time-left.tsx`
- Test: `packages/ui/src/components/shared/__tests__/time-left.test.tsx`

**Interfaces:**
- Consumes: `TimeLeftStatus`, `DeadlineBasis`, `TimeLeftLevel`, `formatTimeLeft` from `@propertypro/shared` (Task 1).
- Produces:
  ```ts
  type Common = { status: TimeLeftStatus; label?: string; form?: 'long' | 'short'; className?: string };
  export type TimeLeftProps =
    | (Common & { basis: 'statute'; level: TimeLeftLevel; citation: string })
    | (Common & { basis: 'governing-docs'; level: TimeLeftLevel })
    | (Common & { basis: 'contract'; level: Exclude<TimeLeftLevel, 'critical'> })
    | (Common & { basis: 'event' });
  export function TimeLeft(props: TimeLeftProps): JSX.Element;
  ```

Rules (§12): the level is passed in; the component does no date arithmetic. Four pips, `aria-hidden`, filled count calm 1, aware 2, urgent 3, critical 4; filled colour `bg-status-info` for calm, `bg-status-warning` for aware and urgent, `bg-status-danger` for critical; unfilled `bg-edge-strong`. `event` renders no pips. The count text is `text-sm font-medium tabular-nums`, and takes `text-status-danger` only at critical. `label` renders after the count in `text-content-secondary`. In short form the root has `aria-label` equal to the long wording, then `label` if present, then the level, comma-separated. `citation` is not rendered here; it is required so a statutory chip cannot be written without one (the page renders `StatuteChip` beside it in Plan C).

- [ ] **Step 1: Pre-check.** `grep -n "status-info\|status-warning\|status-danger\|edge-strong" apps/web/tailwind.config.ts | head` shows all four classes exist.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimeLeft } from '../time-left';

const left9 = { kind: 'left', unit: 'days', count: 9, dueToday: false } as const;

describe('TimeLeft', () => {
  it('says the count in words', () => {
    render(<TimeLeft basis="statute" level="aware" citation="§718.111(12)(g)" status={left9} label="Dec 3" />);
    expect(screen.getByText('9 days left')).toBeVisible();
    expect(screen.getByText('Dec 3')).toBeVisible();
  });
  it('fills pips by level and hides them from assistive tech', () => {
    const { container } = render(<TimeLeft basis="statute" level="urgent" citation="§718.112(2)(c)" status={left9} />);
    const pips = container.querySelector('[data-pips]')!;
    expect(pips).toHaveAttribute('aria-hidden', 'true');
    expect(pips.querySelectorAll('[data-filled="true"]')).toHaveLength(3);
  });
  it('draws no pips for an event', () => {
    const { container } = render(<TimeLeft basis="event" status={left9} />);
    expect(container.querySelector('[data-pips]')).toBeNull();
    expect(screen.getByText('In 9 days')).toBeVisible();
  });
  it('names the level in the short form', () => {
    render(<TimeLeft basis="statute" level="urgent" citation="§718.112(2)(c)" status={left9} label="Dec 3" form="short" />);
    expect(screen.getByLabelText('9 days left, Dec 3, urgent')).toBeInTheDocument();
    expect(screen.getByText('9d left')).toBeVisible();
  });
  it('cannot be critical for a contract, or statutory without a citation', () => {
    // @ts-expect-error a contract date is never critical
    render(<TimeLeft basis="contract" level="critical" status={left9} />);
    // @ts-expect-error a statutory deadline must name its citation
    render(<TimeLeft basis="statute" level="calm" status={left9} />);
  });
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm --filter @propertypro/ui exec vitest run src/components/shared/__tests__/time-left.test.tsx` — FAIL.
- [ ] **Step 4: Implement** `TimeLeft`. Check that `packages/ui/package.json` lists `@propertypro/shared` as a dependency; if not, add it as `workspace:*` and run `pnpm install`.
- [ ] **Step 5: Run to verify pass**, then `pnpm --filter @propertypro/ui typecheck` — exit 0.
- [ ] **Step 6: Commit.** `git commit -m "ui: TimeLeft chip with a required basis and a level it does not compute"`

---

### Task 4: `Icon` and the icon registry

**Files:**
- Create: `packages/ui/src/components/shared/icon-registry.ts`, `packages/ui/src/components/shared/icon.tsx`
- Test: `packages/ui/src/components/shared/__tests__/icon.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export const ICON_REGISTRY: Record<IconKey, LucideIcon>;   // icon-registry.ts
  export type IconKey = 'home' | 'announcements' | 'emergency' | 'documents' | 'meetings' | 'compliance'
    | 'maintenance' | 'violations' | 'arc' | 'packages' | 'visitors' | 'directory' | 'leases' | 'move'
    | 'contracts' | 'insurance' | 'storm' | 'reserves' | 'payments' | 'assessments' | 'board' | 'esign'
    | 'website' | 'settings' | 'help' | 'search' | 'close' | 'more' | 'back' | 'expand';
  export interface IconProps { icon: IconKey | LucideIcon; size?: 'sm' | 'md' | 'lg'; label?: string; className?: string }
  export function Icon(props: IconProps): JSX.Element;
  ```

Registry values, in key order (§11.6): `LayoutDashboard, Megaphone, Siren, FileText, Calendar, ClipboardCheck, Wrench, TriangleAlert, Paintbrush, Package, UserCheck, Users, KeyRound, Truck, BriefcaseBusiness, Umbrella, CloudRain, Landmark, CreditCard, Receipt, Vote, FileSignature, Globe, Settings, LifeBuoy, Search, X, Ellipsis, ArrowLeft, ChevronDown`.

Rules: sizes `sm` `size-4`, `md` `size-5`, `lg` `size-6`; default `sm`. `strokeWidth={1.6}`. Colour is inherited. With `label`, the svg has `role="img"` and `aria-label`; without, `aria-hidden="true"`.

- [ ] **Step 1: Pre-check.** `node -e "const l=require('lucide-react');for(const n of ['TriangleAlert','BriefcaseBusiness','KeyRound','Ellipsis','FileSignature','LifeBuoy'])console.log(n,typeof l[n])"` run from `apps/web` prints `object` or `function` for each. If a name is missing, report it; do not substitute.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render } from '@testing-library/react';
import { Wrench } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Icon } from '../icon';
import { ICON_REGISTRY } from '../icon-registry';

describe('Icon', () => {
  it('is decorative without a label', () => {
    const { container } = render(<Icon icon="packages" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('is named with a label', () => {
    const { getByRole } = render(<Icon icon="close" label="Close" />);
    expect(getByRole('img', { name: 'Close' })).toBeInTheDocument();
  });
  it('sizes from the closed set', () => {
    const { container } = render(<Icon icon={Wrench} size="lg" />);
    expect(container.querySelector('svg')).toHaveClass('size-6');
  });
  it('gives every concept exactly one icon', () => {
    const concepts = Object.entries(ICON_REGISTRY).filter(([k]) => !['search', 'close', 'more', 'back', 'expand'].includes(k));
    expect(new Set(concepts.map(([, v]) => v)).size).toBe(concepts.length);
  });
  it('rejects a key outside the registry', () => {
    // @ts-expect-error not a registry key
    render(<Icon icon="unicorn" />);
  });
});
```

- [ ] **Step 3: Run to verify failure**, **Step 4: implement**, **Step 5: run to verify pass** and `pnpm --filter @propertypro/ui typecheck`.
- [ ] **Step 6: Commit.** `git commit -m "ui: Icon wrapper and a one-concept-one-icon registry"`

---

### Task 5: Section kit

**Files:**
- Create: `packages/ui/src/components/shared/section.tsx`, `apps/web/src/components/shared/section.tsx`
- Test: `packages/ui/src/components/shared/__tests__/section.test.tsx`

**Interfaces:**
- Produces (from `section.tsx`):
  ```ts
  export function Section(props: React.HTMLAttributes<HTMLElement> & { bare?: boolean }): JSX.Element; // <section>; bare drops border and background (for card records)
  export function SectionGroup(props: { title: string; description?: string; children: React.ReactNode }): JSX.Element;
  export function SectionHeader(props: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }): JSX.Element;
  export function SectionToolbar(props: { filters?: React.ReactNode; search?: React.ReactNode; bulk?: React.ReactNode }): JSX.Element;
  export function SectionRow(props: { label: React.ReactNode; description?: React.ReactNode; control?: React.ReactNode; className?: string }): JSX.Element;
  export function SectionFooter(props: { note?: React.ReactNode; children?: React.ReactNode }): JSX.Element;
  ```
- The web file re-exports all six by file path and adds `SectionLinkRow({ href, title, description })` using `next/link`.

Classes (§5.5, §11.4): `Section` `overflow-hidden rounded-md border border-edge bg-surface-card`; `SectionHeader` `flex items-center justify-between gap-3 border-b border-edge-strong px-4 py-3` with an `<h2 className="text-base font-semibold text-content">`; `SectionToolbar` `flex items-center gap-3 border-b border-edge px-4`, `filters` in a `min-w-0 flex-1 overflow-x-auto` strip, `bulk` shown in place of `filters` when present; rows `px-4 py-3` with `border-t border-edge` between; `SectionFooter` `flex items-center justify-between gap-3 border-t border-edge px-4 py-2 text-xs text-content-secondary`.

- [ ] **Step 1: Pre-check.** `grep -n "^export function" apps/web/src/components/settings/settings-layout.tsx` lists the six Settings parts these mirror; read `SettingsRow` and `SettingsCardFooter` for behaviour to keep.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section, SectionFooter, SectionHeader, SectionToolbar } from '../section';

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
});
```

- [ ] **Step 3: Run to verify failure**, **Step 4: implement** both files, **Step 5: run to verify pass**; then `pnpm --filter @propertypro/ui build && pnpm guard:class-resolution` — exit 0.
- [ ] **Step 6: Commit.** `git commit -m "ui: shared Section kit (header, toolbar, row, footer, group)"`

---

### Task 6: `RecordRow`

**Files:**
- Create: `packages/ui/src/components/shared/record-row.tsx`
- Test: `packages/ui/src/components/shared/__tests__/record-row.test.tsx`

**Interfaces:**
- Consumes: `StatusGlyph` (Task 2), `Icon` (Task 4).
- Produces:
  ```ts
  export interface RecordRowProps {
    lead: React.ReactNode;            // a <StatusGlyph hideLabel> or an <Icon>
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
  export type SidePanelProps =
    | { template: 'list' | 'canvas'; glance?: Slot; attention?: Slot; shortcuts?: Slot; about?: Slot }
    | { template: 'detail'; details?: Slot; attention?: Slot; related?: Slot; about?: Slot }
    | { template: 'form'; preview?: Slot; attention?: Slot; about?: Slot }
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

- [ ] **Step 1: Pre-check.** `grep -n "font-display\|fontFamily" apps/web/tailwind.config.ts | head -5` shows a `display` family class; if the class is named differently, use that name here and in Task 9.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isPanelWorthDrawing, PanelAttention, PanelGlance, panelRegions } from '../side-panel';

describe('SidePanel', () => {
  it('orders positions regardless of how props are written', () => {
    const r = panelRegions({ template: 'list', about: 'a', shortcuts: 's', attention: 'n', glance: 'g' });
    expect(r.lead.map((x) => x.heading)).toEqual(['At a glance', 'Needs attention']);
    expect(r.trail.map((x) => x.heading)).toEqual(['Shortcuts', 'About']);
  });
  it('renames positions per template', () => {
    const r = panelRegions({ template: 'detail', details: 'd', related: 'r' });
    expect([...r.lead, ...r.trail].map((x) => x.heading)).toEqual(['Details', 'Related']);
  });
  it('is not worth drawing with only About', () => {
    expect(isPanelWorthDrawing({ template: 'list', about: 'Managers can send alerts.' })).toBe(false);
    expect(isPanelWorthDrawing({ template: 'list', glance: 'g' })).toBe(true);
    expect(isPanelWorthDrawing({ template: 'list' })).toBe(false);
  });
  it('rejects a position that belongs to another template', () => {
    // @ts-expect-error a detail panel has no shortcuts
    panelRegions({ template: 'detail', shortcuts: 's' });
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

### Task 8: `PageLayout`, `PageTabs`, and the `cq-xl` variant

**Files:**
- Create: `packages/ui/src/components/shared/page-layout.tsx`, `packages/ui/src/components/shared/page-tabs.tsx`
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
  export interface PageTab { id: string; label: string; count?: number; href: string }
  export function PageTabs(props: { tabs: PageTab[]; active: string; renderLink: (tab: PageTab, className: string, children: React.ReactNode) => React.ReactNode }): JSX.Element;
  ```

Rules (§5.1, §5.4, §13): the root is `<div data-page-template={template} class="cq flex flex-col gap-5">`. Order in the document: banner, header, tabs, then a grid holding lead regions (`<aside aria-label="Summary">`), the main column, trail regions (`<aside aria-label="More about this page">`) — in that DOM order, always. Layout: with `records` `rows` or `cards`, the grid is one column by default and `cq-lg:grid-cols-[minmax(0,1fr)_17.5rem]` with lead and trail both placed in column 2 by `grid-column`/`grid-row`, main spanning both rows in column 1. With `records="table"` the same switch happens at `cq-xl:` and not at `cq-lg:`. No `order-*` utilities and no reversed flex: placement is by grid lines only. When `panel` is absent or `isPanelWorthDrawing` is false, neither aside renders; if the panel had an `about`, it renders as a `text-sm text-content-secondary` paragraph directly under the header. `template="focus"` ignores `panel` and centres children at `max-w-2xl`. `PageTabs` is a `<nav aria-label="Sections">` of links; the active one has `aria-current="page"` and `border-b-2 border-content` (ink, not coral); a count renders in `text-xs tabular-nums`.

`cq-xl` is `@container cq (min-width: 1280px)`.

- [ ] **Step 1: Pre-check.** `sed -n 300,312p apps/web/tailwind.config.ts` shows the three `addVariant("cq-…")` lines.
- [ ] **Step 2: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageLayout, useInPageLayout } from '../page-layout';
import { PageTabs } from '../page-tabs';

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
    const { container } = render(<PageLayout template="list" header={null} panel={{ template: 'list', glance: 'g', about: 'a' }}>x</PageLayout>);
    expect(container.innerHTML).not.toMatch(/\border-(first|last|\d)/);
  });
  it('folds an About-only panel into a line under the header', () => {
    const { container } = render(<PageLayout template="list" header={<h1>Forum</h1>} panel={{ template: 'list', about: 'Anyone on the board can post.' }}>x</PageLayout>);
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByText('Anyone on the board can post.')).toBeVisible();
  });
  it('tells descendants they are inside a layout', () => {
    render(<><Probe /><PageLayout template="list" header={<Probe />}>x</PageLayout></>);
    expect(screen.getAllByText(/in|out/).map((e) => e.textContent)).toEqual(['out', 'in']);
  });
  it('marks the active tab without coral', () => {
    render(<PageTabs tabs={[{ id: 'a', label: 'Visitors', href: '?tab=a', count: 5 }, { id: 'b', label: 'Denied list', href: '?tab=b' }]} active="a" renderLink={(t, c, ch) => <a href={t.href} className={c} aria-current={t.id === 'a' ? 'page' : undefined}>{ch}</a>} />);
    const active = screen.getByRole('link', { name: /Visitors/ });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).not.toMatch(/interactive/);
  });
});
```

- [ ] **Step 3 to 5:** run to fail; add the `cq-xl` variant; implement both files (`page-layout.tsx` needs `"use client"` for the context — it is the only kit file that does); run to pass; `pnpm --filter @propertypro/ui build && pnpm guard:class-resolution && pnpm exec tsx scripts/verify-shared-side-effects.ts --root packages/ui/src` — the last must report no finding other than `"use client"` prologues and `displayName` assignments.
- [ ] **Step 6: Commit.** `git commit -m "ui: PageLayout and PageTabs; table pages hold the panel to a wider box"`

---

### Task 9: `PageHeader` paints inside a `PageLayout`

**Files:**
- Modify: `apps/web/src/components/shared/page-header.tsx`
- Test: `apps/web/__tests__/components/shared/page-header.test.tsx` (extend; keep every existing case)

**Interfaces:**
- Consumes: `useInPageLayout` (Task 8), `Icon`, `IconKey` (Task 4).
- Produces: `PageHeaderProps` gains `icon?: IconKey` and `status?: React.ReactNode`. Outside a `PageLayout` the component behaves exactly as today.

Rules (§5.2): inside a layout the `<h1>` is `font-display text-3xl font-medium tracking-tight text-content` with no `sr-only`; `description` renders as `text-sm text-content-secondary` under it; `icon` renders the place mark before the title: a `size-9 rounded-md bg-surface-inverse text-content-inverse` tile holding `<Icon size="md">`; `status` renders after the title; the block has `border-b border-edge-strong pb-4`. `children` and `actions` keep their current positions.

- [ ] **Step 1: Pre-check.** `sed -n 1,78p apps/web/src/components/shared/page-header.tsx` matches the shape in the spec history (an `h1.sr-only`, `_description` unused, a toolbar of `children` and `actions`); `grep -n "sr-only\|does not paint" apps/web/__tests__/components/shared/page-header.test.tsx` shows the two pinned assertions.
- [ ] **Step 2: Add the failing tests** (below the existing ones)

```tsx
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';

it('paints the title and description inside a PageLayout', () => {
  render(<PageLayout template="list" header={<PageHeader title="Packages" description="Log deliveries as they arrive." icon="packages" />}>x</PageLayout>);
  const h1 = screen.getByRole('heading', { level: 1, name: 'Packages' });
  expect(h1).not.toHaveClass('sr-only');
  expect(screen.getByText('Log deliveries as they arrive.')).toBeVisible();
});
it('still hides the title and drops the description outside a PageLayout', () => {
  render(<PageHeader title="Packages" description="Log deliveries as they arrive." />);
  expect(screen.getByRole('heading', { level: 1, name: 'Packages' })).toHaveClass('sr-only');
  expect(screen.queryByText('Log deliveries as they arrive.')).toBeNull();
});
```

- [ ] **Step 3: Run to verify failure.** `pnpm --filter @propertypro/ui build && pnpm test apps/web/__tests__/components/shared/page-header.test.tsx` — the first new test FAILS on `sr-only`; all earlier tests pass.
- [ ] **Step 4: Implement.** Rewrite the file's docblock to describe both behaviours.
- [ ] **Step 5: Run to verify pass**, then `pnpm guard:page-header && pnpm guard:breadcrumbs` — exit 0.
- [ ] **Step 6: Revert-check.** Remove the `useInPageLayout()` branch; the first new test goes red, the second and all older tests stay green; restore.
- [ ] **Step 7: Commit.** `git commit -m "web: PageHeader paints its title and description only inside a PageLayout"`

---

### Task 10: `describeAccess`

**Files:**
- Create: `apps/web/src/lib/access/describe-access.ts`
- Test: `apps/web/__tests__/lib/access/describe-access.test.ts`

**Interfaces:**
- Consumes: `RBAC_MATRIX`, `RBAC_RESOURCES`, `MATRIX_ROLES`, `RbacResource` from `@propertypro/shared`.
- Produces: `export function describeAccess(resource: RbacResource): string;`

Rules (§14.2): the sentence is built only from the matrix. Role words: `manager` "Managers", `owner` "Owners", `tenant` "Tenants"; owners and tenants together are "Residents". Templates, chosen by who can write and who can only read:

- writers and read-only roles both exist: `"{Writers} can add and change these. {Readers} can see them."`
- everyone who can read can write: `"{Writers} can add and change these."`
- nobody can write: `"{Readers} can see these."`
- a role with no read is never named.

- [ ] **Step 1: Pre-check.** `sed -n 430,450p packages/shared/src/rbac-matrix.ts` shows `RBAC_MATRIX` keyed by role then resource with `read`/`write` booleans. If the shape differs (resource then role), keep the public signature and adapt the lookup.
- [ ] **Step 2: Write the failing tests**

```ts
import { MATRIX_ROLES, RBAC_MATRIX, RBAC_RESOURCES } from '@propertypro/shared';
import { describe, expect, it } from 'vitest';
import { describeAccess } from '@/lib/access/describe-access';

const WORD = { manager: 'Managers', owner: 'Owners', tenant: 'Tenants' } as const;

describe('describeAccess', () => {
  it.each(RBAC_RESOURCES)('%s names exactly the roles the matrix admits', (resource) => {
    const sentence = describeAccess(resource);
    for (const role of MATRIX_ROLES) {
      const canRead = RBAC_MATRIX[role][resource].read;
      const named = sentence.includes(WORD[role]) || (role !== 'manager' && sentence.includes('Residents'));
      expect(named, `${role} on ${resource}: "${sentence}"`).toBe(canRead);
    }
  });
  it('says Residents only when owners and tenants both have access', () => {
    for (const resource of RBAC_RESOURCES) {
      if (describeAccess(resource).includes('Residents')) {
        expect(RBAC_MATRIX.owner[resource].read && RBAC_MATRIX.tenant[resource].read).toBe(true);
      }
    }
  });
  it('never claims something can be undone', () => {
    for (const resource of RBAC_RESOURCES) expect(describeAccess(resource)).not.toMatch(/undo|undone|restore/i);
  });
});
```

- [ ] **Step 3 to 5:** run `pnpm test apps/web/__tests__/lib/access/describe-access.test.ts` to fail, implement, run to pass.
- [ ] **Step 6: Commit.** `git commit -m "web: describeAccess builds the About sentence from the permission matrix"`

---

### Task 11: The preview switch

**Files:**
- Create: `apps/web/src/lib/design-preview.ts`, `apps/web/src/app/api/v1/account/design-preview/contract.ts`, `apps/web/src/app/api/v1/account/design-preview/route.ts`, `apps/web/src/components/settings/design-preview-row.tsx`
- Modify: `apps/web/src/app/(authenticated)/settings/page.tsx` (render the row in the Display section when allowed), `.env.example` (document `DESIGN_PREVIEW_USER_IDS`)
- Test: `apps/web/__tests__/lib/design-preview.test.ts`, `apps/web/__tests__/account/design-preview-route.test.ts`

**Interfaces:**
- Consumes: `getUserPreference(userId, key)`, `setUserPreference(userId, key, value)` from `@/lib/services/user-preferences-service`.
- Produces:
  ```ts
  export const DESIGN_PREVIEW_KEY = 'design_direction_preview';
  export function isDesignPreviewAllowed(userId: string): boolean;          // userId is in env DESIGN_PREVIEW_USER_IDS (comma-separated)
  export async function isDesignPreviewOn(userId: string): Promise<boolean>; // allowed AND the stored preference is exactly true; false on any error
  ```
- Route: `PATCH /api/v1/account/design-preview`, body `{ enabled: boolean }`, response `{ enabled: boolean }`, written through `runRoute` with a contract, wrapped in `withErrorHandler`. Auth chain: `requireAuthenticatedUserId`, then `if (!isDesignPreviewAllowed(userId)) throw new ForbiddenError(...)`. No community scope. Carries `// route-gate: self-scoped — writes only the caller's own preference` above the export.

`isDesignPreviewOn` is wrapped in React `cache` so a page and its children read it once per request.

- [ ] **Step 1: Pre-check.** `sed -n 15,45p apps/web/src/lib/services/user-preferences-service.ts` confirms the two signatures; open `apps/web/src/app/api/v1/account/profile/route.ts` and its contract as the pattern for a session-anchored body route.
- [ ] **Step 2: Write the failing tests**

```ts
// design-preview.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { getUserPreferenceMock } = vi.hoisted(() => ({ getUserPreferenceMock: vi.fn() }));
vi.mock('@/lib/services/user-preferences-service', () => ({ getUserPreference: getUserPreferenceMock, setUserPreference: vi.fn() }));
import { isDesignPreviewAllowed, isDesignPreviewOn } from '@/lib/design-preview';

describe('design preview', () => {
  beforeEach(() => { vi.stubEnv('DESIGN_PREVIEW_USER_IDS', 'u-1, u-2'); getUserPreferenceMock.mockReset(); });
  it('allows only listed users', () => {
    expect(isDesignPreviewAllowed('u-2')).toBe(true);
    expect(isDesignPreviewAllowed('u-9')).toBe(false);
  });
  it('is off when the list is unset', () => {
    vi.stubEnv('DESIGN_PREVIEW_USER_IDS', '');
    expect(isDesignPreviewAllowed('u-1')).toBe(false);
  });
  it('is on only for an allowed user whose preference is exactly true', async () => {
    getUserPreferenceMock.mockResolvedValue(true);
    expect(await isDesignPreviewOn('u-1')).toBe(true);
    getUserPreferenceMock.mockResolvedValue('true');
    expect(await isDesignPreviewOn('u-2')).toBe(false);
  });
  it('is off for a user removed from the list even if their preference is on', async () => {
    getUserPreferenceMock.mockResolvedValue(true);
    expect(await isDesignPreviewOn('u-9')).toBe(false);
    expect(getUserPreferenceMock).not.toHaveBeenCalled();
  });
  it('is off, not an error, when the preference read throws', async () => {
    getUserPreferenceMock.mockRejectedValue(new Error('db down'));
    await expect(isDesignPreviewOn('u-1')).resolves.toBe(false);
  });
});
```

The route test covers: 200 with `{ data: { enabled: true } }` and `setUserPreference` called with `('u-1', 'design_direction_preview', true)`; 401 when unauthenticated; 403 for a user not on the list with `setUserPreference` not called; 400 for a body without a boolean `enabled`.

- [ ] **Step 3 to 5:** run both files to fail; implement; run to pass; `pnpm guard:contracts && pnpm guard:route-gates` — exit 0 and the Contracted count rises by one.
- [ ] **Step 6: Settings row.** `DesignPreviewRow` is a client component rendering a `SettingsRow` labelled "Preview the new design" with the description "Shows redesigned pages to you only. Other people see no change." and a `Switch`. The settings page renders it only when `isDesignPreviewAllowed(userId)`.
- [ ] **Step 7: Commit.** `git commit -m "web: owner-only design preview switch (allow-list plus per-user preference)"`

The owner sets the list with `vercel env add DESIGN_PREVIEW_USER_IDS --no-sensitive` on the web project (their Supabase user id), then redeploys.

---

### Task 12: Guards

**Files:**
- Create: `scripts/verify-page-template.ts`, `scripts/page-template-baseline.json`, `scripts/verify-icons.ts`, `scripts/icons-baseline.json`, `scripts/verify-panel-copy.ts`
- Modify: `package.json` (scripts `guard:page-template`, `guard:icons`, `guard:panel-copy`), `scripts/run-lint-guards.mjs` (add the three)
- Test: `scripts/__tests__/verify-page-template.test.ts`, `scripts/__tests__/verify-icons.test.ts`, `scripts/__tests__/verify-panel-copy.test.ts`

**Interfaces:**
- Each script exports a pure `scan(root: string): Result` and decides whether to run with `isMainModule(import.meta.url)` from `scripts/lib/is-main-module.ts`. Each accepts `--root <dir>` through `scripts/lib/root-arg.ts` and `--write-baseline`. Exit 0 clean, 1 violations, 2 could not check (missing root, zero files scanned, parse failure).

Rules (§16):

- **`guard:page-template`.** Roots under `apps/web/src/app`: `(authenticated)`, `(help)`, `auth`, `(auth)`, `sign`, `(print)`, `(site-editor)`, `public-transparency`, `demo`. `mobile` is excluded with the printed reason "phone app is a separate programme". A `page.tsx` passes when it, or the one component named in a top-of-file `// page-template: delegated to <path>` comment, contains a JSX `PageLayout` element; or it contains a `redirect(` call and no JSX element; or it carries `// page-template:exempt — <reason>`. Every other page must be listed in the baseline (per-file). A baselined file that now passes is a stale entry and fails. Second rule in the same script, per-file shrink-only counts: string literals containing all three of `rounded-`, `border` and `bg-surface-` in `apps/web/src`, outside `components/ui/` and `components/shared/`. Prints: pages scanned, compliant, redirect-only, baselined, exempt.
- **`guard:icons`.** In `apps/web/src` and `packages/ui/src/components/shared`: an import from `lucide-react` anywhere except `packages/ui/src/components/shared/icon.tsx`, `icon-registry.ts`, and type-only imports of `LucideIcon`; and a JSX element whose tag was imported from `lucide-react` carrying `size=`, `strokeWidth=` or a `className` containing `h-`/`w-`/`size-` followed by a digit. Per-file shrink-only baseline. `apps/admin` is excluded by name.
- **`guard:panel-copy`.** In any file that imports from `components/shared/side-panel`: a string literal or JSX text matching `/\b(Managers?|Owners?|Tenants?|Residents?) (can|may|see|sees)\b|can be undone|cannot be undone/`. No baseline; escape hatch `// panel-copy:exempt — <reason>`. Use `collectCommentRanges` to ignore comments.

- [ ] **Step 1: Pre-check.** `sed -n 1,40p scripts/verify-page-padding.ts` and `cat scripts/lib/root-arg.ts scripts/lib/is-main-module.ts` for the house pattern; `grep -n "guard:page-padding" package.json scripts/run-lint-guards.mjs` for where to register.
- [ ] **Step 2: Write the failing tests.** For each guard, three directions, with fixtures built under `fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'))` (never inside the repo):
  - passes on the real repo with its baseline: `scan(repoRoot)` returns no violations and a scanned count above zero;
  - fails on an injected violation: a fixture `page.tsx` returning `<div>hi</div>` is reported by path; a fixture importing `{ Siren } from 'lucide-react'` and rendering `<Siren className="h-4 w-4" />` is reported twice (import, sizing); a fixture importing `side-panel` and containing `"Managers can send alerts."` is reported;
  - refuses on nothing to check: `scan` of an empty temp directory yields exit status 2, and of a missing directory 2.
  - page-template only: a fixture with `redirect('/x')` and no JSX passes; a fixture with a `// page-template: delegated to ./view` comment passes when `view.tsx` holds `<PageLayout`, and fails when it does not; a baseline entry for a file that now passes is reported as stale.
- [ ] **Step 3: Run to verify failure.** `pnpm test scripts/__tests__/verify-page-template.test.ts` (and the other two) — FAIL, modules not found.
- [ ] **Step 4: Implement** the three scripts with the TypeScript parser (`ts.createSourceFile`), not regular expressions over raw text.
- [ ] **Step 5: Seed baselines.** `pnpm exec tsx scripts/verify-page-template.ts --write-baseline` and `pnpm exec tsx scripts/verify-icons.ts --write-baseline`; read both files; confirm the page count is close to 130 and the icon file count close to 232.
- [ ] **Step 6: Run to verify pass**, then `pnpm lint` — exit 0, and its summary lists 38 guards.
- [ ] **Step 7: Commit.** `git commit -m "guards: page-template, icons and panel-copy, each with a shrink-only baseline"`

---

### Task 13: Pilot — Packages, staff view

**Files:**
- Create: `apps/web/src/components/packages/next/packages-staff-next.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/packages/page.tsx` (branch on the preview switch), `apps/web/src/components/packages/package-columns.tsx` only if a column needs a priority order (see rules)
- Test: `apps/web/__tests__/packages/packages-staff-next.test.tsx`

**Interfaces:**
- Consumes: `PageLayout` (Task 8), `PageHeader` (Task 9), `Section*` (Task 5), `PanelGlance`, `PanelLinks` (Task 7), `describeAccess` (Task 10), `isDesignPreviewOn` (Task 11), `usePackages`, `usePickupPackage` from `@/hooks/use-packages`, the existing `DataTable`, `QuickFilterTabs`, `PackageLogForm`.
- Produces: `export function PackagesStaffNext({ communityId }: { communityId: number }): JSX.Element` (client component).

Decisions (§5, §14.1):

- `PageLayout template="list" records="table"`.
- Header: title "Packages", icon `packages`, description "Log deliveries as they arrive. Residents are told when a package is ready to collect.", one primary "Log a package" opening the existing log form.
- Toolbar filters: the existing three (`pending` labelled "Awaiting pickup", `picked_up` "Picked up", all "All"), with counts computed from the loaded list. No search unless the current view has one.
- Footer: "Showing N". No "of M".
- Panel, position 1: figure = count of packages whose `status !== 'picked_up'`, unit "awaiting pickup", `source="usePackages"`, computed from the same query result as the table. Lines: "Picked up" with the count of `picked_up`. No other lines.
- Panel, position 2: **omitted.** The code has no rule for a package waiting too long, so no attention condition exists. Do not invent one.
- Panel, position 3: omitted unless the current page already links elsewhere.
- Panel, position 4: `describeAccess('packages')`; if `packages` is not an `RbacResource`, use the resource the route's `requirePermission` call names.
- States: loading uses skeleton rows in the section and `aria-busy`; error renders the section error block with "Try again" calling the query's `refetch`; zero packages renders the first-run section: heading "No packages logged yet", sentence "Log the first delivery and the resident gets a notice straight away.", the primary action, and one example row built with the real columns and labelled "Example of a logged package"; a filter with no matches renders "Nothing matches this filter" with "Show all".
- `page.tsx`: after resolving `userId`, `const preview = await isDesignPreviewOn(userId)`; when true and the viewer is staff, render `<PackagesStaffNext communityId={…} />` in place of the current header and `PackageStaffView`. The `FeatureGate` wrapper stays.

- [ ] **Step 1: Pre-check.** `sed -n 36,60p apps/web/src/components/packages/PackageStaffView.tsx` shows `usePackages(communityId)` and the three filters; `sed -n 15,35p apps/web/src/hooks/use-packages.ts` shows the `status` union `'received' | 'notified' | 'picked_up'`; `grep -n "requirePermission\|isAdminRole" "apps/web/src/app/(authenticated)/dashboard/packages/page.tsx"` shows how staff is decided.
- [ ] **Step 2: Write the failing tests** (mock `@/hooks/use-packages` with `vi.hoisted`):
  - with three packages (two `received`, one `picked_up`): the `h1` "Packages" is visible; the glance figure reads `2` with "awaiting pickup" and its root has `data-source="usePackages"`; the "Awaiting pickup" filter shows `2`; the footer reads "Showing 2".
  - the figure and the table agree: after the mock returns four `received`, the figure reads `4` and the table has four body rows.
  - with zero packages: the heading "No packages logged yet" and "Example of a logged package" are visible, the glance figure reads `0`, and one button named "Log a package" exists in the header.
  - while loading: the section has `aria-busy="true"` and the `h1` is already visible.
  - on error: an element with `role="alert"` is visible and clicking "Try again" calls `refetch` once.
  - there is no "Needs attention" heading.
  - axe: `expect(await axe(container)).toHaveNoViolations()` on the three-package render, after asserting the table has rows.
- [ ] **Step 3 to 5:** run `pnpm test apps/web/__tests__/packages/packages-staff-next.test.tsx` to fail; implement; run to pass.
- [ ] **Step 6: Guards.** `pnpm guard:page-template` reports `dashboard/packages/page.tsx` as stale in the baseline; run `--write-baseline`, confirm the diff removes exactly that entry. `pnpm guard:panel-copy && pnpm guard:icons && pnpm guard:design-tokens && pnpm guard:class-resolution` — exit 0.
- [ ] **Step 7: Commit.** `git commit -m "packages: staff page on the page kit, behind the design preview"`

---

### Task 14: Pilot — Packages, resident view

**Files:**
- Create: `apps/web/src/components/packages/next/packages-resident-next.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/packages/page.tsx`
- Test: `apps/web/__tests__/packages/packages-resident-next.test.tsx`

**Interfaces:**
- Consumes: as Task 13, plus `RecordList`, `RecordRow` (Task 6), `StatusGlyph` (Task 2), `useMyPackages`.
- Produces: `export function PackagesResidentNext({ communityId }: { communityId: number }): JSX.Element`.

Decisions (§5.8): `PageLayout template="list" records="rows"` with **no panel**. Title "My packages", description "Packages logged for your unit, and whether they are ready to collect." No primary action. Each package is a `RecordRow`: lead `StatusGlyph` (`in-progress` "Ready to collect" for `received`/`notified`, `done` "Picked up"), title = carrier and description as the current resident view composes them, meta = received date. First-run: heading "No packages for you yet", sentence "When staff log a delivery for your unit it appears here and you get a notice." No example row for residents.

- [ ] **Step 1: Pre-check.** Read `apps/web/src/components/packages/PackageResidentView.tsx` for which fields it shows and how it words them; keep that wording.
- [ ] **Step 2: Write the failing tests:** no `aside` is rendered; no management figure text ("awaiting pickup") appears; a `received` package shows the words "Ready to collect"; zero packages shows the first-run heading and no button; axe passes on a two-package render.
- [ ] **Step 3 to 6:** run to fail, implement, run to pass, commit `"packages: resident page on the page kit, no management figures"`.

---

### Task 15: Pilot — Emergency Alerts list

**Files:**
- Create: `apps/web/src/components/emergency/next/emergency-list-next.tsx`, `apps/web/src/lib/emergency/reach-summary.ts`
- Modify: `apps/web/src/app/(authenticated)/emergency/page.tsx`
- Test: `apps/web/__tests__/emergency/emergency-list-next.test.tsx`, `apps/web/__tests__/emergency/reach-summary.test.ts`

**Interfaces:**
- Consumes: the kit; `resolveEmergencyRecipients` and `listBroadcastsForRecipient` from `@/lib/services/emergency-broadcast-service`; the page's existing `broadcasts` mapping.
- Produces:
  ```ts
  // reach-summary.ts
  export interface ReachSummary { reachable: number; byEmail: number; byText: number | null }  // byText is null when SMS is not available to this community
  export function summarizeReach(recipients: Array<{ email?: string | null; phone?: string | null; smsOptIn?: boolean }>, smsEnabled: boolean): ReachSummary;
  // emergency-list-next.tsx  (server component)
  export function EmergencyListNext(props: { view: 'manager'; broadcasts: ManagerBroadcast[]; reach: ReachSummary; communityId: number } | { view: 'recipient'; broadcasts: RecipientBroadcast[]; communityId: number }): JSX.Element;
  ```

Decisions:

- `PageLayout template="list" records="rows"`. Title "Emergency Alerts", icon `emergency`, description "Send urgent notices by text and email. Every alert is logged with who received it."
- **Manager view.** Primary "Send alert" linking to the existing new-alert route. No secondary: the code has no "send a test". Each alert is a `RecordRow`: lead `StatusGlyph` by severity (`emergency` → `overdue` "Emergency"; `urgent` → `attention` "Urgent"; `info` → `in-progress` "Info"; a cancelled alert → `not-started` "Cancelled"); meta = sent date and time in the community time zone; outcome = "Delivered to all N" when `failedCount === 0`, otherwise "{delivered} of {recipients} delivered, {failed} not reached" with `outcomeTone="problem"`. Footer "Showing N".
- Panel position 1: figure `reach.reachable`, unit "residents reachable", `source="resolveEmergencyRecipients"`. Lines: "By email" always; "By text" **only when `reach.byText !== null`**.
- Panel position 2: `PanelAttention none="Nothing needs attention."` — the code computes no unreachable-resident list here; do not invent one.
- Panel position 4: `describeAccess('emergency_broadcasts')`.
- **Recipient view** (non-admins, as the page branches today): no panel, no delivery outcomes, no primary. Title and description as above; first-run sentence "Alerts sent to you appear here."
- First-run, manager: heading "No alerts sent yet", sentence "When you send one it appears here with who received it and who did not.", the primary action, and one example row labelled "Example of a sent alert".
- `summarizeReach` counts a recipient as reachable with an email, or with a phone and SMS opt-in when `smsEnabled`; `byText` is `null` when `!smsEnabled`.

- [ ] **Step 1: Pre-check.** `sed -n 765,800p apps/web/src/lib/services/emergency-broadcast-service.ts` for the exact return shape of `resolveEmergencyRecipients` (adapt `summarizeReach`'s input type to it, keeping its output type); `sed -n 55,70p "apps/web/src/app/(authenticated)/emergency/new/page.tsx"` for how SMS availability is decided, and reuse that same check for `smsEnabled`.
- [ ] **Step 2: Write the failing tests.**
  - `summarizeReach`: three recipients (email only; phone with opt-in; neither) with `smsEnabled=true` → `{ reachable: 2, byEmail: 1, byText: 1 }`; same input with `smsEnabled=false` → `{ reachable: 1, byEmail: 1, byText: null }`.
  - manager view with one failed delivery: the row shows "142 of 147 delivered, 5 not reached" with the warning class; a fully delivered row shows "Delivered to all 48" without it; each row's meta begins with its severity word.
  - **SMS off:** with `reach.byText === null`, the text "By text" is not in the document.
  - **recipient view:** no `aside`, no text matching `/delivered|reachable/i`, no link named "Send alert".
  - zero alerts, manager: first-run heading, example label and exactly one "Send alert" link.
  - axe on the manager render.
- [ ] **Step 3 to 5:** run to fail, implement, wire the branch in `page.tsx` (both the admin and non-admin returns), run to pass.
- [ ] **Step 6: Revert-check.** Remove the `reach.byText !== null` condition; the "SMS off" test goes red with "By text" found; the others stay green; restore.
- [ ] **Step 7:** refresh the page-template baseline for this file; run the four guards; commit `"emergency: alerts list on the page kit; reach figures obey the SMS gate and the viewer's role"`.

---

### Task 16: Pilot — Emergency alert detail, new alert, and Visitors

Three small pages that prove the detail and form templates and tabs. One pull request each; they touch disjoint files.

**16a. Alert detail**

- Files: create `apps/web/src/components/emergency/next/emergency-detail-next.tsx`; modify `apps/web/src/app/(authenticated)/emergency/[id]/page.tsx`; test `apps/web/__tests__/emergency/emergency-detail-next.test.tsx`.
- `PageLayout template="detail" records="table"`. Title = the alert's title; `status` = `StatusGlyph` with the severity word; no primary. Main: a "Message" section with the body, then a "Delivery" section reusing the existing `DeliveryReport`. Panel `details`: Severity, Sent (community time zone), Audience, Channels as label and value pairs; `about`: `describeAccess('emergency_broadcasts')`.
- The page is a client component loading through `useEmergencyBroadcast`; the panel reads that same hook's data. Recipients (non-admins) get no "Delivery" section and no panel.
- Pre-check: `sed -n 15,60p "apps/web/src/app/(authenticated)/emergency/[id]/page.tsx"`.
- Tests: the `h1` is the alert title; "Details" lists the four labels; a non-admin render has no "Delivery" heading; loading shows the `h1` skeleton and `aria-busy`; axe passes.

**16b. New alert**

- Files: create `apps/web/src/components/emergency/next/emergency-new-next.tsx`; modify `apps/web/src/app/(authenticated)/emergency/new/page.tsx`; test `apps/web/__tests__/emergency/emergency-new-next.test.tsx`.
- `PageLayout template="form"`. Title "New alert", description "Write the alert, choose who gets it, and review it before sending." Header has only a "Cancel" link. The existing `BroadcastComposer` renders in the main column unchanged; its own submit button is the primary and sits at the bottom of the form. Panel `preview`: the existing `SmsPreview`, shown **only when SMS is available** (the same check as Task 15); `about`: the fixed sentence the composer already shows about sending being immediate, moved here verbatim if one exists, otherwise omitted.
- Pre-check: read `BroadcastComposer.tsx` for its submit control and any warning copy; do not change its behaviour.
- Tests: exactly one element with the primary button class; with SMS unavailable there is no "Preview" heading; the header contains a "Cancel" link and no button; axe passes.

**16c. Visitors**

- Files: create `apps/web/src/components/visitors/next/visitors-staff-next.tsx`; modify `apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx`; test `apps/web/__tests__/visitors/visitors-staff-next.test.tsx`.
- `PageLayout template="list" records="table"` with `PageTabs`: "Visitors" and "Denied list", ids `visitors` and `denied`, selected tab read from and written to `?tab=` (default `visitors`) through `next/link`. Each tab renders the existing table for that tab inside a `Section`; the header primary is that tab's existing action. Panel position 1: the count the staff view already shows for expected visitors, if it computes one from its loaded list, with `source` naming that hook; otherwise no glance. Position 4: `describeAccess` for the visitors resource.
- Pre-check: `sed -n 150,215p apps/web/src/components/visitors/VisitorStaffView.tsx` for the two tabs, their tables and actions.
- Tests: two links in a `nav` named "Sections"; the active one has `aria-current="page"`; with `?tab=denied` the denied table renders and the primary is the denied-list action; axe passes.

For each of 16a to 16c: write the failing tests, run to fail, implement, run to pass, refresh the page-template baseline for the one file, run the four guards, commit.

---

### Task 17: Proof at the app's real size

**Files:**
- Create: `scripts/help-capture/manifests/direction/pilot.json`, `apps/web/e2e/design-direction-pilot.spec.ts`
- Modify: `apps/web/e2e/responsive-overflow.spec.ts` (add the pilot routes with the preview on), `apps/web/e2e/ci-safe-specs.json` (add the new spec and raise `expectedTestCount` by the number of blocks it adds), `apps/web/e2e/helpers/dev-login.ts` only if a helper is needed to switch the preview on

**Interfaces:**
- Consumes: `loginAs(page, role, { communitySlug })` from `apps/web/e2e/helpers/dev-login.ts`, `clickWhenHydrated` from `helpers/hydration.ts`, the overflow helper in `helpers/overflow.ts`.

Decisions (§17 proof, Review Focus 3 and 4):

- The spec logs in as `cam` pinned to `sunset-condos`, sets `DESIGN_PREVIEW_USER_IDS` for the dev server to that persona's id, and turns the preview on through the settings switch (using `clickWhenHydrated`).
- For each of `/dashboard/packages`, `/emergency`, `/dashboard/visitors` at 1280 and 1440 wide with large text on (the default):
  - no page-level horizontal overflow and no table that scrolls sideways;
  - the layout is one of two things, asserted from bounding boxes: the "Summary" region sits to the right of the main column, or it sits wholly above it. Record which, per route and width, in the test output with `test.info().annotations`.
- One block inserts a package whose description is 90 characters and a recipient whose name is 40 characters (through the existing create endpoints), reloads, and re-asserts no overflow at both widths.
- One block logs in as `owner` pinned to `sunset-condos` and asserts `/emergency` shows no "residents reachable" text.
- The capture manifest shoots the six pilot screens at 1280 and 1440 as stills so the contact sheet can be attached to the pull request.

- [ ] **Step 1: Pre-check.** `sed -n 30,60p apps/web/e2e/responsive-overflow.spec.ts` for `VIEWPORTS` and `expectNoBleed`; `cat apps/web/e2e/ci-safe-specs.json` for the current `expectedTestCount`; `sed -n 1,60p scripts/help-capture/manifest-schema.ts` for the manifest fields.
- [ ] **Step 2:** Write the spec and the manifest. Start the sandbox with `pnpm agent:env:prepare` then `pnpm agent:live:web` (check `docker exec <any container> cat /proc/pressure/memory` first; stop idle stacks if `full` is well above zero).
- [ ] **Step 3:** Run `pnpm exec playwright test apps/web/e2e/design-direction-pilot.spec.ts --config apps/web/playwright.ci.config.ts`; expected: all blocks pass. If a table scrolls sideways beside the panel at 1440, that is a finding about §5.4's 1280px threshold, not a test to loosen: report the measured widths.
- [ ] **Step 4:** Run `pnpm help:capture direction/pilot` and assemble the twelve stills into one contact sheet.
- [ ] **Step 5:** `pnpm build && pnpm perf:check`; record the three pilot routes' sizes and the aggregate before and after in the pull request description. Expected: exit 0.
- [ ] **Step 6: Commit.** `git commit -m "e2e: pilot pages hold at 1280 and 1440 in large text; capture manifest for review"`

---

### Task 18: Write the direction where page authors look

**Files:**
- Modify: `DESIGN.md` (new opening section), `.claude/rules/design.md` (new opening section; correct the statements this plan makes false), `CLAUDE.md` (the guards list and count), `docs/design-system/README.md` (link)

Decisions: the opening section of both design files is spec §0 verbatim, followed by a short "Page templates" section naming the six templates, the kit parts and their import paths, the panel positions table from §5.3, and the three new guards with their escape hatches. In `.claude/rules/design.md`, the paragraph "`PageHeader` does not paint its title or description" is rewritten to say it paints inside a `PageLayout` and stays hidden elsewhere until that page is migrated. `CLAUDE.md`'s guard count changes from 35 to 38 with today's date.

- [ ] **Step 1: Pre-check.** `grep -n "does not paint\|35\*\* guards\|guard:page-header" .claude/rules/design.md CLAUDE.md` finds the three statements.
- [ ] **Step 2:** Make the edits. **Step 3:** `pnpm lint` — exit 0 (some guards read these files).
- [ ] **Step 4: Commit.** `git commit -m "docs: the design direction and page templates in DESIGN.md and the design rules"`

---

## After this plan

1. The owner turns the preview on in production and reviews the six pilot screens on Sunset Condos.
2. The owner decides the two open items in the spec (§4, decisions 12 and 13) and either approves the pilot or asks for changes.
3. Only then are Plans B to E written, using the thresholds and any design changes the pilot produced.
