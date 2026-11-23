'use client';

/**
 * The Review tab of violations-page.tsx: its filter state, its list and its
 * side panel. One status-agnostic walk feeds the filter counts, the panel and
 * the list, so the three always agree; status filtering happens here.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ViolationSeverity } from '@propertypro/db';
import { RecordList } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionError,
  SectionFirstRun,
  SectionFooter,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import {
  PanelAttention,
  PanelGlance,
  PanelLinks,
  type AccessSentence,
} from '@propertypro/ui/components/shared/side-panel';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useViolationsReview } from '@/hooks/use-violations-review';
import { reviewFigures } from '@/lib/violations/violations-view';
import { SEVERITY_OPTIONS, VIOLATION_STATUS_LABELS } from '@/lib/violations/vocabulary';
import { TEXT_BUTTON_CLASS, ViolationRow } from './violations-page-rows';

const PAGE_SIZE = 20;

const FIELD_CLASS =
  'min-h-11 rounded-sm border border-edge-strong bg-surface-card px-3 py-1 text-sm text-content focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:min-h-0';

type StatusFilter = keyof typeof VIOLATION_STATUS_LABELS | 'all';

export function useReviewState(
  communityId: number,
  finesEnabled: boolean,
  initialUnitId: number | undefined,
  enabled: boolean,
  /** Called when the unit filter is cleared, so the page can drop `?unitId=` too. */
  onUnitCleared: () => void,
) {
  const [unitId, setUnitId] = useState<number | undefined>(initialUnitId);
  const [severity, setSeverity] = useState<ViolationSeverity | ''>('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [status, setStatusRaw] = useState<StatusFilter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);

  const query = useViolationsReview(
    communityId,
    {
      unitId,
      severity: severity || undefined,
      createdAfter: createdAfter || undefined,
      createdBefore: createdBefore || undefined,
    },
    enabled,
  );

  const rows = query.data;
  const figures = useMemo(() => (rows ? reviewFigures(rows, finesEnabled) : null), [rows, finesEnabled]);
  const matching = useMemo(
    () => (rows ? (status === 'all' ? rows : rows.filter((r) => r.status === status)) : []),
    [rows, status],
  );

  // Any filter change starts the list again at one page.
  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setShown(PAGE_SIZE);
    };
  }

  const serverFiltered =
    unitId !== undefined || severity !== '' || createdAfter !== '' || createdBefore !== '';

  return {
    query,
    figures,
    matching,
    shown,
    showMore: () => setShown((n) => n + PAGE_SIZE),
    status,
    setStatus: reset(setStatusRaw),
    unitId,
    unitLabel: rows?.find((r) => r.unitId === unitId)?.unitLabel,
    clearUnit: () => {
      setUnitId(undefined);
      setShown(PAGE_SIZE);
      onUnitCleared();
    },
    severity,
    setSeverity: reset(setSeverity),
    createdAfter,
    setCreatedAfter: reset(setCreatedAfter),
    createdBefore,
    setCreatedBefore: reset(setCreatedBefore),
    serverFiltered,
    clearAll: () => {
      setStatusRaw('all');
      setSeverity('');
      setCreatedAfter('');
      setCreatedBefore('');
      setUnitId(undefined);
      setShown(PAGE_SIZE);
      onUnitCleared();
    },
  };
}

export type ReviewState = ReturnType<typeof useReviewState>;

