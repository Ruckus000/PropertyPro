import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplianceCard } from '../../src/components/mobile/FeatureCard';

const { useComplianceChecklistMock } = vi.hoisted(() => ({
  useComplianceChecklistMock: vi.fn(),
}));

vi.mock('@/hooks/use-compliance-checklist', () => ({
  useComplianceChecklist: useComplianceChecklistMock,
}));

describe('ComplianceCard (Wave 3 C3 — mobile aha reachability)', () => {
  it('renders the score card as a link into the compliance flow', () => {
    useComplianceChecklistMock.mockReturnValue({
      data: [
        { status: 'satisfied' },
        { status: 'satisfied' },
        { status: 'missing' },
        { status: 'missing' },
      ],
      isLoading: false,
    });

    render(
      <ComplianceCard
        communityId={42}
        announcementCount={2}
        openMaintenanceCount={1}
        nextMeetingDate={null}
        timezone="America/New_York"
      />,
    );

    const link = screen.getByRole('link', { name: /compliance dashboard/i });
    expect(link).toHaveAttribute('href', '/communities/42/compliance');
    // Score is 50% (2 of 4 satisfied) — surfaced in the accessible label.
    expect(link).toHaveAttribute(
      'aria-label',
      expect.stringContaining('50 percent'),
    );
  });

  it('shows a non-interactive skeleton while the checklist loads', () => {
    useComplianceChecklistMock.mockReturnValue({ data: undefined, isLoading: true });

    render(
      <ComplianceCard
        communityId={42}
        announcementCount={0}
        openMaintenanceCount={0}
        nextMeetingDate={null}
        timezone="America/New_York"
      />,
    );

    // No dead link while loading — the card only becomes tappable once data lands.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
