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
  it('shows payments to a unit owner when finance is enabled', () => {
    render(
      <MobileHomeContent
        userName="Jane Doe"
        communityName="Palm Gardens"
        communityId={42}
        city="Miami"
        state="FL"
        timezone="America/New_York"
        role="resident"
        isUnitOwner
        hasCompliance={false}
        hasFinance
        hasMaintenanceRequests
        hasMeetings
        announcementCount={2}
        openMaintenanceCount={1}
        nextMeetingDate={null}
      />,
    );

    expect(screen.getByRole('link', { name: /payments/i })).toHaveAttribute(
      'href',
      '/communities/42/payments',
    );
    expect(screen.queryByRole('link', { name: /compliance/i })).not.toBeInTheDocument();
  });

  // Tenants are excluded by the `finances` RBAC cell and the payments page
  // redirects them, so the row would be a dead end.
  it('hides payments from a tenant even when finance is enabled', () => {
    render(
      <MobileHomeContent
        userName="Tia Tenant"
        communityName="Palm Gardens"
        communityId={42}
        city="Miami"
        state="FL"
        timezone="America/New_York"
        role="resident"
        isUnitOwner={false}
        hasCompliance={false}
        hasFinance
        hasMaintenanceRequests
        hasMeetings
        announcementCount={2}
        openMaintenanceCount={1}
        nextMeetingDate={null}
      />,
    );

    expect(screen.queryByRole('link', { name: /payments/i })).not.toBeInTheDocument();
    // Control: the tenant still gets the rows that are open to them.
    expect(screen.getByRole('link', { name: /maintenance/i })).toBeInTheDocument();
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
        role="property_manager"
        isUnitOwner={false}
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
    expect(screen.getByRole('link', { name: /payments/i })).toBeInTheDocument();
  });
});

describe('MobileHomeContent — the community logo', () => {
  const props = {
    userName: 'Jane Doe',
    communityName: 'Palm Gardens',
    communityId: 42,
    city: 'Miami',
    state: 'FL',
    timezone: 'America/New_York',
    role: 'resident' as const,
    isUnitOwner: true,
    hasCompliance: false,
    hasFinance: false,
    hasMaintenanceRequests: false,
    hasMeetings: false,
    announcementCount: 0,
    openMaintenanceCount: 0,
    nextMeetingDate: null,
  };

  it('shows the square logo beside the community name', () => {
    render(<MobileHomeContent {...props} logoUrl="https://storage/signed-logo" />);
    expect(document.querySelector('img[src="https://storage/signed-logo"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Palm Gardens' })).toBeInTheDocument();
  });

  it('renders as before when the community has no logo', () => {
    const { container } = render(<MobileHomeContent {...props} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
