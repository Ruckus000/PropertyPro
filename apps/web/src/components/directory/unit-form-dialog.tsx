'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCreateUnit, useUpdateUnit, type Unit, type UnitOccupancy } from '@/hooks/use-units';
import { OCCUPANCY_LABEL } from './directory-model';

interface UnitFormDialogProps {
  open: boolean;
  /** Edit this unit; omit to add a new one. */
  unit?: Unit | null;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  hasOwnerRole: boolean;
  /** Apartments carry a rent; condos and HOAs do not. */
  showRent: boolean;
  /** Apartments: occupancy comes from leases, so the form neither shows nor sends it. */
  occupancyFromLeases?: boolean;
  onSaved: (unitId: number) => void;
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

function valuesFor(unit: Unit | null | undefined): typeof EMPTY {
  if (!unit) return EMPTY;
  const str = (n: number | null) => (n === null ? '' : String(n));
  return {
    unitNumber: unit.unitNumber,
    building: unit.building ?? '',
    floor: str(unit.floor),
    bedrooms: str(unit.bedrooms),
    bathrooms: str(unit.bathrooms),
    sqft: str(unit.sqft),
    rentAmount: '',
    occupancy: unit.occupancy,
  };
}

function intOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : null;
}

export function UnitFormDialog({
  open,
  unit,
  onOpenChange,
  communityId,
  hasOwnerRole,
  showRent,
  occupancyFromLeases = false,
  onSaved,
}: UnitFormDialogProps) {
  const editing = Boolean(unit);
  const createUnit = useCreateUnit(communityId);
  const updateUnit = useUpdateUnit(communityId);
  const mutation = editing ? updateUnit : createUnit;
  // The parent keys this dialog by unit id, so initial state is per unit.
  const [values, setValues] = useState(() => valuesFor(unit));
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const occupancyChoices: UnitOccupancy[] = hasOwnerRole ? ['owner_occupied', 'rented', 'vacant'] : ['rented', 'vacant'];

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return;
    if (!next) {
      setValues(valuesFor(unit));
      createUnit.reset();
      updateUnit.reset();
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const common = {
      unitNumber: values.unitNumber.trim(),
      building: values.building.trim() || null,
      floor: intOrNull(values.floor),
      bedrooms: intOrNull(values.bedrooms),
      bathrooms: intOrNull(values.bathrooms),
      sqft: intOrNull(values.sqft),
      ...(occupancyFromLeases ? {} : { occupancy: values.occupancy }),
    };
    let savedId: number;
    try {
      if (unit) {
        // Occupancy is always sent (except for apartments, where leases decide
        // it): saving the form is the manager confirming it.
        await updateUnit.mutateAsync({ unitId: unit.id, expectedUpdatedAt: unit.updatedAt, ...common });
        savedId = unit.id;
      } else {
        savedId = (await createUnit.mutateAsync({
          communityId,
          ...common,
          ...(showRent && values.rentAmount.trim() ? { rentAmount: values.rentAmount.trim() } : {}),
        })).id;
      }
    } catch {
      return; // Rendered from mutation.error (e.g. duplicate unit number).
    }
    setValues(valuesFor(unit));
    onSaved(savedId);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{unit ? `Edit unit ${unit.unitNumber}` : 'Add a unit'}</DialogTitle>
          <DialogDescription>
            {unit ? 'Changes apply immediately for everyone.' : 'Only the unit number is required. You can fill in the rest later.'}
          </DialogDescription>
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
            {showRent && !editing ? (
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

          {occupancyFromLeases ? (
            <p className="text-xs text-content-tertiary">
              Occupancy comes from leases: a unit with a current lease is rented. Change it on the Leases page.
            </p>
          ) : (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-content">Occupancy</legend>
            {/* Native radios (visually hidden) styled as a segmented control. */}
            <div className="flex flex-wrap gap-1 rounded-md bg-surface-muted p-1">
              {[null, ...occupancyChoices].map((choice) => (
                <label key={choice ?? 'unset'} className="min-w-24 flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="dir-unit-occupancy"
                    className="peer sr-only"
                    checked={values.occupancy === choice}
                    onChange={() => setValues((prev) => ({ ...prev, occupancy: choice }))}
                  />
                  <span className="flex min-h-10 items-center justify-center rounded-sm px-3 text-sm font-medium text-content-secondary hover:text-content peer-checked:bg-surface-card peer-checked:text-content peer-checked:shadow-e1 peer-focus-visible:ring-2 peer-focus-visible:ring-focus">
                    {choice ? OCCUPANCY_LABEL[choice] : 'Not set'}
                  </span>
                </label>
              ))}
            </div>
            {unit?.occupancy && !unit.occupancyConfirmed ? (
              <p className="text-xs font-medium text-status-warning">
                Estimated from who is on file. Saving confirms it.
              </p>
            ) : null}
            <p className="text-xs text-content-tertiary">
              {hasOwnerRole
                ? 'Your call — a seasonal owner who is away can stay owner-occupied. Leave it unset if unsure.'
                : 'Leave it unset if unsure.'}
            </p>
          </fieldset>
          )}

          {showRent && editing ? (
            <p className="text-xs text-content-tertiary">Rent comes from the unit&apos;s active lease; change it there.</p>
          ) : null}

          {mutation.error ? (
            <p role="alert" className="text-sm text-status-danger">
              {mutation.error.message}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || values.unitNumber.trim() === ''}>
              {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add unit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
