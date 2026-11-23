import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describeAccess } from '@/lib/access/describe-access';
import { EmergencyListPage } from '@/components/emergency/emergency-list-page';

const about = describeAccess('condo_718', 'emergency_broadcasts', 'sent-to-them')!;

// 2026-03-02T02:30Z is still 1 March, 9:30 PM in New York (UTC-5).
const SENT_AT = '2026-03-02T02:30:00.000Z';

type ManagerRow = {
  id: number;
  title: string;
  severity: string;
  recipientCount: number;
  initiatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  scheduledFor?: string | null;
  sendClaimedAt?: string | null;
  sendOutcome?: string | null;
  sendOutcomeReason?: string | null;
};

function row(over: Partial<ManagerRow> & { id: number }): ManagerRow {
  return {
    title: `Alert ${over.id}`,
    severity: 'urgent',
    recipientCount: 10,
    initiatedAt: SENT_AT,
    completedAt: SENT_AT,
    canceledAt: null,
    ...over,
  };
}

function manager(broadcasts: ManagerRow[], canWrite = true) {
  return render(
    <EmergencyListPage
      view="manager"
      broadcasts={broadcasts}
      canWrite={canWrite}
      communityId={7}
      timeZone="America/New_York"
      about={about}
    />,
  );
}

const mixed = [
  row({ id: 4, title: 'Newer draft', initiatedAt: '2026-03-05T12:00:00.000Z', completedAt: null }),
  row({
    id: 3,
    title: 'Newer cancelled',
    initiatedAt: '2026-03-04T12:00:00.000Z',
    completedAt: '2026-03-04T12:05:00.000Z',
    canceledAt: '2026-03-04T12:06:00.000Z',
    recipientCount: 99,
  }),
  row({ id: 2, title: 'Water shutoff', recipientCount: 48 }),
  row({
    id: 1,
    title: 'Older sent',
    initiatedAt: '2026-02-01T15:00:00.000Z',
    completedAt: '2026-02-01T15:05:00.000Z',
    recipientCount: 12,
  }),
];

