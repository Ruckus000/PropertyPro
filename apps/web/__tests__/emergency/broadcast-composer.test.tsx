/**
 * The alert composer's last step: Send now (unchanged) or Send later.
 *
 * The REAL hooks and `requestJson` run against a stubbed `fetch`, so what is
 * asserted is the requests the composer makes and what it shows for each
 * answer, including the answers that never arrive.
 *
 * "Send later" times are wall-clock time in the COMMUNITY's zone. The zone used
 * here is chosen to differ from the machine running the tests, and each
 * conversion test first proves that the browser-zone reading of the same value
 * would give a different instant, so the test cannot pass by accident.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

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

// ── The stubbed server ──────────────────────────────────────────────────────

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const conflict = (message: string) => json(409, { error: { code: 'CONFLICT', message } });
const NETWORK_DOWN = () => Promise.reject(new TypeError('Failed to fetch'));

type Reply = () => Response | Promise<Response>;
interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}
let calls: Call[];
let nextDraftId: number;
/** What `GET /emergency-broadcasts/:id` answers: the alert as the server has it. */
let alertNow: (id: number) => Response | Promise<Response>;
let onSchedule: Reply;
let onSend: Reply;
let onCancel: Reply;

const draftView = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  title: 'Water off',
  body: 'Water is off 9 to noon.',
  severity: 'emergency',
  recipientCount: 48,
  completedAt: null,
  canceledAt: null,
  scheduledFor: null,
  sendClaimedAt: null,
  sendOutcome: null,
  sendOutcomeReason: null,
  recipients: [],
  ...over,
});

const fetchMock = vi.fn(async (url: RequestInfo, init?: RequestInit) => {
  const path = String(url).split('?')[0]!;
  const method = init?.method ?? 'GET';
  calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
  if (path.endsWith('/templates')) return json(200, { data: [] });
  if (method === 'POST' && path === '/api/v1/emergency-broadcasts') {
    return json(200, {
      data: { broadcastId: nextDraftId++, recipientCount: 48, smsEligibleCount: 0, emailCount: 48 },
    });
  }
  if (method === 'POST' && path.endsWith('/schedule')) return onSchedule();
  if (method === 'POST' && path.endsWith('/send')) return onSend();
  if (method === 'POST' && path.endsWith('/cancel')) return onCancel();
  return alertNow(Number(path.split('/').pop()));
});

const posts = (suffix: string) => calls.filter((c) => c.method === 'POST' && c.path.endsWith(suffix));
const creates = () => calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/emergency-broadcasts');
const lookups = () => calls.filter((c) => c.method === 'GET' && /\/emergency-broadcasts\/\d+$/.test(c.path));

// ── Driving the composer ────────────────────────────────────────────────────

