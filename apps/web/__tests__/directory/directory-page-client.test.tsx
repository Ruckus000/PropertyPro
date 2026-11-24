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
  useAdminJoinRequestsMock,
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
// Tab switches write the URL with history.replaceState, which Next syncs into
// useSearchParams without a server render. Asserting router.replace is NOT
// called is the point: that call re-rendered the force-dynamic page.
const historyReplace = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});


beforeEach(() => {
  historyReplace.mockClear();
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
    expect(historyReplace).toHaveBeenCalledWith(null, '', '/dashboard/directory?tab=residents');
    expect(replaceMock).not.toHaveBeenCalled();
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
    expect(historyReplace).toHaveBeenCalledWith(null, '', '/dashboard/directory?tab=residents');
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

  // Audit F4: past the 100-per-minute email budget a later chunk is refused.
  // Clearing the selection lost track of exactly who still needed an invite.
  it('keeps the residents not sent selected, and says so', async () => {
    searchState.value = 'tab=residents';
    batchInviteMock.mockResolvedValue([
      { userId: 'Ivy Invited', status: 'failed', error: 'Email limit reached: 100 emails per minute. Try again in 42 seconds.' },
    ]);
    const user = userEvent.setup();
    renderClient();
    await user.click(screen.getByRole('checkbox', { name: 'Select all shown residents' }));
    await user.click(screen.getByRole('button', { name: 'Resend invites' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Send 1 invitation?' });
    await user.click(within(confirm).getByRole('button', { name: 'Send invitations' }));

    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('The 1 not sent stay selected so you can retry.')),
    );
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
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

describe('DirectoryPageClient — join requests tab', () => {
  const pending = {
    id: 5,
    userId: 'u-5',
    communityId: 42,
    unitIdentifier: '101',
    residentType: 'owner',
    status: 'pending',
    createdAt: '2026-09-30T12:00:00.000Z',
    unitOnRoster: true,
    requesterName: 'Rhea Request',
    requesterEmail: 'rhea@example.com',
  };

  beforeEach(() => {
    searchState.value = '';
    useAdminJoinRequestsMock.mockReturnValue(ok([pending]));
  });

  it('is a tab with the pending count, reachable by URL (?tab=requests)', async () => {
    searchState.value = 'tab=requests';
    renderClient();
    expect(await screen.findByRole('tab', { name: /join requests\s*1/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Rhea Request/)).toBeInTheDocument();
    expect(useAdminJoinRequestsMock).toHaveBeenCalledWith({ communityId: 42, enabled: true });
    // Nothing to add on this tab.
    expect(screen.queryByRole('button', { name: /add (unit|resident)/i })).not.toBeInTheDocument();
  });

  it('the Requests overview cell switches to the tab instead of opening a drawer', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(await screen.findByRole('button', { name: /join requests/i }));
    expect(historyReplace).toHaveBeenCalledWith(null, '', '/dashboard/directory?tab=requests');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('non-admins never see or fetch it, even with ?tab=requests', () => {
    searchState.value = 'tab=requests';
    renderClient({ isAdmin: false });
    expect(screen.queryByRole('tab', { name: /join requests/i })).not.toBeInTheDocument();
    expect(useAdminJoinRequestsMock).toHaveBeenCalledWith({ communityId: 42, enabled: false });
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
    expect(within(confirm).getByText(/details are permanently deleted.*no portal access to lose/)).toBeInTheDocument();
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

// ── Empty states (docs/design-system/patterns/empty-states.md §4.1, §4.3) ──

describe('DirectoryPageClient — setup', () => {
  beforeEach(() => localStorage.clear());

  it('a manager with no units gets the setup guide instead of zeros (F-4) and tabs', async () => {
    useUnitsMock.mockReturnValue(ok([]));
    useResidentsListMock.mockReturnValue(ok([]));
    renderClient();
    expect(await screen.findByRole('heading', { level: 2, name: 'Build your community directory' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Directory overview' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
    // Both ways in, the CSV importer no longer hidden in a menu (F-2).
    expect(screen.getByRole('button', { name: 'Import units: From a spreadsheet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a unit: One at a time' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Unit spreadsheet format' }).textContent).toContain('unit_number');
  });

  it('keeps Residents blocked, with the reason, until a unit exists (F-1)', async () => {
    useUnitsMock.mockReturnValue(ok([]));
    // A resident on file without a unit must not mark the blocked step done.
    useResidentsListMock.mockReturnValue(ok([resident('No Unit', { unitId: null })]));
    renderClient();
    const rail = within(await screen.findByRole('navigation', { name: 'Setup steps' }));
    const residents = rail.getByRole('button', { name: /Residents/ });
    expect(residents.getAttribute('aria-disabled')).toBe('true');
    expect(residents.textContent).toContain('Residents unlock after units');
    expect(residents.textContent).not.toContain('Completed:');
    expect(rail.getByRole('button', { name: /Invitations/ }).textContent).not.toContain('Completed:');
  });

  // The guide is next/dynamic, so "absent" is proven by what renders INSTEAD:
  // the units tab's own empty state lives inside the tabs, which setup hides.
  it('a resident who cannot write units sees no setup guide', () => {
    useUnitsMock.mockReturnValue(ok([]));
    renderClient({ isAdmin: false, canWrite: false, canSeeBalances: false });
    expect(screen.getByText('No units yet')).toBeTruthy();
  });

  it('nor does a non-admin who can write units', () => {
    useUnitsMock.mockReturnValue(ok([]));
    renderClient({ isAdmin: false, canWrite: true, canSeeBalances: false });
    expect(screen.getByText('No units yet')).toBeTruthy();
  });

  it('an apartment guide offers tenants only: the importer refuses owners there', async () => {
    useUnitsMock.mockReturnValue(ok([]));
    useResidentsListMock.mockReturnValue(ok([]));
    renderClient({ communityType: 'apartment', hasOwnerRole: false });
    const others = within(await screen.findByRole('list', { name: 'Other steps' }));
    const residents = others.getByRole('button', { name: /Residents/ });
    expect(residents.textContent).toContain('Tenants');
    expect(residents.textContent).not.toContain('Owners');
  });

  it('with units but nobody invited yet, a Continue setup bar names the next step', () => {
    useResidentsListMock.mockReturnValue(ok([resident('Nell New', { unitId: 3, portalStatus: 'not_invited' })]));
    renderClient();
    const bar = screen.getByRole('region', { name: 'Continue setup' });
    expect(bar.textContent).toContain('2 of 3');
    expect(bar.textContent).toContain('Next: Invitations');
    expect(screen.getByRole('group', { name: 'Directory overview' })).toBeTruthy();
  });

  it('shows no bar once everyone has been invited, accepted or not', () => {
    useResidentsListMock.mockReturnValue(ok([resident('Ivy Invited', { unitId: 3, portalStatus: 'invited' })]));
    renderClient();
    expect(screen.queryByRole('region', { name: 'Continue setup' })).toBeNull();
  });

  it('a residents load error is not "no residents": no bar', () => {
    useResidentsListMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, isSuccess: false, refetch: vi.fn() });
    renderClient();
    expect(screen.queryByRole('region', { name: 'Continue setup' })).toBeNull();
  });

  it('shows no bar once everyone with a login is active', () => {
    useResidentsListMock.mockReturnValue(ok([resident('Olive Owner', { unitId: 1 })]));
    renderClient();
    expect(screen.queryByRole('region', { name: 'Continue setup' })).toBeNull();
  });
});

describe('DirectoryPageClient — page kit', () => {
  const header = () => document.querySelector('[data-page-header]') as HTMLElement;

  it('is a list page with a painted title and a one-sentence description', () => {
    renderClient();
    expect(document.querySelector('[data-page-template="list"]')).not.toBeNull();
    expect(within(header()).getByRole('heading', { level: 1, name: 'Directory' })).not.toHaveClass('sr-only');
    expect(within(header()).getByText('The units in this community and the people who live in them.')).toBeInTheDocument();
  });

  it('a non-admin reads a description that promises units only', () => {
    renderClient({ isAdmin: false, canSeeBalances: false });
    expect(within(header()).getByText('The units in this community.')).toBeInTheDocument();
    expect(screen.queryByText(/the people who live in them/)).not.toBeInTheDocument();
  });

  it('a writer gets Add unit and More actions in the header', () => {
    renderClient();
    expect(within(header()).getByRole('button', { name: 'Add unit' })).toBeInTheDocument();
    expect(within(header()).getByRole('button', { name: 'More actions' })).toBeInTheDocument();
  });

  it('without units.write the header offers no Add and the menu no unit import, but export stays', async () => {
    const user = userEvent.setup();
    renderClient({ canWrite: false });
    expect(within(header()).queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument();
    await user.click(within(header()).getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: /Export units/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Import from CSV/ })).not.toBeInTheDocument();
  });

  it('a writer finds the unit import in the menu', async () => {
    const user = userEvent.setup();
    renderClient();
    await user.click(within(header()).getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: /Import from CSV/ })).toHaveAttribute(
      'href',
      '/dashboard/import-units?communityId=42',
    );
  });

  it('on the residents tab the header primary is Add resident', () => {
    searchState.value = 'tab=residents';
    renderClient();
    expect(within(header()).getByRole('button', { name: 'Add resident' })).toBeInTheDocument();
    expect(within(header()).queryByRole('button', { name: 'Add unit' })).not.toBeInTheDocument();
  });

  it('a non-admin gets no tabs row at all, even with ?tab=residents', () => {
    searchState.value = 'tab=residents';
    renderClient({ isAdmin: false, canSeeBalances: false });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Residents' })).not.toBeInTheDocument();
    // Units are still there.
    expect(screen.getByRole('button', { name: /^101/ })).toBeInTheDocument();
  });

  it('an admin gets the three tabs under the header', () => {
    renderClient();
    const tabs = within(screen.getByRole('tablist', { name: 'Directory sections' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Units3', 'Residents2', 'Join requests']);
  });

  it('the residents table has five columns: no Board or Phone column, the board seat under the name', () => {
    useResidentsListMock.mockReturnValue(
      ok([
        resident('Olive Owner', { unitId: 1, designation: 'board_president', phone: '305-555-0101' }),
        resident('Ivy Invited', { unitId: 3, portalStatus: 'invited' }),
      ]),
    );
    searchState.value = 'tab=residents';
    renderClient();
    const table = screen.getByRole('table', { name: 'Residents' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    expect(headers.slice(1).map((h) => h.textContent)).toEqual(['Name', 'Unit', 'Type', 'Portal']);
    expect(within(headers[0]!).getByRole('checkbox', { name: 'Select all shown residents' })).toBeInTheDocument();
    // No column waits for a wider screen than 768px.
    for (const h of headers) expect(h.className).not.toMatch(/\b(lg|xl):table-cell\b/);

    // The seat sits in the Name cell, with the email.
    const olive = within(table).getByRole('button', { name: /olive owner/i });
    expect(within(olive).getByText('olive.owner@x.test')).toBeInTheDocument();
    expect(within(olive).getByText('Board president')).toBeInTheDocument();
    expect(
      within(within(table).getByRole('button', { name: /ivy invited/i })).queryByText(/board/i),
    ).not.toBeInTheDocument();

    // Phone is in the resident sheet only.
    expect(within(table).queryByText('305-555-0101')).not.toBeInTheDocument();
  });

  it('the Name column takes the spare width; select, Unit, Type and Portal are content-sized', () => {
    searchState.value = 'tab=residents';
    renderClient();
    const table = screen.getByRole('table', { name: 'Residents' });
    const [select, name, ...rest] = within(table).getAllByRole('columnheader');
    expect(name!.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(select!.className).toMatch(/(^|\s)w-11(\s|$)/);
    for (const h of rest) {
      expect(h.className).not.toMatch(/(^|\s)w-(full|1\/2)(\s|$)/);
      expect(h.className).toContain('whitespace-nowrap');
    }
    // The Name cell may shrink and truncate; the others never wrap.
    const cells = within(within(table).getAllByRole('row')[1]!).getAllByRole('cell');
    expect(cells).toHaveLength(5);
    expect(cells[1]!.className).toContain('max-w-0');
    for (const c of cells.slice(2)) expect(c.className).toContain('whitespace-nowrap');
  });

  it('the overview strip is two columns until its own box is 960px, and no cell can spill into the next', () => {
    renderClient();
    const strip = screen.getByRole('group', { name: /directory overview/i });
    expect(strip.parentElement!.className).toMatch(/(^|\s)cq(\s|$)/);
    expect(strip.className).toContain('grid-cols-2');
    expect(strip.className).toContain('cq-lg:grid-flow-col');
    expect(strip.className).toContain('cq-lg:auto-cols-fr');
    expect(strip.className).not.toContain('overflow-x-auto');
    const cells = within(strip).getAllByRole('button');
    expect(cells.map((c) => c.textContent)).toEqual([
      '2 / 3units occupied · 1 vacant',
      '$1,250past due · 1 unit · oldest 62 days',
      '50%using the portal · 1 not yet',
      '0join requests to review',
    ]);
    for (const cell of cells) {
      expect(cell.className).toMatch(/(^|\s)min-w-0(\s|$)/);
      expect(cell.className).not.toMatch(/(^|\s)(md:)?min-w-44(\s|$)/);
      // The caption (second line) wraps inside its cell.
      expect(cell.lastElementChild!.className).not.toContain('whitespace-nowrap');
    }
  });

  it('the phone number is still in the resident sheet', async () => {
    useResidentsListMock.mockReturnValue(ok([resident('Olive Owner', { unitId: 1, phone: '305-555-0101' })]));
    searchState.value = 'tab=residents';
    const user = userEvent.setup();
    renderClient();
    await user.click(within(screen.getByRole('table', { name: 'Residents' })).getByRole('button', { name: /olive owner/i }));
    const drawer = await screen.findByRole('dialog', { name: 'Olive Owner' });
    expect(within(drawer).getByText('305-555-0101')).toBeInTheDocument();
  });

  it('?tab= picks the tab and ?q= seeds the units search', () => {
    searchState.value = 'tab=units&q=103';
    renderClient();
    expect(screen.getByRole('tab', { name: /units/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('searchbox', { name: /search unit or owner/i })).toHaveValue('103');
    expect(screen.getByRole('button', { name: /^103/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^101/ })).not.toBeInTheDocument();
  });
});
