import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsyncMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn().mockResolvedValue({ data: {}, warnings: [] }),
}));

vi.mock('@/hooks/use-meetings', () => ({
  useCreateMeeting: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  useUpdateMeeting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMeeting: () => ({ data: undefined, isLoading: false }),
}));

import { MeetingForm } from '@/components/meetings/meeting-form';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('MeetingForm modal', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    mutateAsyncMock.mockResolvedValue({ data: {}, warnings: [] });
  });

  it('auto-focuses the title field; controlled inputs preserve spaces', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithClient(
      <MeetingForm
        communityId={1}
        communityTimezone="America/New_York"
        communityType="condo_718"
        onClose={onClose}
      />,
    );

    await expect(screen.getByRole('dialog')).toBeVisible();

    const title = screen.getByLabelText('Title');
    await waitFor(() => expect(title).toHaveFocus());

    // Radix dialog + jsdom can swallow Space in user.type; assert the real controlled path.
    fireEvent.change(title, { target: { value: 'Hello World' } });
    expect(title).toHaveValue('Hello World');

    const location = screen.getByLabelText('Location');
    await user.click(location);
    expect(location).toHaveFocus();
    fireEvent.change(location, { target: { value: 'Room A B' } });
    expect(location).toHaveValue('Room A B');
  });

  /**
   * #932 — the live half of the notice-window warning.
   *
   * Asserted at the DOM, not on the pure function: the pure function has its own
   * tests, and what could regress here is the wiring — a prop not threaded, a
   * warning computed but never rendered.
   */
  describe('notice-window warning', () => {
    const NOW = new Date('2026-04-01T12:00:00.000Z');

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function renderForm() {
      return renderWithClient(
        <MeetingForm
          communityId={1}
          communityTimezone="America/New_York"
          communityType="condo_718"
          onClose={vi.fn()}
        />,
      );
    }

    it('stays silent for a schedule with full notice', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText('Start'), {
        target: { value: '2026-05-20T10:00' },
      });

      expect(screen.queryByTestId('meeting-notice-window-warning')).toBeNull();
    });

    it('warns as soon as a start date inside the window is entered', async () => {
      renderForm();
      // Default meeting type is Board — 48 hours. Two hours out is short.
      fireEvent.change(screen.getByLabelText('Start'), {
        target: { value: '2026-04-01T10:00' },
      });

      const warning = await screen.findByTestId('meeting-notice-window-warning');
      expect(warning).toHaveTextContent('48-hour notice window');
    });

    it('re-evaluates when the meeting type changes, not just the date', async () => {
      renderForm();
      // 5 days out: fine for a board meeting (48h), short for an annual one (14d).
      fireEvent.change(screen.getByLabelText('Start'), {
        target: { value: '2026-04-06T10:00' },
      });
      expect(screen.queryByTestId('meeting-notice-window-warning')).toBeNull();

      fireEvent.change(screen.getByLabelText('Meeting Type'), {
        target: { value: 'annual' },
      });

      const warning = await screen.findByTestId('meeting-notice-window-warning');
      expect(warning).toHaveTextContent('14-day notice window');
    });

    it('does not block submission — the meeting is still created', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Emergency Board' } });
      fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Clubhouse' } });
      fireEvent.change(screen.getByLabelText('Start'), {
        target: { value: '2026-04-01T18:00' },
      });
      // End is seeded from the ORIGINAL default start and is not re-derived
      // when Start moves past it, so it has to be set explicitly here or the
      // form fails on "End time must be after the start time" — an unrelated
      // rule that would make this test look like a block it is not.
      // Regex: the End label also contains its helper text ("Optional. Defaults
      // to one hour after the start."), so an exact string match finds nothing.
      fireEvent.change(screen.getByLabelText(/^End/), {
        target: { value: '2026-04-01T19:00' },
      });
      const warning = await screen.findByTestId('meeting-notice-window-warning');

      // `fireEvent.submit` on the form, not a click on the button: jsdom does
      // not run a submit button's implicit form submission reliably inside a
      // Radix portal, and this test is about the handler, not the browser.
      fireEvent.submit(warning.closest('form')!);

      await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
      // The warning is advice, not a validation error — no field error is set.
      expect(screen.queryByText('New meetings must start in the future.')).toBeNull();
    });
  });
});
