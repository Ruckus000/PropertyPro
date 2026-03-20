import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { getFeaturesForCommunityMock } = vi.hoisted(() => ({
  getFeaturesForCommunityMock: vi.fn(),
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { CommunityCard } from '../../src/components/pm/CommunityCard';
import type { PmCommunityPortfolioCard } from '../../src/lib/api/pm-communities';

const makeCondoCommunity = (overrides: Partial<PmCommunityPortfolioCard> = {}): PmCommunityPortfolioCard => ({
  communityId: 101,
  communityName: 'Palm Gardens Condo',
  slug: 'palm-gardens-condo',
  communityType: 'condo_718',
  timezone: 'America/New_York',
  residentCount: 30,
  totalUnits: 50,
  openMaintenanceRequests: 3,
  unsatisfiedComplianceItems: 2,
  occupiedUnits: 0,
  occupancyRate: null,
  ...overrides,
});

const makeApartmentCommunity = (overrides: Partial<PmCommunityPortfolioCard> = {}): PmCommunityPortfolioCard => ({
  communityId: 202,
  communityName: 'Oak Park Apartments',
  slug: 'oak-park-apartments',
  communityType: 'apartment',
  timezone: 'America/Chicago',
  residentCount: 40,
  totalUnits: 60,
  openMaintenanceRequests: 1,
  unsatisfiedComplianceItems: 0,
  occupiedUnits: 48,
  occupancyRate: 80,
  ...overrides,
});

describe('CommunityCard', () => {
  describe('condo/HOA card', () => {
    it('renders community name and type badge', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity()} />);

      expect(screen.getByText('Palm Gardens Condo')).toBeInTheDocument();
      expect(screen.getByText('Condo')).toBeInTheDocument();
    });

    it('shows compliance outstanding count', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity({ unsatisfiedComplianceItems: 5 })} />);

      expect(screen.getByText('Compliance Outstanding')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('shows zero compliance count with success status when satisfied', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity({ unsatisfiedComplianceItems: 0 })} />);

      const el = screen.getByText('0');
      expect(el).toBeInTheDocument();
      // StatusBadge wraps label in inner span; outer span has semantic class
      expect(el.parentElement).toHaveClass('text-status-success');
    });

    it('does NOT show occupancy section for condo', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity()} />);

      expect(screen.queryByText('Occupancy')).not.toBeInTheDocument();
    });

    it('links to /pm/dashboard/[communityId]', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity({ communityId: 101 })} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/pm/dashboard/101');
    });
  });

  describe('apartment card', () => {
    it('shows occupancy rate and occupied/total counts', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: false, hasLeaseTracking: true });

      render(
        <CommunityCard community={makeApartmentCommunity({ occupiedUnits: 48, totalUnits: 60, occupancyRate: 80 })} />,
      );

      expect(screen.getByText('Occupancy')).toBeInTheDocument();
      expect(screen.getByText('80%')).toBeInTheDocument();
      expect(screen.getByText('(48/60)')).toBeInTheDocument();
    });

    it('shows dash when occupancyRate is null', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: false, hasLeaseTracking: true });

      render(
        <CommunityCard community={makeApartmentCommunity({ occupiedUnits: 0, totalUnits: 0, occupancyRate: null })} />,
      );

      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('does NOT show compliance section for apartment', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: false, hasLeaseTracking: true });

      render(<CommunityCard community={makeApartmentCommunity()} />);

      expect(screen.queryByText('Compliance Outstanding')).not.toBeInTheDocument();
    });

    it('shows Apartment type badge', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: false, hasLeaseTracking: true });

      render(<CommunityCard community={makeApartmentCommunity()} />);

      expect(screen.getByText('Apartment')).toBeInTheDocument();
    });
  });

  describe('shared metrics', () => {
    it('shows total units and resident count', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(
        <CommunityCard community={makeCondoCommunity({ totalUnits: 50, residentCount: 30 })} />,
      );

      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('shows open maintenance count with warning status when non-zero', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity({ openMaintenanceRequests: 3 })} />);

      const el = screen.getByText('3');
      expect(el).toBeInTheDocument();
      // StatusBadge wraps label in inner span; outer span has semantic class
      expect(el.parentElement).toHaveClass('text-status-warning');
    });

    it('shows None with success status when no open maintenance requests', () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true, hasLeaseTracking: false });

      render(<CommunityCard community={makeCondoCommunity({ openMaintenanceRequests: 0 })} />);

      const el = screen.getByText('None');
      expect(el).toBeInTheDocument();
      expect(el.parentElement).toHaveClass('text-status-success');
    });
  });
});
