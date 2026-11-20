/**
 * Announcements before the first post (spec docs/design-system/patterns/
 * empty-states.md §4.1 "Announcements", §4.4; plan P6).
 *
 * A single action, so no step row. Managers see what a post is made of (the
 * composer's real fields), three ideas for a first post (copy only: nothing is
 * prefilled, nothing is sent), and where urgent news goes instead. Residents
 * see a calm waiting state.
 *
 * The page header keeps its "New announcement" as the one filled primary (the
 * list streams in under the header, which cannot know the list is empty), so
 * the hero's own link is outline.
 */

import * as React from 'react';
import Link from 'next/link';
import { DocumentsScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextRows, ContextSection } from '@/components/shared/setup-guide';

/** The composer's fields, in its order (announcement-composer.tsx). */
const COMPOSER_FIELDS = [
  { label: 'Title', detail: 'What people see in the list and the email subject' },
  { label: 'Message', detail: 'Formatted text, links and lists' },
  { label: 'Audience', detail: 'Everyone, or one group of residents' },
  { label: 'Pin announcement', detail: 'Keep it at the top of the list' },
  { label: 'Stop showing on', detail: 'Optional date it leaves the list' },
];

const FIRST_POST_IDEAS = [
  { label: 'Welcome to the resident portal', detail: 'What residents can find here and how to sign in' },
  { label: 'How to reach management', detail: 'Office hours, the best way to ask for help' },
  { label: 'What to expect this season', detail: 'Upcoming work, meetings or changes residents should know about' },
];

export function AnnouncementsFirstPost({ communityId }: { communityId: number }) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Announcements"
      title="Keep everyone in the loop"
      description="Post news once and it reaches the people you choose: on this page and by email, right away or in their digest."
      illustration={<DocumentsScene size="hero" />}
      action={
        <Button asChild variant="outline">
          <Link href={`/announcements/new?communityId=${communityId}`}>Write the first announcement</Link>
        </Button>
      }
      aside={
        <>
          <ContextSection title="What a post has">
            <ContextRows rows={COMPOSER_FIELDS} />
          </ContextSection>
          <ContextSection title="Ideas for a first post">
            <ContextRows rows={FIRST_POST_IDEAS} />
          </ContextSection>
          <ContextSection title="Urgent news?">
            <p className="text-sm text-content-secondary">
              For something that can&apos;t wait, like a water shut-off, send an emergency alert instead.
            </p>
            <ContextLinks links={[{ href: `/emergency?communityId=${communityId}`, label: 'Emergency alerts' }]} />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/announcements/post-announcement', label: 'Publish an announcement' }]} />
          </ContextSection>
        </>
      }
    />
  );
}

export function AnnouncementsWaiting({ communityId }: { communityId: number }) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Announcements"
      title="News from your community appears here"
      description="Updates, notices and reminders show up on this page as they're posted."
      illustration={<DocumentsScene size="hero" next={false} />}
      aside={
        <>
          <ContextSection title="How you'll hear">
            <p className="text-sm text-content-secondary">
              An email when something is posted for you, right away or in your digest, as your notification settings say.
            </p>
            <ContextLinks
              links={[{ href: `/settings?tab=notifications&communityId=${communityId}`, label: 'Notification settings' }]}
            />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/announcements/read-announcements', label: 'Read announcements' }]} />
          </ContextSection>
        </>
      }
    />
  );
}
