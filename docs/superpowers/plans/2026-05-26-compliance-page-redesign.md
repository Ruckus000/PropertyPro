# Compliance Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/communities/[id]/compliance` with an Atlassian-style command-center: 4 KPIs, priority queue with sortable column headers, sticky right-rail detail panel, CAM/Board view toggle. Ship behind `?layout=v2` flag, then swap default.

**Architecture:** Six PRs (Slice A0 → E), each independently shippable and reviewable.
- **A0** ships design-system tokens for two new Badge variants (`owner`, `board`).
- **A** ships the data layer (defaultVisibility on templates, calculator extensions) and a flagged container shell with banner + KPIs.
- **B** ships the queue (table + filters + sortable headers + responsive card list).
- **C** ships the side detail panel (selection lifecycle + CTA matrix + recent activity).
- **D** flips the default to the new layout.
- **E** deletes the legacy dashboard, adds localStorage persistence.

**Tech Stack:** Next.js 15 App Router · React 19 · TanStack Query · Tailwind + CVA · Vitest · Drizzle ORM (no schema changes in this plan).

**Spec:** [docs/superpowers/specs/2026-05-26-compliance-page-redesign-design.md](../specs/2026-05-26-compliance-page-redesign-design.md)

**Visual reference:** `.superpowers/brainstorm/24273-1779771427/content/mockup-v2.html`

---

# Slice A0 — Design tokens for Badge variants

**Why first:** Every later slice renders pills with the new `owner` and `board` variants. Without the tokens in place, those slices' tests would fail.

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`
- Modify: `packages/ui/src/tokens/colors.ts`
- Modify: `packages/ui/src/components/Badge.tsx`
- Modify: `packages/ui/src/components/Badge.test.tsx` (or create if missing — verify path first)

## Task A0.1: Add `owner` and `board` semantic token CSS variables

**Files:**
- Modify: `packages/ui/src/styles/tokens.css` (light theme section near line 203 where `--status-success` lives; same additions in the dark theme section)

- [ ] **Step 1: Add light-mode CSS variables for `owner` and `board`**

In `packages/ui/src/styles/tokens.css`, locate the block that defines `--status-info` family (around line 223). After `--status-info-subtle`, add:

```css
  --status-owner: var(--violet-700);
  --status-owner-bg: var(--violet-50);
  --status-owner-border: var(--violet-200);
  --status-owner-subtle: var(--violet-100);

  --status-board: var(--pink-700);
  --status-board-bg: var(--pink-50);
  --status-board-border: var(--pink-200);
  --status-board-subtle: var(--pink-100);
```

If `--violet-*` or `--pink-*` primitive variables don't already exist in this file, also add the primitive scale near the other color primitives at the top of the file:

```css
  --violet-50: #f5f3ff;
  --violet-100: #ede9fe;
  --violet-200: #ddd6fe;
  --violet-700: #6d28d9;
  --violet-950: #2e1065;

  --pink-50: #fdf2f8;
  --pink-100: #fce7f3;
  --pink-200: #fbcfe8;
  --pink-700: #be185d;
  --pink-950: #500724;
```

- [ ] **Step 2: Mirror the additions in the dark-theme block**

Find the dark-mode `[data-theme="dark"]` or `.dark` block in the same file. Add the dark-mode equivalents. The dark equivalents flip light bg ↔ dark bg:

```css
  --status-owner: var(--violet-300);
  --status-owner-bg: var(--violet-950);
  --status-owner-border: var(--violet-700);
  --status-owner-subtle: var(--violet-900);

  --status-board: var(--pink-300);
  --status-board-bg: var(--pink-950);
  --status-board-border: var(--pink-700);
  --status-board-subtle: var(--pink-900);
```

If `--violet-300`, `--violet-900`, `--pink-300`, `--pink-900` are missing from the primitives, add them too:

```css
  --violet-300: #c4b5fd;
  --violet-900: #4c1d95;
  --pink-300: #f9a8d4;
  --pink-900: #831843;
```

- [ ] **Step 3: Verify the file parses (lint check)**

Run: `pnpm --filter @propertypro/ui lint`
Expected: PASS. If lint complains about an unrelated existing issue, scope this check to just the file: `pnpm exec stylelint packages/ui/src/styles/tokens.css` (if stylelint is configured) — or accept the lint baseline.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/styles/tokens.css
git commit -m "feat(ui): add owner/board semantic color tokens

Adds --status-owner-* and --status-board-* CSS variable families
(light + dark) to support new Badge variants for compliance page
record visibility pills.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A0.2: Extend `BadgeVariant` union via `semanticColors.status`

**Files:**
- Modify: `packages/ui/src/tokens/colors.ts`

- [ ] **Step 1: Read the current file**

Open `packages/ui/src/tokens/colors.ts`. Find the `semanticColors.status` object (the one that produces `keyof typeof semanticColors.status` for `StatusVariant`). It currently has `success`, `brand`, `warning`, `danger`, `info`, `neutral` keys.

- [ ] **Step 2: Add `owner` and `board` entries**

In the `status` block, add:

```ts
  owner: {
    default: "var(--status-owner)",
    bg: "var(--status-owner-bg)",
    border: "var(--status-owner-border)",
    subtle: "var(--status-owner-subtle)",
  },
  board: {
    default: "var(--status-board)",
    bg: "var(--status-board-bg)",
    border: "var(--status-board-border)",
    subtle: "var(--status-board-subtle)",
  },
```

(Mirror the shape of the existing `success` / `warning` entries — they're the canonical examples in the same block.)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. The new variants now flow into `StatusVariant` and `BadgeVariant` via the derived `keyof` type.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/tokens/colors.ts
git commit -m "feat(ui): extend StatusVariant with owner and board

Adds owner and board entries to semanticColors.status, extending
BadgeVariant via the existing keyof-derived union.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A0.3: Add Badge variant classes for `owner` and `board`

**Files:**
- Modify: `packages/ui/src/components/Badge.tsx`

- [ ] **Step 1: Add `owner` and `board` to `solidVariantClasses`**

In `Badge.tsx`, locate `solidVariantClasses` (around line 83). After the `neutral` entry, add:

```ts
  owner:
    "bg-[var(--status-owner-bg)] text-[var(--status-owner)] dark:bg-violet-950 dark:text-violet-200",
  board:
    "bg-[var(--status-board-bg)] text-[var(--status-board)] dark:bg-pink-950 dark:text-pink-200",
```

- [ ] **Step 2: Add `owner` and `board` to `outlinedVariantClasses`**

After the `neutral` entry in `outlinedVariantClasses` (around line 97):

```ts
  owner:
    "bg-transparent border border-[var(--status-owner-border)] text-[var(--status-owner)] dark:border-violet-500 dark:text-violet-200",
  board:
    "bg-transparent border border-[var(--status-board-border)] text-[var(--status-board)] dark:border-pink-500 dark:text-pink-200",
```

- [ ] **Step 3: Add `owner` and `board` to `dotColorClasses`**

After the `neutral` entry in `dotColorClasses` (around line 112):

```ts
  owner: "bg-[var(--status-owner)] dark:bg-violet-300",
  board: "bg-[var(--status-board)] dark:bg-pink-300",
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. TypeScript's `Record<BadgeVariant, string>` checks now require entries for `owner` and `board`, which we just added.

- [ ] **Step 5: Run UI tests**

