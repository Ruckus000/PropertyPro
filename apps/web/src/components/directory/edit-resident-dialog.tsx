'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateResident } from '@/hooks/use-residents-management';
import { useUpdateOccupant } from '@/hooks/use-occupants';
import type { DirectoryResidentRow } from './directory-model';

/**
 * Edit a resident's name, phone, owner/tenant and unit. "Move to another unit"
 * is this same form — the unit field is the move. A member's email is their
 * sign-in and the API does not change it, so it is shown, not edited; a
 * household member's email is contact-only and is editable.
 */
export function EditResidentDialog({
  open,
  onOpenChange,
  communityId,
  resident,
  hasOwnerRole,
  unitOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  resident: DirectoryResidentRow;
  hasOwnerRole: boolean;
  unitOptions: readonly { id: number; label: string }[];
  onSaved: (moved: boolean) => void;
}) {
  // Household members (no login) save through /api/v1/occupants; their email
  // is contact-only, so unlike a member's sign-in email it can be edited.
  const household = resident.occupantId !== undefined;
  const updateMember = useUpdateResident(communityId);
  const updateHousehold = useUpdateOccupant(communityId);
  const update = household ? updateHousehold : updateMember;
  // Keyed by userId in the parent, so initial state is per resident.
  const [fullName, setFullName] = useState(resident.fullName ?? '');
  const [email, setEmail] = useState(resident.email ?? '');
  const [phone, setPhone] = useState(resident.phone ?? '');
  const [isUnitOwner, setIsUnitOwner] = useState(household ? resident.ownerHousehold === true : resident.isUnitOwner);
  const [unitId, setUnitId] = useState(resident.unitId === null ? '' : String(resident.unitId));

  function handleOpenChange(next: boolean) {
    if (update.isPending) return;
    if (!next) update.reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nextUnitId = Number(unitId);
    const nextName = fullName.trim();
    const nextPhone = phone.trim() || null;
    // Only what changed: an unchanged unit is not a move, and the server
    // audits exactly the fields it is sent.
    const nextEmail = email.trim() || null;
    const changes = {
      ...(nextName !== (resident.fullName ?? '') ? { fullName: nextName } : {}),
      ...(nextPhone !== (resident.phone ?? null) ? { phone: nextPhone } : {}),
      ...(nextUnitId !== resident.unitId ? { unitId: nextUnitId } : {}),
      ...(household
        ? {
            ...(nextEmail !== (resident.email ?? null) ? { email: nextEmail } : {}),
            ...(hasOwnerRole && isUnitOwner !== (resident.ownerHousehold === true) ? { isOwnerHousehold: isUnitOwner } : {}),
          }
        : hasOwnerRole && isUnitOwner !== resident.isUnitOwner
          ? { isUnitOwner }
          : {}),
    };
    if (Object.keys(changes).length === 0) {
      onSaved(false);
      return;
    }
    try {
      if (household) {
        await updateHousehold.mutateAsync({ id: resident.occupantId!, expectedUpdatedAt: resident.updatedAt, ...changes });
      } else {
        await updateMember.mutateAsync({ userId: resident.userId, expectedUpdatedAt: resident.updatedAt, ...changes });
      }
    } catch {
      return; // Rendered from update.error (a 409 also refreshes the list).
    }
    onSaved(nextUnitId !== resident.unitId);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Edit {resident.displayName}</DialogTitle>
          <DialogDescription>Change their details, or pick another unit to move them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-resident-name">
              Full name <span className="text-status-danger">*</span>
            </Label>
            <Input id="edit-resident-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-resident-email">Email</Label>
            {household ? (
              <Input id="edit-resident-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            ) : (
              <>
                <Input id="edit-resident-email" value={resident.email ?? ''} readOnly disabled aria-describedby="edit-resident-email-note" />
                <p id="edit-resident-email-note" className="text-xs text-content-tertiary">
                  Their email is how they sign in, so it can&apos;t be changed here.
                </p>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-resident-phone">Phone</Label>
            <Input id="edit-resident-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {hasOwnerRole ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-content">Type</legend>
              <div className="flex gap-4">
                {[
                  { label: household ? "Owner's household" : 'Owner', value: true },
                  { label: household ? "Tenant's household" : 'Tenant', value: false },
                ].map((opt) => (
                  <label key={opt.label} className="flex min-h-10 items-center gap-2 text-sm text-content">
                    <input
                      type="radio"
                      name="edit-resident-type"
                      checked={isUnitOwner === opt.value}
                      onChange={() => setIsUnitOwner(opt.value)}
                      className="h-4 w-4 accent-interactive"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="edit-resident-unit">
              Unit <span className="text-status-danger">*</span>
            </Label>
            <select
              id="edit-resident-unit"
              required
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-edge bg-surface-card px-3 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <option value="" disabled>
                Choose a unit
              </option>
              {unitOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          {update.error ? (
            <p role="alert" className="text-sm text-status-danger">
              {update.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || fullName.trim() === '' || unitId === ''}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
