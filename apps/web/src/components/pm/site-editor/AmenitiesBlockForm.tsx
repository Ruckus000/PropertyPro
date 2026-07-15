'use client';
import { useState, type FormEvent } from 'react';
import type { AmenitiesBlockContent, AmenityItem } from '@propertypro/shared';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';

interface Props {
  communityId: number;
  blockOrder: number;
  initial: AmenitiesBlockContent | null;
  onSaved?: () => void;
}

interface DraftItem {
  name: string;
  description: string;
}

const inputClass =
  'mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive';

function toDrafts(initial: AmenitiesBlockContent | null): DraftItem[] {
  if (initial?.items?.length) {
    return initial.items.map((it) => ({ name: it.name, description: it.description ?? '' }));
  }
  return [{ name: '', description: '' }];
}

export function AmenitiesBlockForm({ communityId, blockOrder, initial, onSaved }: Props) {
  const [heading, setHeading] = useState(initial?.heading ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => toDrafts(initial));
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpsertContentBlock(communityId);

  const allNamed = items.length > 0 && items.every((it) => it.name.trim().length > 0);
  const disabled = !allNamed || mutation.isPending;

  function updateItem(index: number, field: keyof DraftItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { name: '', description: '' }]);
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const cleaned: AmenityItem[] = items.map((it) => ({
      name: it.name.trim(),
      ...(it.description.trim() ? { description: it.description.trim() } : {}),
    }));
    const payload: AmenitiesBlockContent = {
      items: cleaned,
      ...(heading.trim() ? { heading: heading.trim() } : {}),
    };
    try {
      await mutation.mutateAsync({ blockType: 'amenities', blockOrder, content: payload });
      onSaved?.();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor={`amenities-heading-${blockOrder}`} className="block text-sm font-medium text-content">
          Heading
        </label>
        <input
          id={`amenities-heading-${blockOrder}`}
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
              <label htmlFor={`amenity-name-${blockOrder}-${i}`} className="block text-sm font-medium text-content">
                Amenity {i + 1} name <span className="text-danger">*</span>
              </label>
              <input
                id={`amenity-name-${blockOrder}-${i}`}
                type="text"
                maxLength={80}
                value={item.name}
                onChange={(e) => updateItem(i, 'name', e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="mt-3">
              <label
                htmlFor={`amenity-desc-${blockOrder}-${i}`}
                className="block text-sm font-medium text-content"
              >
                Amenity {i + 1} description
              </label>
              <input
                id={`amenity-desc-${blockOrder}-${i}`}
                type="text"
                maxLength={280}
                value={item.description}
                onChange={(e) => updateItem(i, 'description', e.target.value)}
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
        + Add amenity
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
