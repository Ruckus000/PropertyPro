/**
 * The alert composer's last step: Send now (unchanged) or Send later.
 *
 * "Send later" times are wall-clock time in the COMMUNITY's zone. The zone used
 * here is chosen to differ from the machine running the tests, and each
 * conversion test first proves that the browser-zone reading of the same value
 * would give a different instant, so the test cannot pass by accident.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ApiRequestError } from '@/lib/api/request-json';

const { createAsync, scheduleAsync, sendMutate, cancelMutate, push } = vi.hoisted(() => ({
  createAsync: vi.fn(),
  scheduleAsync: vi.fn(),
  sendMutate: vi.fn(),
  cancelMutate: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/hooks/use-emergency-broadcasts', () => ({
  useEmergencyTemplates: () => ({ data: [] }),
  useCreateBroadcast: () => ({ mutateAsync: createAsync, isPending: false, error: null }),
  useScheduleBroadcast: () => ({ mutateAsync: scheduleAsync, isPending: false, error: null }),
  useSendBroadcast: () => ({ mutate: sendMutate }),
  useCancelBroadcast: () => ({ mutate: cancelMutate }),
}));

import { BroadcastComposer, type BroadcastSource } from '@/components/emergency/BroadcastComposer';

const RUNNER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
// Pacific unless the machine is itself on Pacific time; then Eastern.
const PACIFIC = RUNNER_ZONE !== 'America/Los_Angeles';
const ZONE = PACIFIC ? 'America/Los_Angeles' : 'America/New_York';
const ZONE_LABEL = PACIFIC ? 'Pacific Time (America/Los_Angeles)' : 'Eastern Time (America/New_York)';
// US clocks go forward on Sunday 8 March 2026. 9:00 AM on the day before and the day after:
const BEFORE_DST = {
  local: '2026-03-07T09:00',
  utc: PACIFIC ? '2026-03-07T17:00:00.000Z' : '2026-03-07T14:00:00.000Z',
  shown: PACIFIC ? 'Sat, Mar 7, 2026, 9:00 AM PST' : 'Sat, Mar 7, 2026, 9:00 AM EST',
};
const AFTER_DST = {
  local: '2026-03-09T09:00',
  utc: PACIFIC ? '2026-03-09T16:00:00.000Z' : '2026-03-09T13:00:00.000Z',
  shown: PACIFIC ? 'Mon, Mar 9, 2026, 9:00 AM PDT' : 'Mon, Mar 9, 2026, 9:00 AM EDT',
};
// 1 March 2026, 12:00 UTC: 4:00 AM Pacific, 7:00 AM Eastern.
const NOW = new Date('2026-03-01T12:00:00.000Z');
const NOW_LOCAL_PLUS = (minutes: number) => {
  const hour = PACIFIC ? 4 : 7;
  return `2026-03-01T0${hour}:${String(minutes).padStart(2, '0')}`;
};

function view(source?: BroadcastSource, smsEnabled = false) {
  return render(
    <BroadcastComposer
      communityId={7}
      communityName="Sunset Condos"
      communityType="condo_718"
      smsEnabled={smsEnabled}
      timeZone={ZONE}
      source={source}
    />,
  );
}

/** From the first step to the confirm step, with a draft created on the way. */
async function reachConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Start from scratch' }));
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Water off' } });
  fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'Water is off 9 to noon.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Next: Recipients' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
  await screen.findByRole('heading', { name: 'Confirm & Send' });
}

function chooseLater(local: string) {
  fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));
  fireEvent.change(screen.getByLabelText(/Send on/), { target: { value: local } });
}