function view(source?: BroadcastSource, smsEnabled = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BroadcastComposer
        communityId={7}
        communityName="Sunset Condos"
        communityType="condo_718"
        smsEnabled={smsEnabled}
        timeZone={ZONE}
        source={source}
      />
    </QueryClientProvider>,
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
const clickSchedule = () => fireEvent.click(screen.getByRole('button', { name: 'Schedule alert' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  calls = [];
  nextDraftId = 11;
  alertNow = (id) => json(200, { data: draftView(id) });
  onSchedule = () => {
    const scheduledFor = String(calls.at(-1)!.body!['scheduledFor']);
    return json(200, { data: { scheduled: true, scheduledFor } });
  };
  onSend = () => json(200, { data: { smsQueued: 0, emailSent: 48 } });
  onCancel = () => json(200, { data: { canceled: true } });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.body).toEqual({
      communityId: 7,
      title: 'Water off',
      body: 'Water is off 9 to noon.',
      severity: 'emergency',
      targetAudience: 'all',
      channels: ['email'],
    });
    expect(creates()[0]!.body).not.toHaveProperty('scheduledFor');
    expect(posts('/schedule')).toHaveLength(0);
    expect(posts('/send')).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  /** Reach the countdown, then run it out on fake timers. */
  async function sendAndRunCountdown() {
    view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('checkbox'));
    // Only now, so React Query's own timers ran for real while the draft was made.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    fireEvent.click(screen.getByRole('button', { name: 'Send Emergency Alert' }));
    for (let second = 0; second < 12; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  }

  it('when the countdown runs out it sends THE DRAFT, once, and says so', async () => {
    await sendAndRunCountdown();

    expect(posts('/send')).toEqual([
      { method: 'POST', path: '/api/v1/emergency-broadcasts/11/send', body: { communityId: 7 } },
    ]);
    expect(screen.getByText('Emergency alert sent!')).toBeVisible();
    expect(creates()).toHaveLength(1);
  });

  it('a 409 from send (scheduled or canceled elsewhere) does not leave the countdown at 0: it says what happened', async () => {
    onSend = () => conflict('This alert is already being sent, or has been sent, scheduled or canceled.');
    alertNow = (id) => json(200, { data: draftView(id, { canceledAt: '2026-03-01T12:00:05.000Z' }) });

    await sendAndRunCountdown();

    expect(screen.getByRole('alert')).toHaveTextContent('This alert was canceled, so it was not sent.');
    expect(screen.queryByText(/Sending in/)).toBeNull();
    expect(screen.queryByText('Emergency alert sent!')).toBeNull();
    expect(screen.getByRole('link', { name: 'View the alert' })).toHaveAttribute(
      'href',
      '/emergency/11?communityId=7',
    );
    // It looked the alert up rather than guessing, and sent only once.
    expect(lookups()).toHaveLength(1);
    expect(posts('/send')).toHaveLength(1);
  });

  it('a 409 from send when the alert DID go out (a second click won) reads as sent', async () => {
    onSend = () => conflict('This alert is already being sent, or has been sent, scheduled or canceled.');
    alertNow = (id) => json(200, { data: draftView(id, { completedAt: '2026-03-01T12:00:11.000Z' }) });

    await sendAndRunCountdown();

    expect(screen.getByText('Emergency alert sent!')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a send that failed part-way says some residents may have received it and points at Send again later', async () => {
    onSend = () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } });
    alertNow = (id) =>
      json(200, {
        data: draftView(id, {
          sendClaimedAt: '2026-03-01T12:00:10.000Z',
          sendOutcome: 'failed',
          sendOutcomeReason: 'send_error',
        }),
      });

    await sendAndRunCountdown();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This alert did not finish sending, and some residents may already have received it. Open the alert to see who, and use Send again later from there.',
    );
    expect(screen.queryByText('Emergency alert sent!')).toBeNull();
    expect(screen.queryByText('boom')).toBeNull();
    expect(screen.getByRole('link', { name: 'View the alert' })).toHaveAttribute('href', '/emergency/11?communityId=7');
  });

  it('a send whose answer never arrives, and cannot be checked, says to check before sending another', async () => {
    onSend = NETWORK_DOWN;
    alertNow = NETWORK_DOWN;

    await sendAndRunCountdown();

    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't confirm whether this alert was sent. Open the alert to check before you send another.",
    );
    expect(screen.queryByText(/Sending in/)).toBeNull();
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

    clickSchedule();

    // The page opened is the DRAFT's (id 11): it was converted, not copied.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/11?communityId=7'));
    // Exactly one schedule request, on the draft made at "Next: Confirm"...
    expect(posts('/schedule')).toEqual([
      {
        method: 'POST',
        path: '/api/v1/emergency-broadcasts/11/schedule',
        body: { communityId: 7, scheduledFor: day.utc },
      },
    ]);
    // ...and exactly one create request, the draft itself: no second broadcast.
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.body).not.toHaveProperty('scheduledFor');
    // No undo countdown and no immediate send for a scheduled alert.
    expect(screen.queryByText(/Sending in/)).toBeNull();
    expect(posts('/send')).toHaveLength(0);
    // Scheduled: the button cannot be pressed again.
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeDisabled();
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
    clickSchedule();

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date and time.');
    expect(posts('/schedule')).toHaveLength(0);
  });

  it('refuses a time less than 5 minutes ahead, and accepts exactly 5', async () => {
    view();
    await reachConfirm();
    chooseLater(NOW_LOCAL_PLUS(4));
    clickSchedule();

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a time at least 5 minutes from now.');
    const field = screen.getByLabelText(/Send on/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'scheduled-for-help scheduled-for-error');
    expect(posts('/schedule')).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();

    // Editing the field clears the error; five minutes ahead goes through.
    chooseLater(NOW_LOCAL_PLUS(5));
    expect(screen.queryByRole('alert')).toBeNull();
    clickSchedule();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(posts('/schedule')[0]!.body!['scheduledFor']).toBe('2026-03-01T12:05:00.000Z');
    expect(creates()).toHaveLength(1);
  });

  it('refuses a time more than 365 days ahead', async () => {
    view();
    await reachConfirm();
    // 2 March 2027 is 366 days after 1 March 2026.
    chooseLater('2027-03-02T09:00');
    clickSchedule();

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a time within the next 365 days.');
    expect(screen.getByLabelText(/Send on/)).toHaveAttribute('aria-invalid', 'true');
    expect(posts('/schedule')).toHaveLength(0);
  });

  it('refuses a time the clocks skip (2:30 AM on the night they go forward)', async () => {
    view();
    await reachConfirm();
    chooseLater('2026-03-08T02:30');
    clickSchedule();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That time is skipped when the clocks change. Choose a different time.',
    );
    expect(posts('/schedule')).toHaveLength(0);
  });

  it("shows the server's refusal of the time on the same field, and can be corrected", async () => {
    onSchedule = () =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Choose a time at least 5 minutes from now.',
          details: { fields: [{ field: 'scheduledFor', message: 'Must be at least 5 minutes from now.' }] },
        },
      });
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a time at least 5 minutes from now.');
    expect(screen.getByLabelText(/Send on/)).toHaveAttribute('aria-invalid', 'true');
    // The request WAS made: this message is the server's, not the local check's.
    expect(posts('/schedule')).toHaveLength(1);
    expect(creates()).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
    // Not scheduled, so the button is usable again and no lookup was needed.
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeEnabled();
    expect(lookups()).toHaveLength(0);
  });

  it('has no axe violations on the send-later step, with and without a field error', async () => {
    const { container } = view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));
    // Prove the step rendered before auditing it.
    expect(screen.getByText(/Sends within 5 minutes after this time\./)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();

    clickSchedule();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date and time.');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BroadcastComposer, when the answer to "Schedule alert" is not a plain yes', () => {
  const SCHEDULED_409 = () => conflict('This alert has already been sent, scheduled or canceled.');
  const scheduledView = (id: number) =>
    json(200, { data: draftView(id, { scheduledFor: BEFORE_DST.utc }) });

  it('a 409 on an alert that IS scheduled (the first answer was lost) opens its page; it never advises a new alert', async () => {
    onSchedule = SCHEDULED_409;
    alertNow = scheduledView;
    const { container } = view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/11?communityId=7'));
    expect(lookups()).toEqual([{ method: 'GET', path: '/api/v1/emergency-broadcasts/11', body: null }]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).not.toMatch(/new alert/i);
    expect(creates()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeDisabled();
  });

  it('no answer at all, and the alert turns out to be scheduled: opens its page', async () => {
    onSchedule = NETWORK_DOWN;
    alertNow = scheduledView;
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/11?communityId=7'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(posts('/schedule')).toHaveLength(1);
  });

  it('no answer, and the alert is verifiably NOT scheduled: says so and lets the manager try again on the same draft', async () => {
    onSchedule = NETWORK_DOWN;
    const { container } = view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't reach the server, and this alert is not scheduled. Check your connection and try again.",
    );
    expect(container.textContent).not.toMatch(/new alert/i);
    expect(push).not.toHaveBeenCalled();

    // The retry goes to the SAME draft and creates nothing.
    onSchedule = () => json(200, { data: { scheduled: true, scheduledFor: BEFORE_DST.utc } });
    clickSchedule();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/11?communityId=7'));
    expect(posts('/schedule').map((c) => c.path)).toEqual([
      '/api/v1/emergency-broadcasts/11/schedule',
      '/api/v1/emergency-broadcasts/11/schedule',
    ]);
    expect(creates()).toHaveLength(1);
  });

  it('no answer and no way to check: says it could not confirm, points at the alert, never at a new one', async () => {
    onSchedule = NETWORK_DOWN;
    alertNow = NETWORK_DOWN;
    const { container } = view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't confirm whether this alert was scheduled.",
    );
    expect(screen.getByRole('link', { name: 'View the alert' })).toHaveAttribute(
      'href',
      '/emergency/11?communityId=7',
    );
    expect(container.textContent).not.toMatch(/new alert/i);
    expect(push).not.toHaveBeenCalled();
  });

  it('a 409 on an alert that was sent or canceled instead: says so, links to it, and stays off', async () => {
    onSchedule = SCHEDULED_409;
    alertNow = (id) => json(200, { data: draftView(id, { canceledAt: '2026-03-01T12:00:05.000Z' }) });
    const { container } = view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This alert can no longer be scheduled: it has already been sent or canceled.',
    );
    expect(container.textContent).not.toMatch(/new alert/i);
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('an audience over the cap (400 with no field) shows what to do and stays retryable', async () => {
    onSchedule = () =>
      json(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'This alert would go to 501 people, and one alert can reach at most 500. Choose a smaller audience and schedule it again.',
        },
      });
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a smaller audience and schedule it again.');
    expect(screen.getByLabelText(/Send on/)).not.toHaveAttribute('aria-invalid');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeEnabled());
  });

  it('editing the time clears a failed attempt\'s message', async () => {
    onSchedule = NETWORK_DOWN;
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();
    await screen.findByRole('alert');

    fireEvent.change(screen.getByLabelText(/Send on/), { target: { value: AFTER_DST.local } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('while the schedule request is out, the button and both radios are off', async () => {
    let answer!: (response: Response) => void;
    onSchedule = () => new Promise<Response>((resolve) => (answer = resolve));
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();

    expect(await screen.findByRole('button', { name: 'Scheduling...' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Send now' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Send later' })).toBeDisabled();
    // A second click while it is out does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Scheduling...' }));
    expect(posts('/schedule')).toHaveLength(1);

    answer(json(200, { data: { scheduled: true, scheduledFor: BEFORE_DST.utc } }));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });
});

describe('BroadcastComposer, the "I understand" tick', () => {
  const tick = () => screen.getByRole('checkbox');
  const sendButton = () => screen.getByRole('button', { name: 'Send Emergency Alert' });

  it('is cleared by switching to Send later and back, so the send button is never left armed', async () => {
    view();
    await reachConfirm();
    fireEvent.click(tick());
    expect(sendButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Send later' }));
    expect(screen.queryByRole('button', { name: 'Send Emergency Alert' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Send now' }));

    expect(tick()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });

  it('is cleared when Back then Next: Confirm makes a new draft', async () => {
    view();
    await reachConfirm();
    fireEvent.click(tick());
    expect(sendButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
    await waitFor(() => expect(creates()).toHaveLength(2));
    await screen.findByRole('heading', { name: 'Confirm & Send' });

    expect(tick()).not.toBeChecked();
    expect(sendButton()).toBeDisabled();
  });
});

describe('BroadcastComposer, Back, edit, and confirm again', () => {
  it('schedules the NEW draft, not the one made the first time', async () => {
    view();
    await reachConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Water off, corrected' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next: Recipients' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
    await waitFor(() => expect(creates()).toHaveLength(2));
    await screen.findByRole('heading', { name: 'Confirm & Send' });
    expect(creates()[1]!.body!['title']).toBe('Water off, corrected');

    chooseLater(BEFORE_DST.local);
    clickSchedule();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/emergency/12?communityId=7'));
    expect(posts('/schedule').map((c) => c.path)).toEqual(['/api/v1/emergency-broadcasts/12/schedule']);
  });

  it('a failed attempt on the first draft does not carry its message or its lock to the next', async () => {
    onSchedule = () => conflict('This alert has already been sent, scheduled or canceled.');
    alertNow = (id) => json(200, { data: draftView(id, { canceledAt: '2026-03-01T12:00:05.000Z' }) });
    view();
    await reachConfirm();
    chooseLater(BEFORE_DST.local);
    clickSchedule();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Confirm' }));
    await waitFor(() => expect(creates()).toHaveLength(2));
    await screen.findByRole('heading', { name: 'Confirm & Send' });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Schedule alert' })).toBeEnabled();
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
    expect(creates()[0]!.body).toMatchObject({
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
    expect(creates()[0]!.body).toMatchObject({ channels: ['email'], targetAudience: 'all' });
  });

  it('without a source it opens on the template step with Send now selected', async () => {
    view();
    expect(screen.getByRole('heading', { name: 'Choose a Template' })).toBeVisible();
    await reachConfirm();
    expect(screen.getByRole('radio', { name: 'Send now' })).toBeChecked();
  });
});
