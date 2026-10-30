/**
 * The Directory nav item shows the pending join-request count — for managers
 * on an entitled community only (anyone else would just collect a 403).
 *
 * The Website item shows how many Florida records the website still lacks, for
 * managers of a condo or HOA whose plan has the site editor, and for no one
 * else: the sidebar is on every page, so every other viewer must send no request.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeaturesForCommunity, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

const { requestJsonMock } = vi.hoisted(() => ({ requestJsonMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api/request-json', () => ({ requestJson: requestJsonMock }));

interface SidebarOptions {
  isLapsed?: boolean;
  communityType?: CommunityType;
  /** Defaults to the community type's own features; `null` is a shell with none loaded. */
  features?: ReturnType<typeof getFeaturesForCommunity> | null;
  /** Share one client across renders, as navigating between pages does. */
  client?: QueryClient;
}

function renderSidebar(role: CommunityRole, isLapsedOrOptions: boolean | SidebarOptions = false) {
  const options: SidebarOptions =
    typeof isLapsedOrOptions === 'boolean' ? { isLapsed: isLapsedOrOptions } : isLapsedOrOptions;
  const { isLapsed = false, communityType = 'condo_718' } = options;
  const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <AppSidebar
          communityId={7}
          communityName="Sunset Condos"
          communityType={communityType}
          role={role}
          features={options.features === undefined ? null : options.features}
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
    requestJsonMock.mockReset();
    requestJsonMock.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  });

  it('shows the pending request count on Directory for a manager', async () => {
    renderSidebar('property_manager');
    const link = await screen.findByRole('link', { name: 'Directory, 2 pending join requests' });
    expect(link).toHaveAttribute('href', '/dashboard/directory?communityId=7');
    expect(requestJsonMock).toHaveBeenCalledWith('/api/v1/admin/join-requests?communityId=7', expect.anything());
  });

  it('no badge (and no request) for a manager on a lapsed community', async () => {
    renderSidebar('property_manager', true);
    await screen.findByRole('navigation');
    expect(requestJsonMock).not.toHaveBeenCalledWith(expect.stringContaining('join-requests'), expect.anything());
    expect(screen.queryByRole('link', { name: /pending join request/ })).toBeNull();
  });

  it('residents neither see Directory nor fetch requests', async () => {
    renderSidebar('resident');
    await screen.findByRole('navigation');
    expect(screen.queryByRole('link', { name: /directory/i })).toBeNull();
    expect(requestJsonMock).not.toHaveBeenCalledWith(expect.stringContaining('join-requests'), expect.anything());
  });
});


describe('AppSidebar — Website badge', () => {
  const RECORDS_URL = '/api/v1/pm/site/records-alert?communityId=7';
  const askedForRecords = () =>
    requestJsonMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('records-alert'));

  beforeEach(() => {
    requestJsonMock.mockReset();
    requestJsonMock.mockImplementation(async (url: string) =>
      url.includes('records-alert') ? { snoozedUntil: null, missingCount: 3 } : [],
    );
  });

  it('the badge shows the missing count for a covered condo', async () => {
    renderSidebar('property_manager', { features: getFeaturesForCommunity('condo_718') });

    const link = await screen.findByRole('link', { name: 'Website, 3 missing records' });
    expect(link).toHaveAttribute('href', '/pm/website?communityId=7');
    // Readable as text, not only as a coloured dot.
    expect(link).toHaveTextContent('3');
    expect(requestJsonMock).toHaveBeenCalledWith(RECORDS_URL);
  });

  it('counts records for an HOA manager too, and says "record" for one', async () => {
    requestJsonMock.mockImplementation(async (url: string) =>
      url.includes('records-alert') ? { snoozedUntil: null, missingCount: 1 } : [],
    );
    renderSidebar('root_manager', { communityType: 'hoa_720', features: getFeaturesForCommunity('hoa_720') });

    expect(await screen.findByRole('link', { name: 'Website, 1 missing record' })).toBeInTheDocument();
  });

  it('shows no badge when nothing is missing', async () => {
    requestJsonMock.mockImplementation(async (url: string) =>
      url.includes('records-alert') ? { snoozedUntil: null, missingCount: 0 } : [],
    );
    renderSidebar('property_manager', { features: getFeaturesForCommunity('condo_718') });

    await screen.findByRole('link', { name: 'Website' });
    expect(screen.queryByRole('link', { name: /missing record/ })).toBeNull();
  });

  it('does not ask again on every page the manager opens', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = { client, features: getFeaturesForCommunity('condo_718') };
    const first = renderSidebar('property_manager', options);
    await screen.findByRole('link', { name: 'Website, 3 missing records' });
    first.unmount();

    // The sidebar remounts on a navigation; the count it already has is fresh.
    renderSidebar('property_manager', options);
    await screen.findByRole('link', { name: 'Website, 3 missing records' });
    const recordsCalls = requestJsonMock.mock.calls.filter(([url]) => String(url).includes('records-alert'));
    expect(recordsCalls).toHaveLength(1);
  });

  it('the badge query is disabled for a resident', async () => {
    renderSidebar('resident', { features: getFeaturesForCommunity('condo_718') });

    await screen.findByRole('navigation');
    expect(screen.queryByRole('link', { name: /website/i })).toBeNull();
    expect(askedForRecords()).toBe(false);
  });

  it('sends no request for an apartment manager, which owes no records', async () => {
    renderSidebar('property_manager', { communityType: 'apartment', features: getFeaturesForCommunity('apartment') });

    await screen.findByRole('link', { name: 'Website' });
    expect(askedForRecords()).toBe(false);
    expect(screen.queryByRole('link', { name: /missing record/ })).toBeNull();
  });

  it('sends no request when the plan lacks the site editor, or for a lapsed manager', async () => {
    const noEditor = { ...getFeaturesForCommunity('condo_718'), hasSiteEditor: false };
    const { unmount } = renderSidebar('property_manager', { features: noEditor });
    await screen.findByRole('navigation');
    expect(askedForRecords()).toBe(false);
    unmount();

    renderSidebar('property_manager', { isLapsed: true, features: getFeaturesForCommunity('condo_718') });
    await screen.findByRole('navigation');
    expect(askedForRecords()).toBe(false);
  });
});
