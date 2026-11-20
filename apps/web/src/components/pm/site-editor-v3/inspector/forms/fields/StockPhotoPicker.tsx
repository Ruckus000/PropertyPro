'use client';

/**
 * The stock photo library, in a dialog: the looks' suggested photos first, the
 * rest under "More photos". One filled button, "Use this photo", disabled until
 * the choice differs from the photo being replaced. A photo already in the
 * welcome section elsewhere is disabled, so a photo is never added twice.
 */
import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import {
  PICKABLE_STOCK_PHOTO_IDS,
  STOCK_PHOTOS,
  stockPhotoSrc,
  type StockPhotoId,
} from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getLook, type LookId } from '@/lib/site-looks/looks';
import { cn } from '@/lib/utils';

export interface StockPhotoPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lookId: LookId | null;
  /** The photo this choice replaces; null when adding. */
  replacing: StockPhotoId | null;
  /** Photos already in the section; they cannot be chosen again. */
  inUse: readonly StockPhotoId[];
  onChoose: (id: StockPhotoId) => void;
}

export function StockPhotoPicker({
  open,
  onOpenChange,
  lookId,
  replacing,
  inUse,
  onChoose,
}: StockPhotoPickerProps) {
  const baseId = useId();
  const [selected, setSelected] = useState<StockPhotoId | null>(replacing);
  useEffect(() => {
    if (open) setSelected(replacing);
  }, [open, replacing]);

  const look = lookId ? getLook(lookId) : null;
  const suggested = (look?.suggestedPhotos ?? []).filter((id) =>
    PICKABLE_STOCK_PHOTO_IDS.includes(id),
  );
  const rest = PICKABLE_STOCK_PHOTO_IDS.filter((id) => !suggested.includes(id));

  function tile(id: StockPhotoId) {
    const isSelected = selected === id;
    const isCurrent = replacing === id;
    const taken = !isCurrent && inUse.includes(id);
    return (
      <li key={id}>
        <button
          type="button"
          aria-label={STOCK_PHOTOS[id].name}
          aria-describedby={isCurrent ? `${baseId}-${id}-in-use` : undefined}
          aria-pressed={isSelected}
          disabled={taken}
          onClick={() => setSelected(id)}
          className={cn(
            'relative block w-full min-h-11 md:min-h-0 overflow-hidden rounded-md border border-edge bg-surface-card text-left',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2',
            isSelected && 'ring-2 ring-interactive',
            taken && 'cursor-not-allowed opacity-60',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed static webp, sized by the grid */}
          <img
            src={stockPhotoSrc(id, 480)}
            alt=""
            loading="lazy"
            className="aspect-[3/2] w-full object-cover"
          />
          <span className="flex items-center justify-between gap-2 px-2 py-1 text-sm text-content">
            <span>{STOCK_PHOTOS[id].name}</span>
            {isCurrent ? (
              <span id={`${baseId}-${id}-in-use`} className="inline-flex items-center gap-1 text-xs text-content-secondary">
                <Check className="h-3 w-3" aria-hidden="true" />
                In use
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  }

  const group = (label: string, ids: readonly StockPhotoId[]) => (
    <div role="group" aria-label={label} className="space-y-2">
      <h3 className="text-sm font-medium text-content">{label}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{ids.map(tile)}</ul>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a photo</DialogTitle>
          {look ? <DialogDescription>{`Your site uses ${look.name}`}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">
          {suggested.length > 0 ? (
            <>
              {group(`Suggested for ${look?.name}`, suggested)}
              {group('More photos', rest)}
            </>
          ) : (
            group('Our photos', rest)
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={selected === null || selected === replacing}
            onClick={() => {
              if (selected === null) return;
              onChoose(selected);
              onOpenChange(false);
            }}
          >
            Use this photo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
