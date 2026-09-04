'use client';

/**
 * Three readings of one set, one at a time.
 *
 * The old screen was a tab strip holding ONE real tab plus a `<Link>` styled to
 * look like a second, above a four-column table with no signer information and
 * no actions at all — every verb (who is holding this up, copy a link, send a
 * reminder, download the signed PDF) lived a navigation away on the detail
 * page. Per the design prototype (`pp-esign.js`), what upstream splits over six
 * routes is one question asked from three ends:
 *
 *   Requests    — what did we send, and where has it got to
 *   Waiting on  — who is holding something up, and what can I do about it now
 *   Templates   — what can we send again
 *
 * Rewritten in place rather than renamed: this path is listed in
 * `scripts/verify-page-header-usage.ts`, whose guard exits 2 — "could not
 * check" — when a listed file goes missing, which reads as broken tooling
 * rather than a failed check.
 */

import { useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { useEsignSubmissions } from '@/hooks/use-esign-submissions';
import { useUrlView } from '@/hooks/use-url-view';
import { mostUrgentRequest, outstandingSigners } from '@/lib/esign/submission-status';
import { AwaitingYouPanel, awaitingViewer } from './awaiting-you-panel';
import { RequestsView } from './requests-view';
import { TemplatesView } from './templates-view';
import { UrgentRequestStrip } from './urgent-request-strip';
import { WaitingView } from './waiting-view';

type EsignView = 'requests' | 'waiting' | 'templates';

const VIEWS: ReadonlyArray<{ value: EsignView; label: string }> = [
  { value: 'requests', label: 'Requests' },
  { value: 'waiting', label: 'Waiting on' },
  { value: 'templates', label: 'Templates' },
];

/**
 * Anything unknown is Requests — including `documents`, which is what the old
 * single tab was called, so an old link lands somewhere sensible.
 */
function coerceEsignView(value: string | null): EsignView {
  switch (value) {
    case 'waiting':
    case 'templates':
      return value;
    default:
      return 'requests';
  }
}

export interface EsignPageShellProps {
  communityId: number;
  viewerUserId: string;
  viewerEmail: string | null;
}

export function EsignPageShell({
  communityId,
  viewerUserId,
  viewerEmail,
}: EsignPageShellProps) {
  const { view, setView } = useUrlView<EsignView>('view', coerceEsignView);

  // One query for both Requests and Waiting on — the same key, so React Query
  // serves them from one cache entry and a reminder invalidates both at once.
  const submissionsQuery = useEsignSubmissions(communityId);
  const requests = useMemo(() => submissionsQuery.data ?? [], [submissionsQuery.data]);
  const now = new Date();

  const owed = outstandingSigners(requests, now).length;
  const urgent = mostUrgentRequest(requests, now);
  const awaitingYou = awaitingViewer(requests, viewerUserId, viewerEmail);

  // Suppress the urgent strip when the panel above already names that request.
  // For a manager chasing their own signature — the likeliest case — the two
  // would otherwise print the same title twice, one directly above the other.
  const urgentIsAlreadyShown =
    urgent !== null && awaitingYou.some(({ request }) => request.id === urgent.id);

  const onRetry = useCallback(() => {
    void submissionsQuery.refetch();
  }, [submissionsQuery]);

  const primaryAction =
    view === 'templates' ? (
      <Button asChild>
        <Link href={`/esign/templates/new?communityId=${communityId}`}>
          <Plus aria-hidden="true" className="size-4" />
          New Template
        </Link>
      </Button>
    ) : (
      <Button asChild>
        <Link href={`/esign/submissions/new?communityId=${communityId}`}>
          <Plus aria-hidden="true" className="size-4" />
          Send Document
        </Link>
      </Button>
    );

  return (
    <div className="space-y-6">
      <PageHeader title="E-Sign" actions={primaryAction}>
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label="View">
            {VIEWS.map((option) => (
              <TabsTrigger key={option.value} value={option.value}>
                {option.label}
                {option.value === 'waiting' && owed > 0 ? (
                  <>
                    {' '}
                    <span className="rounded-full bg-status-warning-subtle px-1.5 text-xs font-semibold text-status-warning">
                      {owed}
                    </span>
                    <span className="sr-only"> outstanding</span>
                  </>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      {view === 'requests' ? (
        <>
          <AwaitingYouPanel
            communityId={communityId}
            requests={requests}
            now={now}
            viewerUserId={viewerUserId}
            viewerEmail={viewerEmail}
          />

          {urgent && !urgentIsAlreadyShown ? (
            <UrgentRequestStrip communityId={communityId} request={urgent} now={now} />
          ) : null}

          <RequestsView
            communityId={communityId}
            requests={requests}
            now={now}
            isLoading={submissionsQuery.isLoading}
            isError={submissionsQuery.isError}
            onRetry={onRetry}
          />
        </>
      ) : null}

      {view === 'waiting' ? (
        <WaitingView
          communityId={communityId}
          requests={requests}
          now={now}
          isLoading={submissionsQuery.isLoading}
          isError={submissionsQuery.isError}
          onRetry={onRetry}
        />
      ) : null}

      {view === 'templates' ? <TemplatesView communityId={communityId} /> : null}
    </div>
  );
}
