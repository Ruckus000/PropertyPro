'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useCreateUnit, type UnitOccupancy } from '@/hooks/use-units';
import { OCCUPANCY_LABEL } from './directory-model';

interface AddUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  hasOwnerRole: boolean;
  /** Apartments carry a rent; condos and HOAs do not. */
  showRent: boolean;
  onCreated: (unitId: number) => void;
}

const EMPTY = {
  unitNumber: '',
  building: '',
  floor: '',
  bedrooms: '',
  bathrooms: '',
  sqft: '',
  rentAmount: '',
  occupancy: null as UnitOccupancy | null,
};

function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
}

export function AddUnitDialog({ open, onOpenChange, communityId, hasOwnerRole, showRent, onCreated }: AddUnitDialogProps) {
  const createUnit = useCreateUnit(communityId);
  const [values, setValues] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const occupancyChoices: UnitOccupancy[] = hasOwnerRole ? ['owner_occupied', 'rented', 'vacant'] : ['rented', 'vacant'];

  function handleOpenChange(next: boolean) {
    if (createUnit.isPending) return;
    if (!next) {
      setValues(EMPTY);
      createUnit.reset();
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let unit: { id: number };
    try {
      unit = await createUnit.mutateAsync({
        communityId,
        unitNumber: values.unitNumber.trim(),
        building: values.building.trim() || null,
        floor: intOrNull(values.floor),
        bedrooms: intOrNull(values.bedrooms),
        bathrooms: intOrNull(values.bathrooms),
        sqft: intOrNull(values.sqft),
        ...(showRent && values.rentAmount.trim() ? { rentAmount: values.rentAmount.trim() } : {}),
        occupancy: values.occupancy,
      });
    } catch {
      return; // Rendered from createUnit.error (e.g. duplicate unit number).
    }
    setValues(EMPTY);
    onCreated(unit.id);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add a unit</DialogTitle>
          <DialogDescription>Only the unit number is required. You can fill in the rest later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-number">
                Unit number <span className="text-status-danger">*</span>
              </Label>
              <Input id="dir-unit-number" required value={values.unitNumber} onChange={set('unitNumber')} placeholder="e.g. 101" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-building">Building</Label>
              <Input id="dir-unit-building" value={values.building} onChange={set('building')} placeholder="e.g. A" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-floor">Floor</Label>
              {/* Floors may be negative (basements); everything else is ≥ 0. */}
              <Input id="dir-unit-floor" type="number" step={1} value={values.floor} onChange={set('floor')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-sqft">Square feet</Label>
              <Input id="dir-unit-sqft" type="number" min={0} step={1} value={values.sqft} onChange={set('sqft')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-beds">Bedrooms</Label>
              <Input id="dir-unit-beds" type="number" min={0} step={1} value={values.bedrooms} onChange={set('bedrooms')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-unit-baths">Bathrooms</Label>
              <Input id="dir-unit-baths" type="number" min={0} step={1} value={values.bathrooms} onChange={set('bathrooms')} />
            </div>
            {showRent ? (
              <div className="space-y-1.5">
                <Label htmlFor="dir-unit-rent">Monthly rent ($)</Label>
                <Input
                  id="dir-unit-rent"
                  type="number"
                  min={0}
                  step="0.01"
                  value={values.rentAmount}
                  onChange={set('rentAmount')}
                />
              </div>
            ) : null}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-content">Occupancy</legend>
            <div role="radiogroup" aria-label="Occupancy" className="flex flex-wrap gap-1 rounded-md bg-surface-muted p-1">
              {occupancyChoices.map((choice) => {
                const selected = values.occupancy === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setValues((prev) => ({ ...prev, occupancy: selected ? null : choice }))}
                    className={cn(
                      'min-h-10 flex-1 rounded-sm px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                      selected ? 'bg-surface-card text-content shadow-e1' : 'text-content-secondary hover:text-content',
                    )}
                  >
                    {OCCUPANCY_LABEL[choice]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-content-tertiary">
              {hasOwnerRole
                ? 'Your call — a seasonal owner who is away can stay owner-occupied. Leave blank if unsure.'
                : 'Leave blank if unsure.'}
            </p>
          </fieldset>

          {createUnit.error ? (
            <p role="alert" className="text-sm text-status-danger">
              {createUnit.error.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createUnit.isPending || values.unitNumber.trim() === ''}>
              {createUnit.isPending ? 'Adding…' : 'Add unit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
