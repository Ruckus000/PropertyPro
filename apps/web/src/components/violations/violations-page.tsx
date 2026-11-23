'use client';

/**
 * Violations on the page kit (preview only): a Review tab for whoever passes
 * the board rule and a Mine tab for residents. The server decides `tabs`;
 * this component never widens them, and loads Review data only when Review is
 * one of them. Mine rows arrive already projected by `toCardFields`.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ViolationsTab } from '@/lib/violations/violations-view';
import { MineBody, type ViolationsMine } from './violations-page-mine';
import { ReviewBody, reviewPanel, useReviewState } from './violations-page-review';
import { TEXT_BUTTON_CLASS } from './violations-page-rows';

// Ink, not coral: Visitors' plain row of text tabs with an ink underline.
const LIST_CLASS =
  'flex w-full justify-start gap-1 rounded-none border-b border-edge-strong bg-transparent p-0';
const TRIGGER_CLASS =
  'rounded-none border-b-2 border-transparent py-2 data-[state=active]:border-content data-[state=active]:bg-transparent data-[state=active]:shadow-none';

const DESCRIPTIONS: Record<ViolationsTab, string> = {
  review: 'Review, track and close out violation cases.',
  mine: "Cases on your home and the reports you've filed.",
};

export interface ViolationsPageProps {
  communityId: number;
  tabs: ViolationsTab[];
  initialTab: ViolationsTab;
  canCreate: boolean;
  finesEnabled: boolean;
  hasArc: boolean;
  about?: AccessSentence;
  initialUnitId?: number;
  mine: ViolationsMine | null;
}

export function ViolationsPage({
  communityId,
  tabs,
  initialTab,
  canCreate,
  finesEnabled,
  hasArc,
  about,
  initialUnitId,
  mine,
}: ViolationsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ViolationsTab>(initialTab);

  const [reportedId, setReportedId] = useState<string | null>(() => {
    const raw = searchParams.get('reported');
    return raw && /^\d+$/.test(raw) ? raw : null;
  });

  // Drop ?reported= once read, so a reload does not repeat the line.
  useEffect(() => {
    if (!searchParams.has('reported')) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete('reported');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(next: string) {
    const value = tabs.find((t) => t === next);
    if (!value) return;
    setTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('reported');
    params.set('tab', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Review data is fetched only for a viewer the server gave the Review tab.
  const review = useReviewState(
    communityId,
    finesEnabled,
    initialUnitId,
    tabs.includes('review') && tab === 'review',
  );

  const reportHref = `/violations/report?communityId=${communityId}`;
  const actions =
    tab === 'review' ? (
      canCreate ? (
        <Button asChild>
          <Link href={reportHref}>New violation</Link>
        </Button>
      ) : undefined
    ) : (
      <Button asChild>
        <Link href={reportHref}>Report a violation</Link>
      </Button>
    );

  const confirmation = reportedId ? (
    <div
      role="status"
      className="mb-4 flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm text-content"
    >
      <p className="flex items-center gap-2">
        <CircleCheck className="size-4 shrink-0 text-status-success" aria-hidden="true" />
        Report #{reportedId} sent to the board.
      </p>
      <button type="button" onClick={() => setReportedId(null)} className={TEXT_BUTTON_CLASS}>
        Dismiss
      </button>
    </div>
  ) : null;

  const reviewBody = <ReviewBody communityId={communityId} review={review} />;
  const mineBody = mine ? (
    <MineBody communityId={communityId} mine={mine} reportHref={reportHref} />
  ) : null;

  const layout = (
    <PageLayout
      template="list"
      records="rows"
      header={
        <PageHeader
          title="Violations"
          icon={<TriangleAlert />}
          description={DESCRIPTIONS[tab]}
          actions={actions}
        />
      }
      tabs={
        tabs.length > 1 ? (
          <TabsList className={LIST_CLASS}>
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t} className={TRIGGER_CLASS}>
                {t === 'review' ? 'Review' : 'Mine'}
              </TabsTrigger>
            ))}
          </TabsList>
        ) : undefined
      }
      panel={tab === 'review' ? reviewPanel(review, communityId, hasArc, about) : undefined}
    >
      {confirmation}
      {tabs.length > 1 ? (
        <>
          <TabsContent value="review" className="mt-0">
            {reviewBody}
          </TabsContent>
          <TabsContent value="mine" className="mt-0">
            {mineBody}
          </TabsContent>
        </>
      ) : tab === 'review' ? (
        reviewBody
      ) : (
        mineBody
      )}
    </PageLayout>
  );

  return tabs.length > 1 ? (
    <Tabs value={tab} onValueChange={handleTabChange}>
      {layout}
    </Tabs>
  ) : (
    layout
  );
}
