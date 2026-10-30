'use client';

import { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock, type UpsertContentBlockInput } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import type { BlockFormProps } from '../types';
import {
  DocumentCategoriesField,
  normalizeDocumentCategories,
  type DocumentCategoryValue,
} from './fields/DocumentCategoriesField';
import {
  OwnerRecordsNote,
  SectionSourceNote,
  isListedSection,
} from './fields/SectionSourceNotes';

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

/**
 * What the live site does with a section that has nothing to list, as the first
 * half of the hint. Meetings and Announcements are left out of the live site.
 * Documents shows the owners' records summary in its slot, and is left out only
 * when no record is posted either (`DocumentsBlock`). Either way the message
 * this form edits is only ever seen on the editor canvas.
 */
const LIVE_SITE_HINT: Record<string, string> = {
  documents:
    "When there are no public documents to list, your website shows a summary of the owners' records here, or hides this section if there are none. This message only shows here in the editor.",
};
const HIDDEN_LIVE_SITE_HINT =
  'Your website hides this section while it has nothing to list. This message only shows here in the editor.';

interface SorDraft {
  emptyText: string;
  /**
   * The Documents section's categories, or null while the block stores none.
   *
   * Null is not the same as an empty list: a block with no `includeCategories`
   * key is written back without one, so opening the panel and fixing the
   * empty-state copy never adds a key the manager did not touch. Only the
   * Documents panel ever sets it.
   */
  categories: DocumentCategoryValue[] | null;
  /**
   * Everything else the block stores, carried through untouched.
   *
   * These blocks also hold `limit` and `timeWindowDays`. Those predate this
   * phase and have never been editable in v3 — exposing them here would be
   * unrelated scope. But a save writes the WHOLE content object, so they must
   * survive the round trip or editing the empty-state copy would silently reset
   * a PM's configured limit to the schema default.
   */
  rest: Record<string, unknown>;
}

function toDraft(content: unknown): SorDraft {
  const loose = (content ?? {}) as Record<string, unknown>;
  const { emptyText, includeCategories, ...rest } = loose;
  return {
    emptyText: typeof emptyText === 'string' ? emptyText : '',
    categories: Array.isArray(includeCategories)
      ? normalizeDocumentCategories(includeCategories)
      : null,
    rest,
  };
}

function toCanonical(draft: SorDraft): unknown {
  const emptyText = draft.emptyText.trim();
  // Omitted rather than sent as '' — the schema is `min(1)`, and an absent
  // value is what makes the renderer keep its built-in copy.
  return {
    ...draft.rest,
    ...(draft.categories === null ? {} : { includeCategories: draft.categories }),
    ...(emptyText.length > 0 ? { emptyText } : {}),
  };
}

/**
 * The panel for the system-of-record blocks that list what the community keeps
 * elsewhere: announcements, meetings and documents.
 *
 * Nothing in these sections is typed here, so the panel first says where the
 * content comes from and links to it. Documents adds the categories to list and
 * a summary of the owners' records; every type keeps the empty-state copy.
 *
 * One component for the three rather than three near-identical files: the
 * differences are the block type it writes, the source it names and the
 * placeholder it shows. `form-registry` binds the type per entry.
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
  const liveSiteHint = LIVE_SITE_HINT[blockType] ?? HIDDEN_LIVE_SITE_HINT;
  // The built-in copy ends in a full stop of its own; closing the sentence after
  // the quotation mark as well would double it.
  const usedWhenBlank = builtIn
    ? `“${builtIn}”${builtIn.endsWith('.') ? '' : '.'}`
    : 'the default.';

  return (
    <div className="space-y-4">
      {isListedSection(blockType) && (
        <SectionSourceNote communityId={communityId} blockType={blockType} />
      )}

      {blockType === 'documents' && (
        <>
          <DocumentCategoriesField
            idPrefix={fieldId}
            value={draft.categories ?? []}
            onChange={(categories) => setDraft((prev) => ({ ...prev, categories }))}
          />
          <OwnerRecordsNote communityId={communityId} />
        </>
      )}

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
          {liveSiteHint} Leave blank to use {usedWhenBlank}
        </p>
      </div>
    </div>
  );
}
