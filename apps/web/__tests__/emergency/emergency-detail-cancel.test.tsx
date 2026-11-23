/**
 * Canceling a scheduled alert from its page, through the REAL hooks and
 * `requestJson` against a stubbed `fetch`: what the page shows after the
 * server answers, without a reload. (The states themselves are covered with
 * mocked hooks in emergency-detail-page.test.tsx.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmergencyDetailPage } from '@/components/emergency/emergency-detail-page';

const GOES_AT = '2026-03-10T13:00:00.000Z';
const SCHEDULED = {
  id: 5,
  communityId: 42,
  title: 'Water off tomorrow',
  body: 'Water is off 9 to noon.',
  smsBody: null,
  severity: 'urgent',
  templateKey: null,
  targetAudience: 'all',
  channels: ['email'],
  recipientCount: 48,
  sentCount: 0,
  deliveredCount: 0,
  failedCount: 0,
  initiatedBy: 'user-1',
  initiatedAt: '2026-03-05T12:00:00.000Z',
  completedAt: null,
  canceledAt: null,
  scheduledFor: GOES_AT,
  sendClaimedAt: null,
  sendOutcome: null,
  sendOutcomeReason: null,
  recipients: [],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let alertNow: typeof SCHEDULED | Record<string, unknown>;
let cancelResponse: () => Response;
const fetchMock = vi.fn();

function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EmergencyDetailPage communityId={42} broadcastId={5} isAdmin timeZone="America/New_York" />
    </QueryClientProvider>,
  );
}

async function confirmCancel() {
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel scheduled alert' }));
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel alert' }));
}

const cancelRequests = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/emergency-broadcasts/5/cancel'));

beforeEach(() => {
  alertNow = SCHEDULED;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: RequestInfo, init?: RequestInit) => {
    if (String(url).endsWith('/cancel') && init?.method === 'POST') return cancelResponse();
    return json(200, { data: alertNow });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EmergencyDetailPage, canceling a scheduled alert', () => {
  it('after a successful cancel the page reads Canceled, with no reload', async () => {
    cancelResponse = () => {
      alertNow = { ...SCHEDULED, canceledAt: '2026-03-06T12:00:00.000Z' };
      return json(200, { data: { canceled: true } });
    };
    view();
    expect(await screen.findByText('48 recipients as of now')).toBeVisible();

    await confirmCancel();

    expect(await screen.findByText('This broadcast was canceled.')).toBeVisible();
    expect(screen.getAllByText('Canceled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.queryByText(/as of now/)).toBeNull();
    expect(cancelRequests()).toHaveLength(1);
    expect(JSON.parse(String(cancelRequests()[0]![1]!.body))).toEqual({ communityId: 42 });
  });

  it('after a successful cancel, focus lands on the notice that says so, not on <body>', async () => {
    cancelResponse = () => {
      alertNow = { ...SCHEDULED, canceledAt: '2026-03-06T12:00:00.000Z' };
      return json(200, { data: { canceled: true } });
    };
    view();
    await confirmCancel();

    const notice = await screen.findByText('This broadcast was canceled.');
    await waitFor(() => expect(notice).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  const CONFLICT = () =>
    json(409, {
      error: {
        code: 'CONFLICT',
        message:
          'This alert can no longer be canceled: the undo window has expired or it has already started sending.',
      },
    });

  it('a refused cancel on an alert someone else already canceled says that, and never "try again"', async () => {
    cancelResponse = () => {
      alertNow = { ...SCHEDULED, canceledAt: '2026-03-06T12:00:00.000Z' };
      return CONFLICT();
    };
    const { container } = view();
    await confirmCancel();

    expect(await screen.findByText('This alert was already canceled.')).toBeVisible();
    expect(container.textContent).not.toMatch(/try again|started sending/i);
    expect(screen.getByText('This broadcast was canceled.')).toBeVisible();
  });

  it('a refused cancel on an alert that has gone out says it was sent', async () => {
    cancelResponse = () => {
      alertNow = { ...SCHEDULED, sendClaimedAt: GOES_AT, completedAt: '2026-03-10T13:02:00.000Z' };
      return CONFLICT();
    };
    const { container } = view();
    await confirmCancel();

    expect(
      await screen.findByText('This alert has already been sent, so it can no longer be canceled.'),
    ).toBeVisible();
    expect(container.textContent).not.toMatch(/try again/i);
    expect(screen.getByRole('heading', { name: 'Delivery' })).toBeVisible();
  });

  it('a refused cancel on an alert that was missed says there is nothing to cancel', async () => {
    cancelResponse = () => {
      alertNow = { ...SCHEDULED, sendClaimedAt: GOES_AT, sendOutcome: 'missed', sendOutcomeReason: 'late' };
      return CONFLICT();
    };
    view();
    await confirmCancel();

    expect(
      await screen.findByText('This alert was missed and will not be sent, so there is nothing to cancel.'),
    ).toBeVisible();
  });

  it('a 409 says it already started sending and refreshes the alert', async () => {
    cancelResponse = () => {
      // The job claimed it between the page loading and the click.
      alertNow = { ...SCHEDULED, sendClaimedAt: GOES_AT };
      return json(409, {
        error: {
          code: 'CONFLICT',
          message:
            'This alert can no longer be canceled: the undo window has expired or it has already started sending.',
        },
      });
    };
    view();
    await confirmCancel();

    expect(
      await screen.findByText('This alert has already started sending, so it can no longer be canceled.'),
    ).toBeVisible();
    // Refreshed: the page now shows what the alert became.
    expect(await screen.findByText('This alert is being sent now.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.queryByText('This broadcast was canceled.')).toBeNull();
  });

  it('any other failure asks the manager to try again and leaves the alert scheduled', async () => {
    cancelResponse = () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } });
    view();
    await confirmCancel();

    expect(await screen.findByText("We couldn't cancel this alert. Please try again.")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Cancel scheduled alert' })).toBeEnabled(),
    );
    expect(screen.queryByText('boom')).toBeNull();
  });
});
