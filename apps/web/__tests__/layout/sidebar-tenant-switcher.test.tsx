/**
 * The sidebar switcher's list is loaded only when the popover opens (it is a
 * `next/dynamic` chunk, to keep it out of every page's first-load JS). This
 * pins that opening it still shows each community with its avatar.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@/hooks/use-user-communities', () => ({
  useUserCommunities: () => ({
    data: [
      { id: 7, name: 'Sunset Condos', slug: 'sunset-condos', role: 'property_manager', displayTitle: null, communityType: 'condo_718', logoUrl: 'https://cdn/sunset.png' },
      { id: 12, name: 'Palm Shores HOA', slug: 'palm-shores-hoa', role: 'root_manager', displayTitle: null, communityType: 'hoa_720', logoUrl: null },
    ],
  }),
}));

import { SidebarTenantSwitcher } from '@/components/layout/sidebar-tenant-switcher';

describe('SidebarTenantSwitcher', () => {
  it('opens to each community with its logo or initial', async () => {
    const user = userEvent.setup();
    render(<SidebarTenantSwitcher communityId={7} communityName="Sunset Condos" expanded />);

    await user.click(screen.getByRole('button', { name: 'Switch community' }));

    const sunset = (await screen.findByText('Sunset Condos', { selector: 'span.truncate.flex-1' })).closest('a')!;
    expect(sunset.querySelector('img')).toHaveAttribute('src', 'https://cdn/sunset.png');
    const palm = screen.getByText('Palm Shores HOA').closest('a')!;
    expect(palm.querySelector('img')).toBeNull();
    expect(palm.querySelector('span[aria-hidden="true"]')).toHaveTextContent('P');
  });
});
