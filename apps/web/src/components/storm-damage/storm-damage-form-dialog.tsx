'use client';

import * as React from 'react';
import { toast } from 'sonner';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCreateStormDamageReport } from '@/hooks/use-storm-damage';
import {
  STORM_DAMAGE_DESCRIPTION_HINT,
  STORM_DAMAGE_DISCLAIMER,
  STORM_DAMAGE_SUBMITTED_CONFIRMATION,
} from '@/lib/constants/storm-disclaimers';
import {
  STORM_DAMAGE_CATEGORY_LABELS,
  STORM_DAMAGE_SEVERITY_LABELS,
  type StormDamageCategory,
  type StormDamageSeverity,
} from './types';

interface Props {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = Object.keys(STORM_DAMAGE_CATEGORY_LABELS) as StormDamageCategory[];
const SEVERITIES = Object.keys(STORM_DAMAGE_SEVERITY_LABELS) as StormDamageSeverity[];

export function StormDamageFormDialog({ communityId, open, onOpenChange }: Props) {
  const create = useCreateStormDamageReport(communityId);

  const [locationLabel, setLocationLabel] = React.useState('');
  const [category, setCategory] = React.useState<StormDamageCategory>('roof');
  const [severity, setSeverity] = React.useState<StormDamageSeverity>('moderate');
  const [occurredAt, setOccurredAt] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setLocationLabel('');
    setCategory('roof');
    setSeverity('moderate');
    setOccurredAt('');
    setDescription('');
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!locationLabel.trim() || !description.trim()) {
      setError('Add where the damage is and a short description.');
      return;
    }
    try {
      await create.mutateAsync({
        locationLabel: locationLabel.trim(),
        category,
        severity,
        // A date input yields YYYY-MM-DD; send it as a UTC datetime so the
        // contract's ISO-8601 validation passes.
        occurredAt: occurredAt ? new Date(`${occurredAt}T00:00:00Z`).toISOString() : null,
        description: description.trim(),
      });
      toast.success(STORM_DAMAGE_SUBMITTED_CONFIRMATION);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'We couldn’t save this report. Please try again.',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" resizable>
        <DialogHeader>
          <DialogTitle>Report storm damage</DialogTitle>
          <DialogDescription>{STORM_DAMAGE_DISCLAIMER}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <AlertBanner status="danger" title={error} />}

          <div className="space-y-2">
            <Label htmlFor="storm-location">Location *</Label>
            <Input
              id="storm-location"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              maxLength={300}
              placeholder="e.g. Building B — 3rd floor hallway, North pool deck"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="storm-category">Type of damage *</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as StormDamageCategory)}>
                <SelectTrigger id="storm-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {STORM_DAMAGE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="storm-severity">Severity *</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as StormDamageSeverity)}>
                <SelectTrigger id="storm-severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STORM_DAMAGE_SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="storm-occurred">When did it happen? (optional)</Label>
            <Input
              id="storm-occurred"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storm-description">Description *</Label>
            <Textarea
              id="storm-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="What did you see, and where?"
            />
            <p className="text-xs text-content-tertiary">{STORM_DAMAGE_DESCRIPTION_HINT}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Report Damage'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