describe('EmergencyListPage, manager view', () => {
  it('reads a sent alert in the community time zone, with its recipient count', () => {
    manager(mixed);
    const item = screen.getByRole('link', { name: 'Water shutoff' }).closest('li')!;
    expect(item).toHaveTextContent('Sent · Urgent · Mar 1, 2026, 9:30 PM');
    expect(item).toHaveTextContent('48 recipients');
    expect(screen.getByRole('link', { name: 'Water shutoff' })).toHaveAttribute(
      'href',
      '/emergency/2?communityId=7',
    );
  });

  it('says Draft and Canceled by the same precedence as the table', () => {
    manager(mixed);
    expect(screen.getByRole('link', { name: 'Newer draft' }).closest('li')).toHaveTextContent(
      'Draft · Urgent · Mar 5, 2026, 7:00 AM',
    );
    expect(screen.getByRole('link', { name: 'Newer cancelled' }).closest('li')).toHaveTextContent(
      /Canceled · /,
    );
  });

  it('glances at the newest sent alert, ignoring a newer draft and a newer cancelled one', () => {
    const { container } = manager(mixed);
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    const glance = aside!.querySelector('[data-source="emergencyBroadcasts.recipientCount"]')!;
    expect(glance).toHaveTextContent('48');
    expect(glance).toHaveTextContent('recipients on the last alert');
    expect(glance).toHaveTextContent('Mar 1, 2026');
  });

  it('draws no summary when there is only a draft', () => {
    const { container } = manager([row({ id: 1, completedAt: null })]);
    expect(container.querySelector('[data-source]')).toBeNull();
  });

  it('claims no delivery or reach figure', () => {
    const { container } = manager(mixed);
    expect(container.textContent).not.toMatch(/delivered|reachable|not reached/i);
  });

  it('offers Send alert only with write access', () => {
    const { unmount } = manager(mixed);
    expect(screen.getByRole('link', { name: 'Send alert' })).toHaveAttribute(
      'href',
      '/emergency/new?communityId=7',
    );
    unmount();
    manager(mixed, false);
    expect(screen.queryByRole('link', { name: 'Send alert' })).toBeNull();
  });

  it('shows the first-run block with exactly one Send alert link when empty', () => {
    manager([]);
    expect(screen.getByRole('heading', { name: 'No alerts sent yet' })).toBeVisible();
    expect(screen.getByText('Example of a sent alert')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Send alert' })).toHaveLength(1);
  });

  it('gives the row title link the 44px floor below md', () => {
    manager(mixed);
    expect(screen.getByRole('link', { name: 'Water shutoff' })).toHaveClass('min-h-11', 'md:min-h-0');
  });

  it('has no axe violations', async () => {
    const { container } = manager(mixed);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the first-run state', async () => {
    const { container } = manager([]);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EmergencyListPage, manager view of "send later" alerts', () => {
  // 13:00Z on 10 March 2026 is 9:00 AM in New York (daylight time).
  const GOES_AT = '2026-03-10T13:00:00.000Z';
  const WRITTEN_AT = '2026-03-05T12:00:00.000Z';
  const later = (over: Partial<ManagerRow> & { id: number }) =>
    row({ initiatedAt: WRITTEN_AT, completedAt: null, scheduledFor: GOES_AT, recipientCount: 48, ...over });
  const item = (name: string) => screen.getByRole('link', { name }).closest('li')!;

  it('a scheduled alert says Scheduled, when it will go, and the count as of now', () => {
    manager([later({ id: 1, title: 'Water off tomorrow' })]);
    expect(item('Water off tomorrow')).toHaveTextContent(
      'Scheduled · Urgent · Scheduled for Mar 10, 2026, 9:00 AM',
    );
    expect(item('Water off tomorrow')).toHaveTextContent('48 recipients as of now');
  });

  it('an alert the job has claimed says Sending and claims no recipient count yet', () => {
    manager([later({ id: 1, title: 'Going now', sendClaimedAt: GOES_AT })]);
    expect(item('Going now')).toHaveTextContent('Sending · Urgent · Scheduled for Mar 10, 2026, 9:00 AM');
    expect(item('Going now')).not.toHaveTextContent(/recipients/);
  });

  it('a missed alert says Missed and why, in plain words, with no recipient count', () => {
    manager([
      later({ id: 1, title: 'Too late', sendClaimedAt: GOES_AT, sendOutcome: 'missed', sendOutcomeReason: 'late' }),
      later({
        id: 2,
        title: 'Gone community',
        sendClaimedAt: GOES_AT,
        sendOutcome: 'missed',
        sendOutcomeReason: 'community_deleted',
      }),
    ]);
    expect(item('Too late')).toHaveTextContent(
      'Missed · Urgent · Scheduled for Mar 10, 2026, 9:00 AM · The send time passed while the system was unavailable.',
    );
    expect(item('Too late')).not.toHaveTextContent(/recipients/);
    expect(item('Gone community')).toHaveTextContent('Missed');
    expect(item('Gone community')).toHaveTextContent('The community was deleted before the send time.');
  });

  it('a failed alert says Did not send and never prints the error class name', () => {
    const { container } = manager([
      later({
        id: 1,
        title: 'Provider down',
        sendClaimedAt: GOES_AT,
        sendOutcome: 'failed',
        sendOutcomeReason: 'EmailProviderDownError',
      }),
      later({
        id: 2,
        title: 'Cut short',
        sendClaimedAt: GOES_AT,
        sendOutcome: 'failed',
        sendOutcomeReason: 'interrupted',
      }),
    ]);
    expect(item('Provider down')).toHaveTextContent(
      'Did not send · Urgent · Scheduled for Mar 10, 2026, 9:00 AM · Something went wrong while sending.',
    );
    expect(item('Cut short')).toHaveTextContent('Sending was interrupted before it finished.');
    expect(container.textContent).not.toContain('EmailProviderDownError');
    expect(container.textContent).not.toMatch(/as of now/);
  });

  it('a scheduled alert that went out reads as an ordinary sent alert, dated when it was sent', () => {
    manager([later({ id: 1, title: 'Went out', sendClaimedAt: GOES_AT, completedAt: '2026-03-10T13:03:00.000Z' })]);
    expect(item('Went out')).toHaveTextContent('Sent · Urgent · Mar 10, 2026, 9:03 AM');
    expect(item('Went out')).toHaveTextContent('48 recipients');
    expect(item('Went out')).not.toHaveTextContent(/as of now|Scheduled for/);
  });

  it('a canceled scheduled alert reads Canceled', () => {
    manager([later({ id: 1, title: 'Called off', canceledAt: '2026-03-06T12:00:00.000Z' })]);
    expect(item('Called off')).toHaveTextContent(/^.*Canceled · Urgent · Mar 5, 2026/);
    expect(item('Called off')).not.toHaveTextContent(/as of now|Scheduled for/);
  });

  it('never counts a scheduled, missed or failed alert as the last alert sent', () => {
    const { container } = manager([
      later({ id: 3 }),
      later({ id: 2, sendClaimedAt: GOES_AT, sendOutcome: 'missed', sendOutcomeReason: 'late' }),
    ]);
    expect(container.querySelector('[data-source]')).toBeNull();
  });

  it('has no axe violations with every scheduling state on the page', async () => {
    const { container } = manager([
      later({ id: 4, title: 'Waiting' }),
      later({ id: 3, title: 'Going', sendClaimedAt: GOES_AT }),
      later({ id: 2, title: 'Late', sendClaimedAt: GOES_AT, sendOutcome: 'missed', sendOutcomeReason: 'late' }),
      later({ id: 1, title: 'Broke', sendClaimedAt: GOES_AT, sendOutcome: 'failed', sendOutcomeReason: 'Error' }),
    ]);
    expect(screen.getByText(/Scheduled · Urgent/)).toBeVisible();
    expect(screen.getByText(/Did not send · Urgent/)).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EmergencyListPage, recipient view', () => {
  // A manager row (with recipientCount) passed to the recipient view must still not leak the count.
  const received = [
    { id: 2, title: 'Water shutoff', severity: 'urgent', initiatedAt: SENT_AT, completedAt: SENT_AT, canceledAt: null, recipientCount: 48 },
  ];

  it('shows no panel, no recipient figures and no Send alert', () => {
    const { container } = render(
      <EmergencyListPage view="recipient" broadcasts={received} communityId={7} timeZone="America/New_York" />,
    );
    expect(container.querySelector('aside')).toBeNull();
    expect(container.textContent).not.toMatch(/recipients/i);
    expect(screen.queryByRole('link', { name: 'Send alert' })).toBeNull();
    const item = screen.getByRole('link', { name: 'Water shutoff' }).closest('li')!;
    expect(item).toHaveTextContent('Sent · Urgent · Mar 1, 2026, 9:30 PM');
  });

  it('reads no scheduling state, even from a row that carries the fields', () => {
    // The server sends a recipient sent alerts only; this pins that the view
    // itself would not surface the manager-only fields if one slipped through.
    const leaked = [
      {
        ...received[0]!,
        scheduledFor: '2026-03-10T13:00:00.000Z',
        sendClaimedAt: '2026-03-10T13:00:00.000Z',
        sendOutcome: 'missed',
        sendOutcomeReason: 'late',
      },
    ];
    const { container } = render(
      <EmergencyListPage view="recipient" broadcasts={leaked} communityId={7} timeZone="America/New_York" />,
    );
    const item = screen.getByRole('link', { name: 'Water shutoff' }).closest('li')!;
    expect(item).toHaveTextContent('Sent · Urgent · Mar 1, 2026, 9:30 PM');
    expect(container.textContent).not.toMatch(/Scheduled|Missed|Did not send|Sending|as of now|recipients/);
  });

  it('says No alerts yet when none were sent to them', () => {
    render(<EmergencyListPage view="recipient" broadcasts={[]} communityId={7} timeZone="America/New_York" />);
    expect(screen.getByRole('heading', { name: 'No alerts yet' })).toBeVisible();
    expect(screen.getByText('Alerts sent to you appear here.')).toBeVisible();
  });

  it('has no axe violations, populated or empty', async () => {
    const first = render(
      <EmergencyListPage view="recipient" broadcasts={received} communityId={7} timeZone="America/New_York" />,
    );
    expect(await axe(first.container)).toHaveNoViolations();
    first.unmount();
    const second = render(
      <EmergencyListPage view="recipient" broadcasts={[]} communityId={7} timeZone="America/New_York" />,
    );
    expect(await axe(second.container)).toHaveNoViolations();
  });
});
