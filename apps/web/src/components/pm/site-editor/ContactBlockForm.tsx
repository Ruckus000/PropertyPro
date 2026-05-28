'use client';
import { useState, type FormEvent } from 'react';
import type { ContactBlockContent } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: ContactBlockContent | null;
  onSaved?: () => void;
}

export function ContactBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [showBoard, setShowBoard] = useState<boolean>(initial?.showBoard ?? true);
  const [showManagement, setShowManagement] = useState<boolean>(initial?.showManagement ?? true);
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: ContactBlockContent = { showBoard, showManagement };
    try {
      await mutation.mutateAsync({ blockType: 'contact', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-content-secondary">
        Renders public management contact fields and a board roster on the public site.
      </p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-content">Visible contact sections</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-content">
          <input
            type="checkbox"
            checked={showManagement}
            onChange={(e) => setShowManagement(e.target.checked)}
            className="h-4 w-4 rounded border-default text-interactive focus:ring-interactive"
          />
          Management contact
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-content">
          <input
            type="checkbox"
            checked={showBoard}
            onChange={(e) => setShowBoard(e.target.checked)}
            className="h-4 w-4 rounded border-default text-interactive focus:ring-interactive"
          />
          Board roster
        </label>
      </fieldset>
      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:opacity-50"
      >
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
}