export function reviewPanel(
  review: ReviewState,
  communityId: number,
  hasArc: boolean,
  about: AccessSentence | undefined,
) {
  const f = review.figures;
  const reported = f?.waitingForNotice ?? 0;
  return {
    template: 'list' as const,
    glance: f ? (
      <PanelGlance
        figure={String(f.open)}
        unit="open cases"
        lines={[
          ['Waiting for a notice', String(f.waitingForNotice)],
          ['Hearings scheduled', String(f.hearings)],
        ]}
        source="violations.status"
      />
    ) : undefined,
    attention: f ? (
      reported > 0 ? (
        <PanelAttention
          lead="Waiting"
          title={`${reported} reported ${reported === 1 ? 'case has' : 'cases have'} no notice yet`}
          action={
            <button
              type="button"
              onClick={() => review.setStatus('reported')}
              className={`text-sm ${TEXT_BUTTON_CLASS}`}
            >
              Show reported cases
            </button>
          }
        />
      ) : (
        <PanelAttention none="Cases that need a notice will show here." />
      )
    ) : undefined,
    shortcuts: hasArc ? (
      <PanelLinks>
        <Link
          href={`/arc-requests?communityId=${communityId}`}
          className="inline-flex min-h-11 items-center text-content-link hover:underline md:min-h-0"
        >
          ARC requests
        </Link>
      </PanelLinks>
    ) : undefined,
    about,
  };
}

export function ReviewBody({ communityId, review }: { communityId: number; review: ReviewState }) {
  const { query, figures, matching, shown } = review;
  const loading = query.isLoading;
  const empty = !loading && !query.isError && figures?.counts.all === 0 && !review.serverFiltered;

  if (empty) {
    return (
      <Section>
        <SectionFirstRun
          headingLevel={2}
          title="No violation cases yet"
          description="When community members report violations, they will appear here."
        />
      </Section>
    );
  }

  const filterTabs = [
    { label: 'All', value: 'all', count: figures?.counts.all },
    ...(figures?.filters ?? []).map((s) => ({
      label: VIOLATION_STATUS_LABELS[s],
      value: s,
      count: figures?.counts[s],
    })),
  ];

  return (
    <Section aria-busy={loading}>
      {query.isError ? null : (
        <SectionToolbar
          filters={
            <div className="flex flex-wrap items-center justify-between gap-3 py-2">
              <QuickFilterTabs
                tabs={filterTabs}
                active={review.status}
                onChange={(v) => review.setStatus(v as StatusFilter)}
                tone="ink"
              />
              <div className="flex flex-wrap items-center gap-2">
                {review.unitId !== undefined ? (
                  <span className="inline-flex items-center gap-2 rounded-md border border-edge bg-surface-subtle px-3 py-1 text-sm text-content">
                    {review.unitLabel ?? 'One unit'} only
                    <button type="button" onClick={review.clearUnit} className={TEXT_BUTTON_CLASS}>
                      Show all units
                    </button>
                  </span>
                ) : null}
                <select
                  aria-label="Filter by severity"
                  value={review.severity}
                  onChange={(e) => review.setSeverity(e.target.value as ViolationSeverity | '')}
                  className={FIELD_CLASS}
                >
                  <option value="">All severities</option>
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={review.createdAfter}
                  onChange={(e) => review.setCreatedAfter(e.target.value)}
                  aria-label="Filter violations from date"
                  className={FIELD_CLASS}
                />
                <span className="text-sm text-content-secondary">to</span>
                <input
                  type="date"
                  value={review.createdBefore}
                  onChange={(e) => review.setCreatedBefore(e.target.value)}
                  aria-label="Filter violations until date"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          }
        />
      )}
      {query.isError ? (
        <SectionError
          message="We couldn't load violations. Please try again."
          onRetry={() => void query.refetch()}
        />
      ) : loading ? (
        <ul aria-label="Loading cases" className="divide-y divide-edge">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <Skeleton className="size-4 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : matching.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 py-6">
          <p className="text-sm text-content">Nothing matches these filters</p>
          <Button variant="outline" size="sm" onClick={review.clearAll}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          <RecordList>
            {matching.slice(0, shown).map((v) => (
              <ViolationRow key={v.id} v={v} communityId={communityId} linkable />
            ))}
          </RecordList>
          <SectionFooter note={`Showing ${Math.min(shown, matching.length)} of ${matching.length}`}>
            {shown < matching.length ? (
              <Button variant="outline" size="sm" onClick={review.showMore}>
                Load more
              </Button>
            ) : null}
          </SectionFooter>
        </>
      )}
    </Section>
  );
}
