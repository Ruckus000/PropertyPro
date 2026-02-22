import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/mobile'),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { usePathname } from 'next/navigation';
import { BottomTabBar } from '../../src/components/mobile/BottomTabBar';
import type { CommunityFeatures } from '@propertypro/shared';

const CONDO_FEATURES: CommunityFeatures = {
  hasCompliance: true,
  hasStatutoryCategories: true,
  hasLeaseTracking: false,
  hasMeetings: true,
  hasPublicNoticesPage: true,
  hasOwnerRole: true,
  hasVoting: true,
  requiresPublicWebsite: true,
  hasMaintenanceRequests: true,
  hasAnnouncements: true,
};

const APARTMENT_FEATURES: CommunityFeatures = {
  hasCompliance: false,
  hasStatutoryCategories: false,
  hasLeaseTracking: true,
  hasMeetings: false,
  hasPublicNoticesPage: false,
  hasOwnerRole: false,
  hasVoting: false,
  requiresPublicWebsite: false,
  hasMaintenanceRequests: true,
  hasAnnouncements: true,
};

describe('BottomTabBar', () => {
  it('renders Home, Documents, Meetings, Announcements, More tabs for condo', () => {
    render(<BottomTabBar features={CONDO_FEATURES} communityId={1} />);
    expect(screen.getByLabelText('Home')).toBeInTheDocument();
    expect(screen.getByLabelText('Documents')).toBeInTheDocument();
    expect(screen.getByLabelText('Meetings')).toBeInTheDocument();
    expect(screen.getByLabelText('Announcements')).toBeInTheDocument();
    expect(screen.getByLabelText('More')).toBeInTheDocument();
  });

  it('hides Meetings tab for apartment community', () => {
    render(<BottomTabBar features={APARTMENT_FEATURES} communityId={2} />);
    expect(screen.queryByLabelText('Meetings')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Home')).toBeInTheDocument();
    expect(screen.getByLabelText('Documents')).toBeInTheDocument();
    expect(screen.getByLabelText('Announcements')).toBeInTheDocument();
  });

  it('marks Home tab as active when pathname is /mobile', () => {
    vi.mocked(usePathname).mockReturnValue('/mobile');
    render(<BottomTabBar features={CONDO_FEATURES} communityId={1} />);
    const homeLink = screen.getByLabelText('Home');
    expect(homeLink).toHaveAttribute('aria-current', 'page');
    expect(homeLink).toHaveAttribute('data-active', 'true');
  });

  it('marks Documents tab as active when pathname is /mobile/documents', () => {
    vi.mocked(usePathname).mockReturnValue('/mobile/documents');
    render(<BottomTabBar features={CONDO_FEATURES} communityId={1} />);
    const docsLink = screen.getByLabelText('Documents');
    expect(docsLink).toHaveAttribute('aria-current', 'page');
    const homeLink = screen.getByLabelText('Home');
    expect(homeLink).not.toHaveAttribute('aria-current', 'page');
  });

  it('includes communityId in tab hrefs', () => {
    render(<BottomTabBar features={CONDO_FEATURES} communityId={42} />);
    const homeLink = screen.getByLabelText('Home') as HTMLAnchorElement;
    expect(homeLink.href).toContain('communityId=42');
  });

  it('all tab elements have min-height via CSS class', () => {
    render(<BottomTabBar features={CONDO_FEATURES} communityId={1} />);
    const tabs = screen.getAllByRole('link');
    tabs.forEach((tab) => {
      expect(tab).toHaveClass('mobile-tab-item');
    });
  });
});
