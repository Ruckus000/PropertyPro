import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Unit } from '../../src/hooks/use-units';
import type { ResidentRecord } from '../../src/hooks/use-residents-management';

const {
  replaceMock,
  searchState,
  useUnitsMock,
  useResidentsListMock,
  useDelinquencyMock,
  resendMock,
  walkPaginatedMock,
  isDesktopMock,
  toastMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchState: { value: '' },
  useUnitsMock: vi.fn(),
  useResidentsListMock: vi.fn(),
  useDelinquencyMock: vi.fn(),
  resendMock: vi.fn(),
  walkPaginatedMock: vi.fn(),
  isDesktopMock: vi.fn(() => true),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/dashboard/directory',
  useSearchParams: () => new URLSearchParams(searchState.value),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/use-media-query', () => ({ useIsDesktop: isDesktopMock }));
vi.mock('@/lib/api/walk-paginated', () => ({ walkPaginated: walkPaginatedMock }));
vi.mock('@/hooks/use-units', () => ({
  useUnits: useUnitsMock,
  useCreateUnit: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-finance', () => ({ useDelinquency: useDelinquencyMock }));
vi.mock('@/hooks/use-residents-management', () => ({
  useResidentsList: useResidentsListMock,
  useResendInvitation: () => ({ mutateAsync: resendMock }),
  useInviteResident: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-access-requests', () => ({
  useApproveAccessRequest: () => ({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() }),
  useDenyAccessRequest: () => ({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() }),
}));

import { DirectoryPageClient } from '../../src/components/directory/directory-page-client';

function unit(id: number, over: Partial<Unit> = {}): Unit {
  return {
    id,
    communityId: 42,
    unitNumber: String(100 + id),
    building: 'A',
    floor: 1,
    bedrooms: 2,
    bathrooms: 1,
    sqft: 900,
    rentAmount: null,
    ownerUserId: null,
    occupancy: 'owner_occupied',
    occupancyConfirmed: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function resident(userId: string, over: Partial<ResidentRecord> = {}): ResidentRecord {
  return {
    userId,
    fullName: userId,
    email: `${userId.toLowerCase().replace(/\s/g, '.')}@x.test`,
    role: 'resident',
    unitId: null,
    phone: null,
    isUnitOwner: true,
    designation: null,
    portalStatus: 'active',
    lastSignInAt: null,
    lastInvitedAt: null,
    ...over,
  };
}

const UNITS = [unit(1), unit(2, { occupancy: 'vacant' }), unit(3, { building: 'B' })];
const RESIDENTS = [
  resident('Olive Owner', { unitId: 1 }),
  resident('Ivy Invited', { unitId: 3, portalStatus: 'invited' }),
];

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() });

function renderClient(props: Partial<Parameters<typeof DirectoryPageClient>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <DirectoryPageClient
      communityId={42}
      communityType="condo_718"
      hasOwnerRole
      isAdmin
      canWrite
      canSeeBalances
      initialTab="units"
      {...props}
    />,
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchState.value = '';
  isDesktopMock.mockReturnValue(true);
  useUnitsMock.mockReturnValue(ok(UNITS));
  useResidentsListMock.mockReturnValue(ok(RESIDENTS));
  useDelinquencyMock.mockReturnValue(ok([{ unitId: 3, overdueAmountCents: 125_000, daysOverdue: 62 }]));
  walkPaginatedMock.mockResolvedValue([]);
  resendMock.mockResolvedValue(undefined);
});

describe('DirectoryPageClient — permissions', () => {
  it('non-admins get units only: no residents tab, overview, balances or resident fetch', () => {
    renderClient({ isAdmin: false, canSeeBalances: false });

    expect(screen.queryByRole('tab', { name: /residents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /directory overview/i })).not.toBeInTheDocument();
    expect(useResidentsListMock).toHaveBeenCalledWith(42, { enabled: false });
    expect(useDelinquencyMock).toHaveBeenCalledWith(42, { enabled: false });
    expect(walkPaginatedMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/past due/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Olive Owner')).not.toBeInTheDocument();
  });

  it('hides Add unit without units.write', () => {
    renderClient({ canWrite: false });
    expect(screen.queryByRole('button', { name: 'Add unit' })).not.toBeInTheDocument();
  });

  it('hides every balance when the delinquency read fails, rather than showing "nothing overdue"', () => {
    useDelinquencyMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, isSuccess: false });
    renderClient();
    expect(screen.queryByText(/past due/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing overdue/i)).not.toBeInTheDocument();
  });
});

describe('DirectoryPageClient — units', () => {
  it('shows owners, flags and the past-due underline on cards', () => {
    renderClient();
    const card = screen.getByRole('button', { name: /^103/ });
    expect(within(card).getByText('$1,250 past due')).toBeInTheDocument();
    expect(within(card).getByText('Ivy Invited')).toBeInTheDocument();
    expect(card.className).toContain('border-b-status-danger');
    // Unit 102 has nobody on file: flagged, and its vacancy is not contradicted.
    const vacant = screen.getByRole('button', { name: /^102/ });
    // Owner line and flag pill both say it.
    expect(within(vacant).getAllByText('No owner on file')).toHaveLength(2);
    expect(within(vacant).getByText('Vacant — no one lives here')).toBeInTheDocument();
  });

  it('the Past due overview cell filters to past-due units and shows a removable token', async () => {
    const user = userEvent.setup();
    renderClient();

    await user.click(within(screen.getByRole('group', { name: /directory overview/i })).getByRole('button', { name: /past due/i }));

    expect(screen.getByRole('button', { name: /^103/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^101/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Past due' }));
    expect(screen.getByRole('button', { name: /^101/ })).toBeInTheDocument();
  });

  it('search with no match offers to clear filters', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.type(screen.getByRole('searchbox', { name: /search unit or owner/i }), 'zzz');
    expect(await screen.findByText('No units match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('button', { name: /^101/ })).toBeInTheDocument();
  });

  it('opens the unit drawer and sends an invite to a resident who has not signed in', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /^103/ }));

    const drawer = await screen.findByRole('dialog', { name: /unit 103/i });
    expect(within(drawer).getByText('$1,250 past due')).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'View ledger' })).toHaveAttribute(
      'href',
      '/communities/42/payments?tab=delinquency',
    );
    await user.click(within(drawer).getByRole('button', { name: 'Resend invite' }));
    expect(resendMock).toHaveBeenCalledWith('Ivy Invited');
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Invitation sent.'));
  });

  it('split view falls back to cards on phones', () => {
    isDesktopMock.mockReturnValue(false);
    renderClient();
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('DirectoryPageClient — residents', () => {
  it('tab switch replaces ?tab= in the URL (no history entry per tab)', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('tab', { name: /residents/i }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/directory?tab=residents', { scroll: false });
  });

  it('lists residents with portal status and opens the resident drawer', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();

    const table = screen.getByRole('table', { name: 'Residents' });
    expect(within(table).getByText('Olive Owner')).toBeInTheDocument();
    expect(within(table).getByText('Invited')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /ivy invited/i }));
    const drawer = await screen.findByRole('dialog', { name: 'Ivy Invited' });
    expect(within(drawer).getByText('Invited — has not signed in yet')).toBeInTheDocument();
    expect(within(drawer).getByText('Board designations are managed in Roles & access.')).toBeInTheDocument();
  });

  it('the portal overview cell filters to residents who have not signed in', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /using the portal/i }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/directory?tab=residents', { scroll: false });
  });
});
