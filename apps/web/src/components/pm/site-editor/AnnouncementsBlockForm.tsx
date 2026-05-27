'use client';
import { useState, type FormEvent } from 'react';
import type { AnnouncementsBlockContent } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: AnnouncementsBlockContent | null;
  onSaved?: () => void;
}

export function AnnouncementsBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [limit, setLimit] = useState<number>(initial?.limit ?? 5);
  const [timeWindowDays, setTimeWindowDays] = useState<number>(initial?.timeWindowDays ?? 30);
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const limitInvalid = !Number.isInteger(limit) || limit < 1 || limit > 20;
  const windowInvalid = !Number.isInteger(timeWindowDays) || timeWindowDays < 1 || timeWindowDays > 365;
  const disabled = limitInvalid || windowInvalid || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: AnnouncementsBlockContent = { limit, timeWindowDays };
    try {
      await mutation.mutateAsync({ blockType: 'announcements', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-content-secondary">
        Renders the latest published announcements on the public site.
      </p>
      <div>
        <label htmlFor={`ann-limit-${blockOrder}`} className="block text-sm font-medium text-content">
          Maximum items <span className="text-danger">*</span>
        </label>
        <input
          id={`ann-limit-${blockOrder}`}
          type="number"
          min={1}
          max={20}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          required
          className="mt-1 block w-32 rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
        <p className="mt-1 text-xs text-content-secondary">Between 1 and 20.</p>
      </div>
      <div>
        <label htmlFor={`ann-window-${blockOrder}`} className="block text-sm font-medium text-content">
          Time window (days) <span className="text-danger">*</span>
        </label>
        <input
          id={`ann-window-${blockOrder}`}
          type="number"
          min={1}
          max={365}
          value={timeWindowDays}
          onChange={(e) => setTimeWindowDays(Number(e.target.value))}
          required
          className="mt-1 block w-32 rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40"
        />
        <p className="mt-1 text-xs text-content-secondary">Only announcements published within this window appear.</p>
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
