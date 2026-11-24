'use client';

/**
 * Move In/Out on the page kit: a list of checklist cards with type filters,
 * and the open checklist (`ChecklistDetailView`) at `?checklist=<id>`.
 *
 * The list is read once, unfiltered, and narrowed here, so every filter's
 * count is of the whole set whichever filter is on.
 */
import { useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { PanelGlance } from '@propertypro/ui/components/shared/side-panel';
import { Section, SectionError, SectionFirstRun } from '@propertypro/ui/components/shared/section';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { useMoveChecklists, type MoveChecklistRow } from '@/hooks/use-move-checklists';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChecklistDetailView } from './ChecklistDetailView';
import { checklistProgress, ProgressBar, progressText } from './checklist-progress';

interface Props {
  communityId: number;
}

type Filter = 'all' | 'move_in' | 'move_out';

const CHECKLIST_PARAM = 'checklist';

function parseChecklistId(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function ChecklistCard({
  checklist,
  href,
  onOpen,
}: {
  checklist: MoveChecklistRow;
  href: string;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { completed, total, kind, word } = checklistProgress(checklist);

  return (
    <li className="relative flex min-w-0 flex-col gap-3 rounded-md border border-edge bg-surface-card p-4 transition-colors duration-quick focus-within:border-edge-strong hover:border-edge-strong">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline">{checklist.type === 'move_in' ? 'Move In' : 'Move Out'}</Badge>
        <StatusGlyph kind={kind} label={word} />
      </div>
      {/* The link's ::after covers the card, so the whole card opens the checklist. */}
      <a
        href={href}
        onClick={onOpen}
        className="truncate rounded-xs text-base font-medium text-content after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus"
      >
        {checklist.unitLabel ?? `Unit #${checklist.unitId}`} — Lease #{checklist.leaseId}
      </a>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-content-secondary">{progressText(completed, total)}</p>
        <ProgressBar completed={completed} total={total} />
      </div>
      <p className="text-xs text-content-secondary">
        Created {new Date(checklist.createdAt).toLocaleDateString()}
      </p>
    </li>
  );
}

const GRID = 'grid gap-4 cq-sm:grid-cols-2 cq-lg:grid-cols-3';

export function ChecklistListPage({ communityId }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  // True only while a checklist this page opened (pushState) is showing.
  const openedHereRef = useRef(false);

  const { data: checklists, isLoading, isError, refetch } = useMoveChecklists(communityId);

  const loaded = checklists !== undefined && !isError;
  const rawRequested = searchParams.get(CHECKLIST_PARAM);
  const requestedId = parseChecklistId(rawRequested);
  // The list is the whole set, so once it has loaded it settles whether the id
  // exists. Until then (or if the list failed) the checklist is asked for directly.
  const showDetail =
    requestedId !== null && (!loaded || checklists.some((c) => c.id === requestedId));
  const notFound = rawRequested !== null && !showDetail;

  function hrefFor(checklistId: number | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (checklistId === null) params.delete(CHECKLIST_PARAM);
    else params.set(CHECKLIST_PARAM, String(checklistId));
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  /*
   * history.pushState, not router.push: the server page never reads
   * `checklist`, and Next syncs the new address into useSearchParams. The push
   * is what makes the browser's Back return to the list.
   */
  function openChecklist(event: MouseEvent<HTMLAnchorElement>, checklistId: number) {
    // Leave new-tab and new-window clicks to the browser: the href is real.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    openedHereRef.current = true;
    window.history.pushState(null, '', hrefFor(checklistId));
  }

  /*
   * Pop the entry this page pushed. A visitor who ARRIVED on `?checklist=`
   * (a refresh, a shared link) has no such entry; Back would leave the page,
   * so the id is stripped in place instead.
   */
  function closeChecklist() {
    if (openedHereRef.current) {
      openedHereRef.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, '', hrefFor(null));
  }

  if (showDetail && requestedId !== null) {
    return (
      <ChecklistDetailView
        communityId={communityId}
        checklistId={requestedId}
        onBack={closeChecklist}
      />
    );
  }

  const moveIn = checklists?.filter((c) => c.type === 'move_in').length ?? 0;
  const moveOut = (checklists?.length ?? 0) - moveIn;
  const complete = checklists?.filter((c) => c.completedAt).length ?? 0;
  const open = (checklists?.length ?? 0) - complete;
  const visible = (checklists ?? []).filter((c) => filter === 'all' || c.type === filter);
  const isEmpty = loaded && checklists.length === 0;

  const tabs = [
    { label: 'All', value: 'all', count: loaded ? checklists.length : undefined },
    { label: 'Move In', value: 'move_in', count: loaded ? moveIn : undefined },
    { label: 'Move Out', value: 'move_out', count: loaded ? moveOut : undefined },
  ];

  let body: React.ReactNode;
  if (isError) {
    body = (
      <Section>
        <SectionError
          message="We couldn't load the checklists. Please try again."
          onRetry={() => void refetch()}
        />
      </Section>
    );
  } else if (isEmpty) {
    body = (
      <Section>
        <SectionFirstRun
          title="No checklists yet"
          headingLevel={2}
          description="A checklist is created automatically when a lease is created or terminated."
          action={
            <Button asChild variant="outline">
              <Link href={`/dashboard/leases?communityId=${communityId}`}>Go to Leases</Link>
            </Button>
          }
        />
      </Section>
    );
  } else if (!loaded || isLoading) {
    body = (
      <div className={GRID}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-md" />
        ))}
      </div>
    );
  } else if (visible.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-sm text-content">Nothing matches this filter</p>
        <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
          Show all
        </Button>
      </div>
    );
  } else {
    body = (
      <ul data-testid="checklist-cards" className={GRID}>
        {visible.map((checklist) => (
          <ChecklistCard
            key={checklist.id}
            checklist={checklist}
            href={hrefFor(checklist.id)}
            onOpen={(event) => openChecklist(event, checklist.id)}
          />
        ))}
      </ul>
    );
  }

  return (
    <PageLayout
      template="list"
      records="cards"
      banner={
        notFound ? (
          <p
            role="status"
            className="rounded-md border border-edge bg-surface-hover p-3 text-sm text-content"
          >
            We couldn&apos;t find that checklist. It may have been removed.
          </p>
        ) : undefined
      }
      header={
        <PageHeader
          title="Move In/Out"
          icon={<ClipboardCheck />}
          description="Follow each move-in and move-out step by step, one checklist per lease."
        />
      }
      panel={{
        template: 'list',
        glance:
          loaded && !isEmpty ? (
            <PanelGlance
              figure={String(open)}
              unit={open === 1 ? 'open checklist' : 'open checklists'}
              lines={[
                ['Move in', String(moveIn)],
                ['Move out', String(moveOut)],
                ['Complete', String(complete)],
              ]}
              source="useMoveChecklists"
            />
          ) : undefined,
      }}
    >
      {/* Cards: the section has no border or background of its own (spec 5.5).
          `cq`: the card grid follows this column's width, not the page's. */}
      <Section bare aria-busy={isLoading} className="cq flex flex-col gap-4">
        {isError || isEmpty ? null : (
          <QuickFilterTabs
            tabs={tabs}
            active={filter}
            onChange={(value) => setFilter(value as Filter)}
            tone="ink"
          />
        )}
        {body}
      </Section>
    </PageLayout>
  );
}
