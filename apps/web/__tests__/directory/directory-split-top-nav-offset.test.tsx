/**
 * D30: the Directory split view is the one pane sized from the viewport, so with
 * the top-nav flag on the tab row's height comes off it (19rem, not 16rem).
 * Mocks mirror directory-page-client.test.tsx.
 */
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
  usePastDueRuleMock,
  resendMock,
  walkPaginatedMock,
  isDesktopMock,
  toastMock,
  deleteUnitMock,
  updateUnitMock,
  removeResidentMock,
  batchInviteMock,
  sendDocumentsMock,
  exportMock,
  useOccupantsMock,
  createOccupantMock,
  removeOccupantMock,
  useAdminJoinRequestsMock,
  flag,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchState: { value: '' },
  useUnitsMock: vi.fn(),
  useResidentsListMock: vi.fn(),
  useDelinquencyMock: vi.fn(),
  usePastDueRuleMock: vi.fn(),
  resendMock: vi.fn(),
  walkPaginatedMock: vi.fn(),
  isDesktopMock: vi.fn(() => true),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  deleteUnitMock: vi.fn(),
  updateUnitMock: vi.fn(),
  removeResidentMock: vi.fn(),
  batchInviteMock: vi.fn(),
  sendDocumentsMock: vi.fn(),
  exportMock: vi.fn(),
  useOccupantsMock: vi.fn(),
  createOccupantMock: vi.fn(),
  removeOccupantMock: vi.fn(),
  useAdminJoinRequestsMock: vi.fn(),
  flag: { on: false },
}));

// The flag is a build-time constant; a getter lets each test pick a value.
vi.mock('@/components/layout/top-nav-flag', () => ({
  get TOP_NAV_ENABLED() {
    return flag.on;
  },
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
  useUpdateUnit: () => ({ mutateAsync: updateUnitMock, isPending: false, error: null, reset: vi.fn() }),
  useDeleteUnit: () => ({ mutateAsync: deleteUnitMock, isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-finance', () => ({ useDelinquency: useDelinquencyMock }));
vi.mock('@/hooks/use-past-due-rule', () => ({
  usePastDueRule: usePastDueRuleMock,
  useUpdatePastDueRule: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-residents-management', () => ({
  useResidentsList: useResidentsListMock,
  useResendInvitation: () => ({ mutateAsync: resendMock }),
  useInviteResident: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useUpdateResident: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useRemoveResident: () => ({ mutateAsync: removeResidentMock, isPending: false, error: null, reset: vi.fn() }),
  useBatchInvite: () => ({ mutateAsync: batchInviteMock, isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-documents', () => ({
  useDocuments: () => ({
    data: [
      { id: 7, title: 'Rules 2026', createdAt: '2026-03-18T00:00:00Z' },
      { id: 8, title: '2026 Annual budget', createdAt: '2025-11-12T00:00:00Z' },
    ],
    isLoading: false,
    isError: false,
  }),
  useSendDocuments: () => ({ mutateAsync: sendDocumentsMock, isPending: false, error: null }),
}));
vi.mock('@/hooks/use-directory-export', () => ({
  useDirectoryExport: () => ({ mutate: exportMock, isPending: false }),
}));
vi.mock('@/hooks/use-occupants', async (importOriginal) => ({
  // The real key and row helpers; only the network hooks are stubbed.
  ...(await importOriginal<typeof import('../../src/hooks/use-occupants')>()),
  useOccupants: useOccupantsMock,
  useCreateOccupant: () => ({ mutateAsync: createOccupantMock, isPending: false, error: null, reset: vi.fn() }),
  useUpdateOccupant: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useRemoveOccupant: () => ({ mutateAsync: removeOccupantMock, isPending: false, error: null, reset: vi.fn() }),
}));
vi.mock('@/hooks/use-admin-join-requests', () => ({
  useAdminJoinRequests: useAdminJoinRequestsMock,
  useReviewJoinRequest: () => ({ mutate: vi.fn(), isPending: false, error: null }),
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
    updatedAt: '2026-10-01T09:00:00.000Z',
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
      canSendDocuments
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
  useOccupantsMock.mockReturnValue(ok([]));
  useAdminJoinRequestsMock.mockReturnValue(ok([]));
  useDelinquencyMock.mockReturnValue(ok([{ unitId: 3, overdueAmountCents: 125_000, daysOverdue: 62 }]));
  usePastDueRuleMock.mockReturnValue(ok({ minCents: 0, minDays: 0 }));
  walkPaginatedMock.mockResolvedValue([]);
  resendMock.mockResolvedValue(undefined);
});


describe('DirectoryPageClient — split view offset (D30)', () => {
  async function openSplit() {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: 'Split' }));
    const list = document.querySelector('[class*="grid-cols-[300px"]');
    expect(list).not.toBeNull();
    return list as HTMLElement;
  }

  it('directory split view uses the taller offset below lg always, and at lg+ only with the flag on', async () => {
    flag.on = false;
    const off = await openSplit();
    // A phone has the tab row in every build; the desktop has the rail (no row).
    expect(off.className).toContain('h-[calc(100dvh-19rem)]');
    expect(off.className).toContain('lg:h-[calc(100dvh-16rem)]');
    cleanup();

    flag.on = true;
    const on = await openSplit();
    expect(on.className).toContain('h-[calc(100dvh-19rem)]');
    expect(on.className).not.toContain('h-[calc(100dvh-16rem)]');
  });
});
