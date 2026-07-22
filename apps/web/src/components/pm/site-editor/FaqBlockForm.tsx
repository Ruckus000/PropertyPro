'use client';
import { useState, type FormEvent } from 'react';
import type { FaqBlockContent, FaqItem } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: FaqBlockContent | null;
  onSaved?: () => void;
}

const inputClass =
  'mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive';

export function FaqBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [heading, setHeading] = useState(initial?.heading ?? '');
  const [items, setItems] = useState<FaqItem[]>(
    initial?.items?.length ? initial.items : [{ question: '', answer: '' }],
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const allFilled =
    items.length > 0 && items.every((it) => it.question.trim().length > 0 && it.answer.trim().length > 0);
  const disabled = !allFilled || mutation.isPending;

  function updateItem(index: number, field: keyof FaqItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { question: '', answer: '' }]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: FaqBlockContent = {
      items: items.map((it) => ({ question: it.question.trim(), answer: it.answer.trim() })),
      ...(heading.trim() ? { heading: heading.trim() } : {}),
    };
    try {
      await mutation.mutateAsync({ blockType: 'faq', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`faq-heading-${blockOrder}`} className="block text-sm font-medium text-content">
          Heading
        </label>
        <input
          id={`faq-heading-${blockOrder}`}
          type="text"
          maxLength={120}
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          className={inputClass}
        />
      </div>

      <ul className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="rounded-sm border border-default p-3">
            <div>
              <label htmlFor={`faq-q-${blockOrder}-${i}`} className="block text-sm font-medium text-content">
                Question {i + 1} <span className="text-danger">*</span>
              </label>
              <input
                id={`faq-q-${blockOrder}-${i}`}
                type="text"
                maxLength={200}
                value={item.question}
                onChange={(e) => updateItem(i, 'question', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="mt-3">
              <label htmlFor={`faq-a-${blockOrder}-${i}`} className="block text-sm font-medium text-content">
                Answer {i + 1} <span className="text-danger">*</span>
              </label>
              <textarea
                id={`faq-a-${blockOrder}-${i}`}
                maxLength={2000}
                rows={3}
                value={item.answer}
                onChange={(e) => updateItem(i, 'answer', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => removeItem(i)}
                className="rounded-sm px-2 py-1 text-sm text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addItem}
        className="rounded-md border border-default px-3 py-1.5 text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        + Add question
      </button>

      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
