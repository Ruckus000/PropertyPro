'use client';

/**
 * Reservation rows for the Operations hub's Reservations tab (plan B5).
 *
 * Each row names its amenity (rows used to read "Reservation #12"), says its
 * status in words, and offers Cancel on a confirmed booking that has not
 * started. The hub draws the box around the list. The list API already
 * scopes residents to their own bookings and the cancel route re-checks
 * ownership, so a row's Cancel is only ever one the viewer may use.
 */

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { RecordList } from '@propertypro/ui/components/shared/record-row';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { useCancelReservation, type ReservationListItem } from '@/hooks/use-operations';
import { formatInCommunityTimezone } from '@/lib/utils/format-date';
import { OperationsRow, operationsStatus, StatusLead } from './operations-row';

// Mounted only once a Cancel is pressed, so the Radix alert-dialog stack stays out of the tab's payload.
const ConfirmDialog = dynamic(
  () => import('@/components/pm/site-editor-v3/ConfirmDialog').then((m) => m.ConfirmDialog),
  { ssr: false },
);

interface ReservationListProps {
  communityId: number;
  communityTimezone: string;
  reservations: ReservationListItem[];
  amenityNames: ReadonlyMap<number, string>;
  /** Injected so tests can pin the clock. */
  now?: Date;
}

export function ReservationList({
  communityId,
  communityTimezone,
  reservations,
  amenityNames,
  now = new Date(),
}: ReservationListProps) {
  const [cancelling, setCancelling] = useState<ReservationListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const cancelMutation = useCancelReservation(communityId);

  const nameOf = (r: ReservationListItem) => amenityNames.get(r.amenityId) ?? 'Amenity';

  async function confirmCancel() {
    if (!cancelling) return;
    setError(null);
    try {
      await cancelMutation.mutateAsync(cancelling.id);
      setCancelling(null);
    } catch (err) {
      setCancelling(null);
      setError(err instanceof Error ? err.message : 'We couldn’t cancel that reservation. Please try again.');
    }
  }

  return (
    <>
      {error && (
        <div className="border-b border-edge p-3">
          <AlertBanner status="danger" title="Reservation not cancelled" description={error} />
        </div>
      )}
      <RecordList aria-label="Reservations">
        {reservations.map((reservation) => {
          const canCancel = reservation.status === 'confirmed' && new Date(reservation.startTime) > now;
          const status = operationsStatus(reservation.status);
          return (
            <OperationsRow
              key={reservation.id}
              lead={<StatusLead status={status} />}
              title={<h3 className="truncate text-sm font-medium text-content">{nameOf(reservation)}</h3>}
              preview={`${formatInCommunityTimezone(reservation.startTime, communityTimezone)} to ${formatInCommunityTimezone(reservation.endTime, communityTimezone)}`}
              statusWord={status.word}
              actions={
                canCancel ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Cancel ${nameOf(reservation)} reservation`}
                    onClick={(event) => {
                      cancelButton.current = event.currentTarget;
                      setCancelling(reservation);
                    }}
                  >
                    Cancel
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </RecordList>
      {cancelling && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null);
          }}
          restoreFocusTo={cancelButton}
          title={`Cancel this ${nameOf(cancelling)} reservation?`}
          description={`${formatInCommunityTimezone(cancelling.startTime, communityTimezone)} to ${formatInCommunityTimezone(cancelling.endTime, communityTimezone)}. The time opens up for others to book.`}
          confirmLabel="Cancel reservation"
          cancelLabel="Keep it"
          destructive
          pending={cancelMutation.isPending}
          onConfirm={() => void confirmCancel()}
        />
      )}
    </>
  );
}
