import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsyncMock, updateMutateAsyncMock, meetingDetail } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn().mockResolvedValue({ data: {}, warnings: [] }),
  updateMutateAsyncMock: vi.fn().mockResolvedValue({ data: {}, warnings: [] }),
  meetingDetail: { current: undefined as Record<string, unknown> | undefined },
}));

vi.mock('@/hooks/use-meetings', () => ({
  useCreateMeeting: () => ({ mutateAsync: mutateAsyncMock, isPending: false }),
  useUpdateMeeting: () => ({ mutateAsync: updateMutateAsyncMock, isPending: false }),
  useMeeting: () => ({ data: meetingDetail.current, isLoading: false }),
}));

// The Radix Checkbox measures its hidden form input with ResizeObserver,
// which jsdom does not provide.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
    updateMutateAsyncMock.mockClear();
    meetingDetail.current = undefined;
  });

  it('starts a new meeting on the type the setup guide picked', () => {
    renderWithClient(
      <MeetingForm
        communityId={1}
        communityTimezone="America/New_York"
        communityType="condo_718"
        initialMeetingType="annual"
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('annual');
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

  it('sends the agenda with the meeting, and null when it is left blank (H-4)', async () => {
    renderWithClient(
      <MeetingForm
        communityId={1}
        communityTimezone="America/New_York"
        communityType="condo_718"
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Annual Meeting' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Clubhouse' } });
    const agenda = screen.getByLabelText('Agenda');
    expect(agenda).toHaveAttribute('maxLength', '10000');
    fireEvent.change(agenda, { target: { value: '1. Call to order\n2. Budget\n' } });
    fireEvent.submit(agenda.closest('form')!);
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({ agenda: '1. Call to order\n2. Budget' }),
      ),
    );

    mutateAsyncMock.mockClear();
    fireEvent.change(agenda, { target: { value: '   ' } });
    fireEvent.submit(agenda.closest('form')!);
    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ agenda: null })),
    );
  });

  // A closed session's agenda (attorney-client, personnel) must be keepable off
  // the public website; #1501 published every agenda with no way to opt out.
  describe('show the agenda on the public website', () => {
    function renderNew() {
      return renderWithClient(
        <MeetingForm communityId={1} communityTimezone="America/New_York" communityType="condo_718" onClose={vi.fn()} />,
      );
    }

    function fillRequired() {
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Closed session' } });
      fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Clubhouse' } });
    }

    it('is on by default, and a new meeting is sent with agendaPublished: true', async () => {
      renderNew();
      const box = screen.getByRole('checkbox', { name: 'Show the agenda on the public website' });
      expect(box).toBeChecked();
      expect(box).toHaveAccessibleDescription('Anyone can read it, and search engines can find it.');

      fillRequired();
      fireEvent.submit(box.closest('form')!);
      await waitFor(() =>
        expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ agendaPublished: true })),
      );
    });

    it('turned off, says who still sees it and sends agendaPublished: false', async () => {
      renderNew();
      const box = screen.getByRole('checkbox', { name: 'Show the agenda on the public website' });
      fireEvent.click(box);
      expect(box).not.toBeChecked();
      expect(box).toHaveAccessibleDescription(
        'Only people signed in to the portal, owners and tenants, see this agenda. The meeting itself is still listed on the website.',
      );

      fillRequired();
      fireEvent.submit(box.closest('form')!);
      await waitFor(() =>
        expect(mutateAsyncMock).toHaveBeenCalledWith(expect.objectContaining({ agendaPublished: false })),
      );
    });

    it('editing loads the saved choice and sends it back unchanged', async () => {
      meetingDetail.current = {
        id: 9,
        title: 'Closed session',
        meetingType: 'board',
        startsAt: '2030-05-01T14:00:00.000Z',
        endsAt: null,
        location: 'Clubhouse',
        agenda: '1. Litigation update',
        agendaPublished: false,
      };
      renderWithClient(
        <MeetingForm
          communityId={1}
          communityTimezone="America/New_York"
          communityType="condo_718"
          meetingId={9}
          onClose={vi.fn()}
        />,
      );
      const box = await screen.findByRole('checkbox', { name: 'Show the agenda on the public website' });
      await waitFor(() => expect(box).not.toBeChecked());

      fireEvent.submit(box.closest('form')!);
      await waitFor(() =>
        expect(updateMutateAsyncMock).toHaveBeenCalledWith(
          expect.objectContaining({ id: 9, agendaPublished: false }),
        ),
      );
    });
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
