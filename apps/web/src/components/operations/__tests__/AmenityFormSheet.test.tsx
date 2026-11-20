/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Radix Switch measures itself with ResizeObserver, which jsdom lacks.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useSaveAmenity: () => ({ mutateAsync, isPending: false }) };
});

import { AmenityFormSheet, buildAmenityInput } from '../AmenityFormSheet';

const BLANK = {
  name: 'Pool',
  location: '',
  capacity: '',
  description: '',
  isBookable: true,
  shortestHours: '',
  longestHours: '',
  advanceDays: '',
  blackoutDates: [] as string[],
};

describe('buildAmenityInput', () => {
  it('turns hours into the minutes the API stores, and blanks into no rule', () => {
    expect(buildAmenityInput({ ...BLANK, shortestHours: '0.5', longestHours: '2.25', advanceDays: '14' })).toEqual({
      input: {
        name: 'Pool',
        location: null,
        capacity: null,
        description: null,
        isBookable: true,
        bookingRules: { minDurationMinutes: 30, maxDurationMinutes: 135, advanceBookingDays: 14 },
      },
    });
    expect(buildAmenityInput(BLANK)).toMatchObject({ input: { bookingRules: {} } });
  });

  it('refuses a shortest booking longer than the longest', () => {
    expect(buildAmenityInput({ ...BLANK, shortestHours: '3', longestHours: '2' })).toEqual({
      error: 'The shortest booking cannot be longer than the longest.',
    });
  });

  it('refuses a blank name, a fractional capacity and fractional days', () => {
    expect(buildAmenityInput({ ...BLANK, name: '  ' })).toEqual({ error: 'Name is required.' });
    expect(buildAmenityInput({ ...BLANK, capacity: '2.5' })).toEqual({
      error: 'Capacity must be a whole number of people.',
    });
    expect(buildAmenityInput({ ...BLANK, advanceDays: '1.5' })).toEqual({ error: 'Days ahead must be a whole number.' });
  });

  it('sorts blackout dates', () => {
    expect(buildAmenityInput({ ...BLANK, blackoutDates: ['2026-12-25', '2026-07-04'] })).toMatchObject({
      input: { bookingRules: { blackoutDates: ['2026-07-04', '2026-12-25'] } },
    });
  });
});

describe('<AmenityFormSheet>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ id: 1 });
  });

  it('adds an amenity with its limits and closed dates', async () => {
    const onClose = vi.fn();
    render(<AmenityFormSheet open onClose={onClose} communityId={42} />);

    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Clubhouse' } });
    fireEvent.change(screen.getByLabelText('Longest booking (hours)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Closed on'), { target: { value: '2026-12-25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add date' }));
    expect(screen.getByRole('button', { name: 'Remove December 25, 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add amenity' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      amenityId: undefined,
      input: {
        name: 'Clubhouse',
        location: null,
        capacity: null,
        description: null,
        isBookable: true,
        bookingRules: { maxDurationMinutes: 240, blackoutDates: ['2026-12-25'] },
      },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('edits an amenity from its saved values and can clear every limit', async () => {
    render(
      <AmenityFormSheet
        open
        onClose={vi.fn()}
        communityId={42}
        amenity={{
          id: 9,
          name: 'Pool',
          description: 'Heated',
          location: 'Building A',
          capacity: 40,
          isBookable: true,
          bookingRules: { minDurationMinutes: 90 },
        }}
      />,
    );
    expect(screen.getByLabelText('Shortest booking (hours)')).toHaveValue(1.5);
    fireEvent.change(screen.getByLabelText('Shortest booking (hours)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ amenityId: 9, input: { bookingRules: {}, capacity: 40 } });
  });

  it('shows the problem and does not save when the limits contradict', async () => {
    render(<AmenityFormSheet open onClose={vi.fn()} communityId={42} />);
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Gym' } });
    fireEvent.change(screen.getByLabelText('Shortest booking (hours)'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Longest booking (hours)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add amenity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The shortest booking cannot be longer than the longest.');
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