Run: `pnpm --filter @propertypro/ui test -- --run` (or the package's test command; check `packages/ui/package.json` for the exact script).
Expected: All existing Badge tests PASS. No new tests yet.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/Badge.tsx
git commit -m "feat(ui): add Badge classes for owner and board variants

Wires the new BadgeVariant entries through solidVariantClasses,
outlinedVariantClasses, and dotColorClasses with light + dark
mode Tailwind classes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A0.4: Test that Badge renders both new variants

**Files:**
- Find or create: `packages/ui/src/components/Badge.test.tsx`

- [ ] **Step 1: Locate the existing Badge test file (or create one)**

Run: `find packages/ui -name "Badge.test.*" 2>/dev/null`

If a test file exists, open it. If not, create `packages/ui/src/components/Badge.test.tsx` with this header:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from './Badge';
```

- [ ] **Step 2: Add a test for the `owner` variant**

```tsx
describe('Badge — new compliance variants', () => {
  it('renders owner variant with violet text class', () => {
    const { container } = render(<Badge variant="owner">Owner portal</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/text-\[var\(--status-owner\)\]/);
    expect(span?.textContent).toBe('Owner portal');
  });

  it('renders board variant with pink text class', () => {
    const { container } = render(<Badge variant="board">Board</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toMatch(/text-\[var\(--status-board\)\]/);
    expect(span?.textContent).toBe('Board');
  });
});
```

- [ ] **Step 3: Run the new tests**

Run: `pnpm --filter @propertypro/ui test -- --run Badge`
Expected: 2 new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/Badge.test.tsx
git commit -m "test(ui): cover Badge owner and board variants

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A0.5: Open Slice A0 PR

- [ ] **Step 1: Verify branch + push**

```bash
git status
git log --oneline -5
git push -u origin HEAD
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(ui): add owner and board Badge variants (Slice A0)" --body "$(cat <<'EOF'
## Summary
- Adds `--status-owner-*` and `--status-board-*` CSS variable families (light + dark)
- Extends `semanticColors.status` so `BadgeVariant` accepts `owner` and `board`
- Wires `solidVariantClasses`, `outlinedVariantClasses`, `dotColorClasses`
- Adds Badge tests for both variants

Prep for compliance page redesign — see [spec](docs/superpowers/specs/2026-05-26-compliance-page-redesign-design.md). This is Slice A0; no app-level UI changes yet.

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm --filter @propertypro/ui test`
- [ ] Visual smoke: render `<Badge variant="owner">` and `<Badge variant="board">` in a dev shell

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Slice A — Data layer + flagged container shell

**Why next:** Builds on Slice A0 (Badge variants) and produces the foundation every later slice depends on (helpers, container shell, layout=v2 gate).

**Files:**
- Modify: `packages/shared/src/compliance/templates.ts` (add `defaultVisibility` to template type and every entry)
- Modify: `apps/web/src/lib/utils/compliance-calculator.ts` (extend with helpers)
- Modify: `apps/web/__tests__/compliance/compliance-calculator.test.ts` (extend with new tests)
- Modify: `apps/web/__tests__/compliance/statutory-718-regression.test.ts` (add defaultVisibility assertion)
- Create: `apps/web/src/components/compliance/compliance-command-center.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx` (extend `PageProps` with `searchParams`, branch on `?layout=v2`)

## Task A.1: Extend `ComplianceTemplateItem` type with `defaultVisibility`

**Files:**
- Modify: `packages/shared/src/compliance/templates.ts`

- [ ] **Step 1: Add the `DefaultVisibility` type alias and extend the interface**

Open `packages/shared/src/compliance/templates.ts`. Above `ComplianceTemplateItem`, add:

```ts
export type DefaultVisibility = 'public_page' | 'owner_portal' | 'owner_only' | 'board';
```

In `ComplianceTemplateItem`, add the required field after `isConditional`:

```ts
export interface ComplianceTemplateItem {
  templateKey: string;
  title: string;
  description: string;
  category: 'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations';
  statuteReference: string;
  deadlineDays?: number;
  rollingMonths?: number;
  isConditional?: boolean;
  defaultVisibility: DefaultVisibility;
}
```

- [ ] **Step 2: Run typecheck to surface the entries needing updates**

Run: `pnpm typecheck`
Expected: FAIL — every entry in `CONDO_718_CHECKLIST_TEMPLATE` and `HOA_720_CHECKLIST_TEMPLATE` is now missing the required `defaultVisibility` field. Each missing entry is a discrete typecheck error. This is the desired failure that the next two tasks address.

(Do not commit yet — the file is in a broken state until the next two tasks fill in the values.)

## Task A.2: Add `defaultVisibility` to every §718 template entry

**Files:**
- Modify: `packages/shared/src/compliance/templates.ts`

- [ ] **Step 1: Apply the spec's §718 mapping**

In `CONDO_718_CHECKLIST_TEMPLATE`, add the appropriate `defaultVisibility` to each entry per the spec's table:

| `templateKey` | `defaultVisibility` |
|---|---|
| `718_declaration` | `'owner_portal'` |
| `718_bylaws` | `'owner_portal'` |
| `718_articles` | `'owner_portal'` |
| `718_rules` | `'owner_portal'` |
| `718_qa_sheet` | `'owner_portal'` |
| `718_budget` | `'owner_portal'` |
| `718_financial_report` | `'owner_portal'` |
| `718_minutes_rolling_12m` | `'board'` |
| `718_video_recordings` | `'owner_portal'` |
| `718_affidavits` | `'board'` |
| `718_insurance` | `'owner_only'` |
| `718_contracts` | `'owner_only'` |

Append `defaultVisibility: '<value>',` to each entry. Example for `718_declaration`:

```ts
{
  templateKey: '718_declaration',
  title: 'Declaration of Condominium & Amendments',
  description: 'Recorded declaration and all amendments must be available in the owner portal.',
  category: 'governing_documents',
  statuteReference: '§718.111(12)(g)(2)(a)',
  deadlineDays: 30,
  defaultVisibility: 'owner_portal',
},
```

(If any §718 template item exists that isn't in the table, give it `defaultVisibility: 'owner_portal'` as the conservative default and note it in the commit message.)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: §718 entries no longer error. §720 entries still error — addressed in the next task.

## Task A.3: Add `defaultVisibility` to every §720 template entry

**Files:**
- Modify: `packages/shared/src/compliance/templates.ts`

- [ ] **Step 1: Apply the spec's §720 mapping**

In `HOA_720_CHECKLIST_TEMPLATE`, add `defaultVisibility` to each entry:

| `templateKey` | `defaultVisibility` |
|---|---|
| `720_governing_docs` | `'owner_portal'` |
| `720_articles` | `'owner_portal'` |
| `720_bylaws_rules` | `'owner_portal'` |
| `720_budget` | `'owner_portal'` |
| `720_financial_report` | `'owner_portal'` |
| `720_minutes_rolling_12m` | `'board'` |
| `720_meeting_notices` | `'owner_portal'` |
| `720_insurance` | `'owner_only'` |
| `720_contracts` | `'owner_only'` |
| `720_bids` | `'board'` |

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Add a regression test assertion**

Open `apps/web/__tests__/compliance/statutory-718-regression.test.ts`. Find a suitable `describe` block or add one near the bottom:

```ts
import { CONDO_718_CHECKLIST_TEMPLATE, HOA_720_CHECKLIST_TEMPLATE } from '@propertypro/shared';

describe('compliance template defaultVisibility coverage', () => {
  it('every §718 template item has defaultVisibility', () => {
    for (const item of CONDO_718_CHECKLIST_TEMPLATE) {
      expect(item.defaultVisibility, `${item.templateKey} missing defaultVisibility`).toBeDefined();
    }
  });

  it('every §720 template item has defaultVisibility', () => {
    for (const item of HOA_720_CHECKLIST_TEMPLATE) {
      expect(item.defaultVisibility, `${item.templateKey} missing defaultVisibility`).toBeDefined();
    }
  });
});
```

(If the existing test file does not import `HOA_720_CHECKLIST_TEMPLATE` already, verify the export name in `packages/shared/src/compliance/templates.ts` — at spec write time it was `HOA_720_CHECKLIST_TEMPLATE`.)

- [ ] **Step 4: Run the new tests**

Run: `pnpm --filter @propertypro/web test -- --run statutory-718-regression`
Expected: PASS, including the two new assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/compliance/templates.ts apps/web/__tests__/compliance/statutory-718-regression.test.ts
git commit -m "feat(shared): add defaultVisibility to compliance templates

Adds a required defaultVisibility field to ComplianceTemplateItem and
maps every §718 and §720 template entry per the compliance page
redesign spec. Includes regression assertions that every template
item carries the new field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.4: Add `BOARD_ACTION_TEMPLATE_KEYS` and `needsAttention`

**Files:**
- Modify: `apps/web/src/lib/utils/compliance-calculator.ts`
- Modify: `apps/web/__tests__/compliance/compliance-calculator.test.ts`

- [ ] **Step 1: Write the failing tests first**

In `apps/web/__tests__/compliance/compliance-calculator.test.ts`, append:

```ts
import { BOARD_ACTION_TEMPLATE_KEYS, needsAttention } from '../../src/lib/utils/compliance-calculator';
import type { ChecklistItemData } from '../../src/components/compliance/compliance-checklist-item';

function makeItem(overrides: Partial<ChecklistItemData> = {}): ChecklistItemData {
  return {
    id: 1,
    templateKey: '718_declaration',
    title: 'Declaration',
    category: 'governing_documents',
    status: 'unsatisfied',
    documentId: null,
    documentPostedAt: null,
    deadline: null,
    rollingWindow: null,
    isConditional: false,
    isApplicable: true,
    ...overrides,
  };
}

describe('BOARD_ACTION_TEMPLATE_KEYS', () => {
  it('contains 718_minutes_rolling_12m and 718_affidavits', () => {
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('718_minutes_rolling_12m')).toBe(true);
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('718_affidavits')).toBe(true);
  });

  it('contains 720_minutes_rolling_12m and 720_bids', () => {
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('720_minutes_rolling_12m')).toBe(true);
    expect(BOARD_ACTION_TEMPLATE_KEYS.has('720_bids')).toBe(true);
  });
});

