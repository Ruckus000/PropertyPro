import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describeAccess } from '@/lib/access/describe-access';

const { useEmergencyBroadcastMock } = vi.hoisted(() => ({ useEmergencyBroadcastMock: vi.fn() }));
vi.mock('@/hooks/use-emergency-broadcasts', () => ({
  useEmergencyBroadcast: useEmergencyBroadcastMock,
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

describe('EmergencyDetailPage', () => {
  beforeEach(() => vi.clearAllMocks());

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
});
