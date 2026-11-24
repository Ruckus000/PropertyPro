'use client';

/**
 * The Amenities tab of the Operations hub (plan B1): what can be booked, with
 * the limits the server enforces (lib/amenities/booking-rules.ts). Managers see
 * every amenity, and its name opens the edit form; residents see only those
 * open for booking, with the name as plain text. Reserve stays a row button.
 * The hub filters the list, draws the box around it and owns the sheets; this
 * only renders the rows.
 */

import { RecordList } from '@propertypro/ui/components/shared/record-row';
import { Button } from '@/components/ui/button';
import type { AmenityListItem } from '@/hooks/use-operations';
import { describeBookingRules } from '@/lib/amenities/booking-rules';
import { OperationsRow, StatusLead } from './operations-row';

interface AmenityListProps {
  amenities: AmenityListItem[];
  isAdmin: boolean;
  onEdit: (amenityId: number) => void;
  onReserve: (amenityId: number) => void;
}

function facts(amenity: AmenityListItem): string[] {
  const out: string[] = [];
  if (amenity.location) out.push(amenity.location);
  if (amenity.capacity) out.push(`Up to ${amenity.capacity} ${amenity.capacity === 1 ? 'person' : 'people'}`);
  return out;
}

export function AmenityList({ amenities, isAdmin, onEdit, onReserve }: AmenityListProps) {
  return (
    <RecordList aria-label="Amenities">
      {amenities.map((amenity) => {
        const rules = describeBookingRules(amenity.bookingRules ?? {});
        // Only managers see amenities that are closed for booking, so only they need the word.
        const status = isAdmin
          ? amenity.isBookable
            ? ({ kind: 'done', word: 'Open for booking' } as const)
            : ({ kind: 'not-started', word: 'Not open for booking' } as const)
          : null;
        return (
          <OperationsRow
            key={amenity.id}
            lead={status ? <StatusLead status={status} /> : null}
            title={
              <h3 className="truncate text-sm font-medium text-content">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onEdit(amenity.id)}
                    className="inline-block min-h-6 max-w-full truncate rounded-xs text-left align-top underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    {amenity.name}
                  </button>
                ) : (
                  amenity.name
                )}
              </h3>
            }
            statusWord={status?.word}
            meta={facts(amenity)}
            actions={
              amenity.isBookable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReserve(amenity.id)}
                  aria-label={`Reserve ${amenity.name}`}
                >
                  Reserve
                </Button>
              ) : undefined
            }
          >
            {amenity.description ? (
              <p className="mt-1 max-w-prose text-sm text-content-secondary">{amenity.description}</p>
            ) : null}
            {rules.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Booking limits for ${amenity.name}`}>
                {rules.map((rule) => (
                  <li
                    key={rule}
                    className="inline-flex min-h-6 items-center rounded-full border border-edge px-2 text-xs text-content-secondary"
                  >
                    {rule}
                  </li>
                ))}
              </ul>
            ) : null}
          </OperationsRow>
        );
      })}
    </RecordList>
  );
}
