# ComplianceRequirementCard Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided, expandable compliance requirement card that consolidates the scattered/dead `compliance-checklist-item`, `compliance-item-actions`, and detail-panel status checks into one self-contained presentational component — the building block of the redesigned compliance page.

**Architecture:** A pure presentational React component. It owns only its expand/collapse UI state; all data comes via props and all actions are callbacks. Collapsed state shows status + title + one-line "why" + a single primary CTA. Expanded state adds status checks, expert detail (statute / deadline / posting window / visibility), the full action row, and recent activity. CTA resolution is delegated to the existing `resolveComplianceCta`; the full action row composes the existing `ComplianceItemActions`; status/visibility labels come from the existing `compliance-pill-mapping`. No new data fetching is introduced.

**Tech Stack:** React 19, TypeScript, Tailwind, `@propertypro/ui` (`Badge`, `Button`), `lucide-react`, Vitest + `@testing-library/react`, TanStack Query (only because the composed `ComplianceItemActions` uses it for its document viewer — tests wrap in a `QueryClientProvider`).

**Phase context:** This is Phase 1 of the compliance-page guided redesign (spec: `docs/superpowers/specs/2026-05-28-compliance-page-guided-redesign-design.md`). It builds the card in isolation with full unit tests. It does NOT wire the card into the page, retire the table, or remove the CAM/Board toggle — that is Phase 2. The old `compliance-checklist-item.tsx` and `compliance-queue.tsx` remain untouched and functional after this phase except for one additive export.

**Commit hygiene note:** The worktree has pre-existing uncommitted changes in `compliance-command-center.tsx` and `compliance-queue.tsx` that predate this work. Every commit step below stages **only** the explicitly named files. Do NOT use `git add -A` or `git add .`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/components/compliance/compliance-requirement-card.tsx` (create) | The guided expandable card. Pure presentational. |
| `apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx` (create) | Unit tests for the card. |
| `apps/web/src/components/compliance/compliance-checklist-item.tsx` (modify) | Export `HELP_TEXT` and the `ChecklistItemData` type stays here (already exported) so the card can reuse the "What's required?" copy without duplicating it. |

### Component public API (final shape — every task builds toward this)

```tsx
import type { ChecklistItemData } from './compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';

export interface ComplianceRequirementCardProps {
  item: ChecklistItemData;
  communityId: number;
  canWrite: boolean;
  role?: string;
  /** Zone styling: loud for the "Needs you" zone, calm for the "Done" zone. */
  variant?: 'needs-attention' | 'done';
  /** Pre-fetched recent activity for this item, supplied by the parent. */
  recentEvents?: AuditEntry[];
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  onMarkNA: (item: ChecklistItemData) => void;
  onUnlink: (item: ChecklistItemData) => void;
}
```

---

## Task 1: Export `HELP_TEXT` from the checklist-item module

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-checklist-item.tsx`

- [ ] **Step 1: Make `HELP_TEXT` exported**

In `compliance-checklist-item.tsx`, find the declaration (currently `const HELP_TEXT: Record<string, string> = {`) and add the `export` keyword:

```tsx
export const HELP_TEXT: Record<string, string> = {
```

(Leave the rest of the map and file unchanged.)

- [ ] **Step 2: Verify the project still type-checks**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: PASS (no new errors). An exported const that was previously local is a safe widening.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/compliance-checklist-item.tsx
git commit -m "refactor(compliance): export HELP_TEXT for reuse in requirement card"
```

---

## Task 2: Collapsed card (status, title, why, primary CTA, expand toggle)

**Files:**
- Create: `apps/web/src/components/compliance/compliance-requirement-card.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx`

- [ ] **Step 1: Write the failing test file (collapsed behavior)**

Create `apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { ComplianceRequirementCard } from '../compliance-requirement-card';
import type { ChecklistItemData } from '../compliance-checklist-item';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const overdueItem: ChecklistItemData = {
  id: 1,
  templateKey: '718_declaration',
  title: 'Conflict of Interest Contracts',
  description: 'Required by Florida law. Owners can request this at any time.',
  category: 'governing_documents',
  statuteReference: '§718.111(12)(g)',
  documentId: null,
  documentPostedAt: null,
  deadline: '2020-01-01T00:00:00.000Z',
  status: 'overdue',
};

