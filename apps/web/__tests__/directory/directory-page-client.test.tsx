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
vi.mock('@/hooks/use-access-requests', async (importOriginal) => ({
  // The real query options (they fetch through the mocked walkPaginated).
  ...(await importOriginal<typeof import('../../src/hooks/use-access-requests')>()),
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
  useDelinquencyMock.mockReturnValue(ok([{ unitId: 3, overdueAmountCents: 125_000, daysOverdue: 62 }]));
  usePastDueRuleMock.mockReturnValue(ok({ minCents: 0, minDays: 0 }));
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

  it('filters by building through native radio buttons', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const radio = await screen.findByRole('radio', { name: /Building B/ });
    expect(screen.getByRole('radio', { name: /All buildings/ })).toBeChecked();
    await user.click(radio);
    expect(radio).toBeChecked();
    expect(screen.getByRole('button', { name: /^103/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^101/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter Building B' })).toBeInTheDocument();
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
    // The banner and the Records section both open THIS unit's ledger.
    expect(within(drawer).getByRole('link', { name: 'View ledger' })).toHaveAttribute(
      'href',
      '/communities/42/payments?tab=ledger&unitId=3',
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

describe('DirectoryPageClient — past-due rule', () => {
  it('a unit under the rule is not flagged and its balance shows neutrally', async () => {
    usePastDueRuleMock.mockReturnValue(ok({ minCents: 200_000, minDays: 30 }));
    const user = userEvent.setup();
    renderClient();
    const card = screen.getByRole('button', { name: /^103/ });
    expect(within(card).queryByText(/past due/)).not.toBeInTheDocument();
    expect(card.className).not.toContain('border-b-status-danger');

    await user.click(card);
    const drawer = await screen.findByRole('dialog', { name: /unit 103/i });
    expect(within(drawer).getByText(/\$1,250 overdue — under your past-due rule/)).toBeInTheDocument();
  });

  it('explains the rule in the filters panel', async () => {
    usePastDueRuleMock.mockReturnValue(ok({ minCents: 50_000, minDays: 30 }));
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(
      await screen.findByText(/Past due means a balance over \$500 and more than 30 days late/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change rule' })).toBeInTheDocument();
  });

  it('an abandoned edit to the rule is gone when the dialog is reopened', async () => {
    usePastDueRuleMock.mockReturnValue(ok({ minCents: 50_000, minDays: 30 }));
    const user = userEvent.setup();
    renderClient();
    const openRule = async () => {
      await user.click(screen.getByRole('button', { name: /^Filters/ }));
      await user.click(await screen.findByRole('button', { name: 'Change rule' }));
      return screen.findByRole('dialog', { name: 'Past-due rule' });
    };

    let dialog = await openRule();
    const amount = within(dialog).getByLabelText('Balance over ($)');
    await user.clear(amount);
    await user.type(amount, '999');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Past-due rule' })).not.toBeInTheDocument());

    dialog = await openRule();
    expect(within(dialog).getByLabelText('Balance over ($)')).toHaveValue(500);
  });

  it('hides balances when the rule cannot be loaded', () => {
    usePastDueRuleMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, isSuccess: false });
    renderClient();
    expect(screen.queryByText(/past due/i)).not.toBeInTheDocument();
  });
});

describe('DirectoryPageClient — residents', () => {
  it('tab switch replaces ?tab= in the URL (no history entry per tab)', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('tab', { name: /residents/i }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/directory?tab=residents', { scroll: false });
  });

  it('?q= seeds the search of the tab it opens (command palette, search results)', () => {
    searchState.value = 'tab=residents&q=Ivy';
    renderClient();
    const table = screen.getByRole('table', { name: 'Residents' });
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('Ivy');
    expect(within(table).getByText('Ivy Invited')).toBeInTheDocument();
    expect(within(table).queryByText('Olive Owner')).not.toBeInTheDocument();
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

describe('DirectoryPageClient — management (phase 2)', () => {
  it('editing a unit sends its occupancy, which confirms it', async () => {
    updateUnitMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /^101/ }));
    const drawer = await screen.findByRole('dialog', { name: /unit 101/i });
    await user.click(within(drawer).getByRole('button', { name: 'Edit unit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit unit 101' });
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(updateUnitMock).toHaveBeenCalledWith(expect.objectContaining({ unitId: 1, occupancy: 'owner_occupied' }));
  });

  it('deleting a unit asks first and shows the server refusal', async () => {
    deleteUnitMock.mockRejectedValue(new Error('Cannot delete unit 3: its ledger balance is not zero. Settle or refund it first.'));
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /^103/ }));
    const drawer = await screen.findByRole('dialog', { name: /unit 103/i });
    await user.click(within(drawer).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete unit 103?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete unit' }));
    expect(deleteUnitMock).toHaveBeenCalledWith(3);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(expect.stringMatching(/balance is not zero/)));
  });

  it('removing the last owner warns that the unit will have no owner', async () => {
    searchState.value = 'tab=residents';
    removeResidentMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /olive owner/i }));
    const drawer = await screen.findByRole('dialog', { name: 'Olive Owner' });
    await user.click(within(drawer).getByRole('button', { name: 'Remove from community' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Olive Owner?' });
    expect(within(confirm).getByText(/Unit 101 will have no owner on file/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove resident' }));
    expect(removeResidentMock).toHaveBeenCalledWith('Olive Owner');
  });

  it('bulk resend confirms and invites only residents who have not signed in', async () => {
    searchState.value = 'tab=residents';
    batchInviteMock.mockResolvedValue([{ userId: 'Ivy Invited', status: 'sent' }]);
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resend invites' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Send 1 invitation?' });
    expect(within(confirm).getByText(/1 resident already signed in and will be skipped/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Send invitations' }));
    expect(batchInviteMock).toHaveBeenCalledWith(['Ivy Invited']);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('1 invitation sent, 1 skipped (already active).'),
    );
  });

  it('selection never includes residents a filter has hidden', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.type(screen.getByRole('searchbox', { name: /search name/i }), 'ivy');
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });
});

describe('DirectoryPageClient — send documents (phase 3)', () => {
  it('bulk send asks to confirm for 2+ recipients, then reports every result', async () => {
    searchState.value = 'tab=residents';
    sendDocumentsMock.mockResolvedValue([
      { userId: 'Olive Owner', status: 'emailed', documentIds: [7] },
      { userId: 'Ivy Invited', status: 'opted_out', documentIds: [7] },
    ]);
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.click(screen.getByRole('button', { name: 'Send documents' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send documents' });
    expect(within(dialog).getByText('To 2 residents')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Select documents' })).toBeDisabled();

    await user.click(within(dialog).getByRole('checkbox', { name: /Rules 2026/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Send 1 document' }));
    expect(sendDocumentsMock).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'Send 1 document to 2 residents?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send 1 document' }));

    expect(sendDocumentsMock).toHaveBeenCalledWith({
      documentIds: [7],
      userIds: expect.arrayContaining(['Olive Owner', 'Ivy Invited']),
      sendId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('1 emailed, 1 turned off document emails.'));
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument();
  });

  it('a single resident sends without a confirm step, and a retry reuses the sendId', async () => {
    searchState.value = 'tab=residents';
    sendDocumentsMock
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce([{ userId: 'Olive Owner', status: 'emailed', documentIds: [7, 8] }]);
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /Olive Owner/ }));
    await user.click(await screen.findByRole('button', { name: 'Send documents' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send documents' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Rules 2026/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Annual budget/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Send 2 documents' }));
    await user.click(within(dialog).getByRole('button', { name: 'Send 2 documents' }));

    expect(sendDocumentsMock).toHaveBeenCalledTimes(2);
    const [first, second] = sendDocumentsMock.mock.calls.map(([arg]) => arg.sendId);
    expect(second).toBe(first);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('1 emailed.'));
  });

  it('every entry point is hidden without documents:write', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient({ canSendDocuments: false });
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    expect(screen.queryByRole('button', { name: 'Send documents' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Olive Owner/ }));
    await screen.findByRole('button', { name: 'Edit details' });
    expect(screen.queryByRole('button', { name: 'Send documents' })).not.toBeInTheDocument();
  });
});

describe('DirectoryPageClient — access requests tab', () => {
  const pending = {
    id: 5,
    communityId: 42,
    fullName: 'Rhea Request',
    email: 'rhea@example.com',
    claimedUnitIdentifier: '101',
    claimedUnitId: null,
    isUnitOwner: true,
    status: 'pending' as const,
    createdAt: '2026-09-30T12:00:00.000Z',
  };

  beforeEach(() => {
    searchState.value = '';
    walkPaginatedMock.mockResolvedValue([pending]);
  });

  it('is a tab with the pending count, reachable by URL (?tab=requests, the email link)', async () => {
    searchState.value = 'tab=requests';
    renderClient();
    expect(await screen.findByRole('tab', { name: /access requests\s*1/i })).toHaveAttribute('aria-selected', 'true');
    // The list renders a phone and a desktop layout; either way the request is there.
    expect((await screen.findAllByText('Rhea Request')).length).toBeGreaterThan(0);
    // Nothing to add on this tab.
    expect(screen.queryByRole('button', { name: /add (unit|resident)/i })).not.toBeInTheDocument();
  });

  it('the Requests overview cell switches to the tab instead of opening a drawer', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(await screen.findByRole('button', { name: /access requests/i }));
    expect(replaceMock).toHaveBeenCalledWith('/dashboard/directory?tab=requests', { scroll: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('non-admins never see or fetch it, even with ?tab=requests', () => {
    searchState.value = 'tab=requests';
    renderClient({ isAdmin: false });
    expect(screen.queryByRole('tab', { name: /access requests/i })).not.toBeInTheDocument();
    expect(walkPaginatedMock).not.toHaveBeenCalled();
  });
});

describe('DirectoryPageClient — violations, records and export (design gaps)', () => {
  it('cards show open violations; the unit drawer links to that unit\'s ledger and violations', async () => {
    useUnitsMock.mockReturnValue(ok(UNITS.map((u) => ({ ...u, openViolations: u.id === 3 ? 2 : 0 }))));
    const user = userEvent.setup();
    renderClient();
    const card = screen.getByRole('button', { name: /^103/ });
    expect(within(card).getByText('2 open violations')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /^101/ })).queryByText(/open violation/)).not.toBeInTheDocument();

    await user.click(card);
    const drawer = await screen.findByRole('dialog', { name: /unit 103/i });
    const records = within(drawer).getByRole('region', { name: 'Records' });
    expect(within(records).getByRole('link', { name: /ledger/i })).toHaveAttribute('href', '/communities/42/payments?tab=ledger&unitId=3');
    expect(within(records).getByRole('link', { name: /violations.*2 open violations/i })).toHaveAttribute(
      'href',
      '/violations?communityId=42&unitId=3',
    );
  });

  it('no violations link when the API sent no counts (feature off, or not a manager)', async () => {
    const user = userEvent.setup();
    renderClient({ canSeeBalances: false });
    await user.click(screen.getByRole('button', { name: /^103/ }));
    const drawer = await screen.findByRole('dialog', { name: /unit 103/i });
    expect(within(drawer).queryByRole('region', { name: 'Records' })).not.toBeInTheDocument();
  });

  it('exports units from the menu', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export units (CSV)' }));
    expect(exportMock).toHaveBeenCalledWith({ kind: 'units' }, expect.anything());
  });

  it('the residents bulk bar exports exactly the visible selection', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.type(screen.getByRole('searchbox', { name: /search name/i }), 'ivy');
    await screen.findByText('1 selected');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportMock).toHaveBeenCalledWith(
      { kind: 'residents', userIds: ['Ivy Invited'], occupantIds: [] },
      expect.anything(),
    );
  });
});

describe('DirectoryPageClient — household members (no portal login)', () => {
  const KIM = {
    id: 5,
    communityId: 42,
    unitId: 1,
    fullName: 'Kim Kid',
    email: null,
    phone: null,
    isOwnerHousehold: true,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  };

  beforeEach(() => useOccupantsMock.mockReturnValue(ok([KIM])));

  it('lists them as "No login" beside members, and leaves them out of portal adoption', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();
    const table = screen.getByRole('table', { name: 'Residents' });
    expect(within(table).getByText('Kim Kid')).toBeInTheDocument();
    expect(within(table).getByText('No login')).toBeInTheDocument();
    // Olive is active and Ivy invited: 1 of 2 people with a login, Kim not counted.
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/1 not yet/)).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /kim kid/i }));
    const drawer = await screen.findByRole('dialog', { name: 'Kim Kid' });
    expect(within(drawer).getByText('Household member — no portal login')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /invite|send documents/i })).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/board designations/i)).not.toBeInTheDocument();
  });

  it('bulk resend and send documents skip them, and say so', async () => {
    searchState.value = 'tab=residents';
    batchInviteMock.mockResolvedValue([{ userId: 'Ivy Invited', status: 'sent' }]);
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resend invites' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Send 1 invitation?' });
    expect(within(confirm).getByText(/1 resident already signed in and will be skipped/)).toBeInTheDocument();
    expect(within(confirm).getByText(/1 household member with no portal login will be skipped/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Send invitations' }));
    expect(batchInviteMock).toHaveBeenCalledWith(['Ivy Invited']);
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(
        '1 invitation sent, 1 skipped (already active), 1 skipped (no portal login).',
      ),
    );

    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.click(screen.getByRole('button', { name: 'Send documents' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send documents' });
    expect(within(dialog).getByText('To 2 residents')).toBeInTheDocument();
  });

  it('selecting only household members explains why there is nothing to send', async () => {
    searchState.value = 'tab=residents&q=Kim';
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.click(screen.getByRole('button', { name: 'Resend invites' }));
    expect(toastMock.info).toHaveBeenCalledWith('Household members have no portal login, so there is no invitation to send.');
    expect(batchInviteMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send documents' }));
    expect(toastMock.info).toHaveBeenCalledWith(
      'Household members have no portal login, so documents can’t be sent to them.',
    );
    expect(screen.queryByRole('dialog', { name: 'Send documents' })).not.toBeInTheDocument();
  });

  it('exports their rows by occupant id, separate from member user ids', async () => {
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(exportMock).toHaveBeenCalledWith(
      { kind: 'residents', userIds: expect.arrayContaining(['Olive Owner', 'Ivy Invited']), occupantIds: [5] },
      expect.anything(),
    );
  });

  it('removing one goes to the occupants API with household wording', async () => {
    searchState.value = 'tab=residents';
    removeOccupantMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: /kim kid/i }));
    await user.click(await screen.findByRole('button', { name: 'Remove from household' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Kim Kid?' });
    expect(within(confirm).getByText(/no portal access to lose/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove household member' }));
    expect(removeOccupantMock).toHaveBeenCalledWith({ id: 5 });
    expect(removeResidentMock).not.toHaveBeenCalled();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Household member removed.'));
  });

  it('adding a household member creates an occupant with no invitation', async () => {
    searchState.value = 'tab=residents';
    createOccupantMock.mockResolvedValue({});
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('button', { name: 'Add resident' }));
    const dialog = await screen.findByRole('dialog', { name: /add resident/i });
    await user.type(within(dialog).getByLabelText('Full name'), 'Gran Smith');
    await user.click(within(dialog).getByRole('checkbox', { name: /household member/i }));
    expect(within(dialog).getByLabelText('Email (optional)')).not.toBeRequired();
    expect(within(dialog).queryByRole('checkbox', { name: /send invitation/i })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /unit/i }), '1');
    await user.click(within(dialog).getByRole('button', { name: /save resident/i }));
    expect(createOccupantMock).toHaveBeenCalledWith({
      unitId: 1,
      fullName: 'Gran Smith',
      email: null,
      phone: null,
      isOwnerHousehold: true,
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Household member added.'));
  });

  it('non-admins never fetch them', () => {
    renderClient({ isAdmin: false, canSeeBalances: false });
    expect(useOccupantsMock).toHaveBeenCalledWith(42, { enabled: false });
  });
});
