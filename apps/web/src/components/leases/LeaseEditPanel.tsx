'use client';

import { useState, useEffect } from 'react';
import type { EnrichedLeaseListItem } from '@/hooks/use-leases';
import { useUpdateLease, useRenewalChain } from '@/hooks/use-leases';
import { formatRentDisplay, parseRentInput, formatLeaseDate } from '@/lib/utils/lease-utils';
import { AlertBanner } from '@/components/shared/alert-banner';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface LeaseEditPanelProps {
  communityId: number;
  lease: EnrichedLeaseListItem | null;
  onClose: () => void;
}

export function LeaseEditPanel({
  communityId,
  lease,
  onClose,
}: LeaseEditPanelProps) {
  const updateLease = useUpdateLease(communityId);
  const { data: renewalChain } = useRenewalChain(
    communityId,
    lease?.id ?? null,
  );

  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (lease) {
      setEndDate(lease.endDate ?? '');
      // Raw decimal from API (e.g. "1500.00") — no cents conversion needed
      setRentAmount(lease.rentAmount ?? '');
      setNotes(lease.notes ?? '');
    }
  }, [lease]);

  async function handleSave() {
    if (!lease) return;

    const parsedRent = parseRentInput(rentAmount);

    await updateLease.mutateAsync({
      id: lease.id,
      endDate: endDate || null,
      rentAmount: parsedRent,
      notes: notes.trim() || null,
    });

    onClose();
  }

  return (
    <SlideOverPanel
      open={lease !== null}
      onClose={onClose}
      title="Lease Details"
      description={lease ? `Lease #${lease.id}` : undefined}
      width="md"
    >
      {lease && (
        <div className="space-y-6">
          {updateLease.isError && (
            <AlertBanner
              status="danger"
              title="Failed to save changes. Please try again."
            />
          )}

          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unit</p>
              <p className="text-sm">{lease.unitNumber ?? `Unit ${lease.unitId}`}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Resident</p>
              <p className="text-sm">{lease.residentName ?? '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Start Date</p>
              <p className="text-sm">{formatLeaseDate(lease.startDate)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-sm capitalize">{lease.status}</p>
            </div>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-end-date">End Date</Label>
              <Input
                id="edit-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Clear for month-to-month
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-rent">Monthly Rent ($)</Label>
              <Input
                id="edit-rent"
                type="number"
                min={0}
                step={0.01}
                placeholder="1500.00"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={updateLease.isPending}>
              {updateLease.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>

          {/* Renewal chain */}
          {renewalChain && renewalChain.length > 1 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3">Renewal History</h3>
                <div className="space-y-2">
                  {renewalChain.map((chainLease) => (
                    <div
                      key={chainLease.id}
                      className="flex items-center justify-between rounded-md border p-3 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {formatLeaseDate(chainLease.startDate)}
                        </span>
                        <span className="text-muted-foreground mx-1">&rarr;</span>
                        <span>{formatLeaseDate(chainLease.endDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatRentDisplay(chainLease.rentAmount)}
                        </span>
                        <Badge
                          variant={chainLease.id === lease.id ? 'default' : 'outline'}
                          className="text-xs"
                        >
                          {chainLease.id === lease.id ? 'Current' : chainLease.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </SlideOverPanel>
  );
}
