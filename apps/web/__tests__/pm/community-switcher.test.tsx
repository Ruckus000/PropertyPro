import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { useRouterMock, selectCommunityMock, recentCommunityIdsMock } = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  selectCommunityMock: vi.fn(),
  recentCommunityIdsMock: { current: [] as number[] },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => useRouterMock(),
  usePathname: () => '/pm/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useSelectedCommunity', () => ({
  useSelectedCommunity: () => ({
    recentCommunityIds: recentCommunityIdsMock.current,
    selectCommunity: selectCommunityMock,
  }),
}));

import { CommunitySwitcher } from '../../src/components/pm/CommunitySwitcher';
import type { PmCommunityPortfolioCard } from '../../src/lib/api/pm-communities';

const makeCommunity = (id: number, name: string, type: PmCommunityPortfolioCard['communityType'] = 'condo_718'): PmCommunityPortfolioCard => ({
  communityId: id,
  communityName: name,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  communityType: type,
  timezone: 'America/New_York',
  residentCount: 10,
  totalUnits: 20,
  openMaintenanceRequests: 0,
  unsatisfiedComplianceItems: 0,
  occupiedUnits: 0,
  occupancyRate: null,
});

const COMMUNITIES: PmCommunityPortfolioCard[] = [
  makeCommunity(1, 'Alpha Condo'),
  makeCommunity(2, 'Beta HOA', 'hoa_720'),
  makeCommunity(3, 'Gamma Apartments', 'apartment'),
];

describe('CommunitySwitcher', () => {
  let pushMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pushMock = vi.fn();
    useRouterMock.mockReturnValue({ push: pushMock });
    recentCommunityIdsMock.current = [];
    vi.clearAllMocks();
    useRouterMock.mockReturnValue({ push: pushMock });
  });

  it('renders the switcher button', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    expect(screen.getByRole('button', { name: /switch community/i })).toBeInTheDocument();
  });

  it('shows current community name in button when provided', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} currentCommunityId={1} />);
    expect(screen.getByRole('button', { name: /alpha condo/i })).toBeInTheDocument();
  });

  it('opens the dropdown when button is clicked', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    const button = screen.getByRole('button', { name: /switch community/i });
    fireEvent.click(button);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('lists all communities in the dropdown', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Alpha Condo')).toBeInTheDocument();
    expect(screen.getByText('Beta HOA')).toBeInTheDocument();
    expect(screen.getByText('Gamma Apartments')).toBeInTheDocument();
  });

  it('filters communities by search input', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    const searchInput = screen.getByRole('searchbox', { name: /search communities/i });
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    expect(screen.getByText('Alpha Condo')).toBeInTheDocument();
    expect(screen.queryByText('Beta HOA')).not.toBeInTheDocument();
    expect(screen.queryByText('Gamma Apartments')).not.toBeInTheDocument();
  });

  it('shows no results message when search matches nothing', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz-no-match' } });

    expect(screen.getByText('No communities found')).toBeInTheDocument();
  });

  it('navigates to /pm/dashboard/[id] when community is selected', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Beta HOA'));

    expect(pushMock).toHaveBeenCalledWith('/pm/dashboard/2');
  });

  it('calls selectCommunity with the chosen id', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Gamma Apartments'));

    expect(selectCommunityMock).toHaveBeenCalledWith(3);
  });

  it('closes the dropdown after selection', () => {
    render(<CommunitySwitcher communities={COMMUNITIES} />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.click(screen.getByText('Alpha Condo'));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  describe('recent communities ordering', () => {
    it('shows recent communities first', () => {
      recentCommunityIdsMock.current = [3, 1];

      render(<CommunitySwitcher communities={COMMUNITIES} />);
      fireEvent.click(screen.getByRole('button'));

      const options = screen.getAllByRole('option');
      expect(options[0]).toHaveTextContent('Gamma Apartments');
      expect(options[1]).toHaveTextContent('Alpha Condo');
      expect(options[2]).toHaveTextContent('Beta HOA');
    });

    it('shows Recent label when there are recent communities', () => {
      recentCommunityIdsMock.current = [2];

      render(<CommunitySwitcher communities={COMMUNITIES} />);
      fireEvent.click(screen.getByRole('button'));

      expect(screen.getByText('Recent')).toBeInTheDocument();
    });

    it('does not show Recent label when there are no recent communities', () => {
      recentCommunityIdsMock.current = [];

      render(<CommunitySwitcher communities={COMMUNITIES} />);
      fireEvent.click(screen.getByRole('button'));

      expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    });
  });
});
