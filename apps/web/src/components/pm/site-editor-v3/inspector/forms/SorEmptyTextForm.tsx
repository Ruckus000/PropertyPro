'use client';

import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock, type UpsertContentBlockInput } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';

const EMPTY_TEXT_MAX = 200;

/**
 * The copy each renderer shows when it has no rows, so the field can be
 * previewed as a placeholder rather than described in the abstract.
 */
const BUILT_IN_EMPTY_COPY: Record<string, string> = {
  announcements: 'No announcements yet.',
  documents: 'No documents available.',
  meetings: 'No upcoming meetings.',
};

interface SorDraft {
  emptyText: string;
  /**
   * Everything else the block stores, carried through untouched.
   *
   * These blocks also hold `limit`, `timeWindowDays` and `includeCategories`.
   * Those predate this phase and have never been editable in v3 — exposing
   * them here would be unrelated scope. But a save writes the WHOLE content
   * object, so they must survive the round trip or editing the empty-state
   * copy would silently reset a PM's configured limit to the schema default.
   */
  rest: Record<string, unknown>;
}

function toDraft(content: unknown): SorDraft {
  const loose = (content ?? {}) as Record<string, unknown>;
  const { emptyText, ...rest } = loose;
  return {
    emptyText: typeof emptyText === 'string' ? emptyText : '',
    rest,
  };
}

function toCanonical(draft: SorDraft): unknown {
  const emptyText = draft.emptyText.trim();
  // Omitted rather than sent as '' — the schema is `min(1)`, and an absent
  // value is what makes the renderer keep its built-in copy.
  return { ...draft.rest, ...(emptyText.length > 0 ? { emptyText } : {}) };
}

/**
 * Empty-state copy for the system-of-record blocks.
 *
 * One component for announcements/documents/meetings rather than three
 * near-identical files: the only difference is the block type it writes and
 * the placeholder it shows. `form-registry` binds the type per entry.
 *
 * `contact` is deliberately absent — it renders fields, not a list, so it has
 * no zero-rows branch to override.
 */
export function SorEmptyTextForm({ communityId, blockType, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({
        blockType: blockType as UpsertContentBlockInput['blockType'],
        blockOrder,
        content: next,
      });
    },
    [upsert, blockType, blockOrder],
  );

  const { draft, setDraft } = useBlockForm<SorDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const fieldId = `sor-empty-${blockType}-${blockOrder}`;
  const hintId = `${fieldId}-hint`;
  const builtIn = BUILT_IN_EMPTY_COPY[blockType] ?? '';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={fieldId}>Empty-state message</Label>
        <Input
          id={fieldId}
          value={draft.emptyText}
          maxLength={EMPTY_TEXT_MAX}
          placeholder={builtIn}
          aria-describedby={hintId}
          onChange={(event) => setDraft((prev) => ({ ...prev, emptyText: event.target.value }))}
        />
        <p id={hintId} className="text-xs text-content-secondary">
          Shown on your website when this section has nothing to list. Leave blank to use
          {builtIn ? ` “${builtIn}”` : ' the default'}.
        </p>
      </div>
    </div>
  );
}
