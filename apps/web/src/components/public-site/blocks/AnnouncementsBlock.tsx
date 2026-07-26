/**
 * AnnouncementsBlock — SoR block that reads published community announcements.
 *
 * Async server component: validates block.content via announcementsBlockSchema
 * (defense-in-depth), fetches via getPublicCommunityScopedReader, and hands the
 * result to the pure view. The markup lives in AnnouncementsBlockView so the
 * editor canvas can render exactly what the public site renders — see
 * BlockViewProps in ./types.
 */
import { announcementsBlockSchema, type AnnouncementsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { sanitizeHtml } from '@/lib/utils/html-sanitizer';
import { AnnouncementsBlockView } from './AnnouncementsBlockView';
import type { BlockRendererProps } from './types';

export async function AnnouncementsBlock(props: BlockRendererProps) {
  const parsed = announcementsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'announcements block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: AnnouncementsBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const items = await reader.listAnnouncements({
    limit: config.limit,
    timeWindowDays: config.timeWindowDays,
  });

  // Sanitize here rather than in the view: it is a server concern, and
  // isomorphic-dompurify pulls jsdom in behind it — which must not reach the
  // editor canvas's client bundle. See AnnouncementViewItem.
  const sanitized = items.map((item) => ({ ...item, bodyHtml: sanitizeHtml(item.body ?? '') }));

  return (
    <AnnouncementsBlockView
      blockId={props.block.id}
      content={config}
      data={sanitized}
      community={props.community}
    />
  );
}
