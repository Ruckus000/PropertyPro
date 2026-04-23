/// <reference types="@testing-library/jest-dom" />
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useAmenitiesMock, useCreateReservationMock } = vi.hoisted(() => ({
  useAmenitiesMock: vi.fn(),
  useCreateReservationMock: vi.fn(),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useAmenities: useAmenitiesMock, useCreateReservation: useCreateReservationMock };
});

import { ReservationCreateSheet } from '../ReservationCreateSheet';

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useAmenitiesMock.mockReturnValue({
    data: [{ id: 9, name: 'Pool', description: null, location: null }],
    isLoading: false,
  });
  useCreateReservationMock.mockReturnValue({ mutateAsync, isPending: false });
  mutateAsync.mockResolvedValue({ data: { id: 1 } });
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('<ReservationCreateSheet>', () => {
  it('shows the Reserve Amenity drawer with amenity options', () => {
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" />,
    ));
    expect(screen.getByRole('heading', { name: /reserve amenity/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /pool/i })).toBeInTheDocument();
  });

  it('submits a reservation with amenityId, date, startTime, endTime', async () => {
    const onClose = vi.fn();
    render(wrap(
      <ReservationCreateSheet open={true} onClose={onClose} communityId={42} communityTimezone="America/New_York" />,
    ));

    fireEvent.change(screen.getByRole('combobox', { name: 'Amenity' }), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('button', { name: /reserve/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0]![0];
    expect(payload.amenityId).toBe(9);
    expect(payload.startTime).toMatch(/^2026-05-01T14:00:00/);
    expect(payload.endTime).toMatch(/^2026-05-01T15:00:00/);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
