/// <reference types="@testing-library/jest-dom" />
/**
 * Resident visitor view (2026-11-20 resident-side review).
 *
 * - The host's own pass shows its QR and Share sends the real code (the route
 *   used to strip `passCode` from every row, so Share sent "Unavailable").
 * - A resident with no linked unit gets a calm not-linked state, not an error.
 * - Any other load failure is an error with Try again, never the empty state.
 * - Revoke asks first, and a failed revoke is shown instead of swallowed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/request-json';
import type { VisitorListItem } from '@/hooks/use-visitors';

const { useMyVisitorsMock, refetchMock, mutateAsyncMock } = vi.hoisted(() => ({
  useMyVisitorsMock: vi.fn(),
  refetchMock: vi.fn(),
  mutateAsyncMock: vi.fn(),
}));

vi.mock('@/hooks/use-visitors', () => ({
  useMyVisitors: useMyVisitorsMock,
  useRevokeVisitor: () => ({ mutateAsync: mutateAsyncMock }),
}));

vi.mock('@/components/visitors/VisitorRegistrationForm', () => ({
  VisitorRegistrationForm: () => null,
}));

import { VisitorResidentView } from '@/components/visitors/VisitorResidentView';

const USER_ID = 'resident-1';

const HOST_PASS: VisitorListItem = {
  id: 1,
  communityId: 7,
  visitorName: 'Jane Guest',
  purpose: 'Dinner',
  hostUnitId: 10,
  hostUnitLabel: '10A',
  hostUserId: USER_ID,
  expectedArrival: '2026-11-21T18:00:00.000Z',
  checkedInAt: null,
  checkedOutAt: null,
  passCode: 'SECRET123',
  staffUserId: null,
  notes: null,
  guestType: 'recurring',
  validFrom: null,
  validUntil: '2026-12-31T00:00:00.000Z',
  recurrenceRule: null,
  expectedDurationMinutes: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleColor: null,
  vehiclePlate: null,
  revokedByUserId: null,
  revokedAt: null,
  createdAt: '2026-11-20T12:00:00.000Z',
  updatedAt: '2026-11-20T12:00:00.000Z',
};

function queryState(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchMock,
    ...overrides,
  };
}

function renderView() {
  return render(
    <VisitorResidentView
      communityId={7}
      currentUserId={USER_ID}
      allowResidentVisitorRevoke
    />,
  );
}

const originalShare = navigator.share;
const originalClipboard = navigator.clipboard;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
  Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
});

describe('<VisitorResidentView> — the host\'s pass', () => {
  it('shows the QR and shares the real pass code', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    useMyVisitorsMock.mockReturnValue(queryState({ data: [HOST_PASS] }));

    renderView();

    expect(screen.getByRole('button', { name: 'Open QR code' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('Jane Guest visitor pass: SECRET123'),
    );
  });

  it('offers no QR or Share for a row without a code', () => {
    const { passCode: _, ...noCode } = HOST_PASS;
    useMyVisitorsMock.mockReturnValue(queryState({ data: [noCode] }));

    renderView();

    expect(screen.getByText('Jane Guest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open QR code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });
});

describe('<VisitorResidentView> — load states', () => {
  it('shows a calm not-linked state for a resident with no unit', () => {
    useMyVisitorsMock.mockReturnValue(
      queryState({
        isError: true,
        error: new ApiRequestError('No unit association', {
          status: 403,
          code: 'NO_UNIT_ASSOCIATION',
        }),
      }),
    );

    renderView();

    expect(screen.getByText("Your account isn't linked to a unit yet")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact management' })).toHaveAttribute(
      'href',
      '/help/contact?communityId=7',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Register Visitor/ })).toBeNull();
  });

  it('shows an error with Try again, not the empty state, when the load fails', () => {
    useMyVisitorsMock.mockReturnValue(
      queryState({ isError: true, error: new ApiRequestError('Boom', { status: 500 }) }),
    );

    renderView();

    expect(screen.getByText("We couldn't load your visitors.")).toBeInTheDocument();
    expect(screen.queryByText('No Visitors In This View')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a 403 that is not the no-unit case an error', () => {
    useMyVisitorsMock.mockReturnValue(
      queryState({
        isError: true,
        error: new ApiRequestError('Visitor logging is disabled', {
          status: 403,
          code: 'FORBIDDEN',
        }),
      }),
    );

    renderView();

    expect(screen.getByText("We couldn't load your visitors.")).toBeInTheDocument();
    expect(screen.queryByText("Your account isn't linked to a unit yet")).toBeNull();
  });
});

describe('<VisitorResidentView> — revoke', () => {
  it('asks first, then revokes the pass', async () => {
    mutateAsyncMock.mockResolvedValue({});
    useMyVisitorsMock.mockReturnValue(queryState({ data: [HOST_PASS] }));

    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke pass' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledWith({ visitorId: 1 }));
    expect(screen.queryByText("We couldn't revoke this pass.")).toBeNull();
  });

  it('shows the server\'s reason when the revoke fails', async () => {
    mutateAsyncMock.mockRejectedValue(
      new ApiRequestError('You can only revoke passes you registered', {
        status: 403,
        code: 'FORBIDDEN',
      }),
    );
    useMyVisitorsMock.mockReturnValue(queryState({ data: [HOST_PASS] }));

    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke pass' }));

    expect(await screen.findByText("We couldn't revoke this pass.")).toBeInTheDocument();
    expect(screen.getByText('You can only revoke passes you registered')).toBeInTheDocument();
  });

  it('hides Revoke on a checked-out pass', () => {
    useMyVisitorsMock.mockReturnValue(
      queryState({
        data: [{
          ...HOST_PASS,
          checkedInAt: '2026-11-20T18:00:00.000Z',
          checkedOutAt: '2026-11-20T20:00:00.000Z',
        }],
      }),
    );

    renderView();

    expect(screen.getByText('Jane Guest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('keeps one-time passes non-revocable', () => {
    useMyVisitorsMock.mockReturnValue(
      queryState({ data: [{ ...HOST_PASS, guestType: 'one_time' }] }),
    );

    renderView();

    expect(screen.getByText('Jane Guest')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
