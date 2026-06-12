import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const {
  useCommunityRosterMock,
  useAssignPropertyManagerMock,
  useRevokePropertyManagerMock,
  useTransferRootMock,
  useSetDesignationMock,
} = vi.hoisted(() => ({
  useCommunityRosterMock: vi.fn(),
  useAssignPropertyManagerMock: vi.fn(),
  useRevokePropertyManagerMock: vi.fn(),
  useTransferRootMock: vi.fn(),
  useSetDesignationMock: vi.fn(),
}));

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/hooks/use-role-management', () => ({
  useCommunityRoster: useCommunityRosterMock,
  useAssignPropertyManager: useAssignPropertyManagerMock,
  useRevokePropertyManager: useRevokePropertyManagerMock,
  useTransferRoot: useTransferRootMock,
  useSetDesignation: useSetDesignationMock,
}));

import { RolesAccessClient } from '@/components/settings/RolesAccessClient';

function mutationStub(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: undefined,
    ...overrides,
  };
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const ROSTER = [
  { userId: 'root1', fullName: 'Root Rita', role: 'root_manager' },
  { userId: 'pm1', fullName: 'PM Pat', role: 'property_manager' },
  { userId: 'res1', fullName: 'Resident Rey', role: 'resident' },
];

beforeEach(() => {
  vi.clearAllMocks();
  useCommunityRosterMock.mockReturnValue({
    data: ROSTER,
    isLoading: false,
    isError: false,
  });
  useAssignPropertyManagerMock.mockReturnValue(mutationStub());
  useRevokePropertyManagerMock.mockReturnValue(mutationStub());
  useTransferRootMock.mockReturnValue(mutationStub());
  useSetDesignationMock.mockReturnValue(mutationStub());
});

function renderClient(communityType: 'condo_718' | 'apartment' = 'condo_718') {
  const Wrapper = makeWrapper();
  return render(
    <Wrapper>
      <RolesAccessClient
        communityId={42}
        communityType={communityType}
        currentRootUserId="root1"
        communityName="Sunset Condos"
      />
    </Wrapper>,
  );
}

describe('RolesAccessClient', () => {
  it('renders the four sections for a condo', () => {
    renderClient('condo_718');
    expect(screen.getByText('Root manager')).toBeInTheDocument();
    expect(screen.getByText('Property managers')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
  });

  it('hides the Board section for an apartment', () => {
    renderClient('apartment');
    expect(screen.getByText('Root manager')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.queryByText('Board')).not.toBeInTheDocument();
  });

  it('shows a promote button for the resident', () => {
    renderClient('condo_718');
    expect(screen.getByTestId('member-promote-res1')).toBeInTheDocument();
  });

  it('shows the static bylaws note in the Board section', () => {
    renderClient('condo_718');
    expect(
      screen.getByText(/PropertyPro records the designation you set/i),
    ).toBeInTheDocument();
  });

  it('renders loading skeletons', () => {
    useCommunityRosterMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderClient('condo_718');
    expect(screen.getByTestId('roles-access-loading')).toBeInTheDocument();
  });

  it('shows the eligibility ack checkbox on a 409 and re-submits with acknowledgeNonOwner', async () => {
    // First attempt resolves to the ack-required 409 result; the re-submit
    // (with the box checked) resolves ok.
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'non_owner_requires_ack' })
      .mockResolvedValueOnce({ ok: true });
    useSetDesignationMock.mockReturnValue(mutationStub({ mutateAsync }));

    renderClient('condo_718');

    // Attempt to set the resident as a board member.
    fireEvent.click(screen.getByTestId('board-member-res1'));

    // The eligibility checkbox should appear after the 409.
    const checkbox = await screen.findByTestId('board-ack-res1');
    expect(
      screen.getByText(/I confirm this person is eligible per our bylaws/i),
    ).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenNthCalledWith(1, {
      userId: 'res1',
      designation: 'board_member',
      acknowledgeNonOwner: false,
    });

    // Check the box and re-submit.
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByTestId('board-ack-submit-res1'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    // Re-submit must carry acknowledgeNonOwner:true AND the SAME designation.
    expect(mutateAsync).toHaveBeenNthCalledWith(2, {
      userId: 'res1',
      designation: 'board_member',
      acknowledgeNonOwner: true,
    });
  });

  it('renders an error banner', () => {
    useCommunityRosterMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    });
    renderClient('condo_718');
    expect(screen.getByText(/couldn’t load the community roster/i)).toBeInTheDocument();
  });
});
