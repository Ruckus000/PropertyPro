/**
 * #932 — the hearing-notice warning, at the DOM.
 *
 * This component had no test at all, which is part of why its 14-day "rule"
 * could live for so long as a `min` attribute that only bound the one caller
 * already respecting it.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { updateViolationMock, toastWarningMock } = vi.hoisted(() => ({
  updateViolationMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock('@/lib/api/violations', () => ({
  updateViolation: updateViolationMock,
  imposeFine: vi.fn(),
  resolveViolation: vi.fn(),
  dismissViolation: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { warning: toastWarningMock, success: vi.fn(), error: vi.fn() },
}));

import { ViolationStatusTransition } from '@/components/violations/ViolationStatusTransition';

const NOW = new Date('2026-04-01T12:00:00.000Z');

const VIOLATION = {
  id: 12,
  communityId: 42,
  unitId: 101,
  reportedByUserId: null,
  category: 'Parking',
  description: 'Vehicle in a fire lane.',
  status: 'noticed' as const,
  severity: 'moderate' as const,
  evidenceDocumentIds: [],
  noticeDate: '2026-03-20',
  hearingDate: null,
  resolutionDate: null,
  resolutionNotes: null,
  createdAt: '2026-03-20T00:00:00.000Z',
  updatedAt: '2026-03-20T00:00:00.000Z',
};

function renderHearingForm() {
  return render(
    <ViolationStatusTransition
      violation={VIOLATION}
      communityId={42}
      action="hearing"
      onComplete={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
}

describe('ViolationStatusTransition — hearing notice window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    updateViolationMock.mockResolvedValue({ data: { ...VIOLATION } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not warn about its own default date', () => {
    // The form defaults to exactly 14 days out. If this ever warns, every
    // reviewer learns to dismiss the warning and it stops meaning anything.
    renderHearingForm();

    expect(screen.queryByTestId('hearing-notice-window-warning')).toBeNull();
    expect(screen.getByText(/Most Florida condo bylaws require/)).toBeVisible();
  });

  it('warns once a short-noticed date is chosen', () => {
    renderHearingForm();
    fireEvent.change(screen.getByLabelText('Hearing Date'), {
      target: { value: '2026-04-05' },
    });

    const warning = screen.getByTestId('hearing-notice-window-warning');
    expect(warning).toHaveTextContent('14-day notice window');
    expect(warning).toHaveTextContent('governing documents');
  });

  it('accepts a date the old `min` attribute would have blocked outright', async () => {
    // The whole point of the change: warn, never block. The date input no
    // longer carries `min`, and nothing in the submit path rejects the value.
    renderHearingForm();
    const input = screen.getByLabelText('Hearing Date');
    expect(input).not.toHaveAttribute('min');

    fireEvent.change(input, { target: { value: '2026-04-03' } });
    fireEvent.click(screen.getByRole('button', { name: /Schedule Hearing/i }));

    await waitFor(() =>
      expect(updateViolationMock).toHaveBeenCalledWith(
        12,
        expect.objectContaining({
          communityId: 42,
          status: 'hearing_scheduled',
          hearingDate: '2026-04-03T00:00:00.000Z',
        }),
      ),
    );
  });

  it("re-raises the server's warning as a dismiss-only toast", async () => {
    // The form closes on success, taking the inline warning with it. Without
    // this the server's warning would be computed into a payload nothing reads.
    updateViolationMock.mockResolvedValue({
      data: {
        ...VIOLATION,
        warnings: [{ code: 'hearing_notice_window_missed', message: 'Too soon.' }],
      },
    });

    renderHearingForm();
    fireEvent.change(screen.getByLabelText('Hearing Date'), {
      target: { value: '2026-04-03' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Schedule Hearing/i }));

    await waitFor(() => expect(toastWarningMock).toHaveBeenCalledTimes(1));
    expect(toastWarningMock).toHaveBeenCalledWith(
      'Hearing scheduled — short notice',
      expect.objectContaining({ description: 'Too soon.', duration: Infinity }),
    );
  });

  it('raises no toast when the server attaches no warning', async () => {
    renderHearingForm();
    fireEvent.click(screen.getByRole('button', { name: /Schedule Hearing/i }));

    await waitFor(() => expect(updateViolationMock).toHaveBeenCalled());
    expect(toastWarningMock).not.toHaveBeenCalled();
  });
});
