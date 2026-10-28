/**
 * QuickLinksBlock — shortcuts to the other sections on the same page (D16).
 *
 * Async server component: validates, works out which links have somewhere to
 * land, and hands the result to the pure view. Markup lives in
 * QuickLinksBlockView so the editor canvas renders the same thing; see
 * BlockViewProps in ./types.
 *
 * A link shows only when its section is on this page AND that section would
 * render something, read with that section's own settings, so no link lands on
 * nothing:
 *   - Meetings, when the page's Meetings section has an upcoming meeting in its
 *     own window. Its first meeting is the "Next:" date.
 *   - News, when the page's Announcements section has an announcement in its own
 *     window.
 *   - Contact, when the page's Contact section has something to show for its own
 *     board and management switches (`contactHasContent`, the rule that section
 *     itself renders by).
 * "The page's section" is the first of its type: the one carrying the
 * `#meetings` / `#announcements` / `#contact` anchor (./page-sections). Content
 * that fails its schema renders nothing, so such a section counts as absent.
 * Owner documents always shows, and the section renders even when it is the only
 * link: the sign-in to the owners' records is always worth one.
 *
 * The page's sections arrive as `pageSections` from the layout, so this asks the
 * database only about sections that are on the page.
 */
import type { z } from 'zod';
import {
  announcementsBlockSchema,
  contactBlockSchema,
  meetingsBlockSchema,
  quicklinksBlockSchema,
  type QuicklinksBlockContent,
} from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { contactHasContent } from './ContactBlockView';
import { firstSectionOfType } from './page-sections';
import { QuickLinksBlockView, type QuickLinksData } from './QuickLinksBlockView';
import type { BlockRendererProps, PageSection } from './types';

/** The first section of `blockType` on the page, parsed by its schema; null when absent or unreadable. */
function sectionSettings<TSchema extends z.ZodType>(
  sections: readonly PageSection[],
  blockType: string,
  schema: TSchema,
): z.output<TSchema> | null {
  const section = firstSectionOfType(sections, blockType);
  if (section === undefined) return null;
  const parsed = schema.safeParse(section.content);
  return parsed.success ? parsed.data : null;
}

export async function QuickLinksBlock(props: BlockRendererProps) {
  const parsed = quicklinksBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'quicklinks block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: QuicklinksBlockContent = parsed.data;

  const sections = props.pageSections ?? [];
  const meetings = sectionSettings(sections, 'meetings', meetingsBlockSchema);
  const announcements = sectionSettings(sections, 'announcements', announcementsBlockSchema);
  const contact = sectionSettings(sections, 'contact', contactBlockSchema);

  const reader = getPublicCommunityScopedReader(props.community.id);
  const [upcoming, news, contactInfo] = await Promise.all([
    meetings
      ? reader.listMeetings({ limit: 1, timeWindowDays: meetings.timeWindowDays })
      : Promise.resolve([]),
    announcements
      ? reader.listAnnouncements({ limit: 1, timeWindowDays: announcements.timeWindowDays })
      : Promise.resolve([]),
    contact
      ? reader.getContactInfo({
        showBoard: contact.showBoard,
        showManagement: contact.showManagement,
      })
      : Promise.resolve(null),
  ]);

  const nextMeeting = upcoming[0];
  const data: QuickLinksData = {
    nextMeeting: nextMeeting ? { startsAt: nextMeeting.startsAt.toISOString() } : null,
    showMeetings: nextMeeting !== undefined,
    showNews: news.length > 0,
    showContact: contactInfo !== null && contactHasContent(contactInfo),
  };

  return (
    <QuickLinksBlockView
      blockId={props.block.id}
      content={config}
      data={data}
      community={props.community}
      anchorId={props.anchorId}
    />
  );
}