const handlers = {
  onUpload: vi.fn(),
  onLink: vi.fn(),
  onView: vi.fn(),
  onMarkApplicable: vi.fn(),
  onMarkNA: vi.fn(),
  onUnlink: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());

describe('ComplianceRequirementCard — collapsed', () => {
  it('renders the title, status label, and plain-language why', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    expect(screen.getByText('Conflict of Interest Contracts')).toBeVisible();
    expect(screen.getByText('Overdue')).toBeVisible();
    expect(
      screen.getByText(/required by florida law/i),
    ).toBeVisible();
  });

  it('renders the resolved primary CTA and fires its handler', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    // overdue + no document + non-board role => "Upload document" / upload
    const cta = screen.getByRole('button', { name: 'Upload document' });
    fireEvent.click(cta);
    expect(handlers.onUpload).toHaveBeenCalledWith(overdueItem);
  });

  it('hides the primary CTA for a read-only user with no document', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite={false} {...handlers} />,
      { wrapper: wrapper() },
    );
    expect(screen.queryByRole('button', { name: 'Upload document' })).toBeNull();
  });

  it('starts collapsed: expand control has aria-expanded=false', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    const toggle = screen.getByRole('button', { name: /show details/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-requirement-card.test.tsx`
Expected: FAIL — cannot resolve `../compliance-requirement-card`.

- [ ] **Step 3: Create the collapsed card implementation**

Create `apps/web/src/components/compliance/compliance-requirement-card.tsx`:

```tsx
'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@propertypro/ui';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import { statusLabel, statusVariant } from './compliance-pill-mapping';
import type { ChecklistItemData } from './compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';

export interface ComplianceRequirementCardProps {
  item: ChecklistItemData;
  communityId: number;
  canWrite: boolean;
  role?: string;
  variant?: 'needs-attention' | 'done';
  recentEvents?: AuditEntry[];
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  onMarkNA: (item: ChecklistItemData) => void;
  onUnlink: (item: ChecklistItemData) => void;
}

function statusIcon(status: ComplianceStatus): LucideIcon {
  if (status === 'overdue') return AlertCircle;
  if (status === 'satisfied') return CheckCircle2;
  if (status === 'not_applicable') return MinusCircle;
  return Clock;
}

export function ComplianceRequirementCard({
  item,
  communityId,
  canWrite,
  role,
  variant = 'needs-attention',
  recentEvents,
  onUpload,
  onLink,
  onView,
  onMarkApplicable,
  onMarkNA,
  onUnlink,
}: ComplianceRequirementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cta = resolveComplianceCta(item, canWrite, role);
  const StatusIcon = statusIcon(item.status);

  function dispatchCta() {
    if (!cta) return;
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  return (
    <article
      className={`rounded-[var(--radius-md)] border bg-surface-card ${
        variant === 'done' ? 'border-edge-subtle opacity-90' : 'border-edge-subtle'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          <StatusIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge>
            <h3 className="text-base font-semibold text-content">{item.title}</h3>
          </div>
          {item.description && (
            <p className="mt-1 text-sm text-content-secondary">{item.description}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {cta && (
              <Button size="sm" variant="primary" onClick={dispatchCta}>
                {cta.label}
              </Button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2"
            >
              {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export default ComplianceRequirementCard;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-requirement-card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-requirement-card.tsx apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx
git commit -m "feat(compliance): collapsed requirement card with status, why, primary CTA"
```

---

## Task 3: Expanded content (status checks, expert detail, action row, activity)

**Files:**
- Modify: `apps/web/src/components/compliance/compliance-requirement-card.tsx`
- Modify: `apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx`

- [ ] **Step 1: Add failing tests for the expanded panel**

Append to the test file (new `describe` block):

```tsx
describe('ComplianceRequirementCard — expanded', () => {
  it('reveals status checks, statute, and the full action row on expand', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));

    // status checks
    expect(screen.getByText(/document on file/i)).toBeVisible();
    expect(screen.getByText(/posted to owner portal/i)).toBeVisible();
    expect(screen.getByText(/audit trail/i)).toBeVisible();

    // expert detail
    expect(screen.getByText('§718.111(12)(g)')).toBeVisible();

    // guided "what's required" help text (HELP_TEXT['718_declaration'])
    expect(screen.getByText(/recorded declaration of condominium/i)).toBeVisible();

    // full action row (overdue, writable, no doc, non-board => Upload + Link + N/A)
    expect(screen.getByRole('button', { name: /upload document for/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /link existing document/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /mark .* as not applicable/i })).toBeVisible();
  });

  it('renders recent activity when supplied, empty message when not', () => {
    const events: AuditEntry[] = [
      {
        id: 7,
        userId: 'u1',
        action: 'unlink_document',
        resourceType: 'compliance_item',
        resourceId: '1',
        metadata: null,
        createdAt: '2026-05-20T12:00:00.000Z',
      },
    ];
    const { rerender } = render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite recentEvents={events} {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.getByText(/unlink document/i)).toBeVisible();

    rerender(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite recentEvents={[]} {...handlers} />,
    );
    expect(screen.getByText(/no recent activity/i)).toBeVisible();
  });

  it('does not render write actions for a read-only user', () => {
    render(
      <ComplianceRequirementCard item={overdueItem} communityId={9} canWrite={false} {...handlers} />,
      { wrapper: wrapper() },
    );
    fireEvent.click(screen.getByRole('button', { name: /show details/i }));
    expect(screen.queryByRole('button', { name: /upload document for/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /link existing document/i })).toBeNull();
  });
});
```

Add to the imports at the top of the test file:

```tsx
import type { AuditEntry } from '@/hooks/use-compliance-activity';
```

- [ ] **Step 2: Run the expanded tests to verify they fail**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-requirement-card.test.tsx -t expanded`
Expected: FAIL — expanded content not rendered yet.

- [ ] **Step 3: Implement the expanded panel (full file)**

Replace the entire contents of `apps/web/src/components/compliance/compliance-requirement-card.tsx` with:

```tsx
'use client';

import React, { useState } from 'react';
import { Badge, Button } from '@propertypro/ui';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, MinusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ComplianceStatus } from '@/lib/utils/compliance-calculator';
import { resolveComplianceCta } from '@/lib/utils/compliance-cta';
import { statusLabel, statusVariant, VISIBILITY_LABEL } from './compliance-pill-mapping';
import { getTemplateDefaultVisibility } from './compliance-visibility';
import { ComplianceItemActions } from './compliance-item-actions';
import { HELP_TEXT, type ChecklistItemData } from './compliance-checklist-item';
import type { AuditEntry } from '@/hooks/use-compliance-activity';

export interface ComplianceRequirementCardProps {
  item: ChecklistItemData;
  communityId: number;
  canWrite: boolean;
  role?: string;
  variant?: 'needs-attention' | 'done';
  recentEvents?: AuditEntry[];
  onUpload: (item: ChecklistItemData) => void;
  onLink: (item: ChecklistItemData) => void;
  onView: (item: ChecklistItemData) => void;
  onMarkApplicable: (item: ChecklistItemData) => void;
  onMarkNA: (item: ChecklistItemData) => void;
  onUnlink: (item: ChecklistItemData) => void;
}

function statusIcon(status: ComplianceStatus): LucideIcon {
  if (status === 'overdue') return AlertCircle;
  if (status === 'satisfied') return CheckCircle2;
  if (status === 'not_applicable') return MinusCircle;
  return Clock;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span
        aria-hidden="true"
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          ok ? 'bg-status-success-bg text-status-success' : 'bg-status-warning-bg text-status-warning'
        }`}
      >
        {ok ? '✓' : '!'}
      </span>
      <span className="text-content-secondary">{label}</span>
    </li>
  );
}

export function ComplianceRequirementCard({
  item,
  communityId,
  canWrite,
  role,
  variant = 'needs-attention',
  recentEvents,
  onUpload,
  onLink,
  onView,
  onMarkApplicable,
  onMarkNA,
  onUnlink,
}: ComplianceRequirementCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cta = resolveComplianceCta(item, canWrite, role);
  const StatusIcon = statusIcon(item.status);
  const visibility = getTemplateDefaultVisibility(item.templateKey);
  const deadline = formatDate(item.deadline);

  function dispatchCta() {
    if (!cta) return;
    if (cta.handler === 'upload') onUpload(item);
    else if (cta.handler === 'link') onLink(item);
    else if (cta.handler === 'view') onView(item);
    else if (cta.handler === 'mark_applicable') onMarkApplicable(item);
  }

  return (
    <article
      className={`rounded-[var(--radius-md)] border bg-surface-card ${
        variant === 'done' ? 'border-edge-subtle opacity-90' : 'border-edge-subtle'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <span aria-hidden="true" className="mt-0.5 shrink-0">
          <StatusIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(item.status)}>{statusLabel(item)}</Badge>
            <h3 className="text-base font-semibold text-content">{item.title}</h3>
          </div>
          {item.description && (
            <p className="mt-1 text-sm text-content-secondary">{item.description}</p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {cta && (
              <Button size="sm" variant="primary" onClick={dispatchCta}>
                {cta.label}
              </Button>
            )}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-sm text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2"
            >
              {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              {expanded ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-edge-subtle px-4 py-4">
          <ul className="flex flex-col gap-2" aria-label="Status checks">
            <StatusCheck ok={!!item.documentId} label="Document on file" />
            <StatusCheck ok={!!item.documentPostedAt} label="Posted to owner portal" />
            <StatusCheck ok label="Audit trail recorded" />
          </ul>

          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {item.statuteReference && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Statute</dt>
                <dd className="text-content-secondary">{item.statuteReference}</dd>
              </div>
            )}
            {deadline && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Deadline</dt>
                <dd className="text-content-secondary">{deadline}</dd>
              </div>
            )}
            {item.rollingWindow?.months ? (
              <div>
                <dt className="text-xs uppercase tracking-wider text-content-tertiary">Posting window</dt>
                <dd className="text-content-secondary">Rolling {item.rollingWindow.months} mo</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wider text-content-tertiary">Visibility</dt>
              <dd className="text-content-secondary">{VISIBILITY_LABEL[visibility]}</dd>
            </div>
          </dl>

          {HELP_TEXT[item.templateKey] && (
            <div className="mt-4 rounded-[var(--radius-sm)] bg-[var(--status-info-bg)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--status-info)]">
                What&apos;s required?
              </p>
              <p className="mt-1 text-sm text-[var(--status-info)]">{HELP_TEXT[item.templateKey]}</p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
            <ComplianceItemActions
              item={item}
              communityId={communityId}
              onUpload={() => onUpload(item)}
              onLink={() => onLink(item)}
              onMarkNA={() => onMarkNA(item)}
              onMarkApplicable={() => onMarkApplicable(item)}
              onUnlink={() => onUnlink(item)}
            />
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">Recent activity</h4>
            {recentEvents && recentEvents.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-content-secondary">
                {recentEvents.map((e) => (
                  <li key={e.id}>
                    {new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' — '}
                    {e.action.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-content-secondary">No recent activity.</p>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default ComplianceRequirementCard;
```

Note: `ComplianceItemActions` renders write buttons by status; it does not itself check `canWrite`. The read-only test passes because, per `resolveComplianceCta`, a read-only user gets no primary CTA — but `ComplianceItemActions` would still render its buttons. To make the read-only expanded test pass, gate the action row on `canWrite` (next step).

- [ ] **Step 4: Gate the action row on `canWrite`**

In the file you just wrote, wrap the action-row block so it only renders when `canWrite` is true. Replace:

```tsx
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
            <ComplianceItemActions
              item={item}
              communityId={communityId}
              onUpload={() => onUpload(item)}
              onLink={() => onLink(item)}
              onMarkNA={() => onMarkNA(item)}
              onMarkApplicable={() => onMarkApplicable(item)}
              onUnlink={() => onUnlink(item)}
            />
          </div>
```

with:

```tsx
          {canWrite ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
              <ComplianceItemActions
                item={item}
                communityId={communityId}
                onUpload={() => onUpload(item)}
                onLink={() => onLink(item)}
                onMarkNA={() => onMarkNA(item)}
                onMarkApplicable={() => onMarkApplicable(item)}
                onUnlink={() => onUnlink(item)}
              />
            </div>
          ) : item.documentId ? (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-4">
              <Button size="sm" variant="secondary" onClick={() => onView(item)}>
                View document
              </Button>
            </div>
          ) : null}
```

- [ ] **Step 5: Run the expanded tests to verify they pass**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-requirement-card.test.tsx`
Expected: PASS (all collapsed + expanded tests).

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/compliance/compliance-requirement-card.tsx apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx
git commit -m "feat(compliance): expandable detail with status checks, expert detail, actions, activity"
```

---

## Task 4: "Done" variant calm styling regression test

**Files:**
- Modify: `apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx`

- [ ] **Step 1: Add a test asserting the done variant renders a satisfied item's view affordance**

Append:

```tsx
describe('ComplianceRequirementCard — done variant', () => {
  const satisfiedItem: ChecklistItemData = {
    id: 2,
    templateKey: '718_bylaws',
    title: 'Bylaws',
    description: null,
    category: 'governing_documents',
    statuteReference: '§718.112',
    documentId: 555,
    documentPostedAt: '2026-05-01T00:00:00.000Z',
    deadline: null,
    status: 'satisfied',
  };

  it('shows the View document CTA for a satisfied item', () => {
    render(
      <ComplianceRequirementCard item={satisfiedItem} communityId={9} canWrite variant="done" {...handlers} />,
      { wrapper: wrapper() },
    );
    // satisfied => resolveComplianceCta returns View document / view
    const cta = screen.getByRole('button', { name: 'View document' });
    fireEvent.click(cta);
    expect(handlers.onView).toHaveBeenCalledWith(satisfiedItem);
  });
});
```

- [ ] **Step 2: Run to verify it passes (no impl change needed — behavior already supported)**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-requirement-card.test.tsx -t "done variant"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/__tests__/compliance-requirement-card.test.tsx
git commit -m "test(compliance): cover done-variant satisfied-item CTA"
```

---

## Task 5: Full suite + lint gate

**Files:** none (verification only)

- [ ] **Step 1: Run the compliance test suite**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance`
Expected: PASS. The new card suite is green; existing `compliance-item-actions`, `compliance-pill-mapping`, `compliance-activity-feed`, `compliance-detail-panel`, `compliance-queue` suites remain green (this phase did not modify them beyond the additive `HELP_TEXT` export).

- [ ] **Step 2: Lint the new file**

Run: `pnpm --filter @propertypro/web exec eslint src/components/compliance/compliance-requirement-card.tsx`
Expected: PASS (no errors).

- [ ] **Step 3: Final type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: PASS.

No commit (verification only). If any check fails, fix and re-run before declaring Phase 1 complete.

---

## Self-Review (completed by plan author)

**Spec coverage (Phase 1 portion):** The card consolidates `compliance-checklist-item` (collapse/expand + the exported `HELP_TEXT` "What's required?" guidance, rendered in the expanded panel per the "teach aggressively" pillar), `compliance-item-actions` (action row), and detail-panel status checks — matches spec §4 and §6. Task 1's `HELP_TEXT` export is consumed by Task 3. Pure-presentational + no data fetching matches spec §6 "isolation notes." Recent activity is a prop (`recentEvents`), satisfying "card must not own data fetching." Focus ring on the expand toggle satisfies spec §9. `variant` supports the two-zone styling (spec §5). CTA parity via `resolveComplianceCta` satisfies spec §7.

**Deferred to Phase 2 (intentionally not in this plan):** page assembly, hero, metric strip, zone partitioning, retiring the table/detail-panel, removing the toggle, wiring `recentEvents` from real activity data. Deferred to Phase 3: loading skeletons, activity-feed text fix, error AlertBanner, modal width.

**Placeholder scan:** No TBD/TODO. Every code step shows complete code. Test code is concrete with real fixtures.

**Type consistency:** `ChecklistItemData` imported from `compliance-checklist-item` (unchanged source of truth). `AuditEntry` matches `use-compliance-activity.ts` exactly (id:number, userId:string|null, action, resourceType, resourceId, metadata, createdAt). `resolveComplianceCta` handler union (`upload|link|view|mark_applicable`) matches the `dispatchCta` switch. `ComplianceItemActions` props (`item, communityId, onUpload, onLink, onMarkNA, onMarkApplicable, onUnlink`) match its definition. `statusVariant`/`statusLabel`/`VISIBILITY_LABEL`/`getTemplateDefaultVisibility` signatures match their modules.

**One known coupling:** `ComplianceItemActions` does not self-gate on `canWrite`; Task 3 Step 4 wraps it in a `canWrite` guard in the card. Verified against the read-only expanded test.
