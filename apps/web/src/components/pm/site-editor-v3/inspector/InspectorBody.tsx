'use client';

import { blockFormRegistry } from './form-registry';
import type { BlockType } from '@propertypro/shared';

/**
 * Shown for a section whose type has no edit form yet. Coverage is incremental,
 * and a section with no form must still say so rather than render an empty box.
 */
export const NO_FORM_BODY =
  'Settings for this section arrive in a later update. For now you can reorder sections from the canvas or the Sections panel.';

export interface InspectorBodyProps {
  communityId: number;
  blockType: string;
  blockOrder: number;
  content: unknown;
}

/**
 * Resolves the selected section to its edit form.
 *
 * The single consumer of `blockFormRegistry`, shared by both inspector
 * presentations (the docked column and the overlay sheet) so neither knows
 * anything about block types.
 */
export function InspectorBody({
  communityId,
  blockType,
  blockOrder,
  content,
}: InspectorBodyProps) {
  const Form = blockFormRegistry[blockType as BlockType];

  if (!Form) {
    return <p className="text-sm text-content-secondary">{NO_FORM_BODY}</p>;
  }

  return (
    <Form
      // Slot, never `block.id`. The id changes on every save, so keying on it
      // would remount the form — and destroy its local state — on the PM's
      // first keystroke-triggered autosave. The slot is stable across saves,
      // and `useCanvasSelection` re-anchors it across reorders.
      key={`${blockType}:${blockOrder}`}
      communityId={communityId}
      blockType={blockType as BlockType}
      blockOrder={blockOrder}
      content={content}
    />
  );
}
