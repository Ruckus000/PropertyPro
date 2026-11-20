'use client';

/**
 * The Amenities tab of the Operations hub (plan B1): what can be booked, with
 * the limits the server enforces (lib/amenities/booking-rules.ts). Managers see
 * every amenity and can edit it; residents see only those open for booking.
 * The hub filters the list and owns the sheets; this only renders.
 */

import { CalendarCheck, CalendarX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AmenityListItem } from '@/hooks/use-operations';
import { describeBookingRules } from '@/lib/amenities/booking-rules';

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
    <ul className="space-y-3" aria-label="Amenities">
      {amenities.map((amenity) => {
        const rules = describeBookingRules(amenity.bookingRules ?? {});
        const meta = facts(amenity);
        return (
          <li key={amenity.id} className="rounded-md border border-edge bg-surface-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold text-content">{amenity.name}</h3>
                {meta.length > 0 && <p className="text-sm text-content-secondary">{meta.join(' · ')}</p>}
                {isAdmin && (
                  <p className="inline-flex items-center gap-1 text-xs text-content-secondary">
                    {amenity.isBookable ? (
                      <CalendarCheck aria-hidden="true" className="size-4" />
                    ) : (
                      <CalendarX aria-hidden="true" className="size-4" />
                    )}
                    {amenity.isBookable ? 'Open for booking' : 'Not open for booking'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => onEdit(amenity.id)} aria-label={`Edit ${amenity.name}`}>
                    Edit
                  </Button>
                )}
                {amenity.isBookable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReserve(amenity.id)}
                    aria-label={`Reserve ${amenity.name}`}
                  >
                    Reserve
                  </Button>
                )}
              </div>
            </div>
            {amenity.description && (
              <p className="mt-2 max-w-[75ch] text-sm text-content-secondary">{amenity.description}</p>
            )}
            {rules.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Booking limits for ${amenity.name}`}>
                {rules.map((rule) => (
                  <li
                    key={rule}
                    className="inline-flex min-h-6 items-center rounded-full border border-edge px-2 text-xs text-content-secondary"
                  >
                    {rule}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
