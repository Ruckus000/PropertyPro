/**
 * BoardBlockView — presentational half of the Board members section.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 *
 * One entry per seat holder (initials, name and title) and nothing else: no email,
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
    <SiteSection
      id={anchorId}
      headingId={headingId}
      title={content?.heading ?? DEFAULT_BOARD_HEADING}
      layout="stacked"
    >
      {data.members.length === 0 ? (
        <SiteSectionEmpty>No one holds a board seat yet.</SiteSectionEmpty>
      ) : (
        <ul className="grid gap-x-8 gap-y-10 site-sm:grid-cols-2 site-md:grid-cols-4">
          {data.members.map((member, index) => (
            <li key={`${index}-${member.name}`} className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-xl text-content-inverse"
              >
                {initials(member.name)}
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-xl leading-snug text-content">{member.name}</span>
                <span className="block text-base text-content-secondary">{member.title}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SiteSection>
  );
}

/** "Sam President" → "SP": the first letter of the first and last words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  // Array.from splits by character, so a name that opens with an astral
  // character never leaves half a surrogate pair in the circle.
  const firstChar = (word: string | undefined) => (word ? (Array.from(word)[0] ?? '') : '');
  const last = words.length > 1 ? firstChar(words[words.length - 1]) : '';
  return (firstChar(words[0]) + last).toUpperCase();
}
