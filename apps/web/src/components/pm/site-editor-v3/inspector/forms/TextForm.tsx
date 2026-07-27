'use client';

import { useCallback } from 'react';
import { textBlockSchema, type BlockVariant } from '@propertypro/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import { VariantField } from './fields/VariantField';
import type { BlockFormProps } from '../types';

const HEADING_MAX = 120;
const BODY_MAX = 2000;

interface TextDraft {
  heading: string;
  body: string;
  variant: BlockVariant;
}

/**
 * Tolerant parse. Deliberately NOT `textBlockSchema.parse` — a block whose
 * stored content fails its schema still has to open in the editor, because
 * this form is the only place a PM can fix it. Missing or wrong-typed fields
 * come back as empty strings and the save is simply blocked until valid.
 */
function toDraft(content: unknown): TextDraft {
  const parsed = textBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      heading: parsed.data.heading ?? '',
      body: parsed.data.body,
      // Absent means standard — see blockVariantSchema. Normalising here means
      // the form never has to render an indeterminate radio group.
      variant: parsed.data.variant ?? 'standard',
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  return {
    heading: typeof loose.heading === 'string' ? loose.heading : '',
    body: typeof loose.body === 'string' ? loose.body : '',
    variant: 'standard',
  };
}

/**
 * Draft -> stored shape. Trims, and OMITS an empty heading rather than sending
 * `heading: ''` — which `textBlockSchema` rejects (`min(1)`) and which would
 * make "clear the heading, retype it" two distinct autosaves.
 *
 * Returns null while `body` is empty: the schema requires it, so there is
 * nothing valid to write yet.
 */
function toCanonical(draft: TextDraft): unknown | null {
  const body = draft.body.trim();
  if (body.length === 0) return null;
  const heading = draft.heading.trim();
  return {
    ...(heading.length > 0 ? { heading } : {}),
    body,
    // `standard` is the default, so omit it rather than writing it. Storing it
    // explicitly would make two identical-looking sections differ by content
    // key, and show up as a spurious change in the publish diff.
    ...(draft.variant !== 'standard' ? { variant: draft.variant } : {}),
  };
}

export function TextForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'text', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<TextDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const headingId = `text-heading-${blockOrder}`;
  const bodyId = `text-body-${blockOrder}`;
  const bodyHintId = `${bodyId}-hint`;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          // `maxLength` counts UTF-16 code units while the schema's `.max()`
          // counts them the same way, so these agree. Do not "fix" this to a
          // code-point count without changing the schema too.
          maxLength={HEADING_MAX}
          onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
          placeholder="Optional"
        />
      </div>

      <VariantField
        idPrefix={`text-${blockOrder}`}
        value={draft.variant}
        onChange={(variant) => setDraft((prev) => ({ ...prev, variant }))}
      />

      <div className="space-y-1.5">
        <Label htmlFor={bodyId}>
          Body <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </Label>
        <Textarea
          id={bodyId}
          value={draft.body}
          maxLength={BODY_MAX}
          rows={8}
          required
          aria-describedby={bodyHintId}
          onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
        />
        <p
          id={bodyHintId}
          className={isIncomplete ? 'text-xs text-status-danger' : 'text-xs text-content-secondary'}
        >
          {isIncomplete
            ? 'Add some text before this section can be saved.'
            : 'Changes save automatically.'}
        </p>
      </div>
    </div>
  );
}
