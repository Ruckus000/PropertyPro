/**
 * MeetingsBlock — SoR block that reads upcoming community meetings.
 *
 * Async server component: validates, fetches, and hands the result to the pure
 * view. Markup lives in MeetingsBlockView so the editor canvas renders exactly
 * what the public site renders — see BlockViewProps in ./types.
 *
 * With no upcoming meeting it renders nothing: the live site never shows an
 * empty box (D14). The view keeps its placeholder text, because the editor
 * canvas renders the view directly and a manager needs to see the empty section.
 */
import { meetingsBlockSchema, type MeetingsBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { MeetingsBlockView } from './MeetingsBlockView';
import type { BlockRendererProps } from './types';

export async function MeetingsBlock(props: BlockRendererProps) {
  const parsed = meetingsBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'meetings block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: MeetingsBlockContent = parsed.data;
  const reader = getPublicCommunityScopedReader(props.community.id);
  const items = await reader.listMeetings({
    limit: config.limit,
    timeWindowDays: config.timeWindowDays,
  });
  if (items.length === 0) return null;

  return (
    <MeetingsBlockView
      blockId={props.block.id}
      content={config}
      data={items}
      community={props.community}
    />
  );
}
