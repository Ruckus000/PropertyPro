/**
 * BoardBlockView — presentational half of the Board members section.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 *
 * One card per seat holder, with a name and a title and nothing else: no email,
 * no phone, no link. The shell hands over exactly those two fields, but do not
 * widen what this renders either.
 *
 * With no one in a seat, this view keeps a placeholder, because the editor
 * canvas renders it directly and a manager needs to see where the section sits.
 * The public site never reaches that branch: the shell renders nothing first.
 */
import { DEFAULT_BOARD_HEADING, type BoardBlockContent } from '@propertypro/shared';
import type { BlockViewProps } from './types';
import { SiteSection, SiteSectionEmpty } from './SiteSection';

export interface BoardMember {
  name: string;
  title: string;
}

export interface BoardData {
  members: BoardMember[];
}

export type BoardBlockViewProps = BlockViewProps<BoardBlockContent, BoardData>;

export function BoardBlockView({ blockId, content, data, anchorId }: BoardBlockViewProps) {
  const headingId = `board-${blockId}`;

  return (
    <SiteSection id={anchorId} headingId={headingId} title={content?.heading ?? DEFAULT_BOARD_HEADING}>
      {data.members.length === 0 ? (
        <SiteSectionEmpty>No one holds a board seat yet.</SiteSectionEmpty>
      ) : (
        <ul className="grid gap-x-12 site-sm:grid-cols-2">
          {data.members.map((member, index) => (
            <li key={`${index}-${member.name}`} className="border-t border-edge py-5">
              <p className="font-heading text-xl text-content">{member.name}</p>
              <p className="mt-1 text-base text-content-secondary">{member.title}</p>
            </li>
          ))}
        </ul>
      )}
    </SiteSection>
  );
}
