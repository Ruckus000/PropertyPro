'use client';
import { useState, type FormEvent } from 'react';
import type { DocumentsBlockContent } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

/** The five category names exposed via the documentsBlockSchema enum. */
const DOCUMENT_CATEGORIES = [
  { value: 'budget', label: 'Budget' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'financial', label: 'Financial' },
  { value: 'rules', label: 'Rules' },
  { value: 'other', label: 'Other' },
] as const;

type CategoryValue = (typeof DOCUMENT_CATEGORIES)[number]['value'];

interface Props {
  communityId: number;
  blockOrder: number;
  initial: DocumentsBlockContent | null;
  onSaved?: () => void;
}

export function DocumentsBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [limit, setLimit] = useState<number>(initial?.limit ?? 5);
  const [includeCategories, setIncludeCategories] = useState<Set<CategoryValue>>(
    new Set((initial?.includeCategories ?? []) as CategoryValue[]),
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const limitInvalid = !Number.isInteger(limit) || limit < 1 || limit > 20;
  const disabled = limitInvalid || mutation.isPending;

  function toggleCategory(value: CategoryValue) {
    setIncludeCategories((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: DocumentsBlockContent = {
      limit,
      includeCategories: Array.from(includeCategories) as CategoryValue[],
    };
    try {
      await mutation.mutateAsync({ blockType: 'documents', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-content-secondary">
        Renders publicly accessible documents filtered by category.
      </p>
      <div>
        <label htmlFor={`doc-limit-${blockOrder}`} className="block text-sm font-medium text-content">
          Maximum items <span className="text-danger">*</span>
        </label>
        <input
          id={`doc-limit-${blockOrder}`}
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
      <fieldset>
        <legend className="text-sm font-medium text-content">Include categories</legend>
        <p className="mt-0.5 text-xs text-content-secondary">Only documents in the selected categories will be shown.</p>
        <div className="mt-2 space-y-1">
          {DOCUMENT_CATEGORIES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer text-sm text-content">
              <input
                type="checkbox"
                checked={includeCategories.has(value)}
                onChange={() => toggleCategory(value)}
                className="h-4 w-4 rounded border-default text-interactive focus:ring-interactive"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
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
