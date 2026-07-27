import React, { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityPickerDialog } from '@/components/layout/community-picker-dialog';

const useUserCommunitiesMock = vi.fn();

vi.mock('@/hooks/use-user-communities', () => ({
  useUserCommunities: () => useUserCommunitiesMock(),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const COMMUNITIES = [
  {
    id: 7,
    name: 'Sunset Condos',
    slug: 'sunset-condos',
    role: 'property_manager',
    displayTitle: null,
    communityType: 'condo_718' as const,
  },
  {
    id: 12,
    name: 'Palm Shores HOA',
    slug: 'palm-shores-hoa',
    role: 'root_manager',
    displayTitle: null,
    communityType: 'hoa_720' as const,
  },
];

function renderDialog(buildDestination: (communityId: number) => string, label = 'Documents') {
  return render(
    wrap(
      <CommunityPickerDialog
        open
        onOpenChange={() => {}}
        itemLabel={label}
        buildDestination={buildDestination}
      />,
    ),
  );
}

beforeEach(() => {
  useUserCommunitiesMock.mockReset();
  useUserCommunitiesMock.mockReturnValue({
    data: COMMUNITIES,
    isPending: false,
    isError: false,
  });
});

describe('<CommunityPickerDialog>', () => {
  it('lists the user communities with the clicked item in the description', () => {
    renderDialog((id) => `/dashboard?communityId=${id}`);

    expect(screen.getByText('Select a community')).toBeInTheDocument();
    expect(screen.getByText('Choose which community to open Documents for.')).toBeInTheDocument();
    expect(screen.getByText('Sunset Condos')).toBeInTheDocument();
    expect(screen.getByText('Palm Shores HOA')).toBeInTheDocument();
  });

  it('builds a query-scoped destination for the picked community', () => {
    renderDialog((id) => `/dashboard?communityId=${id}`);

    const link = screen.getByRole('link', { name: 'Open Documents for Sunset Condos' });
    expect(link).toHaveAttribute('href', '/dashboard?communityId=7');
  });

  it('injects ?communityId= into PATH-scoped destinations', () => {
    // Regression guard: tenant resolution has no path-based branch, so
    // /communities/7/documents alone would bounce back to /select-community.
    renderDialog((id) => `/communities/${id}/documents`);

    const link = screen.getByRole('link', { name: 'Open Documents for Sunset Condos' });
    expect(link).toHaveAttribute('href', '/communities/7/documents?communityId=7');
  });

  it('replaces a stale communityId rather than duplicating it', () => {
    renderDialog(() => '/dashboard?communityId=999&tab=open');

    const link = screen.getByRole('link', { name: 'Open Documents for Palm Shores HOA' });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('communityId=12');
    expect(href).not.toContain('999');
    expect(href).toContain('tab=open');
  });

  it('renders a loading state while the communities load', () => {
    useUserCommunitiesMock.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderDialog((id) => `/dashboard?communityId=${id}`);

    expect(screen.getByLabelText('Loading your communities')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders an error state when the request fails', () => {
    useUserCommunitiesMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderDialog((id) => `/dashboard?communityId=${id}`);

    expect(screen.getByText("We couldn't load your communities")).toBeInTheDocument();
  });

  it('renders a constructive empty state for a user with no memberships', () => {
    useUserCommunitiesMock.mockReturnValue({ data: [], isPending: false, isError: false });
    renderDialog((id) => `/dashboard?communityId=${id}`);

    expect(screen.getByText('You are not a member of any community yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
