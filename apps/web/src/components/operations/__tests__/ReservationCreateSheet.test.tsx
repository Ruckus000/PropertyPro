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
    data: [
      { id: 9, name: 'Pool', description: null, location: null, capacity: null, isBookable: true, bookingRules: { maxDurationMinutes: 120, advanceBookingDays: 30 } },
      { id: 10, name: 'Sauna', description: null, location: null, capacity: null, isBookable: false, bookingRules: {} },
    ],
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

  it('never offers an amenity that is not open for booking', () => {
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" />,
    ));
    expect(screen.queryByRole('option', { name: /sauna/i })).toBeNull();
  });

  it('preselects an amenity and shows the limits the server enforces', () => {
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" initialAmenityId={9} />,
    ));
    expect(screen.getByRole('combobox', { name: 'Amenity' })).toHaveValue('9');
    expect(screen.getByText('Up to 2 hours per booking · Book up to 30 days ahead')).toBeInTheDocument();
  });

  it('asks only managers for a unit; residents book their own', () => {
    const { unmount } = render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" />,
    ));
    expect(screen.queryByLabelText(/unit id/i)).toBeNull();
    unmount();
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" isAdmin />,
    ));
    expect(screen.getByLabelText(/unit id/i)).toBeInTheDocument();
  });

  it('shows a calm empty state instead of a form when nothing can be booked', () => {
    useAmenitiesMock.mockReturnValue({
      data: [{ id: 10, name: 'Sauna', description: null, location: null, capacity: null, isBookable: false, bookingRules: {} }],
      isLoading: false,
    });
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" />,
    ));
    expect(screen.getByText('Nothing to book yet')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Amenity' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^reserve$/i })).toBeNull();
  });

  it('ignores a preselected amenity that is not open for booking', async () => {
    render(wrap(
      <ReservationCreateSheet open={true} onClose={vi.fn()} communityId={42} communityTimezone="America/New_York" initialAmenityId={10} />,
    ));
    expect(screen.getByRole('combobox', { name: 'Amenity' })).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('button', { name: /^reserve$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Amenity, date, start time, and end time are required.');
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
