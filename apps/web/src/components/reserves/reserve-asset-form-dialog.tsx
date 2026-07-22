'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCreateReserveAsset, useUpdateReserveAsset } from '@/hooks/use-reserve-assets';
import { RESERVE_NOTES_HINT, RESERVE_TRANSPARENCY_ADMIN_HINT } from '@/lib/constants/reserve-disclaimers';
import {
  RESERVE_ASSET_CATEGORY_LABELS,
  type ReserveAssetCategory,
  type ReserveAssetRecord,
} from './types';

interface ReserveAssetFormDialogProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = create mode. */
  editing: ReserveAssetRecord | null;
}

/** Cents (integer) → a plain dollar string for the input, or '' when null. */
function centsToDollarInput(cents: number | null): string {
  if (cents === null) return '';
  return String(cents / 100);
}

/**
 * Dollar string → integer cents, or null when blank. Returns `undefined` when
 * the value is present but not a valid non-negative number (caller validates).
 */
function dollarInputToCents(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return undefined;
  return Math.round(dollars * 100);
}

/**
 * Add/edit dialog for a reserve asset. Factual fields only — this is a record
 * the association enters, not a reserve study.
 */
export function ReserveAssetFormDialog({
  communityId,
  open,
  onOpenChange,
  editing,
}: ReserveAssetFormDialogProps) {
  const isEdit = editing !== null;
  const createAsset = useCreateReserveAsset(communityId);
  const updateAsset = useUpdateReserveAsset(communityId);

  const [name, setName] = React.useState('');
  const [category, setCategory] = React.useState<ReserveAssetCategory>('roof');
  const [yearInstalled, setYearInstalled] = React.useState('');
  const [usefulLifeYears, setUsefulLifeYears] = React.useState('');
  const [replacementCost, setReplacementCost] = React.useState('');
  const [currentReserve, setCurrentReserve] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setName(editing?.name ?? '');
    setCategory(editing?.category ?? 'roof');
    setYearInstalled(editing ? String(editing.yearInstalled) : '');
    setUsefulLifeYears(editing ? String(editing.usefulLifeYears) : '');
    setReplacementCost(editing ? centsToDollarInput(editing.replacementCostCents) : '');
    setCurrentReserve(editing ? centsToDollarInput(editing.currentReserveCents) : '');
    setNotes(editing?.notes ?? '');
  }, [open, editing]);

  const isPending = createAsset.isPending || updateAsset.isPending;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Enter a name for this component.');
      return;
    }
    const year = Number(yearInstalled);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) {
      setError('Enter a valid install year.');
      return;
    }
    const life = Number(usefulLifeYears);
    if (!Number.isInteger(life) || life <= 0 || life > 200) {
      setError('Enter a valid expected useful life (in years).');
      return;
    }
    const replacementCents = dollarInputToCents(replacementCost);
    if (replacementCents === undefined) {
      setError('Replacement cost must be a non-negative number.');
      return;
    }
    const reserveCents = dollarInputToCents(currentReserve);
    if (reserveCents === undefined) {
      setError('Currently reserved must be a non-negative number.');
      return;
    }

    const payload = {
      name: name.trim(),
      category,
      yearInstalled: year,
      usefulLifeYears: life,
      replacementCostCents: replacementCents,
      currentReserveCents: reserveCents,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        await updateAsset.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createAsset.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t save this asset. Please try again.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit reserve asset' : 'Add reserve asset'}</DialogTitle>
          <DialogDescription>{RESERVE_TRANSPARENCY_ADMIN_HINT}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AlertBanner status="danger" title={error} />}

          <div className="space-y-2">
            <Label htmlFor="ra-name">Component name *</Label>
            <Input
              id="ra-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main roof"
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ra-category">Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ReserveAssetCategory)}>
              <SelectTrigger id="ra-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RESERVE_ASSET_CATEGORY_LABELS) as ReserveAssetCategory[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {RESERVE_ASSET_CATEGORY_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ra-year">Year installed *</Label>
              <Input
                id="ra-year"
                type="number"
                inputMode="numeric"
                value={yearInstalled}
                onChange={(e) => setYearInstalled(e.target.value)}
                placeholder="e.g. 2015"
                min={1900}
                max={2200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-life">Expected useful life (years) *</Label>
              <Input
                id="ra-life"
                type="number"
                inputMode="numeric"
                value={usefulLifeYears}
                onChange={(e) => setUsefulLifeYears(e.target.value)}
                placeholder="e.g. 25"
                min={1}
                max={200}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ra-replacement">Replacement cost (optional)</Label>
              <Input
                id="ra-replacement"
                type="number"
                inputMode="decimal"
                value={replacementCost}
                onChange={(e) => setReplacementCost(e.target.value)}
                placeholder="USD, e.g. 250000"
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-reserve">Currently reserved (optional)</Label>
              <Input
                id="ra-reserve"
                type="number"
                inputMode="decimal"
                value={currentReserve}
                onChange={(e) => setCurrentReserve(e.target.value)}
                placeholder="USD, e.g. 90000"
                min={0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ra-notes">Notes for members (optional)</Label>
            <Textarea
              id="ra-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <p className="text-xs text-content-tertiary">{RESERVE_NOTES_HINT}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
