import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MobileProfileContent } from '../../src/components/mobile/MobileProfileContent';

vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  SlideUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/mobile/MobileBackHeader', () => ({
  MobileBackHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}));

function renderProfile(overrides: Partial<Parameters<typeof MobileProfileContent>[0]> = {}) {
  return render(
    <MobileProfileContent
      userName="Jordan Admin"
      userRole="Root Manager"
      communityName="Palm Shores HOA"
      communityId={42}
      role="root_manager"
      hasCompliance
      hasFinance
      {...overrides}
    />,
  );
}

describe('MobileProfileContent (Wave 3 C3 — dead-link audit)', () => {
  it('renders every menu row as a real link with a resolved href', () => {
    renderProfile();

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    // No row points nowhere: every link has a non-empty, non-placeholder href.
    for (const link of links) {
      const href = link.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).not.toBe('#');
    }
  });

  it('has no "Coming soon" placeholder rows in the live menu', () => {
    renderProfile();
    // The dead-link audit requires no inert placeholder rows shipped to GA.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    // And no element is left in an aria-disabled state on this surface.
    expect(document.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('exposes the compliance dashboard entry for admin roles', () => {
    renderProfile();
    const compliance = screen.getByRole('link', { name: /compliance dashboard/i });
    expect(compliance).toHaveAttribute('href', '/communities/42/compliance');
  });

  it('hides compliance for non-admin residents', () => {
    renderProfile({ role: 'resident' });
    expect(
      screen.queryByRole('link', { name: /compliance dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
