import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describeAccess } from '@/lib/access/describe-access';

const { useEmergencyBroadcastMock, cancelMutate, cancelState } = vi.hoisted(() => ({
  useEmergencyBroadcastMock: vi.fn(),
  cancelMutate: vi.fn(),
  cancelState: { isPending: false },
}));
vi.mock('@/hooks/use-emergency-broadcasts', () => ({
  useEmergencyBroadcast: useEmergencyBroadcastMock,
  useCancelBroadcast: () => ({ mutate: cancelMutate, isPending: cancelState.isPending }),
}));

import { EmergencyDetailPage } from '@/components/emergency/emergency-detail-page';

const about = describeAccess('condo_718', 'emergency_broadcasts', 'sent-to-them')!;
// 02:30Z on 2 March is 9:30 PM on 1 March in New York.
const SENT_AT = '2026-03-02T02:30:00.000Z';

const MESSAGE = {
  id: 5,
  title: 'Storm alert',
  body: 'Shelter in place',
  severity: 'emergency',
  completedAt: SENT_AT,
};
const REPORT = {
  ...MESSAGE,
  communityId: 42,
  smsBody: 'Storm: shelter',
  templateKey: null,
  targetAudience: 'all',
  channels: ['email'],
  recipientCount: 1,
  sentCount: 1,
  deliveredCount: 1,
  failedCount: 0,
  initiatedBy: 'user-1',
  initiatedAt: '2026-03-02T02:00:00.000Z',
  canceledAt: null,
  recipients: [
    {
      userId: 'user-2',
      email: 'pat@example.com',
      phone: null,
      fullName: 'Pat Resident',
      smsStatus: 'skipped',
      emailStatus: 'sent',
      smsSentAt: null,
      smsDeliveredAt: null,
      emailSentAt: SENT_AT,
    },
  ],
};

function view(isAdmin: boolean) {
  return render(
    <EmergencyDetailPage
      communityId={42}
      broadcastId={5}
      isAdmin={isAdmin}
      timeZone="America/New_York"
      about={about}
    />,
  );
}

// 13:00Z on 10 March 2026 is 9:00 AM in New York (daylight time).
const GOES_AT = '2026-03-10T13:00:00.000Z';
const SCHEDULED = {
  ...REPORT,
  recipientCount: 48,
  sentCount: 0,
  deliveredCount: 0,
  completedAt: null,
  scheduledFor: GOES_AT,
  sendClaimedAt: null,
  sendOutcome: null,
  sendOutcomeReason: null,
  // A scheduled alert stores no recipient rows until it sends.
  recipients: [],
};

function show(data: unknown, isAdmin = true) {
  useEmergencyBroadcastMock.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn() });
  return view(isAdmin);
}

