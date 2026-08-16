/**
 * `ArcSubmissionsTab` — the reviewer half of the ARC loop (#933).
 *
 * Covers the failed-load path (#954). The reviewer half reports a failure in
 * two places the resident half does not: the table's own empty message, and
 * the per-status filter counts.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useArcSubmissionsMock } = vi.hoisted(() => ({
  useArcSubmissionsMock: vi.fn(),
}));

vi.mock('@/hooks/use-arc', () => ({
  useArcSubmissions: useArcSubmissionsMock,
}));

// The decision form pulls in mutation hooks and a toast stack that this file
// has no interest in — the tab only needs to render it inside a closed panel.
vi.mock('@/components/violations/ArcDecisionForm', () => ({
  ArcDecisionForm: () => null,
}));

import { ArcSubmissionsTab } from '@/components/violations/ArcSubmissionsTab';
import type { ArcSubmission } from '@/hooks/use-arc';

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
    decidedByUserId: null,
    decidedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ArcSubmissionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the queue', () => {
    useArcSubmissionsMock.mockReturnValue({
      data: [makeSubmission()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ArcSubmissionsTab communityId={42} />);

    expect(screen.getByText('Replace front door')).toBeVisible();
  });

  it('reports a failed fetch instead of showing an empty queue', () => {
    // Both of the tab's "nothing here" signals are indistinguishable from a
    // failure: `data` is undefined, so the table renders its empty message and
    // every filter count renders 0. A reviewer reading that as a clear queue
    // stops checking, and submissions sit past the declaration's review window.
    const refetch = vi.fn();
    useArcSubmissionsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    render(<ArcSubmissionsTab communityId={42} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load the ARC queue/i);
    expect(screen.queryByText(/No ARC submissions found/i)).toBeNull();
    // The filter tabs are equally misleading on a failure — a reviewer reads
    // "Submitted 0" as an answered queue, so they must not render either.
    expect(screen.queryByText('Submitted')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('still shows the empty state when the queue is genuinely clear', () => {
    // The counterpart to the case above: a successful fetch of zero rows must
    // keep reporting an empty queue, not an error.
    useArcSubmissionsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ArcSubmissionsTab communityId={42} />);

    expect(screen.getByText(/No ARC submissions found/i)).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
