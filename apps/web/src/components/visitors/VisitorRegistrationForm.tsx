'use client';

import { useState } from 'react';
import { useCreateVisitor } from '@/hooks/use-visitors';
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

interface VisitorRegistrationFormProps {
  communityId: number;
  /** When provided, locks the form to this unit (resident self-registration). */
  hostUnitId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PURPOSE_SUGGESTIONS = [
  'Guest',
  'Delivery',
  'Contractor',
  'Realtor',
  'Family',
  'Interview',
] as const;

export function VisitorRegistrationForm({
  communityId,
  hostUnitId,
  open,
  onOpenChange,
}: VisitorRegistrationFormProps) {
  const createVisitor = useCreateVisitor(communityId);

  const [visitorName, setVisitorName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [unitId, setUnitId] = useState(hostUnitId ? String(hostUnitId) : '');
  const [guestType, setGuestType] = useState<'one_time' | 'recurring' | 'vendor' | 'permanent'>('one_time');
  const [expectedArrival, setExpectedArrival] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState('weekdays');
  const [expectedDurationMinutes, setExpectedDurationMinutes] = useState('60');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setVisitorName('');
    setPurpose('');
    setUnitId(hostUnitId ? String(hostUnitId) : '');
    setGuestType('one_time');
    setExpectedArrival('');
    setValidFrom('');
    setValidUntil('');
    setRecurrenceRule('weekdays');
    setExpectedDurationMinutes('60');
    setVehicleOpen(false);
    setVehicleMake('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedUnitId = Number(unitId);
    if (!Number.isInteger(parsedUnitId) || parsedUnitId <= 0) return;
    if (!visitorName.trim()) return;
    if (!purpose.trim()) return;
    if (guestType === 'one_time' && !expectedArrival) return;
    if (guestType !== 'one_time' && !validFrom) return;

    await createVisitor.mutateAsync({
      visitorName: visitorName.trim(),
      purpose: purpose.trim(),
      hostUnitId: parsedUnitId,
      expectedArrival: expectedArrival ? new Date(expectedArrival).toISOString() : undefined,
      notes: notes.trim() || null,
      guestType,
      validFrom: validFrom ? new Date(validFrom).toISOString() : null,
      validUntil: validUntil ? new Date(validUntil).toISOString() : null,
      recurrenceRule: guestType === 'recurring' ? recurrenceRule : null,
      expectedDurationMinutes:
        guestType === 'permanent'
          ? null
          : expectedDurationMinutes
            ? Number(expectedDurationMinutes)
            : null,
      vehicleMake: vehicleMake.trim() || null,
      vehicleModel: vehicleModel.trim() || null,
      vehicleColor: vehicleColor.trim() || null,
      vehiclePlate: vehiclePlate.trim() || null,
    });

    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Register Visitor</DialogTitle>
          <DialogDescription>
            Create a visitor pass. A passcode will be auto-generated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Guest Type</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['one_time', 'One-Time'],
                ['recurring', 'Recurring'],
                ['vendor', 'Vendor'],
                ['permanent', 'Permanent'],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={guestType === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setGuestType(value as typeof guestType)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitor-name">Visitor Name</Label>
            <Input
              id="visitor-name"
              placeholder="John Doe"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitor-purpose">Purpose</Label>
            <Input
              id="visitor-purpose"
              placeholder="e.g. Guest, Delivery, Contractor"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              list="purpose-suggestions"
              required
            />
            <datalist id="purpose-suggestions">
              {PURPOSE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitor-unit">Host Unit</Label>
            <Input
              id="visitor-unit"
              type="number"
              min={1}
              placeholder="e.g. 101"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={hostUnitId !== undefined}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitor-arrival">
              {guestType === 'one_time' ? 'Expected Arrival' : 'Valid From'}
            </Label>
            <Input
              id="visitor-arrival"
              type="datetime-local"
              value={guestType === 'one_time' ? expectedArrival : validFrom}
              onChange={(e) =>
                guestType === 'one_time'
                  ? setExpectedArrival(e.target.value)
                  : setValidFrom(e.target.value)
              }
              required
            />
          </div>

          {guestType !== 'one_time' ? (
            <div className="space-y-2">
              <Label htmlFor="visitor-valid-until">Valid Until</Label>
              <Input
                id="visitor-valid-until"
                type="datetime-local"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required={guestType !== 'permanent'}
                disabled={guestType === 'permanent'}
              />
            </div>
          ) : null}

          {guestType === 'recurring' ? (
            <div className="space-y-2">
              <Label>Recurrence Rule</Label>
              <Select value={recurrenceRule} onValueChange={setRecurrenceRule}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recurrence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekdays">Weekdays</SelectItem>
                  <SelectItem value="weekends">Weekends</SelectItem>
                  <SelectItem value="mon_wed_fri">Mon / Wed / Fri</SelectItem>
                  <SelectItem value="tue_thu">Tue / Thu</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {guestType !== 'permanent' ? (
            <div className="space-y-2">
              <Label>Expected Duration</Label>
              <Select value={expectedDurationMinutes} onValueChange={setExpectedDurationMinutes}>
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="240">4 hours</SelectItem>
                  <SelectItem value="480">8 hours</SelectItem>
                  <SelectItem value="720">12 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="rounded-lg border border-edge p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Vehicle Information</p>
                <p className="text-xs text-muted-foreground">
                  Add vehicle details for faster gate validation.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVehicleOpen((current) => !current)}
              >
                {vehicleOpen ? 'Hide' : 'Add Vehicle'}
              </Button>
            </div>

            {vehicleOpen ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="vehicle-make">Make</Label>
                  <Input
                    id="vehicle-make"
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-model">Model</Label>
                  <Input
                    id="vehicle-model"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-color">Color</Label>
                  <Input
                    id="vehicle-color"
                    value={vehicleColor}
                    onChange={(e) => setVehicleColor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vehicle-plate">Plate</Label>
                  <Input
                    id="vehicle-plate"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="visitor-notes">Notes</Label>
            <Textarea
              id="visitor-notes"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createVisitor.isPending}>
              {createVisitor.isPending ? 'Registering...' : 'Register Visitor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