describe('needsAttention', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('returns true for overdue items', () => {
    expect(needsAttention(makeItem({ status: 'overdue' }), now)).toBe(true);
  });

  it('returns true for unsatisfied items with deadline within 7 days (inclusive boundary)', () => {
    const boundary = new Date('2026-06-02T00:00:00.000Z'); // exactly +7d
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: boundary.toISOString() }), now)).toBe(true);
  });

  it('returns false for unsatisfied items with deadline 8 days out', () => {
    const farther = new Date('2026-06-03T00:00:00.000Z');
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: farther.toISOString() }), now)).toBe(false);
  });

  it('returns true for board-action whitelist items that are unsatisfied', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'unsatisfied' }), now),
    ).toBe(true);
  });

  it('returns false for board-action whitelist items that are satisfied', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'satisfied' }), now),
    ).toBe(false);
  });

  it('returns false for not_applicable regardless of templateKey', () => {
    expect(
      needsAttention(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'not_applicable' }), now),
    ).toBe(false);
  });

  it('returns false for unsatisfied items with no deadline that are NOT board-action', () => {
    expect(needsAttention(makeItem({ status: 'unsatisfied', deadline: null }), now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: FAIL with `BOARD_ACTION_TEMPLATE_KEYS` and `needsAttention` not exported / not defined.

- [ ] **Step 3: Implement the helper**

In `apps/web/src/lib/utils/compliance-calculator.ts`, after `calculateComplianceStatus`, add:

```ts
import type { ChecklistItemData } from '@/components/compliance/compliance-checklist-item';

/**
 * Templates whose status implies the board must act before the item can be satisfied.
 * Maintain as an explicit whitelist; do not derive from a heuristic.
 */
export const BOARD_ACTION_TEMPLATE_KEYS = new Set<string>([
  '718_minutes_rolling_12m',
  '718_affidavits',
  '720_minutes_rolling_12m',
  '720_bids',
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * True when the item should appear in the "Action needed" filter / attention banner.
 * Single predicate: overdue OR (unsatisfied and deadline within 7 days)
 * OR (board-action whitelist and not satisfied/not_applicable).
 */
export function needsAttention(item: ChecklistItemData, now: Date = new Date()): boolean {
  if (item.status === 'overdue') return true;

  if (item.status === 'unsatisfied' && item.deadline) {
    const deadlineMs = new Date(item.deadline).getTime();
    if (deadlineMs - now.getTime() <= SEVEN_DAYS_MS) return true;
  }

  if (
    BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey) &&
    item.status !== 'satisfied' &&
    item.status !== 'not_applicable'
  ) {
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: All previous tests still PASS; new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/utils/compliance-calculator.ts apps/web/__tests__/compliance/compliance-calculator.test.ts
git commit -m "feat(compliance): add BOARD_ACTION_TEMPLATE_KEYS and needsAttention

Single predicate for the redesign's 'Action needed' filter and
banner chip. Inclusive 7-day boundary; whitelist over heuristic.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.5: Add `buildComplianceSummary`

**Files:**
- Modify: `apps/web/src/lib/utils/compliance-calculator.ts`
- Modify: `apps/web/__tests__/compliance/compliance-calculator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
import { buildComplianceSummary } from '../../src/lib/utils/compliance-calculator';

describe('buildComplianceSummary', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('returns 100% readiness for empty input', () => {
    const s = buildComplianceSummary([], now);
    expect(s.readiness).toEqual({ satisfied: 0, applicableTotal: 0, percentage: 100 });
    expect(s.postingWindowsDueSoonCount).toBe(0);
    expect(s.overdueCount).toBe(0);
    expect(s.needsBoardActionCount).toBe(0);
    expect(s.attentionCount).toBe(0);
  });

  it('returns 100% readiness when all items are not_applicable', () => {
    const items = [
      makeItem({ id: 1, status: 'not_applicable' }),
      makeItem({ id: 2, status: 'not_applicable' }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.readiness.applicableTotal).toBe(0);
    expect(s.readiness.percentage).toBe(100);
  });

  it('counts satisfied / applicableTotal correctly with mixed statuses', () => {
    const items = [
      makeItem({ id: 1, status: 'satisfied' }),
      makeItem({ id: 2, status: 'satisfied' }),
      makeItem({ id: 3, status: 'unsatisfied' }),
      makeItem({ id: 4, status: 'not_applicable' }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.readiness).toEqual({ satisfied: 2, applicableTotal: 3, percentage: 67 });
  });

  it('does not double-count items that are both overdue and board-action', () => {
    const items = [
      makeItem({
        id: 1,
        templateKey: '718_minutes_rolling_12m',
        status: 'overdue',
        deadline: '2026-05-01T00:00:00.000Z',
      }),
    ];
    const s = buildComplianceSummary(items, now);
    expect(s.attentionCount).toBe(1);
    expect(s.overdueCount).toBe(1);
    expect(s.needsBoardActionCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: FAIL with `buildComplianceSummary` not defined.

- [ ] **Step 3: Implement**

In `compliance-calculator.ts`, after `needsAttention`, add:

```ts
export interface ComplianceSummary {
  readiness: { satisfied: number; applicableTotal: number; percentage: number };
  postingWindowsDueSoonCount: number;
  overdueCount: number;
  needsBoardActionCount: number;
  attentionCount: number;
}

export function buildComplianceSummary(
  items: ChecklistItemData[],
  now: Date = new Date(),
): ComplianceSummary {
  let satisfied = 0;
  let applicableTotal = 0;
  let postingWindowsDueSoonCount = 0;
  let overdueCount = 0;
  let needsBoardActionCount = 0;
  let attentionCount = 0;

  for (const item of items) {
    if (item.status !== 'not_applicable') applicableTotal++;
    if (item.status === 'satisfied') satisfied++;
    if (item.status === 'overdue') overdueCount++;

    if (item.status === 'unsatisfied' && item.deadline) {
      const ms = new Date(item.deadline).getTime() - now.getTime();
      if (ms <= SEVEN_DAYS_MS) postingWindowsDueSoonCount++;
    }

    if (
      BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey) &&
      item.status !== 'satisfied' &&
      item.status !== 'not_applicable'
    ) {
      needsBoardActionCount++;
    }

    if (needsAttention(item, now)) attentionCount++;
  }

  const percentage = applicableTotal === 0
    ? 100
    : Math.round((satisfied / applicableTotal) * 100);

  return {
    readiness: { satisfied, applicableTotal, percentage },
    postingWindowsDueSoonCount,
    overdueCount,
    needsBoardActionCount,
    attentionCount,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/utils/compliance-calculator.ts apps/web/__tests__/compliance/compliance-calculator.test.ts
git commit -m "feat(compliance): add buildComplianceSummary helper

Drives the 4 KPIs and the banner attention chip. Single-pass over
items; attentionCount uses the needsAttention predicate so items
that are both overdue and board-action are counted exactly once.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.6: Add `sortByPriority`

**Files:**
- Modify: `apps/web/src/lib/utils/compliance-calculator.ts`
- Modify: `apps/web/__tests__/compliance/compliance-calculator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
import { sortByPriority } from '../../src/lib/utils/compliance-calculator';

describe('sortByPriority', () => {
  const now = new Date('2026-05-26T00:00:00.000Z');

  it('orders overdue first, then unsatisfied-with-deadline by date, then null-deadline, then satisfied, then N/A', () => {
    const items = [
      makeItem({ id: 1, title: 'A', status: 'satisfied' }),
      makeItem({ id: 2, title: 'B', status: 'not_applicable' }),
      makeItem({ id: 3, title: 'C', status: 'overdue' }),
      makeItem({ id: 4, title: 'D', status: 'unsatisfied', deadline: '2026-06-10T00:00:00.000Z' }),
      makeItem({ id: 5, title: 'E', status: 'unsatisfied', deadline: '2026-06-01T00:00:00.000Z' }),
      makeItem({ id: 6, title: 'F', status: 'unsatisfied', deadline: null }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.id)).toEqual([3, 5, 4, 6, 1, 2]);
  });

  it('uses title ASC as a stable tiebreak within the rolling-window bucket', () => {
    const items = [
      makeItem({ id: 10, title: 'Zebra', status: 'unsatisfied', deadline: null }),
      makeItem({ id: 11, title: 'Apple', status: 'unsatisfied', deadline: null }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.title)).toEqual(['Apple', 'Zebra']);
  });

  it('uses id ASC as the final tiebreak for items with identical title and bucket', () => {
    const items = [
      makeItem({ id: 22, title: 'Same', status: 'satisfied' }),
      makeItem({ id: 11, title: 'Same', status: 'satisfied' }),
    ];
    const sorted = sortByPriority(items, now);
    expect(sorted.map((i) => i.id)).toEqual([11, 22]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: FAIL with `sortByPriority` not defined.

- [ ] **Step 3: Implement**

In `compliance-calculator.ts`, after `buildComplianceSummary`, add:

```ts
function priorityBucket(item: ChecklistItemData): number {
  if (item.status === 'overdue') return 0;
  if (item.status === 'unsatisfied' && item.deadline) return 1;
  if (item.status === 'unsatisfied' && !item.deadline) return 2;
  if (item.status === 'satisfied') return 3;
  return 4; // not_applicable
}

export function sortByPriority(
  items: ChecklistItemData[],
  _now: Date = new Date(),
): ChecklistItemData[] {
  const copy = items.slice();
  copy.sort((a, b) => {
    const ba = priorityBucket(a);
    const bb = priorityBucket(b);
    if (ba !== bb) return ba - bb;

    // Bucket 1: order by deadline ASC.
    if (ba === 1) {
      const da = new Date(a.deadline!).getTime();
      const db = new Date(b.deadline!).getTime();
      if (da !== db) return da - db;
    }

    // All other buckets (and tie-broken bucket 1): order by title ASC.
    const titleCmp = a.title.localeCompare(b.title);
    if (titleCmp !== 0) return titleCmp;

    // Final stable tiebreak: id ASC.
    return a.id - b.id;
  });
  return copy;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-calculator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/utils/compliance-calculator.ts apps/web/__tests__/compliance/compliance-calculator.test.ts
git commit -m "feat(compliance): add sortByPriority helper

Deterministic queue order: overdue → unsatisfied-by-deadline →
unsatisfied-null-deadline → satisfied → N/A. Title ASC tiebreak
within bucket; id ASC final.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.7: Create `ComplianceCommandCenter` shell — chrome + banner + KPIs

**Files:**
- Create: `apps/web/src/components/compliance/compliance-command-center.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`

- [ ] **Step 1: Write a smoke test first**

Create `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceCommandCenter } from '../compliance-command-center';

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => ({
    data: [
      {
        id: 1, templateKey: '718_declaration', title: 'Declaration',
        category: 'governing_documents', status: 'satisfied',
        documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
        deadline: null, rollingWindow: null, isApplicable: true,
      },
      {
        id: 2, templateKey: '718_insurance', title: 'Insurance',
        category: 'insurance', status: 'overdue',
        documentId: null, documentPostedAt: null,
        deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
      },
    ],
    isLoading: false,
    error: null,
  }),
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

function renderWithProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ComplianceCommandCenter', () => {
  it('renders the page header with breadcrumb and title', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('shows all four KPI labels', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByText(/readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/posting windows/i)).toBeInTheDocument();
    expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    expect(screen.getByText(/needs board action/i)).toBeInTheDocument();
  });

  it('shows the CAM/Board view toggle for cam role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'CAM view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the view toggle for owner role', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="owner" canWrite={false} />,
    );
    expect(screen.queryByRole('button', { name: 'CAM view' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @propertypro/web test -- --run compliance-command-center`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/compliance/compliance-command-center.tsx`:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@propertypro/ui';
import { useComplianceChecklist } from '@/hooks/useComplianceChecklist';
import { buildComplianceSummary } from '@/lib/utils/compliance-calculator';
import { ComplianceOnboarding } from './compliance-onboarding';
import { ComplianceActivityFeed } from './compliance-activity-feed';
import type { CommunityRole, NewCommunityRole } from '@propertypro/shared';

type ViewMode = 'cam' | 'board';

export interface ComplianceCommandCenterProps {
  communityId: number;
  role: CommunityRole | NewCommunityRole;
  canWrite: boolean;
}

const CAM_LIKE_ROLES = new Set<string>(['cam', 'pm_admin', 'property_manager_admin', 'site_manager']);
const BOARD_LIKE_ROLES = new Set<string>(['board_president', 'board_member']);

function defaultViewForRole(role: string): ViewMode {
  if (BOARD_LIKE_ROLES.has(role)) return 'board';
  return 'cam';
}

function showToggle(role: string): boolean {
  return CAM_LIKE_ROLES.has(role) || BOARD_LIKE_ROLES.has(role);
}

export function ComplianceCommandCenter({
  communityId,
  role,
  canWrite,
}: ComplianceCommandCenterProps) {
  const [view, setView] = useState<ViewMode>(() => defaultViewForRole(role));
  const { data: items = [], isLoading, error } = useComplianceChecklist(communityId);

  const summary = useMemo(() => buildComplianceSummary(items, new Date()), [items]);

  if (error) {
    return (
      <div className="rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger">
        We couldn't load compliance records. Please try again.
      </div>
    );
  }

  const breadcrumb = (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm text-content-secondary">
        <li><Link href="/dashboard">Communities</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-content">Compliance</li>
      </ol>
    </nav>
  );

  const actions = (
    <div className="flex items-center gap-2">
      {showToggle(role) && (
        <div role="group" aria-label="Audience view" className="inline-flex rounded-[var(--radius-sm)] border border-[var(--border-default)] p-0.5">
          <button
            type="button"
            aria-pressed={view === 'cam'}
            onClick={() => setView('cam')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'cam' ? 'bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >CAM view</button>
          <button
            type="button"
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
            className={`px-3 py-1.5 text-sm rounded ${view === 'board' ? 'bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)]' : 'text-content-secondary'}`}
          >Board view</button>
        </div>
      )}
      {canWrite && <Button variant="secondary">Upload record</Button>}
      <Button variant="primary">Export readiness PDF</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compliance"
        description="Records and statutory requirements"
        breadcrumb={breadcrumb}
        actions={actions}
        hideHelpButton
      />

      {summary.attentionCount > 0 && (
        <section
          aria-labelledby="compliance-banner-title"
          className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border-l-4 border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--status-warning)] text-white text-xs font-bold">!</span>
            <div>
              <div id="compliance-banner-title" className="font-semibold text-[var(--status-warning)]">Requirements are now in effect</div>
              <div className="text-sm text-content-secondary">Tracking is active for required records, posting windows, and board approvals.</div>
            </div>
          </div>
          <span className="rounded-full bg-[var(--status-warning)] px-3 py-1 text-xs font-semibold text-white">
            {view === 'board'
              ? `${summary.needsBoardActionCount} need board action`
              : `${summary.attentionCount} need attention`}
          </span>
        </section>
      )}

      <section aria-label="Compliance summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Readiness" value={`${summary.readiness.percentage}%`} meta={`${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} items satisfied`} />
        <KpiCard label="Posting windows" value={summary.postingWindowsDueSoonCount} meta="Due inside 7 days" />
        <KpiCard label="Overdue" value={summary.overdueCount} meta="Past deadline" tone={summary.overdueCount > 0 ? 'alert' : 'default'} />
        <KpiCard label="Needs board action" value={summary.needsBoardActionCount} meta="Approvals and reviews pending" />
      </section>

      <ComplianceOnboarding items={items} onUpload={() => { /* hooked in Slice B */ }} />

      {/* Queue + Detail panel land in Slice B and Slice C. */}
      {isLoading && (
        <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center text-content-secondary">
          Loading…
        </div>
      )}

      <section id="compliance-activity-feed">
        <ComplianceActivityFeed communityId={communityId} />
      </section>
    </div>
  );
}

function KpiCard({
  label, value, meta, tone = 'default',
}: { label: string; value: string | number; meta: string; tone?: 'default' | 'alert' }) {
  return (
    <article className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{label}</div>
      <div className={`mt-2 text-3xl font-bold tabular-nums ${tone === 'alert' ? 'text-[var(--status-danger)]' : 'text-content'}`}>{value}</div>
      <div className="mt-1 text-sm text-content-secondary">{meta}</div>
    </article>
  );
}

export default ComplianceCommandCenter;
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @propertypro/web test -- --run compliance-command-center`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx
git commit -m "feat(compliance): add ComplianceCommandCenter shell

Container with breadcrumb, page header (hideHelpButton), CAM/Board
toggle (role-gated), banner with role-aware copy, 4-KPI grid, and
the existing ComplianceOnboarding + activity feed wired in.
Queue and detail panel land in subsequent slices.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.8: Extend `page.tsx` with `searchParams` and `?layout=v2` branch

**Files:**
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx`

- [ ] **Step 1: Update the file**

Replace the file content with:

```tsx
/**
 * Compliance page.
 *
 * Route: /communities/[id]/compliance
 * Auth: community membership + compliance:read permission required.
 * Feature gate: hasCompliance must be true (condo/HOA only).
 *
 * Layout: pass ?layout=v2 to render the redesigned ComplianceCommandCenter;
 * otherwise renders the legacy ComplianceDashboard. Default flips in Slice D.
 */
import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership as requireCommunityMembership } from '@/lib/request/page-community-context';
import { checkPermission, getFeaturesForCommunity } from '@propertypro/shared';
import ComplianceDashboard from '@/components/compliance/compliance-dashboard';
import ComplianceCommandCenter from '@/components/compliance/compliance-command-center';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ layout?: string }>;
}

export default async function CompliancePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { layout } = await searchParams;
  const communityId = Number(id);
  if (!Number.isFinite(communityId) || communityId <= 0) {
    redirect('/dashboard?reason=invalid-selection');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  const membership = await requireCommunityMembership(communityId, userId);

  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasCompliance) {
    redirect('/dashboard?reason=feature-not-available');
  }

  const opts = { isUnitOwner: membership.isUnitOwner, permissions: membership.permissions };
  if (!checkPermission(membership.role, membership.communityType, 'compliance', 'read', opts)) {
    redirect('/dashboard?reason=insufficient-permissions');
  }

  if (layout === 'v2') {
    const canWrite = checkPermission(
      membership.role, membership.communityType, 'compliance', 'write', opts,
    );
    return (
      <ComplianceCommandCenter
        communityId={communityId}
        role={membership.role}
        canWrite={canWrite}
      />
    );
  }

  return <ComplianceDashboard communityId={communityId} />;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Smoke test in dev**

Run: `pnpm dev`

In a browser logged in as a CAM (`/dev/agent-login?as=cam`), visit:
- `/communities/<id>/compliance` — should render the existing dashboard.
- `/communities/<id>/compliance?layout=v2` — should render the new command-center shell with banner + 4 KPIs (queue/detail panel will say "Loading…" or be missing until later slices).

Stop the dev server with `Ctrl-C`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx
git commit -m "feat(compliance): gate redesigned layout behind ?layout=v2

Extends PageProps with searchParams; default branch still renders
the legacy ComplianceDashboard. Adds checkPermission(...,'write')
to derive canWrite for the new container.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task A.9: Open Slice A PR

- [ ] **Step 1: Verify CI guards locally**

Run: `pnpm lint`
Expected: PASS (or no new violations).

- [ ] **Step 2: Push and open PR**

```bash
git push
gh pr create --title "feat(compliance): data layer + flagged container shell (Slice A)" --body "$(cat <<'EOF'
## Summary
- `defaultVisibility` added to `ComplianceTemplateItem` and every §718 + §720 entry
- `compliance-calculator.ts` extended with `BOARD_ACTION_TEMPLATE_KEYS`, `needsAttention`, `buildComplianceSummary`, `sortByPriority` + edge-case tests
- `ComplianceCommandCenter` shell: breadcrumb, page header (no Help button), role-gated CAM/Board toggle, attention banner, 4-KPI grid
- `page.tsx` extended with `searchParams`; renders new component when `?layout=v2`, legacy dashboard otherwise

Slice A of the [compliance page redesign](docs/superpowers/specs/2026-05-26-compliance-page-redesign-design.md). Queue and detail panel ship in subsequent slices.

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm --filter @propertypro/web test -- --run compliance-calculator`
- [x] `pnpm --filter @propertypro/web test -- --run statutory-718-regression`
- [x] `pnpm --filter @propertypro/web test -- --run compliance-command-center`
- [ ] Manual: visit `/communities/<id>/compliance?layout=v2` as CAM — banner + KPIs render

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Slice B — Queue with filters and sort

**Why next:** The container shell exists; now plug in the priority queue (sortable, filterable, responsive).

**Files:**
- Create: `apps/web/src/components/compliance/compliance-queue.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx`
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx` (mount the queue, lift modal state)

## Task B.1: Create `ComplianceQueue` with filter chips and Status pill rendering

**Files:**
- Create: `apps/web/src/components/compliance/compliance-queue.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx`

- [ ] **Step 1: Write a focused test for the chip group**

Create `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceQueue } from '../compliance-queue';

const ITEMS = [
  { id: 1, templateKey: '718_declaration', title: 'Declaration', category: 'governing_documents', status: 'satisfied' as const, documentId: 1, documentPostedAt: '2026-05-01T00:00:00.000Z', deadline: null, rollingWindow: null, isApplicable: true },
  { id: 2, templateKey: '718_insurance', title: 'Insurance', category: 'insurance', status: 'overdue' as const, documentId: null, documentPostedAt: null, deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true },
];

describe('ComplianceQueue', () => {
  it('renders one row per item with a Status pill', () => {
    render(
      <ComplianceQueue
        items={ITEMS}
        canWrite
        onUpload={vi.fn()}
        onLink={vi.fn()}
        onView={vi.fn()}
        onMarkApplicable={vi.fn()}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText('Declaration')).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeInTheDocument();
    expect(screen.getByText('Satisfied')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows filter chips with counts', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Action needed/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /All/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('hides items that do not match the active filter', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Satisfied/i }));
    expect(screen.getByText('Declaration')).toBeInTheDocument();
    expect(screen.queryByText('Insurance')).not.toBeInTheDocument();
  });

  it('shows "Showing X of Y" and Clear filters affordance when filter is active', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Satisfied/i }));
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear filters/i })).toBeInTheDocument();
  });

  it('calls onSelect with the item id when row primary action is clicked', () => {
    const onSelect = vi.fn();
    const onView = vi.fn();
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={onView} onMarkApplicable={vi.fn()} selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /View document/i })[0]);
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @propertypro/web test -- --run compliance-queue`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/compliance/compliance-queue.tsx`:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import { Badge } from '@propertypro/ui';
import { sortByPriority, needsAttention, BOARD_ACTION_TEMPLATE_KEYS } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from './compliance-checklist-item';
import { getTemplateDefaultVisibility, type DefaultVisibility } from './compliance-visibility';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';

type FilterKey = 'all' | 'action_needed' | 'overdue' | 'due_soon' | 'satisfied';

export interface ComplianceQueueProps {
  items: ChecklistItemData[];
  canWrite: boolean;
  role?: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
}

const VISIBILITY_LABEL: Record<DefaultVisibility, string> = {
  public_page: 'Public',
  owner_portal: 'Owner portal',
  owner_only: 'Owner-only',
  board: 'Board',
};

const VISIBILITY_VARIANT: Record<DefaultVisibility, 'info' | 'owner' | 'board'> = {
  public_page: 'info',
  owner_portal: 'owner',
  owner_only: 'owner',
  board: 'board',
};

function statusLabel(item: ChecklistItemData): string {
  if (item.status === 'satisfied') return 'Satisfied';
  if (item.status === 'overdue') return 'Overdue';
  if (item.status === 'not_applicable') return 'Not applicable';
  if (BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey)) return 'Needs board action';
  return 'Action needed';
}

function statusVariant(status: ComplianceStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'satisfied') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'not_applicable') return 'neutral';
  return 'warning';
}

function deadlineCell(item: ChecklistItemData): string {
  if (item.status === 'satisfied') return 'Posted';
  if (item.rollingWindow && !item.deadline) return `Rolling ${item.rollingWindow.months} mo`;
  if (!item.deadline) return '—';
  return new Date(item.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function resolveCta(
  item: ChecklistItemData,
  canWrite: boolean,
  role?: string,
): { label: string; handler: 'upload' | 'link' | 'view' | 'mark_applicable' } | null {
  if (!canWrite) return item.documentId ? { label: 'View document', handler: 'view' } : null;
  if (item.status === 'not_applicable') return { label: 'Mark applicable', handler: 'mark_applicable' };
  if (item.status === 'satisfied') return { label: 'View document', handler: 'view' };
  if (item.documentId) {
    const rolling = !!item.rollingWindow;
    return { label: rolling ? 'Upload current document' : 'Re-link or replace', handler: rolling ? 'upload' : 'link' };
  }
  if (role === 'board_president' || role === 'board_member') {
    return { label: 'Link existing document', handler: 'link' };
  }
  return { label: 'Upload document', handler: 'upload' };
}

export function ComplianceQueue({
  items, canWrite, role, selectedId, onSelect,
  onUpload, onLink, onView, onMarkApplicable,
}: ComplianceQueueProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const sorted = useMemo(() => sortByPriority(items), [items]);
  const filtered = useMemo(() => sorted.filter((i) => matchesFilter(i, filter)), [sorted, filter]);

  const counts = useMemo(() => ({
    all: items.length,
    action_needed: items.filter((i) => needsAttention(i)).length,
    overdue: items.filter((i) => i.status === 'overdue').length,
    due_soon: items.filter((i) => i.status === 'unsatisfied' && i.deadline && (new Date(i.deadline).getTime() - Date.now()) <= 7 * 86400000).length,
    satisfied: items.filter((i) => i.status === 'satisfied').length,
  }), [items]);

  function dispatch(cta: NonNullable<ReturnType<typeof resolveCta>>, item: ChecklistItemData) {
    onSelect(item.id);
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  return (
    <section aria-labelledby="queue-heading" className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card">
      <header className="flex items-start justify-between gap-4 px-6 py-4">
        <div>
          <h2 id="queue-heading" className="text-lg font-semibold">Required records queue</h2>
          <p className="text-sm text-content-secondary">
            Showing {filtered.length} of {items.length} records
            {filter !== 'all' && (
              <>
                {' · '}
                <button type="button" onClick={() => setFilter('all')} className="text-[var(--interactive-primary)] hover:underline">× Clear filters</button>
              </>
            )}
          </p>
        </div>
      </header>

      <div role="group" aria-label="Filter records" className="flex flex-wrap gap-2 px-6 pb-3">
        <FilterChip active={filter === 'action_needed'} onClick={() => setFilter('action_needed')}>Action needed <span className="opacity-80 ml-1">{counts.action_needed}</span></FilterChip>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All <span className="opacity-80 ml-1">{counts.all}</span></FilterChip>
        <FilterChip active={filter === 'overdue'} onClick={() => setFilter('overdue')}>Overdue <span className="opacity-80 ml-1">{counts.overdue}</span></FilterChip>
        <FilterChip active={filter === 'due_soon'} onClick={() => setFilter('due_soon')}>Due ≤ 7 days <span className="opacity-80 ml-1">{counts.due_soon}</span></FilterChip>
        <FilterChip active={filter === 'satisfied'} onClick={() => setFilter('satisfied')}>Satisfied <span className="opacity-80 ml-1">{counts.satisfied}</span></FilterChip>
      </div>

      {filtered.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-content-secondary">
          No records match these filters.
          <button type="button" onClick={() => setFilter('all')} className="ml-2 text-[var(--interactive-primary)] hover:underline">Clear filters</button>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-y border-edge-subtle bg-surface-muted text-left text-xs font-semibold uppercase tracking-wider text-content-tertiary">
              <th scope="col" className="px-6 py-3">Record</th>
              <th scope="col" className="px-6 py-3">Status</th>
              <th scope="col" className="px-6 py-3">Visibility</th>
              <th scope="col" className="px-6 py-3 text-right">Deadline</th>
              <th scope="col" className="px-6 py-3">Statute</th>
              <th scope="col" className="px-6 py-3 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const cta = resolveCta(item, canWrite, role);
              const vis = getTemplateDefaultVisibility(item.templateKey);
              return (
                <tr key={item.id} aria-current={selectedId === item.id ? 'true' : undefined} className={selectedId === item.id ? 'bg-[var(--interactive-primary-soft)]' : 'hover:bg-surface-muted'}>
                  <td className="px-6 py-4">
                    <div className="font-medium">{item.title}</div>
                  </td>
                  <td className="px-6 py-4"><Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge></td>
                  <td className="px-6 py-4"><Badge variant={VISIBILITY_VARIANT[vis]}>{VISIBILITY_LABEL[vis]}</Badge></td>
                  <td className="px-6 py-4 text-right text-sm">{deadlineCell(item)}</td>
                  <td className="px-6 py-4 text-sm text-content-secondary">{item.statuteReference ?? ''}</td>
                  <td className="px-6 py-4 text-right">
                    {cta ? (
                      <button type="button" onClick={() => dispatch(cta, item)} className="rounded-[var(--radius-sm)] border border-[var(--border-default)] px-3 py-1.5 text-sm hover:bg-surface-muted">{cta.label}</button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function matchesFilter(item: ChecklistItemData, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'action_needed') return needsAttention(item);
  if (filter === 'overdue') return item.status === 'overdue';
  if (filter === 'satisfied') return item.status === 'satisfied';
  if (filter === 'due_soon') {
    return !!item.deadline && item.status === 'unsatisfied' && (new Date(item.deadline).getTime() - Date.now()) <= 7 * 86400000;
  }
  return true;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm min-h-[36px] ${active ? 'border-[var(--interactive-primary)] bg-[var(--interactive-primary-soft)] text-[var(--interactive-primary)] font-semibold' : 'border-[var(--border-default)] text-content hover:bg-surface-muted'}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Create the visibility helper**

The queue imports `getTemplateDefaultVisibility` from a sibling file. Create `apps/web/src/components/compliance/compliance-visibility.ts`:

```ts
import { CONDO_718_CHECKLIST_TEMPLATE, HOA_720_CHECKLIST_TEMPLATE, type DefaultVisibility } from '@propertypro/shared';

export type { DefaultVisibility };

const TEMPLATE_VISIBILITY: Map<string, DefaultVisibility> = new Map();
for (const item of [...CONDO_718_CHECKLIST_TEMPLATE, ...HOA_720_CHECKLIST_TEMPLATE]) {
  TEMPLATE_VISIBILITY.set(item.templateKey, item.defaultVisibility);
}

export function getTemplateDefaultVisibility(templateKey: string): DefaultVisibility {
  return TEMPLATE_VISIBILITY.get(templateKey) ?? 'owner_portal';
}
```

(If `DefaultVisibility` is not re-exported from `@propertypro/shared`'s package barrel, add the re-export in `packages/shared/src/index.ts` and re-run `pnpm typecheck`.)

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-queue`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/compliance/compliance-queue.tsx apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx apps/web/src/components/compliance/compliance-visibility.ts
git commit -m "feat(compliance): add ComplianceQueue with filters and CTA matrix

Sortable priority queue: status pill mapping, visibility pill from
template defaults, filter chip group (role=group + aria-pressed),
Showing X of Y + Clear filters affordance, CTA matrix resolver
dispatching to onUpload/onLink/onView/onMarkApplicable handlers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B.2: Add sortable column headers

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-queue.tsx`
- Modify: `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx`

- [ ] **Step 1: Write a failing test**

Append to the queue test file:

```tsx
describe('ComplianceQueue — sortable headers', () => {
  it('marks Status column as the default sort with aria-sort="descending"', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    const statusHeader = screen.getByRole('columnheader', { name: /status/i });
    expect(statusHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('changes aria-sort when Deadline header is clicked', () => {
    render(
      <ComplianceQueue items={ITEMS} canWrite onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} selectedId={null} onSelect={vi.fn()} />,
    );
    const deadline = screen.getByRole('columnheader', { name: /deadline/i });
    fireEvent.click(deadline.querySelector('button')!);
    expect(deadline).toHaveAttribute('aria-sort', 'ascending');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @propertypro/web test -- --run compliance-queue`
Expected: FAIL — headers don't have `aria-sort` and aren't buttons.

- [ ] **Step 3: Implement sortable headers**

In `compliance-queue.tsx`, add at the top of the component body:

```tsx
type SortKey = 'status' | 'deadline' | 'statute';
type SortDir = 'asc' | 'desc';
const [sortKey, setSortKey] = useState<SortKey>('status');
const [sortDir, setSortDir] = useState<SortDir>('desc');

function toggleSort(key: SortKey) {
  if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
  else { setSortKey(key); setSortDir(key === 'status' ? 'desc' : 'asc'); }
}

const ordered = useMemo(() => {
  if (sortKey === 'status') return sortDir === 'desc' ? sorted : sorted.slice().reverse();
  if (sortKey === 'deadline') {
    const copy = sorted.slice().sort((a, b) => {
      const da = a.deadline ? new Date(a.deadline).getTime() : Number.POSITIVE_INFINITY;
      const db = b.deadline ? new Date(b.deadline).getTime() : Number.POSITIVE_INFINITY;
      return sortDir === 'asc' ? da - db : db - da;
    });
    return copy;
  }
  const copy = sorted.slice().sort((a, b) =>
    sortDir === 'asc'
      ? (a.statuteReference ?? '').localeCompare(b.statuteReference ?? '')
      : (b.statuteReference ?? '').localeCompare(a.statuteReference ?? ''),
  );
  return copy;
}, [sorted, sortKey, sortDir]);
```

Replace the `filtered = useMemo(() => sorted.filter(...))` line with `filtered = useMemo(() => ordered.filter(...))` and update its deps to `[ordered, filter]`.

Then update the `<thead>` row to use `<SortableHeader>` for Status, Deadline, and Statute (Record, Visibility, Action stay plain `<th>`). Add this component above `ComplianceQueue`:

```tsx
function SortableHeader({
  label, columnKey, sortKey, sortDir, onClick, align = 'left',
}: { label: string; columnKey: 'status' | 'deadline' | 'statute'; sortKey: string; sortDir: 'asc' | 'desc'; onClick: () => void; align?: 'left' | 'right' }) {
  const active = sortKey === columnKey;
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={`px-6 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-content-tertiary hover:text-content">
        {label}
        <span aria-hidden="true" className="text-[0.6rem]">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
```

Replace the relevant `<th>` cells in `<thead>` with:

```tsx
<SortableHeader label="Status" columnKey="status" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('status')} />
{/* ... Visibility plain ... */}
<SortableHeader label="Deadline" columnKey="deadline" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('deadline')} align="right" />
<SortableHeader label="Statute" columnKey="statute" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('statute')} />
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-queue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-queue.tsx apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx
git commit -m "feat(compliance): make queue columns sortable (Atlassian pattern)

Status (default desc), Deadline, and Statute columns are now
clickable column headers with aria-sort and chevron glyphs.
Default sort is Status via sortByPriority.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B.3: Wire queue into `ComplianceCommandCenter` with modal state

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx`

- [ ] **Step 1: Wire the queue, lift modal state**

In `compliance-command-center.tsx`, import the queue + modals:

```tsx
import { ComplianceQueue } from './compliance-queue';
import { LinkDocumentModal } from './link-document-modal';
import { UploadDocumentModal } from './upload-document-modal';
import { useComplianceMutations } from '@/hooks/useComplianceMutations';
import type { ChecklistItemData } from './compliance-checklist-item';
```

Add state inside the component:

```tsx
const mutations = useComplianceMutations(communityId);
const [selectedId, setSelectedId] = useState<number | null>(null);
const [uploadItem, setUploadItem] = useState<ChecklistItemData | null>(null);
const [linkItem, setLinkItem] = useState<ChecklistItemData | null>(null);
```

Replace the "Loading…" placeholder block with:

```tsx
{!isLoading && items.length > 0 && (
  <ComplianceQueue
    items={items}
    canWrite={canWrite}
    role={role}
    selectedId={selectedId}
    onSelect={setSelectedId}
    onUpload={(item) => setUploadItem(item)}
    onLink={(item) => setLinkItem(item)}
    onView={(item) => {
      if (item.documentId) {
        window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
      }
    }}
    onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
  />
)}

{uploadItem && (
  <UploadDocumentModal
    communityId={communityId}
    defaultTitle={uploadItem.title}
    categoryName={uploadItem.category}
    onUploaded={(documentId) => mutations.linkDocument.mutate({ itemId: uploadItem.id, documentId })}
    onClose={() => setUploadItem(null)}
  />
)}
{linkItem && (
  <LinkDocumentModal
    communityId={communityId}
    onSelect={(documentId) => { mutations.linkDocument.mutate({ itemId: linkItem.id, documentId }); setLinkItem(null); }}
    onClose={() => setLinkItem(null)}
  />
)}
```

- [ ] **Step 2: Run all compliance tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance`
Expected: PASS. The command-center smoke tests should still pass; queue tests pass.

- [ ] **Step 3: Smoke test in dev**

Run: `pnpm dev`. Visit `/communities/<id>/compliance?layout=v2` as a CAM. The queue should render with filter chips and sortable headers; clicking "Upload document" or "Link existing document" opens the corresponding modal; sorting by Deadline reorders.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx
git commit -m "feat(compliance): mount ComplianceQueue inside command center

Lifts modal state into the container; wires CTA matrix handlers
to existing UploadDocumentModal, LinkDocumentModal, and
useComplianceMutations. View document opens /documents/[id] in
a new tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task B.4: Open Slice B PR

- [ ] **Step 1: Push and open PR**

```bash
git push
gh pr create --title "feat(compliance): priority queue with filters and sortable headers (Slice B)" --body "$(cat <<'EOF'
## Summary
- New `ComplianceQueue` component: Atlassian-style table with sortable column headers (Status default, Deadline, Statute) and `aria-sort`
- Filter chip group (`role="group"` + `aria-pressed`) with Action needed / All / Overdue / Due ≤7d / Satisfied + counts
- "Showing X of Y · × Clear filters" affordance when filter is active
- Visibility pill resolved from template `defaultVisibility` (Slice A); status pill via local mapping
- CTA matrix as a single switch dispatching to existing modals + mutations
- Mounted inside `ComplianceCommandCenter`; modal state lifted

## Test plan
- [x] `pnpm --filter @propertypro/web test -- --run compliance-queue`
- [x] `pnpm --filter @propertypro/web test -- --run compliance-command-center`
- [ ] Manual: `/communities/<id>/compliance?layout=v2` — filters, sort, and CTAs work as a CAM

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Slice C — Side detail panel

**Why next:** Container + queue render data. Selection model + side panel close the interaction loop.

**Files:**
- Create: `apps/web/src/components/compliance/compliance-detail-panel.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx`
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx` (selection lifecycle, layout, "View full activity" target)

## Task C.1: Create `ComplianceDetailPanel`

**Files:**
- Create: `apps/web/src/components/compliance/compliance-detail-panel.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ComplianceDetailPanel } from '../compliance-detail-panel';

vi.mock('@/hooks/use-compliance-activity', () => ({
  useComplianceActivityFeed: () => ({
    data: { data: [
      { id: 1, userId: 'u', action: 'link_document', resourceType: 'compliance_checklist_item', resourceId: '1', metadata: null, createdAt: '2026-05-26T10:42:00Z' },
    ], pagination: { nextCursor: null, hasMore: false }, users: {} },
    isLoading: false,
    error: null,
  }),
}));

const ITEM = {
  id: 1, templateKey: '718_insurance', title: 'Current insurance declaration',
  category: 'insurance', status: 'unsatisfied' as const,
  documentId: null, documentPostedAt: null,
  deadline: '2026-06-14T00:00:00.000Z', rollingWindow: null, isApplicable: true,
};

function withQuery(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ComplianceDetailPanel', () => {
  it('renders the selected item title and pills', () => {
    withQuery(<ComplianceDetailPanel item={ITEM} communityId={1} canWrite role="cam" onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} />);
    expect(screen.getByText('Current insurance declaration')).toBeInTheDocument();
    expect(screen.getByText('Action needed')).toBeInTheDocument();
  });

  it('renders the resolved CTA for unsatisfied + no document + CAM', () => {
    withQuery(<ComplianceDetailPanel item={ITEM} communityId={1} canWrite role="cam" onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Upload document/i })).toBeInTheDocument();
  });

  it('renders the empty-selection state when item is null', () => {
    withQuery(<ComplianceDetailPanel item={null} communityId={1} canWrite role="cam" onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} />);
    expect(screen.getByText(/Select a record/i)).toBeInTheDocument();
  });

  it('hides Recent Activity section when the activity hook 403s', async () => {
    vi.doMock('@/hooks/use-compliance-activity', () => ({
      useComplianceActivityFeed: () => ({
        data: undefined,
        isLoading: false,
        error: { status: 403, message: 'Forbidden' },
      }),
    }));
    const { ComplianceDetailPanel: Panel } = await import('../compliance-detail-panel');
    withQuery(<Panel item={ITEM} communityId={1} canWrite role="cam" onUpload={vi.fn()} onLink={vi.fn()} onView={vi.fn()} onMarkApplicable={vi.fn()} />);
    expect(screen.queryByText(/Recent activity/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @propertypro/web test -- --run compliance-detail-panel`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the panel**

Create `apps/web/src/components/compliance/compliance-detail-panel.tsx`:

```tsx
'use client';

import React from 'react';
import { Badge } from '@propertypro/ui';
import { useComplianceActivityFeed } from '@/hooks/use-compliance-activity';
import type { ChecklistItemData } from './compliance-checklist-item';
import { getTemplateDefaultVisibility } from './compliance-visibility';
import { BOARD_ACTION_TEMPLATE_KEYS } from '@/lib/utils/compliance-calculator';

export interface ComplianceDetailPanelProps {
  item: ChecklistItemData | null;
  communityId: number;
  canWrite: boolean;
  role?: string;
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
}

function resolveCta(item: ChecklistItemData, canWrite: boolean, role?: string) {
  if (!canWrite) return item.documentId ? { label: 'View document', handler: 'view' as const } : null;
  if (item.status === 'not_applicable') return { label: 'Mark applicable', handler: 'mark_applicable' as const };
  if (item.status === 'satisfied') return { label: 'View document', handler: 'view' as const };
  if (item.documentId) {
    const rolling = !!item.rollingWindow;
    return rolling
      ? { label: 'Upload current document', handler: 'upload' as const }
      : { label: 'Re-link or replace', handler: 'link' as const };
  }
  if (role === 'board_president' || role === 'board_member') return { label: 'Link existing document', handler: 'link' as const };
  return { label: 'Upload document', handler: 'upload' as const };
}

function statusLabel(item: ChecklistItemData): string {
  if (item.status === 'satisfied') return 'Satisfied';
  if (item.status === 'overdue') return 'Overdue';
  if (item.status === 'not_applicable') return 'Not applicable';
  if (BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey)) return 'Needs board action';
  return 'Action needed';
}

function statusVariant(status: ChecklistItemData['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'satisfied') return 'success';
  if (status === 'overdue') return 'danger';
  if (status === 'not_applicable') return 'neutral';
  return 'warning';
}

const VISIBILITY_LABEL = { public_page: 'Public', owner_portal: 'Owner portal', owner_only: 'Owner-only', board: 'Board' } as const;
const VISIBILITY_VARIANT = { public_page: 'info', owner_portal: 'owner', owner_only: 'owner', board: 'board' } as const;

export function ComplianceDetailPanel({
  item, communityId, canWrite, role,
  onUpload, onLink, onView, onMarkApplicable,
}: ComplianceDetailPanelProps) {
  const activity = useComplianceActivityFeed(communityId);

  if (!item) {
    return (
      <aside aria-label="Selected record details" className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-6 text-center text-sm text-content-secondary">
        Select a record to see details.
      </aside>
    );
  }

  const cta = resolveCta(item, canWrite, role);
  const vis = getTemplateDefaultVisibility(item.templateKey);
  const activityHidden = activity.error?.status === 403;
  const recentEvents = activity.data?.data?.slice(0, 3) ?? [];

  function dispatchCta() {
    if (!cta) return;
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  function scrollToActivityFeed() {
    const el = document.getElementById('compliance-activity-feed');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <aside aria-label="Selected record details" className="sticky top-6 rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">Selected record</div>
      <h3 className="mt-1 text-lg font-semibold leading-tight">{item.title}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge>
        <Badge variant={VISIBILITY_VARIANT[vis]}>{VISIBILITY_LABEL[vis]}</Badge>
        {item.statuteReference && <Badge variant="neutral">{item.statuteReference}</Badge>}
      </div>

      <ul className="my-4 flex flex-col gap-3 border-y border-edge-subtle py-4">
        <Check ok={!!item.documentId} title="Document on file" desc={item.documentId ? 'Linked document is on record.' : 'No document linked yet.'} />
        <Check ok={!!item.documentPostedAt} title="Owner portal access" desc={item.documentPostedAt ? 'Posted and visible to authorized owners.' : 'Not yet posted.'} />
        <Check ok title="Audit trail" desc="Every action is recorded." />
      </ul>

      {cta && (
        <button type="button" onClick={dispatchCta} className="w-full rounded-[var(--radius-md)] bg-[var(--interactive-primary)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--interactive-primary-hover)]">
          {cta.label}
        </button>
      )}

      {!activityHidden && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">Recent activity</h4>
          {recentEvents.length === 0 ? (
            <p className="mt-2 text-sm text-content-secondary">No recent activity.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {recentEvents.map((e) => (
                <li key={e.id} className="text-content-secondary">
                  <span className="font-medium text-content">{new Date(e.createdAt).toLocaleString()}</span> — {e.action.replace(/_/g, ' ')}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={scrollToActivityFeed} className="mt-3 text-sm text-[var(--interactive-primary)] hover:underline">
            View full activity →
          </button>
        </div>
      )}
    </aside>
  );
}

function Check({ ok, title, desc }: { ok: boolean; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden="true" className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${ok ? 'bg-status-success-bg text-status-success' : 'bg-status-warning-bg text-status-warning'}`}>{ok ? '✓' : '!'}</span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-content-secondary">{desc}</div>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-detail-panel`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-detail-panel.tsx apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx
git commit -m "feat(compliance): add ComplianceDetailPanel

Sticky right-rail panel: selected record header + pills, three
status checks, CTA matrix resolver, recent activity (last 3 from
community feed), 'View full activity →' link that scrolls to the
bottom collapsible. Hides the Recent Activity section on 403.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task C.2: Wire detail panel + selection lifecycle into the container

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx`

- [ ] **Step 1: Add the lifecycle effects**

In `compliance-command-center.tsx`, replace the existing single-column body wrapping the queue with a two-column grid plus the panel. Add a `useEffect` to set the initial selection and a ref-based scroll-on-mutation effect.

First, import:

```tsx
import { useEffect, useRef } from 'react';
import { ComplianceDetailPanel } from './compliance-detail-panel';
import { sortByPriority } from '@/lib/utils/compliance-calculator';
```

Inside the component, replace the queue block with:

```tsx
const selectedRowRef = useRef<number | null>(null);
const selectedItem = selectedId != null ? items.find((i) => i.id === selectedId) ?? null : null;

useEffect(() => {
  if (items.length > 0 && selectedId === null) {
    const first = sortByPriority(items)[0];
    if (first) setSelectedId(first.id);
  }
  // If the selected item disappears entirely, fall back to the new top item.
  if (selectedId !== null && !items.some((i) => i.id === selectedId)) {
    setSelectedId(sortByPriority(items)[0]?.id ?? null);
  }
}, [items, selectedId]);

useEffect(() => {
  if (selectedId == null || selectedRowRef.current === selectedId) return;
  selectedRowRef.current = selectedId;
  // Scroll the selected row into view after layout settles.
  requestAnimationFrame(() => {
    const row = document.querySelector(`[data-row-id="${selectedId}"]`);
    if (row && 'scrollIntoView' in row) (row as HTMLElement).scrollIntoView({ block: 'nearest' });
  });
}, [selectedId, items]);
```

Replace the single-column queue render with:

```tsx
{!isLoading && items.length > 0 && (
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
    <ComplianceQueue
      items={items}
      canWrite={canWrite}
      role={role}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onUpload={(item) => setUploadItem(item)}
      onLink={(item) => setLinkItem(item)}
      onView={(item) => { if (item.documentId) window.open(`/documents/${item.documentId}`, '_blank', 'noopener'); }}
      onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
    />
    <ComplianceDetailPanel
      item={selectedItem}
      communityId={communityId}
      canWrite={canWrite}
      role={role}
      onUpload={(item) => setUploadItem(item)}
      onLink={(item) => setLinkItem(item)}
      onView={(item) => { if (item.documentId) window.open(`/documents/${item.documentId}`, '_blank', 'noopener'); }}
      onMarkApplicable={(item) => mutations.markApplicable.mutate({ itemId: item.id })}
    />
  </div>
)}
```

- [ ] **Step 2: Add `data-row-id` to queue rows**

In `compliance-queue.tsx`, in the `tbody` map, add `data-row-id={item.id}` to each `<tr>`:

```tsx
<tr key={item.id} data-row-id={item.id} aria-current={...} className={...}>
```

- [ ] **Step 3: Run all compliance tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance`
Expected: PASS.

- [ ] **Step 4: Smoke test in dev**

Visit `/communities/<id>/compliance?layout=v2` as a CAM. The first item (priority-sorted) should already be selected and visible in the side panel. Clicking a different row's CTA should populate the panel.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx apps/web/src/components/compliance/compliance-queue.tsx
git commit -m "feat(compliance): mount detail panel with selection lifecycle

Selection useState with effects for initial selection (sortByPriority[0]),
scrollIntoView on selection change, and fallback when selected item
disappears. Two-column body layout (queue + sticky side panel) at lg
breakpoint and above.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task C.3: Open Slice C PR

- [ ] **Step 1: Push and open PR**

```bash
git push
gh pr create --title "feat(compliance): side detail panel with selection lifecycle (Slice C)" --body "$(cat <<'EOF'
## Summary
- New `ComplianceDetailPanel`: header + pills + 3 status checks + CTA (matrix-resolved) + recent activity (last 3) + "View full activity →" link
- Selection lifecycle in `ComplianceCommandCenter`: initial selection = sortByPriority[0], scroll-into-view on selection change, fallback when selected item disappears
- Two-column body layout (queue 1fr · panel 380px sticky at lg+); stacks on mobile
- Recent Activity section hides on 403 (mirrors existing feed behavior)

## Test plan
- [x] `pnpm --filter @propertypro/web test -- --run compliance-detail-panel`
- [x] `pnpm --filter @propertypro/web test -- --run compliance-command-center`
- [ ] Manual: queue + side panel render side-by-side; selecting a row updates the panel; "View full activity →" smooth-scrolls to bottom

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Slice D — Default-on swap

**Why next:** Layout is feature-complete behind the flag. Flip the default; let the legacy path stay reachable for one release window via `?layout=v1`.

**Files:**
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx`

## Task D.1: Flip the default branch

- [ ] **Step 1: Edit `page.tsx`**

Change the branch logic from `if (layout === 'v2') { ... } return <ComplianceDashboard ...>;` to `if (layout === 'v1') { return <ComplianceDashboard ...>; } { ... v2 default ... }`:

```tsx
if (layout === 'v1') {
  return <ComplianceDashboard communityId={communityId} />;
}

const canWrite = checkPermission(
  membership.role, membership.communityType, 'compliance', 'write', opts,
);
return (
  <ComplianceCommandCenter
    communityId={communityId}
    role={membership.role}
    canWrite={canWrite}
  />
);
```

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm --filter @propertypro/web test -- --run compliance`
Expected: PASS.

- [ ] **Step 3: Smoke test in dev**

Visit `/communities/<id>/compliance` (no flag) — should render `ComplianceCommandCenter`. Visit `/communities/<id>/compliance?layout=v1` — should render the legacy `ComplianceDashboard`.

- [ ] **Step 4: Commit + open PR**

```bash
git add apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx
git commit -m "feat(compliance): make redesigned layout the default

Flips the branch in page.tsx — ?layout=v1 now opts back to the
legacy ComplianceDashboard. Legacy path is preserved for one
release window before Slice E removes it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
gh pr create --title "feat(compliance): swap default to redesigned layout (Slice D)" --body "$(cat <<'EOF'
## Summary
- `/communities/<id>/compliance` now renders `ComplianceCommandCenter` by default
- `?layout=v1` opts back to the legacy `ComplianceDashboard` (removed in Slice E)

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm --filter @propertypro/web test -- --run compliance`
- [ ] Manual: default route renders new layout; `?layout=v1` renders old

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Slice E — Cleanup + localStorage persistence

**Why last:** New layout has soaked as default. Remove the legacy branch and its dependencies; add view-preference persistence as a small rider.

**Files:**
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx`
- Delete: `apps/web/src/components/compliance/compliance-dashboard.tsx`
- Delete: `apps/web/src/components/compliance/compliance-score-ring.tsx`
- Delete: `apps/web/src/components/compliance/deadline-ribbon.tsx`
- Delete: `apps/web/src/components/compliance/compliance-filter-pills.tsx`
- Delete: `apps/web/__tests__/compliance/compliance-dashboard.test.tsx`
- Delete: `apps/web/__tests__/compliance/compliance-filters.test.ts`
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx` (localStorage persistence)

## Task E.1: Remove `?layout=v1` branch and the legacy import

- [ ] **Step 1: Edit `page.tsx`**

Remove the `?layout=v1` branch and the `ComplianceDashboard` import:

```tsx
// Remove:
// import ComplianceDashboard from '@/components/compliance/compliance-dashboard';

// Remove the branch:
// if (layout === 'v1') { return <ComplianceDashboard ...>; }

// Also remove `layout` from searchParams destructure if unused.
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx
git commit -m "refactor(compliance): drop ?layout=v1 escape hatch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task E.2: Delete legacy components and their tests

- [ ] **Step 1: Verify no other importers**

For each file below, run `grep -rn "<COMPONENT_NAME>" apps packages --include="*.ts*"` and confirm no remaining importers outside the files we're about to delete:

```bash
grep -rn "compliance-dashboard\b\|ComplianceDashboard\b" apps packages --include="*.ts*" | grep -v "__tests__\|compliance-dashboard.tsx"
grep -rn "compliance-score-ring\b\|ComplianceScoreRing\b" apps packages --include="*.ts*"
grep -rn "deadline-ribbon\b\|DeadlineRibbon\b" apps packages --include="*.ts*"
grep -rn "compliance-filter-pills\b\|ComplianceFilterPills\b" apps packages --include="*.ts*"
```

Each command should return zero hits (after page.tsx's import is gone from Task E.1).

- [ ] **Step 2: Delete the files**

```bash
git rm apps/web/src/components/compliance/compliance-dashboard.tsx
git rm apps/web/src/components/compliance/compliance-score-ring.tsx
git rm apps/web/src/components/compliance/deadline-ribbon.tsx
git rm apps/web/src/components/compliance/compliance-filter-pills.tsx
git rm apps/web/__tests__/compliance/compliance-dashboard.test.tsx
git rm apps/web/__tests__/compliance/compliance-filters.test.ts
```

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm typecheck && pnpm --filter @propertypro/web test -- --run compliance`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(compliance): remove legacy dashboard and its companions

Deletes ComplianceDashboard, ComplianceScoreRing, DeadlineRibbon,
ComplianceFilterPills and their tests. All consumers migrated in
prior slices.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task E.3: Add localStorage persistence for view preference

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-command-center.tsx`
- Modify: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`

- [ ] **Step 1: Write a failing test**

Append to the command-center test file:

```tsx
import { fireEvent } from '@testing-library/react';

describe('ComplianceCommandCenter — view persistence', () => {
  it('reads view preference from localStorage on mount', () => {
    window.localStorage.setItem('compliance.audienceView.1', 'board');
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    expect(screen.getByRole('button', { name: 'Board view' })).toHaveAttribute('aria-pressed', 'true');
    window.localStorage.removeItem('compliance.audienceView.1');
  });

  it('writes view preference to localStorage on toggle', () => {
    renderWithProviders(
      <ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Board view' }));
    expect(window.localStorage.getItem('compliance.audienceView.1')).toBe('board');
    window.localStorage.removeItem('compliance.audienceView.1');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm --filter @propertypro/web test -- --run compliance-command-center`
Expected: FAIL — preference is not persisted.

- [ ] **Step 3: Implement persistence**

In `compliance-command-center.tsx`, replace the `useState<ViewMode>` initializer and add an effect:

```tsx
const storageKey = `compliance.audienceView.${communityId}`;

const [view, setView] = useState<ViewMode>(() => {
  if (typeof window === 'undefined') return defaultViewForRole(role);
  const stored = window.localStorage.getItem(storageKey);
  if (stored === 'cam' || stored === 'board') return stored;
  return defaultViewForRole(role);
});

useEffect(() => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, view);
}, [storageKey, view]);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @propertypro/web test -- --run compliance-command-center`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx
git commit -m "feat(compliance): persist CAM/Board view preference per community

localStorage key 'compliance.audienceView.<communityId>'. Per-browser
not per-user; acceptable for v1 per the spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

## Task E.4: Open Slice E PR

- [ ] **Step 1: Final lint sweep**

```bash
pnpm lint
```
Expected: PASS.

- [ ] **Step 2: Push and open PR**

```bash
git push
gh pr create --title "refactor(compliance): cleanup + localStorage view persistence (Slice E)" --body "$(cat <<'EOF'
## Summary
- Drops `?layout=v1` escape hatch
- Deletes legacy `ComplianceDashboard`, `ComplianceScoreRing`, `DeadlineRibbon`, `ComplianceFilterPills` and their tests
- Adds per-community localStorage persistence for CAM/Board view preference

Closes the compliance page redesign series ([spec](docs/superpowers/specs/2026-05-26-compliance-page-redesign-design.md)).

## Test plan
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm --filter @propertypro/web test -- --run compliance`
- [ ] Manual: toggle CAM/Board, reload page, verify preference sticks per community

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-Review

**Spec coverage:**

| Spec section | Implementing task(s) |
|---|---|
| Problem / Goals | Whole plan |
| Color and theme | A.7 (KpiCard styling), B.1 (queue styling), inherits tokens |
| Information architecture (column order, alignment, null deadline) | B.1 (cells), B.2 (sortable headers) |
| Components → Reuse | A.7, B.3, C.2 |
| Components → New (3 components) | A.7, B.1, C.1 |
| Badge variants — token-system change | A0.1, A0.2, A0.3, A0.4 |
| Status → Badge variant mapping | B.1 (`statusVariant`, `statusLabel`), C.1 (same helpers in panel) |
| Removed / demoted | E.2 |
| Data — Reuse as-is | A.7 (`useComplianceChecklist`), B.3, C.2 (mutations) |
| Status taxonomy unchanged | Calculator extensions stay additive |
| Derived helpers | A.4, A.5, A.6 |
| Visibility taxonomy (§718 + §720 tables) | A.2, A.3 |
| Role-driven default view + persistence | A.7 (role-gated toggle), E.3 (localStorage) |
| Side panel CTA matrix (switch impl) | B.1 (`resolveCta`), C.1 (panel `resolveCta`) |
| States — Loading / Empty / Error / etc. | A.7 (loading + error), B.1 (filter→0), C.1 (no selection / 403), C.2 (hidden-by-filter via effect) |
| Selection model | C.2 (lifecycle + scroll) |
| Queue interactions and affordances | B.1 (filters, Showing X of Y), B.2 (sortable headers); KPI tooltips wired in A.7 (basic labels; tooltip primitive integration listed in B.1 follow-up if needed) |
| Accessibility | Embedded throughout (aria-pressed, aria-current, aria-sort, breadcrumb labels) |
| Routes and integration / searchParams | A.8 (page.tsx), D.1 (flip default), E.1 (drop branch) |
| PDF export contract | Unchanged — Export PDF wiring is part of A.7's actions slot; carried forward |
| Recent activity (side panel) + 403 hide + View full activity link | C.1 |
| Telemetry | Unchanged; preserved via `useComplianceMutations` |

**Gap noted:** the spec mentions KPI label tooltips (Queue interactions section). The plan's A.7 KpiCard renders the labels as plain text without `<Tooltip>`. This is a deliberate scope choice — wiring tooltips through the KpiCard is a small follow-up that doesn't change the data flow. If product wants the tooltips in the same PR as A, add a Step in A.7 that wraps each KpiCard label in `<Tooltip content="...">` from `apps/web/src/components/ui/tooltip.tsx`. Otherwise leave for a Slice B+ polish task.

**Type consistency check:**
- `BadgeVariant` derives from `keyof typeof semanticColors.status` — Slice A0 adds `owner` and `board`, all subsequent slices use these. ✓
- `ComplianceTemplateItem.defaultVisibility` is `DefaultVisibility` everywhere. ✓
- `ChecklistItemData` (existing type) used unchanged. ✓
- `ComplianceSummary` interface defined in A.5, consumed in A.7 — names match. ✓
- `sortByPriority(items)` signature consistent across A.6, A.7, B.1, C.2. ✓
- CTA matrix `resolveCta` exists in both `compliance-queue.tsx` (B.1) and `compliance-detail-panel.tsx` (C.1). This is intentional duplication for component independence; if it grows, extract to a shared helper. Noted, not a bug.

**Placeholder scan:** no TBDs, no "add appropriate handling", every code step has actual code. ✓

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-26-compliance-page-redesign.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per slice (or per task within a slice), review between tasks, fast iteration. Best for a 6-slice plan where each slice is its own PR.

**2. Inline Execution** — I work through tasks in this session using `executing-plans`, batch with checkpoints for your review.

Which approach?
