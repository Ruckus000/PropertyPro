# Compliance Page Assembly Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the compliance page from a 6-column table + sticky detail panel + CAM/Board toggle into a guided, risk-first workspace: a status hero, a compact metric strip, a prioritized "Needs you" zone of expandable requirement cards, and a calm collapsed "Done" zone.

**Architecture:** `ComplianceCommandCenter` is rewritten to compose a new `ComplianceStatusHero`, a local `KpiCard` metric strip, and the Phase 1 `ComplianceRequirementCard` (rendered in two zones partitioned by status). The CAM/Board toggle and its localStorage state are removed. The old `ComplianceQueue` and `ComplianceDetailPanel` are deleted — the card absorbs the detail view via in-place expansion, so no table and no side panel remain. Card actions are wired to `useComplianceMutations` (link/unlink/markApplicable/markNotApplicable) and the existing upload/link modals.

**Tech Stack:** React 19, TypeScript, Tailwind, `@propertypro/ui` (`Button`), `lucide-react`, `next/navigation` (`useRouter`), TanStack Query, Vitest + `@testing-library/react`.

**Phase context:** Phase 1 (committed) built `ComplianceRequirementCard` in isolation. Phase 2 wires it into the page and retires the old surfaces. Spec: `docs/superpowers/specs/2026-05-28-compliance-page-guided-redesign-design.md`. Phase 3 (later) handles loading skeletons, activity-feed text-size, error AlertBanner, and modal width — do NOT pull those in here.

**Commit hygiene note:** The only other uncommitted file in the worktree is `.claude/launch.json` (a dev-server fix). Do NOT stage it. Every commit stages ONLY the files named in that task. Never `git add -A`/`.`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/compliance/compliance-status-hero.tsx` | Create | Risk-first verdict + readiness meter + jump-to-worst CTA. Pure presentational. |
| `apps/web/src/components/compliance/__tests__/compliance-status-hero.test.tsx` | Create | Unit tests for the hero. |
| `apps/web/src/components/compliance/compliance-command-center.tsx` | Rewrite | Page assembly: hero + metric strip + two zones + wiring. No toggle, no queue, no detail panel. |
| `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx` | Rewrite | Tests for the new structure. |
| `apps/web/src/components/compliance/compliance-queue.tsx` | Delete | Replaced by zone-rendered cards. |
| `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx` | Delete | Tests the deleted component. |
| `apps/web/src/components/compliance/compliance-detail-panel.tsx` | Delete | Absorbed into the card. |
| `apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx` | Delete | Tests the deleted component. |

### Confirmed APIs (do not re-derive)
- `ComplianceRequirementCard` props: `{ item, communityId, canWrite, role?, variant?, recentEvents?, onUpload, onLink, onView, onMarkApplicable, onMarkNA, onUnlink }` (all on-callbacks take `(item)`).
- `buildComplianceSummary(items, now)` → `{ readiness: { satisfied, applicableTotal, percentage }, postingWindowsDueSoonCount, overdueCount, needsBoardActionCount, attentionCount }` (type `ComplianceSummary`).
- `sortByPriority(items)` → items ordered overdue → unsatisfied-with-deadline → unsatisfied-no-deadline → satisfied → not_applicable.
- `useComplianceMutations(communityId)` → `{ linkDocument, unlinkDocument, markNotApplicable, markApplicable }`, each a mutation with `.mutate({ itemId })` (linkDocument: `.mutate({ itemId, documentId })`).
- `UploadDocumentModal` props: `{ communityId, defaultTitle, categoryName, onUploaded(documentId), onClose }`.
- `LinkDocumentModal` props: `{ communityId, onSelect(documentId), onClose }`.
- `PageHeader` wraps the `breadcrumb` slot in a `<nav aria-label="Breadcrumb">` (the existing test relies on `getByLabelText('Breadcrumb')`), so the breadcrumb `<ol>` itself carries NO aria-label.
- `/documents` page exists at `apps/web/src/app/(authenticated)/documents/page.tsx` — the repurposed "Upload record" navigates there.

---

## Task 1: `ComplianceStatusHero`

**Files:**
- Create: `apps/web/src/components/compliance/compliance-status-hero.tsx`
- Create: `apps/web/src/components/compliance/__tests__/compliance-status-hero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/compliance/__tests__/compliance-status-hero.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceStatusHero } from '../compliance-status-hero';
import type { ComplianceSummary } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from '../compliance-checklist-item';

