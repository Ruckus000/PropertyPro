'use client';

/**
 * Add or edit an amenity (plan B2). Every field is one the existing
 * POST /api/v1/amenities and PATCH /api/v1/amenities/[id] accept; booking
 * limits are entered in hours and days and stored as the API's minutes and
 * days. The server enforces them on every booking (lib/amenities/booking-rules.ts)
 * and refuses a shortest booking longer than the longest, as this form does.
 */

import { useId, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useSaveAmenity, type AmenityInput, type AmenityListItem } from '@/hooks/use-operations';
import { formatCalendarDate, type BookingRules } from '@/lib/amenities/booking-rules';

interface AmenityFormSheetProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
  /** The amenity to edit; omit to add one. */
  amenity?: AmenityListItem;
}

const hoursFrom = (minutes: number | undefined) => (minutes === undefined ? '' : String(minutes / 60));

/** Parse an optional positive number field; `undefined` when blank, `null` when invalid. */
function optionalPositive(raw: string): number | undefined | null {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The API payload, or the first problem to show. Exported for direct tests. */
export function buildAmenityInput(fields: {
  name: string;
  location: string;
  capacity: string;
  description: string;
  isBookable: boolean;
  shortestHours: string;
  longestHours: string;
  advanceDays: string;
  blackoutDates: string[];
}): { input: AmenityInput } | { error: string } {
  const name = fields.name.trim();
  if (!name) return { error: 'Name is required.' };

  const capacity = optionalPositive(fields.capacity);
  if (capacity === null || (capacity !== undefined && !Number.isInteger(capacity))) {
    return { error: 'Capacity must be a whole number of people.' };
  }
  const shortest = optionalPositive(fields.shortestHours);
  const longest = optionalPositive(fields.longestHours);
  if (shortest === null || longest === null) return { error: 'Booking lengths must be more than 0 hours.' };
  const minMinutes = shortest === undefined ? undefined : Math.round(shortest * 60);
  const maxMinutes = longest === undefined ? undefined : Math.round(longest * 60);
  if (minMinutes === 0 || maxMinutes === 0) return { error: 'Booking lengths must be at least 1 minute.' };
  if (minMinutes !== undefined && maxMinutes !== undefined && minMinutes > maxMinutes) {
    return { error: 'The shortest booking cannot be longer than the longest.' };
  }
  const days = optionalPositive(fields.advanceDays);
  if (days === null || (days !== undefined && !Number.isInteger(days))) {
    return { error: 'Days ahead must be a whole number.' };
  }

  const bookingRules: BookingRules = {};
  if (minMinutes !== undefined) bookingRules.minDurationMinutes = minMinutes;
  if (maxMinutes !== undefined) bookingRules.maxDurationMinutes = maxMinutes;
  if (days !== undefined) bookingRules.advanceBookingDays = days;
  if (fields.blackoutDates.length > 0) bookingRules.blackoutDates = [...fields.blackoutDates].sort();

  return {
    input: {
      name,
      location: fields.location.trim() || null,
      capacity: capacity ?? null,
      description: fields.description.trim() || null,
      isBookable: fields.isBookable,
      bookingRules,
    },
  };
}

export function AmenityFormSheet({ open, onClose, communityId, amenity }: AmenityFormSheetProps) {
  const id = useId();
  const rules = amenity?.bookingRules ?? {};
  const [name, setName] = useState(amenity?.name ?? '');
  const [location, setLocation] = useState(amenity?.location ?? '');
  const [capacity, setCapacity] = useState(amenity?.capacity ? String(amenity.capacity) : '');
  const [description, setDescription] = useState(amenity?.description ?? '');
  const [isBookable, setIsBookable] = useState(amenity?.isBookable ?? true);
  const [shortestHours, setShortestHours] = useState(hoursFrom(rules.minDurationMinutes));
  const [longestHours, setLongestHours] = useState(hoursFrom(rules.maxDurationMinutes));
  const [advanceDays, setAdvanceDays] = useState(rules.advanceBookingDays ? String(rules.advanceBookingDays) : '');
  const [blackoutDates, setBlackoutDates] = useState<string[]>(rules.blackoutDates ?? []);
  const [blackoutDraft, setBlackoutDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveAmenity(communityId);

  function addBlackout() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blackoutDraft)) return;
    setBlackoutDates((dates) => (dates.includes(blackoutDraft) ? dates : [...dates, blackoutDraft].sort()));
    setBlackoutDraft('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // A date picked but not yet added still counts: saving must not silently drop a closure.
    const pending = /^\d{4}-\d{2}-\d{2}$/.test(blackoutDraft) && !blackoutDates.includes(blackoutDraft);
    const built = buildAmenityInput({
      name,
      location,
      capacity,
      description,
      isBookable,
      shortestHours,
      longestHours,
      advanceDays,
      blackoutDates: pending ? [...blackoutDates, blackoutDraft] : blackoutDates,
    });
    if ('error' in built) {
      setError(built.error);
      return;
    }
    try {
      await save.mutateAsync({ amenityId: amenity?.id, input: built.input });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We couldn’t save this amenity. Please try again.');
    }
  }

  const field = (suffix: string) => `${id}-${suffix}`;

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={amenity ? `Edit ${amenity.name}` : 'Add amenity'}
      description="Residents see the name, location, capacity, description and booking limits."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6" noValidate>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={field('name')}>Name *</Label>
            <Input id={field('name')} value={name} maxLength={240} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={field('location')}>Location</Label>
              <Input
                id={field('location')}
                value={location}
                maxLength={240}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={field('capacity')}>Capacity (people)</Label>
              <Input
                id={field('capacity')}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={field('description')}>Description</Label>
            <Textarea
              id={field('description')}
              value={description}
              maxLength={5000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor={field('bookable')}>Open for booking</Label>
              <p className="text-sm text-content-secondary">When off, residents can&apos;t book it. Past bookings stay.</p>
            </div>
            <Switch id={field('bookable')} checked={isBookable} onCheckedChange={setIsBookable} />
          </div>
        </div>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-content">Booking limits</legend>
          <p className="text-sm text-content-secondary">Leave a limit blank for none. Every booking is checked against them.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={field('shortest')}>Shortest booking (hours)</Label>
              <Input
                id={field('shortest')}
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={shortestHours}
                onChange={(e) => setShortestHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={field('longest')}>Longest booking (hours)</Label>
              <Input
                id={field('longest')}
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={longestHours}
                onChange={(e) => setLongestHours(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={field('advance')}>Book up to (days ahead)</Label>
            <Input
              id={field('advance')}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={advanceDays}
              onChange={(e) => setAdvanceDays(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={field('blackout')}>Closed on</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id={field('blackout')}
                type="date"
                className="w-auto md:w-auto"
                value={blackoutDraft}
                onChange={(e) => setBlackoutDraft(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addBlackout} disabled={!blackoutDraft}>
                Add date
              </Button>
            </div>
            {blackoutDates.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Closed dates">
                {blackoutDates.map((date) => (
                  <li
                    key={date}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border border-edge pl-3 pr-1 text-sm text-content"
                  >
                    {formatCalendarDate(date)}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${formatCalendarDate(date)}`}
                      onClick={() => setBlackoutDates((dates) => dates.filter((d) => d !== date))}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </fieldset>

        {error && (
          <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : amenity ? 'Save changes' : 'Add amenity'}
          </Button>
        </div>
      </form>
    </SlideOverPanel>
  );
}
