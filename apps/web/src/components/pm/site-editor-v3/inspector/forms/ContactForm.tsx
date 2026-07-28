'use client';

import { useCallback } from 'react';
import { contactBlockSchema } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';

interface ContactDraft {
  showBoard: boolean;
  showManagement: boolean;
}

/**
 * Tolerant parse — a block whose stored content fails its schema must still
 * open, because this form is the only place to repair it.
 */
function toDraft(content: unknown): ContactDraft {
  const parsed = contactBlockSchema.safeParse(content);
  if (parsed.success) {
    return { showBoard: parsed.data.showBoard, showManagement: parsed.data.showManagement };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  // Defaulting to visible matches the schema's own defaults: an unreadable
  // contact block should show the community's contact details, not hide them.
  return {
    showBoard: loose.showBoard !== false,
    showManagement: loose.showManagement !== false,
  };
}

/**
 * Always emits BOTH keys, even at their defaults — and that is load-bearing.
 *
 * The route stores `parse.data`, so zod materialises both defaults server-side
 * and the refetch always returns `{showBoard, showManagement}`. If this omitted
 * a key at its default, `useBlockForm`'s echo check would compare the `{}` it
 * sent against the fully-defaulted object that came back, fail to recognise its
 * own write, and treat it as a foreign change — so every toggle-and-toggle-back
 * would trigger a spurious adopt/markClean cycle.
 *
 * Never returns null: every field has a default, so there is no incomplete
 * state to block a save on.
 */
function toCanonical(draft: ContactDraft): unknown {
  return { showBoard: draft.showBoard, showManagement: draft.showManagement };
}

/**
 * Contact block settings.
 *
 * The block itself is system-of-record: the renderer assembles it from the
 * community row, the board member rows and the management contact rows at
 * render time. Nothing here is contact DATA — only which of those two groups
 * appears. Editing the people is the residents/board admin's job, not this
 * panel's.
 *
 * Native checkboxes rather than `components/ui/switch`: that is Radix, and
 * nothing under `forms/` may pull a Radix stack onto this route (see
 * `form-registry.ts`).
 */
export function ContactForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'contact', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft } = useBlockForm<ContactDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const boardId = `contact-show-board-${blockOrder}`;
  const managementId = `contact-show-management-${blockOrder}`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">
        This section pulls contact details from your community record, so it stays
        current on its own. Choose who to show.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={boardId}
          checked={draft.showBoard}
          className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, showBoard: event.target.checked }))
          }
        />
        <Label htmlFor={boardId} className="font-normal">
          Show board members
        </Label>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={managementId}
          checked={draft.showManagement}
          className="h-4 w-4 rounded-sm border-edge text-interactive focus-visible:ring-2 focus-visible:ring-interactive"
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, showManagement: event.target.checked }))
          }
        />
        <Label htmlFor={managementId} className="font-normal">
          Show management contact
        </Label>
      </div>

      {!draft.showBoard && !draft.showManagement && (
        <p className="text-xs text-content-secondary">
          With both hidden this section shows nothing. Remove it from Sections if you
          don&apos;t want it on the page.
        </p>
      )}
    </div>
  );
}
