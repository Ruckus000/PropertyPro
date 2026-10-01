'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdatePastDueRule } from '@/hooks/use-past-due-rule';
import { isPastDue, plural, type DelinquencyRow, type PastDueRule } from './directory-model';

/**
 * Edit the community's past-due rule with a live preview of how many units it
 * flags. Opened only for finance viewers; the API (finance admin write) decides
 * who may save.
 */
export function PastDueRuleDialog({
  open,
  onOpenChange,
  communityId,
  rule,
  delinquency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number;
  rule: PastDueRule;
  delinquency: readonly DelinquencyRow[];
  onSaved: () => void;
}) {
  const update = useUpdatePastDueRule(communityId);
  const [dollars, setDollars] = useState(String(rule.minCents / 100));
  const [days, setDays] = useState(String(rule.minDays));

  const draft: PastDueRule | null = (() => {
    const d = Number(dollars);
    const n = Number(days);
    if (!Number.isFinite(d) || d < 0 || !Number.isInteger(n) || n < 0) return null;
    return { minCents: Math.round(d * 100), minDays: n };
  })();
  const flagged = draft
    ? delinquency.filter(
        (row) =>
          row.overdueAmountCents > 0 &&
          isPastDue({ amountCents: row.overdueAmountCents, daysOverdue: row.daysOverdue }, draft),
      ).length
    : null;

  function handleOpenChange(next: boolean) {
    if (update.isPending) return;
    if (next) {
      setDollars(String(rule.minCents / 100));
      setDays(String(rule.minDays));
      update.reset();
    }
    onOpenChange(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    try {
      await update.mutateAsync(draft);
    } catch {
      return; // Rendered from update.error.
    }
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Past-due rule</DialogTitle>
          <DialogDescription>
            A unit is flagged past due when its overdue balance is over the amount and its oldest unpaid charge is
            more than the number of days late.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="past-due-amount">Balance over ($)</Label>
              <Input
                id="past-due-amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={dollars}
                onChange={(e) => setDollars(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="past-due-days">More than (days late)</Label>
              <Input
                id="past-due-days"
                type="number"
                min={0}
                step={1}
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            </div>
          </div>
          <p role="status" className="text-sm text-content-secondary">
            {flagged === null ? 'Enter a non-negative amount and a whole number of days.' : `${plural(flagged, 'unit')} would be flagged.`}
          </p>
          {update.error ? (
            <p role="alert" className="text-sm text-status-danger">
              {update.error.message}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || draft === null}>
              {update.isPending ? 'Saving…' : 'Save rule'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
