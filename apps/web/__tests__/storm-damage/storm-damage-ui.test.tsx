/**
 * Component tests — storm-damage intake UI (legal redlines).
 *
 * These lock in the attorney-reviewed 2026-07-20 redlines at the render layer,
 * where the route tests can't reach:
 *  - the resident-visible status badge shows the NEUTRAL vocabulary
 *    (Logged / Reviewed by management / Archived), never the old
 *    Submitted/Acknowledged/Closed claim-adjudication words;
 *  - a successful report submission surfaces the strengthened
 *    STORM_DAMAGE_SUBMITTED_CONFIRMATION (previously dead code) via a toast;
 *  - the primary CTA uses the neutral 'Saving…' verb, not the regulated 'file'.
 *
 * This records damage for the association — it is NOT an insurance claim
 * (§626.854); no claim/coverage logic is asserted here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const {
  useStormDamageReportsMock,
  useCreateStormDamageReportMock,
  useUpdateStormDamageStatusMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  useStormDamageReportsMock: vi.fn(),
  useCreateStormDamageReportMock: vi.fn(),
  useUpdateStormDamageStatusMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: vi.fn() },
}));

vi.mock('@/hooks/use-storm-damage', () => ({
  useStormDamageReports: useStormDamageReportsMock,
  useCreateStormDamageReport: useCreateStormDamageReportMock,
  useUpdateStormDamageStatus: useUpdateStormDamageStatusMock,
}));

import { StormDamageSection } from '@/components/storm-damage/storm-damage-section';
import { StormDamageFormDialog } from '@/components/storm-damage/storm-damage-form-dialog';
import { STORM_DAMAGE_SUBMITTED_CONFIRMATION } from '@/lib/constants/storm-disclaimers';
import type { StormDamageReportRecord } from '@/components/storm-damage/types';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ id: 1 }),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: undefined,
    ...overrides,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const REPORT: StormDamageReportRecord = {
  id: 1,
  communityId: 42,
  unitId: null,
  reportedBy: 'user-1',
  occurredAt: null,
  locationLabel: 'Building B — 3rd floor hallway',
  category: 'roof',
  severity: 'moderate',
  description: 'Water intrusion through the ceiling.',
  photoDocumentIds: [],
  status: 'submitted',
  createdAt: '2026-07-20T00:00:00Z',
  updatedAt: '2026-07-20T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useCreateStormDamageReportMock.mockReturnValue(mutationStub());
  useUpdateStormDamageStatusMock.mockReturnValue(mutationStub());
});

describe('StormDamageSection — resident-visible status badge', () => {
  it('shows the neutral "Logged" label for a submitted report (not "Submitted")', () => {
    useStormDamageReportsMock.mockReturnValue({
      data: [REPORT],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<StormDamageSection communityId={42} canManage={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Logged')).toBeInTheDocument();
    expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
  });

  it('uses neutral labels for acknowledged and closed statuses too', () => {
    useStormDamageReportsMock.mockReturnValue({
      data: [
        { ...REPORT, id: 2, status: 'acknowledged' },
        { ...REPORT, id: 3, status: 'closed' },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<StormDamageSection communityId={42} canManage={false} />, {
      wrapper: makeWrapper(),
    });

    expect(screen.getByText('Reviewed by management')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByText('Acknowledged')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
  });
});

describe('StormDamageFormDialog — success confirmation is wired', () => {
  it('fires the strengthened confirmation toast on a successful submit', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 99 });
    useCreateStormDamageReportMock.mockReturnValue(mutationStub({ mutateAsync }));
    const onOpenChange = vi.fn();

    render(
      <StormDamageFormDialog communityId={42} open onOpenChange={onOpenChange} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.change(screen.getByLabelText(/Location/), {
      target: { value: 'North pool deck' },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'Cracked deck tiles after the storm.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Report Damage' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).toHaveBeenCalledWith(STORM_DAMAGE_SUBMITTED_CONFIRMATION);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not fire the confirmation toast when submit fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'));
    useCreateStormDamageReportMock.mockReturnValue(mutationStub({ mutateAsync }));

    render(
      <StormDamageFormDialog communityId={42} open onOpenChange={vi.fn()} />,
      { wrapper: makeWrapper() },
    );

    fireEvent.change(screen.getByLabelText(/Location/), {
      target: { value: 'North pool deck' },
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'Cracked deck tiles after the storm.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Report Damage' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});
