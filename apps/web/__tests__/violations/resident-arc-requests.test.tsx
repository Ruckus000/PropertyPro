/**
 * `ResidentArcRequests` — the resident half of the ARC loop (#933).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useArcSubmissionsMock, withdrawMock, confirmMock } = vi.hoisted(() => ({
  useArcSubmissionsMock: vi.fn(),
  withdrawMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock('@/hooks/use-arc', () => ({
  useArcSubmissions: useArcSubmissionsMock,
  useWithdrawArcSubmission: () => ({ mutateAsync: withdrawMock, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { ResidentArcRequests } from '@/components/violations/ResidentArcRequests';
import type { ArcSubmission, ArcSubmissionStatus } from '@/hooks/use-arc';

function makeSubmission(overrides: Partial<ArcSubmission> = {}): ArcSubmission {
  return {
    id: 7,
    communityId: 42,
    unitId: 101,
    submittedByUserId: 'resident-1',
    title: 'Replace front door',
    description: 'Mahogany, same footprint.',
    projectType: 'Windows or doors',
    estimatedStartDate: null,
    estimatedCompletionDate: null,
    attachmentDocumentIds: [],
    status: 'submitted',
    reviewNotes: null,
    ruleReference: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function withSubmissions(data: ArcSubmission[] | undefined, isLoading = false) {
  useArcSubmissionsMock.mockReturnValue({ data, isLoading, isError: false, refetch: vi.fn() });
  render(<ResidentArcRequests communityId={42} />);
}

describe('ResidentArcRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withdrawMock.mockResolvedValue({});
    vi.stubGlobal('confirm', confirmMock);
    confirmMock.mockReturnValue(true);
  });

  it('points a resident with no requests at the form', () => {
    withSubmissions([]);

    expect(screen.getByText(/No architectural requests yet/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Start a request' })).toHaveAttribute(
      'href',
      '/arc-requests/new?communityId=42',
    );
  });

  it('reports a failed fetch instead of claiming there are no requests', () => {
    // A failed query leaves `data` undefined, which looks identical to "none
    // yet". Rendering the empty state there would tell a resident whose
    // request is sitting in the queue that they never submitted it, and hand
    // them a button to submit it again.
    const refetch = vi.fn();
    useArcSubmissionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<ResidentArcRequests communityId={42} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load your requests/i);
    expect(screen.queryByText(/No architectural requests yet/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the request with its status', () => {
    withSubmissions([makeSubmission({ status: 'under_review' })]);

    expect(screen.getByText('Replace front door')).toBeVisible();
    expect(screen.getByText('Under Review')).toBeVisible();
  });

  it('shows committee notes to the resident on a denial', () => {
    // HB 1203 makes the written reason the substance of a denial. A resident
    // who cannot read it has to phone the office to find out why.
    withSubmissions([
      makeSubmission({ status: 'denied', reviewNotes: 'Violates covenant 4.2.' }),
    ]);

    expect(screen.getByText('Violates covenant 4.2.')).toBeVisible();
  });

  it('withdraws after confirmation', async () => {
    withSubmissions([makeSubmission({ status: 'submitted' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => expect(withdrawMock).toHaveBeenCalledWith({ id: 7 }));
  });

  it('does not withdraw when the confirmation is declined', async () => {
    confirmMock.mockReturnValue(false);
    withSubmissions([makeSubmission({ status: 'submitted' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    expect(withdrawMock).not.toHaveBeenCalled();
  });

  it.each(['approved', 'denied', 'withdrawn'] as const)(
    'offers no Withdraw button once %s',
    (status: ArcSubmissionStatus) => {
      // The service refuses to withdraw a decided submission; offering the
      // button would guarantee a 422.
      withSubmissions([makeSubmission({ status })]);

      expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
    },
  );

  it('offers Withdraw while under review', () => {
    withSubmissions([makeSubmission({ status: 'under_review' })]);

    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  });
});
