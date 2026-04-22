'use client';

import { useState, type FormEvent } from 'react';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { useAmenities, useCreateReservation } from '@/hooks/use-operations';

interface ReservationCreateSheetProps {
  open: boolean;
  onClose: () => void;
  communityId: number;
  communityTimezone: string;
}

/**
 * Returns an ISO-8601 datetime string with offset, interpreting the input
 * date+time as being in the given IANA timezone. Uses Intl to resolve the
 * offset at the target instant (handles DST correctly).
 */
function toZonedIsoString(date: string, time: string, timezone: string): string {
  const naive = `${date}T${time}:00`;
  const naiveDate = new Date(naive);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(naiveDate);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00';
  const match = offsetPart.match(/GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/);
  if (!match) return `${naive}+00:00`;
  const sign = match[1] ?? '+';
  const hh = match[2] ? match[2].padStart(2, '0') : '00';
  const mm = match[3] ?? '00';
  return `${naive}${sign}${hh}:${mm}`;
}

export function ReservationCreateSheet({
  open,
  onClose,
  communityId,
  communityTimezone,
}: ReservationCreateSheetProps) {
  const [amenityId, setAmenityId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [unitId, setUnitId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amenitiesQuery = useAmenities(communityId);
  const createMutation = useCreateReservation(communityId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amenityId || !date || !startTime || !endTime) {
      setError('Amenity, date, start time, and end time are required.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        amenityId: Number(amenityId),
        unitId: unitId ? Number(unitId) : null,
        startTime: toZonedIsoString(date, startTime, communityTimezone),
        endTime: toZonedIsoString(date, endTime, communityTimezone),
        notes: notes.trim() || null,
      });
      setAmenityId(''); setDate(''); setStartTime(''); setEndTime('');
      setUnitId(''); setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reservation');
    }
  }

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Reserve Amenity"
      description="Book a community amenity for a time slot."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="res-amenity" className="block text-sm font-medium text-content-secondary">Amenity</label>
          <select
            id="res-amenity"
            value={amenityId}
            onChange={(e) => setAmenityId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          >
            <option value="">(Select an amenity)</option>
            {amenitiesQuery.data?.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="res-date" className="block text-sm font-medium text-content-secondary">Date</label>
          <input
            id="res-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="res-start" className="block text-sm font-medium text-content-secondary">Start time</label>
            <input
              id="res-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="res-end" className="block text-sm font-medium text-content-secondary">End time</label>
            <input
              id="res-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="res-unit" className="block text-sm font-medium text-content-secondary">Unit ID (optional)</label>
          <input
            id="res-unit"
            type="number"
            min={1}
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="res-notes" className="block text-sm font-medium text-content-secondary">Notes</label>
          <textarea
            id="res-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Reserving\u2026' : 'Reserve'}
        </button>
      </form>
    </SlideOverPanel>
  );
}
