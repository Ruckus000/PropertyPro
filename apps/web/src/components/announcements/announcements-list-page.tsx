/**
 * Announcements list on the page kit. A server component: it owns the
 * PageLayout and the header, and takes the records as `children` so the route
 * can stream them in under a header that has already painted.
 *
 * The staff view carries the header actions ("New announcement" for a writer,
 * "Show deleted" for an admin) and the generated access sentence. The resident
 * view has neither, and no panel.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

type Props = (
  | {
      view: 'staff';
      /** The viewer can post: the header offers "New announcement". */
      canWrite: boolean;
      /** Admins only: the link that turns the deleted rows on or off. */
      deletedToggle?: { showing: boolean; href: string };
      about?: AccessSentence;
    }
  | { view: 'resident' }
) & {
  communityId: number;
  /** The records: `AnnouncementList`, usually inside a Suspense boundary. */
  children: ReactNode;
};

/** `/announcements` with the community and whichever of `q` / `includeDeleted` apply. */
export function announcementsListHref(
  communityId: number,
  state: { query?: string; includeDeleted?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.includeDeleted) params.set('includeDeleted', 'true');
  params.set('communityId', String(communityId));
  return `/announcements?${params.toString()}`;
}

export function AnnouncementsListPage(props: Props) {
  const { communityId, children } = props;
  const staff = props.view === 'staff' ? props : null;

  const actions =
    staff && (staff.canWrite || staff.deletedToggle) ? (
      <>
        {staff.deletedToggle ? (
          <Button asChild variant="outline">
            <Link href={staff.deletedToggle.href}>
              {staff.deletedToggle.showing ? 'Hide deleted' : 'Show deleted'}
            </Link>
          </Button>
        ) : null}
        {staff.canWrite ? (
          <Button asChild>
            <Link href={`/announcements/new?communityId=${communityId}`}>New announcement</Link>
          </Button>
        ) : null}
      </>
    ) : undefined;

  return (
    <PageLayout
      template="list"
      records="rows"
      header={
        <PageHeader
          title="Announcements"
          icon={<Megaphone />}
          description="News, notices and reminders posted for this community."
          actions={actions}
        />
      }
      panel={staff ? { template: 'list', about: staff.about } : undefined}
    >
      {children}
    </PageLayout>
  );
}
