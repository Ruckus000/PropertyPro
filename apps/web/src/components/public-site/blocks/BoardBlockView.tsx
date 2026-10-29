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
    <section
      id={anchorId}
      className="px-4 py-12 site-sm:px-6 site-lg:px-8"
      aria-labelledby={headingId}
    >
      <div className="mx-auto max-w-3xl">
        <h2 id={headingId} className="mb-6 font-heading text-2xl font-semibold text-content">
          {content?.heading ?? DEFAULT_BOARD_HEADING}
        </h2>
        {data.members.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface-card p-4 text-sm text-content-secondary">
            No one holds a board seat yet.
          </p>
        ) : (
          <ul className="grid gap-4 site-sm:grid-cols-2">
            {data.members.map((member, index) => (
              <li
                key={`${index}-${member.name}`}
                className="rounded-md border border-edge bg-surface-card p-5"
              >
                <p className="text-base font-medium text-content">{member.name}</p>
                <p className="text-base text-content-secondary">{member.title}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
