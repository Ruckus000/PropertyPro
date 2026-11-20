/**
 * Empty Amenities and Reservations tabs in the Operations hub (spec
 * docs/design-system/patterns/empty-states.md §3, §4.4; plan
 * docs/superpowers/plans/2026-11-20-empty-states-amenities-vendors-assessments.md B7, A8, A9).
 *
 * Section size: these are tab panels. Managers get the one action that moves
 * them forward; residents get a calm waiting state, and their one action
 * (Reserve) only when something can actually be booked. Names in the copy are
 * the community's real amenities, never examples.
 */

import { PropScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';

const MAX_NAMED = 4;

/** "Pool", "Pool and Gym", "Pool, Gym, Clubhouse and 2 more". */
export function listAmenityNames(names: string[]): string {
  const shown = names.slice(0, MAX_NAMED);
  const rest = names.length - shown.length;
  const parts = rest > 0 ? [...shown, `${rest} more`] : shown;
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(parts);
}

export function AmenitiesEmpty({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  if (isAdmin) {
    return (
      <EmptyState
        size="section"
        illustration={<PropScene size="section" prop="calendar" />}
        title="List the spaces residents can book"
        description="Add each amenity with where it is, how many people it holds and its booking limits. Residents book it from Reservations, and the limits are checked on every booking."
        action={<Button onClick={onAdd}>Add amenity</Button>}
      />
    );
  }
  return (
    <EmptyState
      size="section"
      illustration={<PropScene size="section" prop="calendar" />}
      title="Spaces you can book appear here"
      description="When your association opens an amenity for booking, you'll find it here with its booking limits."
    />
  );
}

export function ReservationsEmpty({
  isAdmin,
  amenityCount,
  bookableNames,
  onReserve,
  onAdd,
  onShowAmenities,
}: {
  isAdmin: boolean;
  /** Every amenity the viewer can see, bookable or not. */
  amenityCount: number;
  bookableNames: string[];
  onReserve: () => void;
  onAdd: () => void;
  onShowAmenities: () => void;
}) {
  const illustration = <PropScene size="section" prop="calendar" />;

  if (bookableNames.length > 0) {
    const names = listAmenityNames(bookableNames);
    return (
      <EmptyState
        size="section"
        illustration={illustration}
        title="No reservations yet"
        description={
          isAdmin
            ? `Residents can book ${names}. Reservations appear here as they're made.`
            : `You can book ${names}. Your reservations appear here.`
        }
        // The page header already holds the filled "Reserve Amenity" (one primary per region).
        action={
          <Button variant="outline" onClick={onReserve}>
            Reserve Amenity
          </Button>
        }
      />
    );
  }

  if (!isAdmin) {
    return (
      <EmptyState
        size="section"
        illustration={illustration}
        title="Nothing to book yet"
        description="When your association opens a space for booking, you'll reserve it here."
      />
    );
  }

  if (amenityCount > 0) {
    return (
      <EmptyState
        size="section"
        illustration={illustration}
        title="Nothing to book yet"
        description="None of your amenities is open for booking. Turn on Open for booking for the ones residents can reserve."
        action={<Button onClick={onShowAmenities}>View amenities</Button>}
      />
    );
  }

  return (
    <EmptyState
      size="section"
      illustration={illustration}
      title="Nothing to book yet"
      description="Add the spaces residents can book, with their booking limits, and reservations appear here."
      action={<Button onClick={onAdd}>Add amenity</Button>}
    />
  );
}
