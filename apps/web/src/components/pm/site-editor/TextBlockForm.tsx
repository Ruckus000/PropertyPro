'use client';
import { useState, type FormEvent } from 'react';
import type { TextBlockContent } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: TextBlockContent | null;
  onSaved?: () => void;
}

export function TextBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [heading, setHeading] = useState(initial?.heading ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const disabled = body.trim().length === 0 || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: TextBlockContent = {
      body: body.trim(),
      ...(heading.trim() ? { heading: heading.trim() } : {}),
    } as TextBlockContent;
    try {
      await mutation.mutateAsync({ blockType: 'text', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`text-heading-${blockOrder}`} className="block text-sm font-medium text-content">Heading</label>
        <input
          id={`text-heading-${blockOrder}`}
          type="text"
          maxLength={120}
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
        />
      </div>
      <div>
        <label htmlFor={`text-body-${blockOrder}`} className="block text-sm font-medium text-content">
          Body <span className="text-danger">*</span>
        </label>
        <textarea
          id={`text-body-${blockOrder}`}
          maxLength={2000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
        />
      </div>
      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
