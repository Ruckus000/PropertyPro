/**
 * New and Edit announcement on the page kit. The header has Cancel only: the
 * composer keeps the one filled button (Publish / Save), and Delete lives on
 * the announcement's own page. Without `announcement` this is the New page.
 */
import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section } from '@propertypro/ui/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { AnnouncementAuthoringForm } from './announcement-authoring-form';

type Props = ComponentProps<typeof AnnouncementAuthoringForm>;

export function AnnouncementFormPage({ communityId, communityType, announcement }: Props) {
  const cancelHref = announcement
    ? `/announcements/${announcement.id}?communityId=${communityId}`
    : `/announcements?communityId=${communityId}`;

  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title={announcement ? 'Edit Announcement' : 'New Announcement'}
          icon={<Megaphone />}
          description={
            announcement
              ? 'Change the wording, the audience, the pin or the end date of this announcement.'
              : 'Write the announcement, choose who sees it, then publish.'
          }
          actions={
            <Button asChild variant="outline">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          }
        />
      }
    >
      {/* The width the composer had before the move. `overflow-visible`: the
          Section clips by default, and the editor's menus must not be cut off. */}
      <Section className="w-full max-w-4xl overflow-visible">
        <AnnouncementAuthoringForm
          communityId={communityId}
          communityType={communityType}
          announcement={announcement}
        />
      </Section>
    </PageLayout>
  );
}
