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
  const [expectedArrival, setExpectedArrival] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setVisitorName('');
    setPurpose('');
    setUnitId(hostUnitId ? String(hostUnitId) : '');
    setExpectedArrival('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedUnitId = Number(unitId);
    if (!Number.isInteger(parsedUnitId) || parsedUnitId <= 0) return;
    if (!visitorName.trim()) return;
    if (!purpose.trim()) return;
    if (!expectedArrival) return;

    // Convert datetime-local to ISO with offset
    const arrival = new Date(expectedArrival).toISOString();

    await createVisitor.mutateAsync({
      visitorName: visitorName.trim(),
      purpose: purpose.trim(),
      hostUnitId: parsedUnitId,
      expectedArrival: arrival,
      notes: notes.trim() || null,
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
            <Label htmlFor="visitor-arrival">Expected Arrival</Label>
            <Input
              id="visitor-arrival"
              type="datetime-local"
              value={expectedArrival}
              onChange={(e) => setExpectedArrival(e.target.value)}
              required
            />
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
