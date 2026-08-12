/**
 * `ArcDecisionForm` — the reviewer half of the ARC loop (#933).
 *
 * The behaviour worth pinning is the HB 1203 denial reason. The route contract
 * and the service both reject a denial with no written reason, so the server is
 * safe either way; what this component adds is telling the reviewer *before*
 * they click, instead of surfacing a 400 about a field the form never asked
 * about.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { decideMock, reviewMock, toastSuccessMock } = vi.hoisted(() => ({
  decideMock: vi.fn(),
  reviewMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/hooks/use-arc', () => ({
  useDecideArcSubmission: () => ({ mutateAsync: decideMock, isPending: false }),
  useReviewArcSubmission: () => ({ mutateAsync: reviewMock, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: vi.fn(), warning: vi.fn() },
}));

import { ArcDecisionForm } from '@/components/violations/ArcDecisionForm';
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
    decidedByUserId: null,
    decidedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderForm(status: ArcSubmissionStatus = 'submitted', reviewNotes: string | null = null) {
  const onComplete = vi.fn();
  render(
    <ArcDecisionForm
      submission={makeSubmission({ status, reviewNotes })}
      communityId={42}
      onComplete={onComplete}
    />,
  );
  return { onComplete };
}

describe('ArcDecisionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    decideMock.mockResolvedValue({});
    reviewMock.mockResolvedValue({});
  });

  it('refuses a denial with no written reason, and never calls the API', async () => {
    // The HB 1203 requirement, enforced where the reviewer can see it.
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/HB 1203/);
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('sends the written reason with a denial', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText('Review notes'), {
      target: { value: 'Violates covenant 4.2 — no unfinished hardwood on street elevations.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith({
        id: 7,
        decision: 'denied',
        reviewNotes: 'Violates covenant 4.2 — no unfinished hardwood on street elevations.',
      }),
    );
  });

  it('does not require a reason to approve', async () => {
    // Asymmetric on purpose: the statute constrains denials, not approvals.
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith({
        id: 7,
        decision: 'approved',
        reviewNotes: null,
      }),
    );
  });

  it('offers "Mark under review" only before review has started', () => {
    renderForm('submitted');
    expect(screen.getByRole('button', { name: 'Mark under review' })).toBeVisible();
  });

  it('drops "Mark under review" once already under review, but keeps the decision buttons', () => {
    renderForm('under_review');

    expect(screen.queryByRole('button', { name: 'Mark under review' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeVisible();
  });

  it.each(['approved', 'denied', 'withdrawn'] as const)(
    'renders nothing at all once %s — the service would reject every action',
    (status) => {
      const { container } = render(
        <ArcDecisionForm
          submission={makeSubmission({ status })}
          communityId={42}
          onComplete={vi.fn()}
        />,
      );
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('pre-fills notes left by an earlier review step', () => {
    // `decideArcSubmissionForCommunity` falls back to the stored notes when the
    // decide call sends none, so the reviewer must see what is already there —
    // otherwise they would think a denial had no reason on file when it did.
    renderForm('under_review', 'Waiting on a color sample.');

    expect(screen.getByLabelText('Review notes')).toHaveValue('Waiting on a color sample.');
  });

  it('surfaces a server error instead of closing the panel', async () => {
    decideMock.mockRejectedValueOnce(new Error('ARC submission is already decided'));
    const { onComplete } = renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already decided');
    expect(onComplete).not.toHaveBeenCalled();
  });
});
