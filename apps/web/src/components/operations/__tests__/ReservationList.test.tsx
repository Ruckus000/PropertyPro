/// <reference types="@testing-library/jest-dom" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationListItem } from '@/hooks/use-operations';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useCancelReservation: () => ({ mutateAsync, isPending: false }) };
});

import { ReservationList } from '../ReservationList';
import { listAmenityNames } from '../amenities-empty';

const NOW = new Date('2026-06-01T12:00:00Z');

function reservation(overrides: Partial<ReservationListItem>): ReservationListItem {
  return {
    id: 1,
    amenityId: 9,
    unitId: null,
    status: 'confirmed',
    startTime: '2026-06-02T14:00:00.000Z',
    endTime: '2026-06-02T15:00:00.000Z',
    notes: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(rows: ReservationListItem[]) {
  return render(
    <ReservationList
      communityId={42}
      communityTimezone="America/New_York"
      reservations={rows}
      amenityNames={new Map([[9, 'Pool'], [10, 'Gym']])}
      now={NOW}
    />,
  );
}

describe('<ReservationList>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ id: 1, status: 'cancelled' });
  });

  it('offers Cancel only on confirmed bookings that have not started', () => {
    renderList([
      reservation({ id: 1, amenityId: 9 }),
      reservation({ id: 2, amenityId: 10, startTime: '2026-05-30T14:00:00.000Z', endTime: '2026-05-30T15:00:00.000Z' }),
      reservation({ id: 3, amenityId: 10, status: 'cancelled' }),
    ]);
    expect(screen.getByRole('button', { name: 'Cancel Pool reservation' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Cancel Gym reservation' })).toHaveLength(0);
  });

  it('cancels only after the viewer confirms', async () => {
    renderList([reservation({ id: 7 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Pool reservation' }));
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(7));
  });

  it('keeps the booking when the viewer backs out', async () => {
    renderList([reservation({ id: 7 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Pool reservation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('says so when the cancel fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('You can only cancel your own reservations'));
    renderList([reservation({ id: 7 })]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Pool reservation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    expect(await screen.findByText('You can only cancel your own reservations')).toBeInTheDocument();
  });
});

describe('listAmenityNames', () => {
  it('lists real names, capping the count', () => {
    expect(listAmenityNames(['Pool'])).toBe('Pool');
    expect(listAmenityNames(['Pool', 'Gym'])).toBe('Pool and Gym');
    expect(listAmenityNames(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D, and 2 more');
  });
});
