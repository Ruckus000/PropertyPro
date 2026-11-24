/**
 * One announcement on the page kit. A server component, so the sanitiser
 * (`isomorphic-dompurify`) never reaches the browser bundle.
 *
 * Edit, Delete and Restore sit in the header for a viewer who can manage the
 * post (`canManage`: its author, or an admin who can write). The staff view
 * adds the Details panel and the generated access sentence; the resident view
 * has no panel and reads the date (and a board-only mark) above the message.
 */
import DOMPurify from 'isomorphic-dompurify';
import { Megaphone } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { PageHeader } from '@/components/shared/page-header';
import { AnnouncementDetailActions } from './announcement-detail-actions';

type Props = ({ view: 'staff'; about?: AccessSentence } | { view: 'resident' }) & {
  communityId: number;
  announcement: {
    id: number;
    title: string;
    /** Stored HTML; sanitised here before it is rendered. */
    body: string;
    isPinned: boolean;
    publishedAt: Date;
    deletedAt: Date | null;
  };
  /**
   * Who the post is for, when this viewer is told: managers always, anyone
   * else only on a board-only post. The route decides; this only prints it.
   */
  audienceLabel?: string;
  /** Header shows Edit and Delete, or Restore on a deleted post. */
  canManage: boolean;
};

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AnnouncementDetailPage(props: Props) {
  const { communityId, announcement, audienceLabel, canManage } = props;
  const isDeleted = announcement.deletedAt != null;
  const statusWord = isDeleted ? 'Deleted' : 'Published';
  const published = formatDate(announcement.publishedAt);

  return (
    <PageLayout
      template="detail"
      header={
        <PageHeader
          title={announcement.title}
          icon={<Megaphone />}
          description="A notice posted on the community announcements page."
          status={<StatusGlyph kind={isDeleted ? 'not-started' : 'done'} label={statusWord} />}
          actions={
            canManage ? (
              <AnnouncementDetailActions
                communityId={communityId}
                announcementId={announcement.id}
                isDeleted={isDeleted}
              />
            ) : undefined
          }
        />
      }
      panel={
        props.view === 'staff'
          ? {
              template: 'detail',
              details: (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                  <dt className="text-content-secondary">Published</dt>
                  <dd className="text-content">{published}</dd>
                  {audienceLabel ? (
                    <>
                      <dt className="text-content-secondary">Audience</dt>
                      <dd className="text-content">{audienceLabel}</dd>
                    </>
                  ) : null}
                  {announcement.isPinned ? (
                    <>
                      <dt className="text-content-secondary">Pinned</dt>
                      <dd className="text-content">Yes</dd>
                    </>
                  ) : null}
                </dl>
              ),
              about: props.about,
            }
          : undefined
      }
    >
      <Section>
        <SectionHeader title="Message" />
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-xs text-content-secondary">
            {[announcement.isPinned ? 'Pinned' : null, `Published ${published}`, audienceLabel]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div
            // A reading measure: the section spans the column, the text does not.
            className="prose prose-neutral max-w-3xl text-content-secondary"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(announcement.body) }}
          />
        </div>
      </Section>
    </PageLayout>
  );
}
