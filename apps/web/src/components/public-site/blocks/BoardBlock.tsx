/**
 * BoardBlock — the people who hold board seats, by name and title (D16).
 *
 * Async server component: validates, fetches, and hands the result to the pure
 * view. Markup lives in BoardBlockView so the editor canvas renders the same
 * thing; see BlockViewProps in ./types.
 *
 * The roster is `getContactInfo`'s board list: the seat holders by their
 * `designation`, titled by `display_title` or else "Board President" / "Board
 * Member", as the Contact section shows them. Designations are read here for
 * DISPLAY ONLY and must never feed a permission decision.
 *
 * Names and titles only. The management contact is never asked for, and only
 * `name` and `title` are passed on, so a contact field added to the roster later
 * cannot reach this section.
 *
 * With no one in a seat it renders nothing: the live site never shows an empty
 * box (D14). The view keeps its placeholder for the editor canvas.
 */
import { boardBlockSchema, type BoardBlockContent } from '@propertypro/shared';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { BoardBlockView } from './BoardBlockView';
import type { BlockRendererProps } from './types';

export async function BoardBlock(props: BlockRendererProps) {
  const parsed = boardBlockSchema.safeParse(props.block.content);
  if (!parsed.success) {
    console.warn(
      'board block content failed Zod validation; skipping render',
      { blockId: props.block.id, communityId: props.community.id, issues: parsed.error.issues },
    );
    return null;
  }
  const config: BoardBlockContent = parsed.data;

  const reader = getPublicCommunityScopedReader(props.community.id);
  const { board } = await reader.getContactInfo({ showBoard: true, showManagement: false });
  if (board.length === 0) return null;

  return (
    <BoardBlockView
      blockId={props.block.id}
      content={config}
      data={{ members: board.map(({ name, title }) => ({ name, title })) }}
      community={props.community}
      anchorId={props.anchorId}
    />
  );
}
