'use client';

import { Link2 } from 'lucide-react';
import { parseLinkedText, type LinkedField } from '@propertypro/shared';

/** What each linked detail is called to the manager, and what its button inserts. */
export const LINKED_FIELD_LABEL: Record<LinkedField, string> = {
  name: 'Community name',
  city: 'City',
  units: 'Number of homes',
};

export interface LinkedChipsProps {
  /** The words as stored, tokens and all. */
  text: string;
  id?: string;
}

/**
 * The words split into plain text and linked details, each detail as a chip:
 * "Welcome to [Community name]". It shows which parts of the sentence the page
 * fills in from the Community profile; the "Shows as" line beside it says what
 * they fill in with today.
 *
 * Renders nothing for words that use no linked detail. A chip carries an icon
 * and its name, and an unseen "linked detail" before the name for a screen
 * reader, so it is never told apart by its colour alone.
 */
export function LinkedChips({ text, id }: LinkedChipsProps) {
  const parts = parseLinkedText(text);
  if (!parts.some((part) => part.kind === 'field')) return null;

  return (
    <p id={id} className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-content-secondary">
      <span>Made of:</span>
      {parts.map((part, index) =>
        part.kind === 'text' ? (
          <span key={index} className="whitespace-pre-wrap break-words">
            {part.value}
          </span>
        ) : (
          <span
            key={index}
            data-linked-field={part.field}
            className="inline-flex items-center gap-1 rounded-full border border-edge bg-interactive-subtle px-2 py-0.5 font-medium text-interactive"
          >
            <Link2 className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">Linked detail: </span>
            {LINKED_FIELD_LABEL[part.field]}
          </span>
        ),
      )}
    </p>
  );
}
