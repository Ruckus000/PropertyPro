'use client';

import { useCallback } from 'react';
import { DEFAULT_BOARD_HEADING } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';

/** `boardBlockSchema`'s limit on the heading. */
const HEADING_MAX = 80;

interface BoardDraft {
  heading: string;
}

/**
 * Tolerant parse — a block whose stored content fails its schema must still
 * open, because this form is the only place to repair it.
 */
function toDraft(content: unknown): BoardDraft {
  const loose = (content ?? {}) as Record<string, unknown>;
  return { heading: typeof loose.heading === 'string' ? loose.heading : '' };
}

/**
 * Draft -> stored shape. The heading is trimmed, and left out when nothing is
 * left: the schema is `.trim().min(1)`, so an empty string would be refused, and
 * an absent key is what makes the renderer keep its own heading.
 *
 * Returns null — blocks the save — only for a heading over the limit, which the
 * input's `maxLength` already prevents typing; this is the guard behind it.
 *
 * `hidden` is not this form's: the Sections list's eye toggle sets it, and
 * `useBlockForm` carries it through every save.
 */
function toCanonical(draft: BoardDraft): unknown | null {
  const heading = draft.heading.trim();
  if (heading.length > HEADING_MAX) return null;
  return heading.length > 0 ? { heading } : {};
}

/**
 * Board members settings: the heading, and nothing else.
 *
 * The people are not this block's content. The renderer reads the community's
 * board seats when the page is drawn (`BoardBlock`), by name and title only, so a
 * change of officers shows with no edit here and no contact detail can reach the
 * page. The copy says all of that, because a manager who finds one field will look
 * for the others.
 */
export function BoardForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'board', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft } = useBlockForm<BoardDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const headingId = `board-heading-${blockOrder}`;
  const hintId = `${headingId}-hint`;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          maxLength={HEADING_MAX}
          placeholder={DEFAULT_BOARD_HEADING}
          aria-describedby={hintId}
          onChange={(event) => setDraft({ heading: event.target.value })}
        />
        <p id={hintId} className="text-xs text-content-secondary">
          Leave blank to use “{DEFAULT_BOARD_HEADING}”.
        </p>
      </div>

      <p className="text-sm text-content-secondary">
        Names and titles come from the board seats recorded in PropertyPro, so a change of
        officers shows up on its own. No contact details, such as email addresses or phone
        numbers, are shown.
      </p>
      <p className="text-sm text-content-secondary">
        If no one holds a board seat yet, your website leaves this section out.
      </p>
      <p className="text-sm text-content-secondary">
        If your Contact section also lists the board, untick “Show board members” there so the
        board appears only once.
      </p>
    </div>
  );
}
