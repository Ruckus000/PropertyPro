import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommunityCardGrid } from '@/components/pm/CommunityCardGrid';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

const communities: PortfolioCommunity[] = [
  {
    communityId: 1,
    communityName: 'Sunset Condos',
    communityType: 'condo_718',
    totalUnits: 7,
    residentCount: 2,
    occupancyRate: null,
    occupiedUnits: null,
    openMaintenanceRequests: 0,
    complianceScore: 81,
    outstandingBalance: 225000,
    expiringLeases: 0,
  },
  {
    communityId: 3,
    communityName: 'Sunset Ridge Apartments',
    communityType: 'apartment',
    totalUnits: 23,
    residentCount: 15,
    occupancyRate: 65,
    occupiedUnits: 15,
    openMaintenanceRequests: 7,
    complianceScore: null,
    outstandingBalance: 0,
    expiringLeases: 4,
  },
];

describe('CommunityCardGrid', () => {
  it('renders a card for each community', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('Sunset Condos')).toBeInTheDocument();
    expect(screen.getByText('Sunset Ridge Apartments')).toBeInTheDocument();
  });

  it('renders the add-community card', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('Add Community')).toBeInTheDocument();
  });

  it('links each community card to its dashboard', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    const link = screen.getByLabelText('Open dashboard for Sunset Condos');
    expect(link).toHaveAttribute('href', '/pm/dashboard/1');
  });

  it('shows StatusBadge for maintenance > 0', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('7 open')).toBeInTheDocument();
  });

  it('shows plain text for maintenance = 0', () => {
    render(<CommunityCardGrid communities={communities} isLoading={false} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders empty state when no communities', () => {
    render(<CommunityCardGrid communities={[]} isLoading={false} />);
    expect(screen.getByText('Add your first community')).toBeInTheDocument();
  });

  it('renders skeleton cards when loading', () => {
    const { container } = render(<CommunityCardGrid communities={[]} isLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
