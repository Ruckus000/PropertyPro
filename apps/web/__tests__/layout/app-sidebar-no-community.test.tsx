import React, { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

let mockPathname = '/select-community';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Stub the lazily-loaded picker so this test covers the sidebar's wiring
// (button vs link, which destination is handed over) rather than the dialog.
vi.mock('@/components/layout/community-picker-dialog', () => ({
  CommunityPickerDialog: ({
    open,
    itemLabel,
    buildDestination,
  }: {
    open: boolean;
    itemLabel: string | null;
    buildDestination: ((communityId: number) => string) | null;
  }) =>
    open ? (
      <div data-testid="community-picker">
        <span data-testid="picker-label">{itemLabel}</span>
        <span data-testid="picker-destination">{buildDestination?.(7) ?? ''}</span>
      </div>
    ) : null,
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider>{node}</SidebarProvider>
    </QueryClientProvider>
  );
}

function renderSidebar(communityId: number | null) {
  return render(
    wrap(
      <AppSidebar
        communityId={communityId}
        communityName={communityId ? 'Sunset Condos' : null}
        communityType={communityId ? 'condo_718' : null}
        role={communityId ? 'property_manager' : null}
        features={null}
        userName="Test Ruckus"
        plan={null}
        expandedOverride
        showCollapseToggle={false}
      />,
    ),
  );
}

beforeEach(() => {
  mockPathname = '/select-community';
  window.localStorage.clear();
});

describe('AppSidebar with no community in scope', () => {
  it('renders nav items as dialog-opening buttons, not dead links', async () => {
    renderSidebar(null);

    const documents = await screen.findByRole('button', { name: /documents/i });
    expect(documents).toHaveAttribute('aria-haspopup', 'dialog');
    // The old behaviour: every item linked to /select-community, so on that
    // page clicking did nothing at all.
    expect(screen.queryByRole('link', { name: /documents/i })).toBeNull();
  });

  it('opens the picker with the clicked item’s own destination', async () => {
    renderSidebar(null);

    fireEvent.click(await screen.findByRole('button', { name: /documents/i }));

    expect(await screen.findByTestId('community-picker')).toBeInTheDocument();
    expect(screen.getByTestId('picker-label')).toHaveTextContent('Documents');
    expect(screen.getByTestId('picker-destination')).toHaveTextContent('/communities/7/documents');
  });

  it('hides role-gated items, since the role is unknowable without a community', async () => {
    renderSidebar(null);

    // Documents has no visibility gate, so it stays.
    expect(await screen.findByRole('button', { name: /documents/i })).toBeInTheDocument();
    // Residents is visibility: 'admin'. A null role would otherwise let it
    // through, and picking a community would land on a permission-denied page.
    expect(screen.queryByRole('button', { name: /residents/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /audit trail/i })).toBeNull();
  });

  it('renders normal links and never mounts the picker once a community is in scope', async () => {
    renderSidebar(42);

    expect(await screen.findByRole('link', { name: /documents/i })).toHaveAttribute(
      'href',
      '/communities/42/documents',
    );
    expect(screen.queryByTestId('community-picker')).toBeNull();
  });
});

describe('AppSidebar PM context', () => {
  it('keeps the community nav on the community-scoped website page', async () => {
    mockPathname = '/pm/settings/website';
    renderSidebar(42);

    // The regression: this page used to swap in the 4-item PM portfolio nav.
    expect(await screen.findByRole('link', { name: /documents/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /templates/i })).toBeNull();
  });

  it('still shows the PM portfolio nav on portfolio routes', async () => {
    mockPathname = '/pm/dashboard/communities';
    renderSidebar(null);

    expect(await screen.findByRole('link', { name: /templates/i })).toHaveAttribute(
      'href',
      '/pm/portfolio/templates',
    );
    expect(screen.queryByRole('link', { name: /documents/i })).toBeNull();
  });
});
