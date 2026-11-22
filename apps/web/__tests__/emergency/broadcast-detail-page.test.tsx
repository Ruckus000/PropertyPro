/**
 * /emergency/[id] renders both shapes the detail API returns.
 *
 * A non-manager gets only `{ id, title, body, severity, completedAt }`. The page
 * used to mount the delivery report whenever `completedAt` was set, and
 * `DeliveryReport` maps over `recipients` — undefined for a resident, so every
 * resident view of a sent alert would crash.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useEmergencyBroadcastMock } = vi.hoisted(() => ({
  useEmergencyBroadcastMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '5' }),
  useSearchParams: () => new URLSearchParams('communityId=42'),
}));
vi.mock('@/hooks/use-emergency-broadcasts', () => ({
  useEmergencyBroadcast: useEmergencyBroadcastMock,
}));
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { BroadcastDetailClient as BroadcastDetailPage } from '../../src/app/(authenticated)/emergency/[id]/broadcast-detail-client';

const MESSAGE = {
  id: 5,
  title: 'Storm alert',
  body: 'Shelter in place',
  severity: 'emergency',
  completedAt: '2026-01-01T00:05:00.000Z',
};

describe('/emergency/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a resident the message and no delivery report', () => {
    useEmergencyBroadcastMock.mockReturnValue({ data: MESSAGE, isLoading: false, error: null });
    render(<BroadcastDetailPage />);

    expect(screen.getByText('Shelter in place')).toBeInTheDocument();
    expect(screen.queryByText('Name')).not.toBeInTheDocument();
  });

  it('shows a manager the delivery report (control)', () => {
    useEmergencyBroadcastMock.mockReturnValue({
      data: {
        ...MESSAGE,
        communityId: 42,
        smsBody: null,
        templateKey: null,
        targetAudience: 'all',
        channels: ['email'],
        recipientCount: 1,
        sentCount: 1,
        deliveredCount: 1,
        failedCount: 0,
        initiatedBy: 'user-1',
        initiatedAt: '2026-01-01T00:00:00.000Z',
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
            emailSentAt: '2026-01-01T00:05:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });
    render(<BroadcastDetailPage />);

    expect(screen.getByText('Pat Resident')).toBeInTheDocument();
  });
});
