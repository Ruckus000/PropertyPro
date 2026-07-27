'use client';

import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { amenitiesBlockSchema, type BlockVariant } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useUpsertContentBlock } from '@/hooks/use-content-blocks';
import { useBlockForm } from '../use-block-form';
import { VariantField } from './fields/VariantField';
import type { BlockFormProps } from '../types';

const HEADING_MAX = 120;
const NAME_MAX = 80;
const DESCRIPTION_MAX = 280;
const MAX_ITEMS = 30;

interface AmenityDraft {
  name: string;
  description: string;
}

interface AmenitiesDraft {
  heading: string;
  items: AmenityDraft[];
  variant: BlockVariant;
}

function toDraft(content: unknown): AmenitiesDraft {
  const parsed = amenitiesBlockSchema.safeParse(content);
  if (parsed.success) {
    return {
      heading: parsed.data.heading ?? '',
      items: parsed.data.items.map((item) => ({
        name: item.name,
        description: item.description ?? '',
      })),
      variant: parsed.data.variant ?? 'standard',
    };
  }
  const loose = (content ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(loose.items) ? loose.items : [];
  return {
    heading: typeof loose.heading === 'string' ? loose.heading : '',
    items: rawItems.map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        name: typeof item.name === 'string' ? item.name : '',
        description: typeof item.description === 'string' ? item.description : '',
      };
    }),
    // A block with no rows at all still needs one editable line, or there is
    // nothing to type into and no way to recover.
    variant: 'standard',
  };
}

/**
 * `amenitiesBlockSchema.items` is `min(1)`, so a draft whose rows are all blank
 * has nothing valid to write. Blank rows are dropped rather than sent — an
 * amenity with an empty name fails `min(1)` at publish.
 */
function toCanonical(draft: AmenitiesDraft): unknown | null {
  const items = draft.items
    .map((item) => ({ name: item.name.trim(), description: item.description.trim() }))
    .filter((item) => item.name.length > 0)
    .map((item) => ({
      name: item.name,
      ...(item.description.length > 0 ? { description: item.description } : {}),
    }));
  if (items.length === 0) return null;

  const heading = draft.heading.trim();
  return {
    ...(heading.length > 0 ? { heading } : {}),
    items,
    ...(draft.variant !== 'standard' ? { variant: draft.variant } : {}),
  };
}

export function AmenitiesForm({ communityId, blockOrder, content }: BlockFormProps) {
  const upsert = useUpsertContentBlock(communityId);

  const save = useCallback(
    async (next: unknown) => {
      await upsert.mutateAsync({ blockType: 'amenities', blockOrder, content: next });
    },
    [upsert, blockOrder],
  );

  const { draft, setDraft, isIncomplete } = useBlockForm<AmenitiesDraft>({
    content,
    toDraft,
    toCanonical,
    save,
  });

  const rows = draft.items.length > 0 ? draft.items : [{ name: '', description: '' }];
  const headingId = `amenities-heading-${blockOrder}`;

  const setRow = (index: number, next: Partial<AmenityDraft>) =>
    setDraft((prev) => {
      const items = (prev.items.length > 0 ? prev.items : [{ name: '', description: '' }]).slice();
      items[index] = { ...items[index]!, ...next };
      return { ...prev, items };
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={headingId}>Heading</Label>
        <Input
          id={headingId}
          value={draft.heading}
          maxLength={HEADING_MAX}
          placeholder="Optional"
          onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-content">Amenities</p>
        <ul className="space-y-3">
          {rows.map((item, index) => {
            const nameId = `amenity-name-${blockOrder}-${index}`;
            const descId = `amenity-desc-${blockOrder}-${index}`;
            return (
              <li key={index} className="space-y-2 rounded-md border border-edge p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={nameId} className="text-xs">
                    Name
                  </Label>
                  <Input
                    id={nameId}
                    value={item.name}
                    maxLength={NAME_MAX}
                    onChange={(event) => setRow(index, { name: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={descId} className="text-xs">
                    Description
                  </Label>
                  <Input
                    id={descId}
                    value={item.description}
                    maxLength={DESCRIPTION_MAX}
                    placeholder="Optional"
                    onChange={(event) => setRow(index, { description: event.target.value })}
                  />
                </div>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    // Position-bearing, because "Remove" repeated down a list
                    // is useless in a screen reader's element list.
                    aria-label={`Remove amenity ${index + 1}`}
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        items: prev.items.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_ITEMS}
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              items: [
                ...(prev.items.length > 0 ? prev.items : [{ name: '', description: '' }]),
                { name: '', description: '' },
              ],
            }))
          }
        >
          Add amenity
        </Button>

        {isIncomplete && (
          <p className="text-xs text-status-danger">
            Name at least one amenity before this section can be saved.
          </p>
        )}
      </div>

      <VariantField
        idPrefix={`amenities-${blockOrder}`}
        value={draft.variant}
        onChange={(variant) => setDraft((prev) => ({ ...prev, variant }))}
      />
    </div>
  );
}