const scheduleCalls = () => scheduleAsync.mock.calls.map(([body]) => body);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  createAsync.mockResolvedValue({ broadcastId: 11, recipientCount: 48, smsEligibleCount: 0, emailCount: 48 });
  scheduleAsync.mockImplementation(async (body: { scheduledFor: string }) => ({
    scheduled: true,
    scheduledFor: body.scheduledFor,
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BroadcastComposer, Send now', () => {
  it('is the default and behaves as before: a draft with NO scheduledFor, then the undo countdown', async () => {
    view();
    await reachConfirm();

    expect(screen.getByRole('radio', { name: 'Send now' })).toBeChecked();
    expect(screen.queryByLabelText(/Send on/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule alert' })).toBeNull();

    const send = screen.getByRole('button', { name: 'Send Emergency Alert' });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(send);

    expect(screen.getByText('Sending in 10 seconds...')).toBeVisible();
    expect(screen.getByRole('button', { name: 'UNDO - Cancel Broadcast' })).toBeVisible();
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(createAsync.mock.calls[0]![0]).toEqual({
      communityId: 7,
      title: 'Water off',
      body: 'Water is off 9 to noon.',
      smsBody: undefined,
      severity: 'emergency',
      templateKey: undefined,
      targetAudience: 'all',
      channels: ['email'],
    });
    expect(createAsync.mock.calls[0]![0]).not.toHaveProperty('scheduledFor');
    expect(scheduleAsync).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('BroadcastComposer, Send later', () => {
  it.each([
    ['the day before the clocks go forward', BEFORE_DST],
    ['the day after the clocks go forward', AFTER_DST],
  ])('sends the community-zone instant for 9:00 AM on %s', async (_label, day) => {
    // The same field value read in the machine's zone is a different instant.
    expect(new Date(day.local).toISOString()).not.toBe(day.utc);

    view();
    await reachConfirm();
    chooseLater(day.local);

    expect(screen.getByText(day.shown)).toBeVisible();
    expect(screen.getByText('48 recipients as of now')).toBeVisible();
    expect(screen.getByText(/You can cancel it until it starts sending\./)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send Emergency Alert' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

    // The page opened is the DRAFT's (id 11): it was converted, not copied.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/11?communityId=7'));
    // Exactly one schedule request, on the draft made at "Next: Confirm"...
    expect(scheduleCalls()).toEqual([{ broadcastId: 11, communityId: 7, scheduledFor: day.utc }]);
    // ...and exactly one create request, the draft itself: no second broadcast.
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(createAsync.mock.calls[0]![0]).not.toHaveProperty('scheduledFor');
    // No undo countdown and no immediate send for a scheduled alert.
    expect(screen.queryByText(/Sending in/)).toBeNull();
    expect(sendMutate).not.toHaveBeenCalled();
  });

  it('says how soon it sends and names the community zone under the field', async () => {
    view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));

    const field = screen.getByLabelText(/Send on/);
    const help = document.getElementById('scheduled-for-help')!;
    expect(help).toHaveTextContent(`Sends within 5 minutes after this time. Time zone: ${ZONE_LABEL}.`);
    expect(field).toHaveAttribute('aria-describedby', 'scheduled-for-help');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('refuses an empty time', async () => {
    view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date and time.');
    expect(scheduleCalls()).toHaveLength(0);
  });

  it('refuses a time less than 5 minutes ahead, and accepts exactly 5', async () => {
    view();
    await reachConfirm();
    chooseLater(NOW_LOCAL_PLUS(4));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a time at least 5 minutes from now.');
    const field = screen.getByLabelText(/Send on/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'scheduled-for-help scheduled-for-error');
    expect(scheduleCalls()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();

    // Editing the field clears the error; five minutes ahead goes through.
    chooseLater(NOW_LOCAL_PLUS(5));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(scheduleCalls()[0].scheduledFor).toBe('2026-03-01T12:05:00.000Z');
    expect(createAsync).toHaveBeenCalledTimes(1);
  });

  it('refuses a time more than 365 days ahead', async () => {
    view();
    await reachConfirm();
    // 2 March 2027 is 366 days after 1 March 2026.
    chooseLater('2027-03-02T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a time within the next 365 days.');
    expect(screen.getByLabelText(/Send on/)).toHaveAttribute('aria-invalid', 'true');
    expect(scheduleCalls()).toHaveLength(0);
  });

  it("shows the server's refusal of the time on the same field", async () => {
    view();
    await reachConfirm();
    scheduleAsync.mockRejectedValueOnce(
      new ApiRequestError('Choose a time at least 5 minutes from now.', {
        status: 400,
        code: 'VALIDATION_ERROR',
        details: { fields: [{ field: 'scheduledFor', message: 'Must be at least 5 minutes from now.' }] },
      }),
    );
    chooseLater(BEFORE_DST.local);
    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a time at least 5 minutes from now.');
    expect(screen.getByLabelText(/Send on/)).toHaveAttribute('aria-invalid', 'true');
    // The request WAS made: this message is the server's, not the local check's.
    expect(scheduleAsync).toHaveBeenCalledTimes(1);
    expect(createAsync).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('has no axe violations on the send-later step, with and without a field error', async () => {
    const { container } = view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));
    // Prove the step rendered before auditing it.
    expect(screen.getByText(/Sends within 5 minutes after this time\./)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date and time.');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BroadcastComposer, pre-filled from an earlier alert', () => {
  const SOURCE: BroadcastSource = {
    title: 'Pool closed',
    body: 'The pool is closed for repairs.',
    smsBody: 'Pool closed.',
    severity: 'urgent',
    targetAudience: 'owners_only',
    channels: ['sms', 'email'],
  };

  it('opens on the compose step with the alert copied in and Send later selected', async () => {
    view(SOURCE, true);

    expect(screen.getByRole('heading', { name: 'Compose Alert' })).toBeVisible();
    expect(screen.getByLabelText('Title')).toHaveValue('Pool closed');
    expect(screen.getByLabelText('Email body')).toHaveValue('The pool is closed for repairs.');
    expect(screen.getByLabelText('SMS body')).toHaveValue('Pool closed.');
    expect(screen.getByLabelText('Severity')).toHaveValue('urgent');

    fireEvent.click(screen.getByRole('button', { name: 'Next: Recipients' }));
    expect(screen.getByLabelText('Audience')).toHaveValue('owners_only');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
    await screen.findByRole('heading', { name: 'Confirm & Send' });

    expect(screen.getByRole('radio', { name: 'Send later' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeVisible();
    expect(createAsync.mock.calls[0]![0]).toMatchObject({
      title: 'Pool closed',
      body: 'The pool is closed for repairs.',
      smsBody: 'Pool closed.',
      severity: 'urgent',
      targetAudience: 'owners_only',
      channels: ['sms', 'email'],
    });
  });

  it('drops a copied SMS channel when texting is off, and an unknown severity or audience', async () => {
    view({ ...SOURCE, severity: 'critical', targetAudience: 'tenants_only', channels: ['sms'] }, false);

    expect(screen.getByLabelText('Severity')).toHaveValue('emergency');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recipients' }));
    expect(screen.getByLabelText('Audience')).toHaveValue('all');
    fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
    await screen.findByRole('heading', { name: 'Confirm & Send' });
    expect(createAsync.mock.calls[0]![0]).toMatchObject({ channels: ['email'], targetAudience: 'all' });
  });

  it('without a source it opens on the template step with Send now selected', async () => {
    view();
    expect(screen.getByRole('heading', { name: 'Choose a Template' })).toBeVisible();
    await reachConfirm();
    expect(screen.getByRole('radio', { name: 'Send now' })).toBeChecked();
  });
});
