/**
 * The Directory nav item shows the pending access-request count — for managers
 * on an entitled community only (anyone else would just collect a 403).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityRole } from '@propertypro/shared';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

const { walkPaginatedMock } = vi.hoisted(() => ({ walkPaginatedMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api/walk-paginated', () => ({ walkPaginated: walkPaginatedMock }));

function renderSidebar(role: CommunityRole, isLapsed = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <AppSidebar
          communityId={7}
          communityName="Sunset Condos"
          communityType="condo_718"
          role={role}
          features={null}
          isLapsed={isLapsed}
          userName="Pat Manager"
          plan={null}
          expandedOverride
          showCollapseToggle={false}
        />
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe('AppSidebar — Directory badge', () => {
  beforeEach(() => {
    walkPaginatedMock.mockReset();
    walkPaginatedMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it('shows the pending request count on Directory for a manager', async () => {
    renderSidebar('property_manager');
    const link = await screen.findByRole('link', { name: 'Directory, 2 pending access requests' });
    expect(link).toHaveAttribute('href', '/dashboard/directory?communityId=7');
    expect(walkPaginatedMock).toHaveBeenCalledWith('/api/v1/access-requests', { communityId: '7' }, expect.anything());
  });

  it('no badge (and no request) for a manager on a lapsed community', async () => {
    renderSidebar('property_manager', true);
    await screen.findByRole('navigation');
    expect(walkPaginatedMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /pending access request/ })).toBeNull();
  });

  it('residents neither see Directory nor fetch requests', async () => {
    renderSidebar('resident');
    await screen.findByRole('navigation');
    expect(screen.queryByRole('link', { name: /directory/i })).toBeNull();
    expect(walkPaginatedMock).not.toHaveBeenCalled();
  });
});