function summary(overrides: Partial<ComplianceSummary> = {}): ComplianceSummary {
  return {
    readiness: { satisfied: 13, applicableTotal: 16, percentage: 81 },
    postingWindowsDueSoonCount: 0,
    overdueCount: 0,
    needsBoardActionCount: 0,
    attentionCount: 0,
    ...overrides,
  };
}

const worst: ChecklistItemData = {
  id: 5, templateKey: '718_insurance', title: 'Insurance', description: null,
  category: 'insurance', statuteReference: null, documentId: null,
  documentPostedAt: null, deadline: null, status: 'overdue',
};

describe('ComplianceStatusHero', () => {
  it('shows a danger verdict and Start-with CTA when overdue', () => {
    const onJump = vi.fn();
    render(<ComplianceStatusHero summary={summary({ overdueCount: 2, attentionCount: 2 })} worstItem={worst} onJumpToWorst={onJump} />);
    expect(screen.getByText(/2 records are overdue/i)).toBeVisible();
    const cta = screen.getByRole('button', { name: /start with: insurance/i });
    fireEvent.click(cta);
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('shows a warning verdict when items need attention but none overdue', () => {
    render(<ComplianceStatusHero summary={summary({ overdueCount: 0, attentionCount: 3, postingWindowsDueSoonCount: 3 })} worstItem={worst} onJumpToWorst={vi.fn()} />);
    expect(screen.getByText(/3 records need your attention/i)).toBeVisible();
  });

  it('shows a success verdict and no CTA when fully compliant', () => {
    render(<ComplianceStatusHero summary={summary()} worstItem={null} onJumpToWorst={vi.fn()} />);
    expect(screen.getByText(/fully compliant/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /start with/i })).toBeNull();
  });

  it('exposes readiness as a progressbar with the right value', () => {
    render(<ComplianceStatusHero summary={summary({ readiness: { satisfied: 4, applicableTotal: 8, percentage: 50 } })} worstItem={null} onJumpToWorst={vi.fn()} />);
    const bar = screen.getByRole('progressbar', { name: /compliance readiness/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText(/4 of 8 satisfied/i)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-status-hero.test.tsx`
Expected: FAIL — cannot resolve `../compliance-status-hero`.

- [ ] **Step 3: Implement the hero**

Create `apps/web/src/components/compliance/compliance-status-hero.tsx`:

```tsx
'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@propertypro/ui';
import type { ComplianceSummary } from '@/lib/utils/compliance-calculator';
import type { ChecklistItemData } from './compliance-checklist-item';

export interface ComplianceStatusHeroProps {
  summary: ComplianceSummary;
  worstItem: ChecklistItemData | null;
  onJumpToWorst: () => void;
}

type HeroTone = 'danger' | 'warning' | 'success';

function heroTone(summary: ComplianceSummary): HeroTone {
  if (summary.overdueCount > 0) return 'danger';
  if (summary.attentionCount > 0) return 'warning';
  return 'success';
}

function heroVerdict(summary: ComplianceSummary, tone: HeroTone): string {
  if (tone === 'danger') {
    const n = summary.overdueCount;
    return `${n} ${n === 1 ? 'record is' : 'records are'} overdue. These can expose the association to penalties — start here.`;
  }
  if (tone === 'warning') {
    const n = summary.attentionCount;
    return `${n} ${n === 1 ? 'record needs' : 'records need'} your attention soon.`;
  }
  return "You're fully compliant. Nothing needs attention right now.";
}

const TONE_STYLES: Record<HeroTone, { border: string; bg: string; fg: string; bar: string }> = {
  danger: { border: 'border-[var(--status-danger)]', bg: 'bg-[var(--status-danger-bg)]', fg: 'text-[var(--status-danger)]', bar: 'bg-[var(--status-danger)]' },
  warning: { border: 'border-[var(--status-warning)]', bg: 'bg-[var(--status-warning-bg)]', fg: 'text-[var(--status-warning)]', bar: 'bg-[var(--interactive-primary)]' },
  success: { border: 'border-[var(--status-success)]', bg: 'bg-[var(--status-success-bg)]', fg: 'text-[var(--status-success)]', bar: 'bg-[var(--status-success)]' },
};

export function ComplianceStatusHero({ summary, worstItem, onJumpToWorst }: ComplianceStatusHeroProps) {
  const tone = heroTone(summary);
  const styles = TONE_STYLES[tone];
  const Icon: LucideIcon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  const pct = summary.readiness.percentage;

  return (
    <section
      aria-labelledby="compliance-hero-title"
      className={`rounded-[var(--radius-md)] border-l-4 ${styles.border} ${styles.bg} p-5`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={`mt-0.5 shrink-0 ${styles.fg}`}>
            <Icon size={24} />
          </span>
          <div>
            <h2 id="compliance-hero-title" className={`text-lg font-semibold ${styles.fg}`}>
              {tone === 'success' ? 'Fully compliant' : 'Action required'}
            </h2>
            <p className="mt-1 text-sm text-content-secondary">{heroVerdict(summary, tone)}</p>
          </div>
        </div>
        {tone !== 'success' && worstItem && (
          <Button variant="primary" size="md" onClick={onJumpToWorst}>
            Start with: {worstItem.title}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-content">Readiness</span>
          <span className="tabular-nums text-content-secondary">
            {summary.readiness.satisfied} of {summary.readiness.applicableTotal} satisfied
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Compliance readiness"
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        >
          <div className={`h-full ${styles.bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}

export default ComplianceStatusHero;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-status-hero.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/compliance/compliance-status-hero.tsx apps/web/src/components/compliance/__tests__/compliance-status-hero.test.tsx
git commit -m "feat(compliance): risk-first status hero with readiness meter"
```

---

## Task 2: Rewrite `ComplianceCommandCenter`

**Files:**
- Rewrite: `apps/web/src/components/compliance/compliance-command-center.tsx`

- [ ] **Step 1: Replace the entire file contents**

Overwrite `apps/web/src/components/compliance/compliance-command-center.tsx` with:

```tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@propertypro/ui';
import { useComplianceChecklist } from '@/hooks/useComplianceChecklist';
import { useComplianceMutations } from '@/hooks/useComplianceMutations';
import { buildComplianceSummary, sortByPriority } from '@/lib/utils/compliance-calculator';
import { ComplianceOnboarding } from './compliance-onboarding';
import { ComplianceActivityFeed } from './compliance-activity-feed';
import { ComplianceRequirementCard } from './compliance-requirement-card';
import { ComplianceStatusHero } from './compliance-status-hero';
import { UploadDocumentModal } from './upload-document-modal';
import { LinkDocumentModal } from './link-document-modal';
import type { CommunityRole, NewCommunityRole } from '@propertypro/shared';
import type { ChecklistItemData } from './compliance-checklist-item';

export interface ComplianceCommandCenterProps {
  communityId: number;
  role: CommunityRole | NewCommunityRole;
  canWrite: boolean;
}

export function ComplianceCommandCenter({
  communityId,
  role,
  canWrite,
}: ComplianceCommandCenterProps) {
  const router = useRouter();
  const [uploadItem, setUploadItem] = useState<ChecklistItemData | null>(null);
  const [linkItem, setLinkItem] = useState<ChecklistItemData | null>(null);
  const { data: items = [], isLoading, error } = useComplianceChecklist(communityId);
  const mutations = useComplianceMutations(communityId);

  const summary = useMemo(
    () => buildComplianceSummary(items as ChecklistItemData[], new Date()),
    [items],
  );
  const prioritized = useMemo(
    () => sortByPriority(items as ChecklistItemData[]),
    [items],
  );
  const needsYou = useMemo(
    () => prioritized.filter((i) => i.status === 'overdue' || i.status === 'unsatisfied'),
    [prioritized],
  );
  const done = useMemo(
    () => prioritized.filter((i) => i.status === 'satisfied' || i.status === 'not_applicable'),
    [prioritized],
  );
  const worst = needsYou[0] ?? null;

  function jumpToWorst() {
    if (!worst) return;
    const el = document.querySelector(`[data-card-id="${worst.id}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  const cardHandlers = {
    onUpload: (item: ChecklistItemData) => setUploadItem(item),
    onLink: (item: ChecklistItemData) => setLinkItem(item),
    onView: (item: ChecklistItemData) => {
      if (item.documentId) {
        window.open(`/documents/${item.documentId}`, '_blank', 'noopener');
      }
    },
    onMarkApplicable: (item: ChecklistItemData) =>
      mutations.markApplicable.mutate({ itemId: item.id }),
    onMarkNA: (item: ChecklistItemData) =>
      mutations.markNotApplicable.mutate({ itemId: item.id }),
    onUnlink: (item: ChecklistItemData) =>
      mutations.unlinkDocument.mutate({ itemId: item.id }),
  };

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-md)] border border-status-danger-border bg-status-danger-bg px-4 py-3 text-sm text-status-danger"
      >
        We couldn&apos;t load compliance records. Please try again.
      </div>
    );
  }

  const breadcrumb = (
    <ol className="flex items-center gap-2 text-sm text-content-secondary">
      <li><Link href="/dashboard">Communities</Link></li>
      <li aria-hidden="true">/</li>
      <li aria-current="page" className="text-content">Compliance</li>
    </ol>
  );

  const actions = canWrite ? (
    <Button variant="secondary" onClick={() => router.push('/documents')}>
      Upload record
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={breadcrumb}
        title="Compliance"
        description="Records and statutory requirements"
        actions={actions}
      />

      {isLoading ? (
        <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center text-content-secondary">
          Loading&hellip;
        </div>
      ) : (
        <>
          <ComplianceStatusHero summary={summary} worstItem={worst} onJumpToWorst={jumpToWorst} />

          <section
            aria-label="Compliance metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <KpiCard
              label="Readiness"
              value={`${summary.readiness.percentage}%`}
              meta={`${summary.readiness.satisfied} of ${summary.readiness.applicableTotal} satisfied`}
            />
            <KpiCard
              label="Posting windows"
              value={summary.postingWindowsDueSoonCount}
              meta="Due inside 7 days"
            />
            <KpiCard
              label="Overdue"
              value={summary.overdueCount}
              meta="Past deadline"
              tone={summary.overdueCount > 0 ? 'alert' : 'default'}
            />
            <KpiCard
              label="Needs board action"
              value={summary.needsBoardActionCount}
              meta="Approvals and reviews pending"
            />
          </section>

          <ComplianceOnboarding
            items={items as ChecklistItemData[]}
            onUpload={(item) => setUploadItem(item as ChecklistItemData)}
          />

          <section aria-labelledby="needs-you-heading" className="flex flex-col gap-3">
            <h2 id="needs-you-heading" className="text-lg font-semibold">Needs you</h2>
            {needsYou.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-8 text-center">
                <p className="text-base font-semibold text-content">You&apos;re all caught up</p>
                <p className="mt-1 text-sm text-content-secondary">No records need attention right now.</p>
              </div>
            ) : (
              needsYou.map((item) => (
                <div key={item.id} data-card-id={item.id}>
                  <ComplianceRequirementCard
                    item={item}
                    communityId={communityId}
                    canWrite={canWrite}
                    role={role}
                    variant="needs-attention"
                    {...cardHandlers}
                  />
                </div>
              ))
            )}
          </section>

          {done.length > 0 && (
            <details className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-content-secondary">
                You&apos;re caught up on {done.length} {done.length === 1 ? 'record' : 'records'}
              </summary>
              <div className="flex flex-col gap-3 p-4 pt-0">
                {done.map((item) => (
                  <div key={item.id} data-card-id={item.id}>
                    <ComplianceRequirementCard
                      item={item}
                      communityId={communityId}
                      canWrite={canWrite}
                      role={role}
                      variant="done"
                      {...cardHandlers}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {uploadItem && (
            <UploadDocumentModal
              communityId={communityId}
              defaultTitle={uploadItem.title}
              categoryName={uploadItem.category}
              onUploaded={(documentId) => {
                mutations.linkDocument.mutate({ itemId: uploadItem.id, documentId });
                setUploadItem(null);
              }}
              onClose={() => setUploadItem(null)}
            />
          )}
          {linkItem && (
            <LinkDocumentModal
              communityId={communityId}
              onSelect={(documentId) => {
                mutations.linkDocument.mutate({ itemId: linkItem.id, documentId });
                setLinkItem(null);
              }}
              onClose={() => setLinkItem(null)}
            />
          )}

          <section id="compliance-activity-feed">
            <ComplianceActivityFeed communityId={communityId} />
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label, value, meta, tone = 'default',
}: { label: string; value: string | number; meta: string; tone?: 'default' | 'alert' }) {
  return (
    <article className="rounded-[var(--radius-md)] border border-edge-subtle bg-surface-card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{label}</div>
      <div
        className={`mt-2 flex items-center gap-2 text-3xl font-bold tabular-nums ${
          tone === 'alert' ? 'text-[var(--status-danger)]' : 'text-content'
        }`}
      >
        {tone === 'alert' && <AlertTriangle size={20} aria-hidden="true" />}
        {value}
      </div>
      <div className="mt-1 text-sm text-content-secondary">{meta}</div>
    </article>
  );
}

export default ComplianceCommandCenter;
```

- [ ] **Step 2: Type-check (expect test failures, not type errors, for now)**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: PASS. (The old test file still references the old behavior and will fail at runtime in Task 3, but it should still COMPILE since it only imports `ComplianceCommandCenter`. If tsc reports errors originating in the test file, leave them — Task 3 rewrites it. If tsc reports errors in the component file, fix them before proceeding.)

- [ ] **Step 3: Commit the component rewrite**

```bash
git add apps/web/src/components/compliance/compliance-command-center.tsx
git commit -m "feat(compliance): rewrite command center as guided hero + zones, drop toggle/queue/detail-panel"
```

---

## Task 3: Rewrite the command-center test

**Files:**
- Rewrite: `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx`

- [ ] **Step 1: Replace the entire test file**

Overwrite `apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ComplianceCommandCenter } from '../compliance-command-center';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

let mockChecklistReturn: { data: unknown[] | undefined; isLoading: boolean; error: Error | null } = {
  data: [],
  isLoading: false,
  error: null,
};

vi.mock('@/hooks/useComplianceChecklist', () => ({
  useComplianceChecklist: () => mockChecklistReturn,
  COMPLIANCE_QUERY_KEY: 'compliance-checklist',
}));

vi.mock('@/hooks/useComplianceMutations', () => ({
  useComplianceMutations: () => ({
    linkDocument: { mutate: vi.fn() },
    unlinkDocument: { mutate: vi.fn() },
    markNotApplicable: { mutate: vi.fn() },
    markApplicable: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/use-compliance-activity', () => ({
  useComplianceActivityFeed: () => ({
    data: { data: [], pagination: { nextCursor: null, hasMore: false }, users: {} },
    isLoading: false,
    error: null,
  }),
}));

const FIXTURE = [
  {
    id: 1, templateKey: '718_declaration', title: 'Declaration',
    description: null, category: 'governing_documents', status: 'satisfied',
    statuteReference: '§718.111', documentId: 99, documentPostedAt: '2026-05-01T00:00:00.000Z',
    deadline: null, rollingWindow: null, isApplicable: true,
  },
  {
    id: 2, templateKey: '718_insurance', title: 'Insurance',
    description: null, category: 'insurance', status: 'overdue',
    statuteReference: '§718.111', documentId: null, documentPostedAt: null,
    deadline: '2026-05-01T00:00:00.000Z', rollingWindow: null, isApplicable: true,
  },
];

function renderWithProviders(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockChecklistReturn = { data: structuredClone(FIXTURE), isLoading: false, error: null };
});

describe('ComplianceCommandCenter', () => {
  it('renders the page header with breadcrumb and title', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Breadcrumb')).toBeInTheDocument();
  });

  it('renders the risk-first hero with a danger verdict when overdue', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByText(/record is overdue|records are overdue/i)).toBeVisible();
    expect(screen.getByRole('progressbar', { name: /compliance readiness/i })).toBeInTheDocument();
  });

  it('renders the four metric labels', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getAllByText(/readiness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/posting windows/i)).toBeInTheDocument();
    expect(screen.getAllByText(/overdue/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/needs board action/i)).toBeInTheDocument();
  });

  it('puts the overdue item in the Needs-you zone and the satisfied item in the Done zone', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.getByRole('heading', { name: 'Needs you' })).toBeInTheDocument();
    expect(screen.getByText('Insurance')).toBeVisible();
    // Done zone is a collapsed <details> summary
    expect(screen.getByText(/caught up on 1 record/i)).toBeInTheDocument();
  });

  it('does NOT render a CAM/Board view toggle', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    expect(screen.queryByRole('button', { name: 'CAM view' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Board view' })).toBeNull();
  });

  it('navigates to /documents when Upload record is clicked (writable user)', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload record' }));
    expect(pushMock).toHaveBeenCalledWith('/documents');
  });

  it('hides the Upload record action for a read-only user', () => {
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="owner" canWrite={false} />);
    expect(screen.queryByRole('button', { name: 'Upload record' })).toBeNull();
  });

  it('shows a success hero and an all-caught-up empty state when nothing needs attention', () => {
    mockChecklistReturn = {
      data: [structuredClone(FIXTURE[0])], // only the satisfied item
      isLoading: false,
      error: null,
    };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByText(/fully compliant/i)).toBeVisible();
    expect(screen.getByText(/you're all caught up/i)).toBeVisible();
  });

  it('renders the loading indicator when data is loading', () => {
    mockChecklistReturn = { data: undefined, isLoading: true, error: null };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders the error alert when the checklist fails to load', () => {
    mockChecklistReturn = { data: undefined, isLoading: false, error: new Error('boom') };
    renderWithProviders(<ComplianceCommandCenter communityId={1} role="cam" canWrite={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't load compliance records. Please try again.");
  });
});
```

- [ ] **Step 2: Run the command-center test**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance/__tests__/compliance-command-center.test.tsx`
Expected: PASS (10 tests). If the "Insurance" card text is not found, confirm the card renders the title as plain text (it does — `<h3>{item.title}</h3>`). If "Loading…" assertion fails on the ellipsis character, note the component emits `&hellip;` which renders as `…` (U+2026) — the test string uses that same character.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/compliance/__tests__/compliance-command-center.test.tsx
git commit -m "test(compliance): rewrite command-center tests for guided hero + zones"
```

---

## Task 4: Delete the retired components and their tests

**Files:**
- Delete: `apps/web/src/components/compliance/compliance-queue.tsx`
- Delete: `apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx`
- Delete: `apps/web/src/components/compliance/compliance-detail-panel.tsx`
- Delete: `apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx`

- [ ] **Step 1: Confirm nothing else imports them**

Run: `grep -rn "compliance-queue\|compliance-detail-panel" apps/web/src --include=*.ts --include=*.tsx | grep -v "__tests__/compliance-queue.test\|__tests__/compliance-detail-panel.test\|/compliance-queue.tsx\|/compliance-detail-panel.tsx"`
Expected: NO output. (The only importer was `compliance-command-center.tsx`, which Task 2 already rewrote to not import them.) If any other importer appears, STOP and report — do not delete.

- [ ] **Step 2: Delete the four files**

Run:
```bash
git rm apps/web/src/components/compliance/compliance-queue.tsx \
  apps/web/src/components/compliance/__tests__/compliance-queue.test.tsx \
  apps/web/src/components/compliance/compliance-detail-panel.tsx \
  apps/web/src/components/compliance/__tests__/compliance-detail-panel.test.tsx
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: PASS. If a dangling import surfaces (e.g., a re-export of `FilterKey` from `compliance-queue`), find it and repoint it to `./compliance-pill-mapping` (the original source of `FilterKey`), then re-run.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(compliance): delete retired queue table and detail panel"
```

(`git rm` already staged the deletions; no `git add` needed. Do not stage anything else.)

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full compliance suite**

Run: `pnpm --filter @propertypro/web exec vitest run src/components/compliance`
Expected: PASS. Suites present now: `compliance-status-hero` (4), `compliance-requirement-card` (9), `compliance-command-center` (10), `compliance-item-actions` (3), `compliance-pill-mapping` (8), `compliance-activity-feed` (7). The `compliance-queue` and `compliance-detail-panel` suites are gone. No failures.

- [ ] **Step 2: Type-check the whole app**

Run: `pnpm --filter @propertypro/web exec tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Lint the changed/new files**

Run: `pnpm --filter @propertypro/web exec eslint src/components/compliance/compliance-status-hero.tsx src/components/compliance/compliance-command-center.tsx`
Expected: PASS. (If the workspace does not expose `eslint` via `exec`, run the repo's `pnpm lint` from the root instead and confirm it passes.)

- [ ] **Step 4: Manual preview verification (dev server already configured)**

The dev server config is in `.claude/launch.json`. Using the preview tooling: log in as `cam` via `/dev/agent-login?as=cam`, open `/communities/1/compliance`, and confirm at 1440 / 1024 / 375 widths:
1. No horizontal page overflow at any width.
2. The hero shows a risk verdict; the readiness meter renders.
3. "Needs you" cards render; clicking a card's "Show details" expands it in place with the action row reachable WITHOUT horizontal scrolling.
4. The "Done" disclosure expands to show satisfied records.
5. No CAM/Board toggle is present.
6. "Upload record" (as cam) navigates to /documents.

Report what you observe. If any check fails, capture which one and stop for guidance rather than guessing a fix.

No commit (verification only).

---

## Self-Review (completed by plan author)

**Spec coverage (Phase 2 portion):**
- Risk-first hero (spec §5.2): Task 1. ✓
- Compact metric strip with alert icon, no color-alone (spec §5.3, F-13): Task 2 `KpiCard`. ✓
- "Needs you" + "Done" zones with the Phase 1 card (spec §5.4–5.5): Task 2. ✓
- Remove CAM/Board toggle + localStorage (spec §3, F-15): Task 2 (state deleted) + Task 3 (toggle/persistence tests removed). ✓
- Retire table + detail panel (spec §6): Task 4. ✓
- Repurpose "Upload record" → /documents; gate/omit "Export readiness PDF" (spec §5.1, F-03): Task 2 (Upload navigates; Export omitted). ✓
- Card action wiring incl. unlink + markNA (spec §7): Task 2 `cardHandlers`. ✓
- jump-to-worst via `data-card-id` scroll (spec §5.2): Task 2 `jumpToWorst`. ✓

**Deferred to Phase 3 (intentionally NOT here):** loading skeletons (Task 2 keeps the simple "Loading…" text), activity-feed `text-sm` fix, error `AlertBanner` (Task 2 keeps the existing inline error block, now with `role="alert"`), modal width. These are Phase 3 scope.

**Placeholder scan:** None. Every code/test step shows complete content.

**Type consistency:** `ComplianceSummary` shape matches `compliance-calculator.ts`. `useComplianceMutations` mock includes all four real mutations (`linkDocument, unlinkDocument, markNotApplicable, markApplicable`). Card props match Phase 1's exported interface exactly, including `onMarkNA`/`onUnlink`. `useRouter` mocked from `next/navigation`. Breadcrumb `<ol>` carries no aria-label (PageHeader supplies the labelled nav) — matches the retained `getByLabelText('Breadcrumb')` assertion.

**Known risk:** Task 2's rewrite makes the OLD command-center test fail until Task 3 replaces it. The plan sequences component rewrite (Task 2) → test rewrite (Task 3) and only runs the full suite in Task 5, so the intermediate red state is expected and contained.
