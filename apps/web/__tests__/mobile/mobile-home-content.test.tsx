import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MobileHomeContent } from '../../src/components/mobile/MobileHomeContent';

vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  SlideUp: ({ children }: { children: ReactNode }) => <>{children}</>,
  StaggerChildren: ({ children }: { children: ReactNode }) => <>{children}</>,
  StaggerItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  PressScale: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/mobile/FeatureCard', () => ({
  ComplianceCard: () => <div>Compliance card</div>,
  SummaryCard: () => <div>Summary card</div>,
}));

describe('MobileHomeContent', () => {
  it('shows payments when finance is enabled', () => {
    render(
      <MobileHomeContent
        userName="Jane Doe"
        communityName="Palm Gardens"
        communityId={42}
        city="Miami"
        state="FL"
        timezone="America/New_York"
        role="owner"
        hasCompliance={false}
        hasFinance
        hasMaintenanceRequests
        hasMeetings
        announcementCount={2}
        openMaintenanceCount={1}
        nextMeetingDate={null}
      />,
    );

    expect(screen.getByRole('link', { name: /payments/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /compliance/i })).not.toBeInTheDocument();
  });

  it('shows compliance only for eligible admin roles', () => {
    render(
      <MobileHomeContent
        userName="Jordan Admin"
        communityName="Palm Gardens"
        communityId={42}
        city="Miami"
        state="FL"
        timezone="America/New_York"
        role="manager"
        presetKey="board_member"
        hasCompliance
        hasFinance
        hasMaintenanceRequests
        hasMeetings
        announcementCount={2}
        openMaintenanceCount={1}
        nextMeetingDate={null}
      />,
    );

    expect(screen.getByRole('link', { name: /compliance/i })).toBeInTheDocument();
  });
});