describe('EmergencyDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelState.isPending = false;
  });

  it('manager: h1 is the title; Details lists Severity and Sent in the community time zone', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: REPORT, isLoading: false, error: null });
    const { container } = view(true);
    expect(screen.getByRole('heading', { level: 1, name: /Storm alert/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Details' })).toBeVisible();
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveTextContent('Severity');
    expect(aside).toHaveTextContent('Emergency');
    expect(aside).toHaveTextContent('Sent');
    expect(aside).toHaveTextContent('Mar 1, 2026, 9:30 PM');
    expect(screen.getByRole('heading', { name: 'Message' })).toBeVisible();
    expect(screen.getByText('Shelter in place')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Delivery' })).toBeVisible();
    expect(screen.getByText('Pat Resident')).toBeVisible();
  });

  it('manager: Details values share one grid column', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: REPORT, isLoading: false, error: null });
    const { container } = view(true);
    const dl = container.querySelector('aside dl')!;
    expect(dl).toHaveClass('grid', 'grid-cols-[auto_1fr]');
    expect(Array.from(dl.children).map((c) => c.tagName)).toEqual(['DT', 'DD', 'DT', 'DD']);
  });

  it('non-admin: no Delivery heading and no aside, even if recipients were present', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: REPORT, isLoading: false, error: null });
    const { container } = view(false);
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
    expect(screen.queryByText('Pat Resident')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(screen.getByText('Shelter in place')).toBeVisible();
  });

  it('non-admin: sees the severity word, the sent date and the status word, but no Delivery and no aside', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: MESSAGE, isLoading: false, error: null });
    const { container } = view(false);
    const message = screen.getByRole('heading', { name: 'Message' }).closest('section')!;
    expect(message).toHaveTextContent('Emergency');
    expect(message).toHaveTextContent('Mar 1, 2026, 9:30 PM');
    expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('an unsent alert reads "Pending" in the header and the banner, never "Draft"', () => {
    useEmergencyBroadcastMock.mockReturnValue({
      data: { ...REPORT, completedAt: null },
      isLoading: false,
      error: null,
    });
    view(true);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.getByText('This broadcast is pending confirmation.')).toBeVisible();
  });

  it('a canceled alert reads "Canceled"', () => {
    useEmergencyBroadcastMock.mockReturnValue({
      data: { ...REPORT, completedAt: null, canceledAt: SENT_AT },
      isLoading: false,
      error: null,
    });
    view(true);
    expect(screen.getAllByText('Canceled').length).toBeGreaterThan(0);
  });

  it('resident message shape: message only', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: MESSAGE, isLoading: false, error: null });
    const { container } = view(false);
    expect(screen.getByText('Shelter in place')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('manager on a resident-shaped response draws no Delivery section', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: MESSAGE, isLoading: false, error: null });
    view(true);
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
  });

  it('loading is aria-busy', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = view(true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('a failed load shows an alert', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') });
    view(true);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t load/i);
  });

  it('has no axe violations', async () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: REPORT, isLoading: false, error: null });
    const { container } = view(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations for a non-admin', async () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: MESSAGE, isLoading: false, error: null });
    const { container } = view(false);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a sent alert that was never scheduled offers no cancel, and Send again later', () => {
    show(REPORT);
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Send again later' })).toHaveAttribute(
      'href',
      '/emergency/new?communityId=42&from=5',
    );
  });

  it('an unsent immediate alert offers neither action', () => {
    show({ ...REPORT, completedAt: null });
    expect(screen.queryByRole('link', { name: 'Send again later' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
  });
});

describe('EmergencyDetailPage, a scheduled alert (manager)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelState.isPending = false;
  });

  it('says Scheduled, when it will send in the community zone, and the count as of now', () => {
    const { container } = show(SCHEDULED);
    expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
    expect(screen.getByText('Tue, Mar 10, 2026, 9:00 AM EDT')).toBeVisible();
    expect(screen.getByText('48 recipients as of now')).toBeVisible();
    expect(screen.getByText(/It sends\s+within 5 minutes after that time/)).toBeVisible();
    const aside = container.querySelector('aside')!;
    expect(aside).toHaveTextContent('Scheduled for');
    expect(aside).toHaveTextContent('Mar 10, 2026, 9:00 AM');
    expect(aside).toHaveTextContent('48 as of now');
    // Not the wording of an immediate alert waiting on its sender.
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('This broadcast is pending confirmation.')).toBeNull();
  });

  it('shows no delivery report for an alert that has not been sent', () => {
    show({ ...SCHEDULED, recipients: REPORT.recipients });
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
    expect(screen.queryByText('Pat Resident')).toBeNull();
  });

  it('Send again later links to the composer with this alert as the source', () => {
    show(SCHEDULED);
    expect(screen.getByRole('link', { name: 'Send again later' })).toHaveAttribute(
      'href',
      '/emergency/new?communityId=42&from=5',
    );
  });

  it('Cancel scheduled alert asks first: nothing is canceled until the dialog is confirmed', () => {
    show(SCHEDULED);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scheduled alert' }));

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Cancel this scheduled alert?')).toBeVisible();
    expect(cancelMutate).not.toHaveBeenCalled();

    // Backing out cancels nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep scheduled' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(cancelMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel scheduled alert' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel alert' }));
    expect(cancelMutate).toHaveBeenCalledTimes(1);
    expect(cancelMutate).toHaveBeenCalledWith(
      { broadcastId: 5, communityId: 42 },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('disables the cancel button while the cancel is in flight', () => {
    cancelState.isPending = true;
    show(SCHEDULED);
    expect(screen.getByRole('button', { name: 'Canceling...' })).toBeDisabled();
  });

  it('a non-admin gets no scheduling controls even on a manager-shaped response', () => {
    show(SCHEDULED, false);
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Send again later' })).toBeNull();
    expect(screen.queryByText(/as of now/)).toBeNull();
  });

  it('an alert the job has claimed reads Sending and can no longer be canceled here', () => {
    show({ ...SCHEDULED, sendClaimedAt: GOES_AT });
    expect(screen.getAllByText('Sending').length).toBeGreaterThan(0);
    expect(screen.getByText('This alert is being sent now.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
  });

  it('a canceled scheduled alert reads Canceled, with Send again later and no cancel', () => {
    show({ ...SCHEDULED, canceledAt: SENT_AT });
    expect(screen.getAllByText('Canceled').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Send again later' })).toBeVisible();
    expect(screen.queryByText(/as of now/)).toBeNull();
  });

  it('a missed alert says why in plain words, offers Send again later, and shows no delivery', () => {
    show({ ...SCHEDULED, sendClaimedAt: GOES_AT, sendOutcome: 'missed', sendOutcomeReason: 'late' });
    expect(screen.getAllByText('Missed').length).toBeGreaterThan(0);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This alert was not sent.');
    expect(alert).toHaveTextContent('The send time passed while the system was unavailable.');
    expect(screen.getByRole('link', { name: 'Send again later' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancel scheduled alert' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
  });

  it('a failed alert says Did not send without the error class name, and shows no delivery', () => {
    const { container } = show({
      ...SCHEDULED,
      sendClaimedAt: GOES_AT,
      sendOutcome: 'failed',
      sendOutcomeReason: 'EmailProviderDownError',
      recipients: REPORT.recipients,
    });
    expect(screen.getAllByText('Did not send').length).toBeGreaterThan(0);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('This alert did not send.');
    expect(alert).toHaveTextContent('Something went wrong while sending.');
    expect(container.textContent).not.toContain('EmailProviderDownError');
    expect(screen.getByRole('link', { name: 'Send again later' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Delivery' })).toBeNull();
    expect(screen.queryByText('Pat Resident')).toBeNull();
  });

  it('has no axe violations in the scheduled state, closed and with the confirm dialog open', async () => {
    const { container } = show(SCHEDULED);
    // Prove the scheduled state rendered before auditing it.
    expect(screen.getByText('48 recipients as of now')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel scheduled alert' })).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();

    // The dialog is portalled to the body, outside the container: audit it on its own.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel scheduled alert' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel alert' })).toBeVisible();
    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('has no axe violations for a missed alert', async () => {
    const { container } = show({
      ...SCHEDULED,
      sendClaimedAt: GOES_AT,
      sendOutcome: 'missed',
      sendOutcomeReason: 'late',
    });
    expect(screen.getByText('This alert was not sent.')).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });
});
