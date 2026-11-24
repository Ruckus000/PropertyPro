/**
 * The four Contracts routes, run as the server runs them: the real page
 * functions, the real gate (`lib/contracts/page-gate.ts`), the real permission
 * matrix and the real contract service, over a stand-in scoped client that only
 * returns the rows of the community it was opened for.
 *
 * The sealing cases are the ones that matter. While bidding is open, nothing a
 * bid says (vendor, amount, note) may be in the props the page hands its view,
 * or in the HTML that view renders; the count and the closing time must be.
 */
import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Radix Select and Checkbox (the form's Status and conflict box) need this in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const h = vi.hoisted(() => ({
  tables: {
    contracts: { __table: 'contracts' },
    contractBids: { __table: 'contract_bids' },
    documents: { __table: 'documents' },
    complianceChecklistItems: { __table: 'compliance_checklist_items' },
  },
  rows: {
    contracts: [] as Record<string, unknown>[],
    contract_bids: [] as Record<string, unknown>[],
    documents: [] as Record<string, unknown>[],
    compliance_checklist_items: [] as Record<string, unknown>[],
  },
  createScopedClient: vi.fn(),
  requireUser: vi.fn(),
  requireMembership: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock('@propertypro/db', () => ({ ...h.tables, createScopedClient: h.createScopedClient }));
// `community-resolution` imports a slug lookup from here at load; no page under test calls it.
vi.mock('@propertypro/db/unsafe', () => ({}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  useRouter: () => h.router,
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000' }),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: h.requireUser,
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: h.requireMembership,
}));
// The plan lookup reads the database; the feature set itself is the real one,
// so an apartment community really has no `hasCompliance`.
vi.mock('@/lib/middleware/plan-guard', async () => {
  const { getFeaturesForCommunity } = await import('@propertypro/shared');
  return {
    getEffectiveFeaturesForPage: async (_id: number, communityType: Parameters<typeof getFeaturesForCommunity>[0]) =>
      getFeaturesForCommunity(communityType),
  };
});
vi.mock('@/hooks/use-contracts', () => ({
  useContracts: () => ({ isLoading: true, isError: false, isSuccess: false, data: undefined, refetch: vi.fn() }),
  useAddContractBid: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useCreateContract: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateContract: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));

import ContractsPage from '../../src/app/(authenticated)/contracts/page';
import NewContractPage from '../../src/app/(authenticated)/contracts/new/page';
import ContractDetailPage from '../../src/app/(authenticated)/contracts/[id]/page';
import EditContractPage from '../../src/app/(authenticated)/contracts/[id]/edit/page';

const NOW = new Date('2026-12-01T15:00:00.000Z');
const CLOSES_LATER = new Date('2026-12-12T22:00:00.000Z');
const CLOSED_EARLIER = new Date('2026-11-20T22:00:00.000Z');

/** Everything a sealed bid says. None of it may leave the server. */
const SECRETS = ['Zephyr Roofing', 'Quarry Builders', '48250', '48,250', '51900', '51,900', 'Includes tear-off'];

const MANAGER = {
  userId: 'user-1',
  communityId: 42,
  role: 'property_manager' as const,
  communityType: 'condo_718' as const,
  isAdmin: true,
  isUnitOwner: false,
  timezone: 'America/New_York',
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  freeAccessExpiresAt: null,
};

function contractRow(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    communityId: 42,
    title: 'Roof replacement',
    vendorName: 'To be awarded',
    description: 'Replace the flat roof',
    contractValue: '50000.00',
    startDate: '2027-01-01',
    endDate: '2027-06-30',
    documentId: null,
    complianceChecklistItemId: null,
    biddingClosesAt: CLOSES_LATER,
    conflictOfInterest: false,
    conflictOfInterestNote: null,
    status: 'draft',
    ...over,
  };
}

const BIDS = [
  { id: 1, communityId: 42, contractId: 7, vendorName: 'Zephyr Roofing', bidAmount: '48250.00', notes: 'Includes tear-off', submittedAt: new Date('2026-11-28T14:00:00Z') },
  { id: 2, communityId: 42, contractId: 7, vendorName: 'Quarry Builders', bidAmount: '51900.50', notes: null, submittedAt: new Date('2026-11-29T14:00:00Z') },
];

/** As the real scoped client: only this community's rows, then the extra filter. */
function fakeScopedClient(communityId: number) {
  return {
    selectFrom: async (table: { __table: keyof typeof h.rows }, _cols: unknown, where: { col: unknown; val: unknown }) => {
      const key = table.__table === 'contract_bids' ? 'contractId' : 'id';
      return h.rows[table.__table].filter((r) => r['communityId'] === communityId && r[key] === where.val);
    },
  };
}

function detail(id: string, communityId: string | null = '42') {
  return ContractDetailPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(communityId ? { communityId } : {}),
  });
}

function edit(id: string, communityId = '42') {
  return EditContractPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({ communityId }),
  });
}

describe('Contracts pages', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    h.rows.contracts = [contractRow()];
    h.rows.contract_bids = [...BIDS];
    h.rows.documents = [];
    h.rows.compliance_checklist_items = [];
    h.createScopedClient.mockReset().mockImplementation(fakeScopedClient);
    h.requireUser.mockReset().mockResolvedValue('user-1');
    h.requireMembership.mockReset().mockResolvedValue(MANAGER);
    h.router.push.mockReset();
    h.router.refresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('a contract whose bidding is still open', () => {
    it('hands the view no bid vendor, amount or note, only the count and the closing time', async () => {
      const element = (await detail('7')) as ReactElement<{ contract: { bidSummary: unknown; biddingClosesAt: string } }>;

      const props = JSON.stringify(element.props);
      for (const secret of SECRETS) {
        expect(props).not.toContain(secret);
      }
      expect(element.props.contract.bidSummary).toEqual({ bids: [], embargoed: true, bidCount: 2 });
      expect(element.props.contract.biddingClosesAt).toBe('2026-12-12T22:00:00.000Z');
    });

    it('renders no bid vendor, amount or note, and says how many were received and when they open', async () => {
      const { container } = render((await detail('7')) as ReactElement);

      for (const secret of SECRETS) {
        expect(container.innerHTML).not.toContain(secret);
      }
      expect(screen.queryByRole('table', { name: 'Bids' })).not.toBeInTheDocument();
      expect(screen.getByTestId('bids-sealed')).toHaveTextContent(
        'Bidding is sealed. 2 received. Opens Dec 12, 2026, 5:00 PM EST.',
      );
      // The contract's own vendor and value are not bids, and do show.
      expect(screen.getByText('$50,000.00')).toBeInTheDocument();
    });
  });

  describe('the same contract after bidding has closed', () => {
    beforeEach(() => {
      h.rows.contracts = [contractRow({ biddingClosesAt: CLOSED_EARLIER })];
    });

    it('shows each bid with its vendor, amount as money, and note', async () => {
      render((await detail('7')) as ReactElement);

      const bids = screen.getByRole('table', { name: 'Bids' });
      expect(within(bids).getByText('Zephyr Roofing')).toBeInTheDocument();
      expect(within(bids).getByText('$48,250.00')).toBeInTheDocument();
      expect(within(bids).getByText('Includes tear-off')).toBeInTheDocument();
      expect(within(bids).getByText('Quarry Builders')).toBeInTheDocument();
      expect(within(bids).getByText('$51,900.50')).toBeInTheDocument();
      expect(screen.queryByTestId('bids-sealed')).not.toBeInTheDocument();
    });
  });

  describe('which contract', () => {
    it("a contract id from another community is not found, and that community's client is never opened", async () => {
      h.rows.contracts = [contractRow({ id: 9, communityId: 99, title: 'Other association pool contract' })];

      await expect(detail('9')).rejects.toThrow('NOT_FOUND');
      await expect(edit('9')).rejects.toThrow('NOT_FOUND');
      expect(h.createScopedClient).toHaveBeenCalledWith(42);
      expect(h.createScopedClient).not.toHaveBeenCalledWith(99);
      // Membership was checked for the community in the URL, not the contract's.
      expect(h.requireMembership).toHaveBeenCalledWith(42, 'user-1');
    });

    it('an id that is not a positive whole number is not found, before anything is read', async () => {
      for (const bad of ['abc', '0', '-3', '1.5', '7x']) {
        await expect(detail(bad)).rejects.toThrow('NOT_FOUND');
        await expect(edit(bad)).rejects.toThrow('NOT_FOUND');
      }
      expect(h.createScopedClient).not.toHaveBeenCalled();
    });

    it('a contract page with no community is not found', async () => {
      await expect(detail('7', null)).rejects.toThrow('NOT_FOUND');
      expect(h.requireMembership).not.toHaveBeenCalled();
    });
  });

  describe('who is turned away', () => {
    const allFour = () => [
      ['list', () => ContractsPage({ searchParams: Promise.resolve({ communityId: '42' }) })],
      ['new', () => NewContractPage({ searchParams: Promise.resolve({ communityId: '42' }) })],
      ['contract', () => detail('7')],
      ['edit', () => edit('7')],
    ] as const;

    it('a unit owner (not a manager) is sent to the dashboard from all four pages, and nothing is read', async () => {
      h.requireMembership.mockResolvedValue({ ...MANAGER, role: 'resident', isAdmin: false, isUnitOwner: true });
      for (const [name, open] of allFour()) {
        await expect(open(), name).rejects.toThrow('REDIRECT:/dashboard?reason=insufficient-permissions');
      }
      expect(h.createScopedClient).not.toHaveBeenCalled();
    });

    it('a tenant is sent to the dashboard from all four pages', async () => {
      h.requireMembership.mockResolvedValue({ ...MANAGER, role: 'resident', isAdmin: false, isUnitOwner: false });
      for (const [name, open] of allFour()) {
        await expect(open(), name).rejects.toThrow('REDIRECT:/dashboard?reason=insufficient-permissions');
      }
    });

    it('an apartment community has no contracts: its manager is sent to the dashboard from all four', async () => {
      h.requireMembership.mockResolvedValue({ ...MANAGER, communityType: 'apartment' });
      for (const [name, open] of allFour()) {
        await expect(open(), name).rejects.toThrow('REDIRECT:/dashboard?reason=feature-not-available');
      }
      expect(h.createScopedClient).not.toHaveBeenCalled();
    });

    it('someone who is not signed in is sent to sign in', async () => {
      h.requireUser.mockRejectedValue(new Error('Unauthorized'));
      for (const [name, open] of allFour()) {
        await expect(open(), name).rejects.toThrow('REDIRECT:/auth/login');
      }
      expect(h.requireMembership).not.toHaveBeenCalled();
    });

    it('a manager of a lapsed community cannot open a contract or its edit page, as the list API refuses them', async () => {
      h.requireMembership.mockResolvedValue({
        ...MANAGER,
        subscriptionStatus: 'canceled',
        subscriptionCanceledAt: new Date('2026-01-01T00:00:00Z'),
      });
      await expect(detail('7')).rejects.toThrow('REDIRECT:/dashboard?reason=subscription-lapsed');
      await expect(edit('7')).rejects.toThrow('REDIRECT:/dashboard?reason=subscription-lapsed');
      expect(h.createScopedClient).not.toHaveBeenCalled();
    });

    it('the list and the new page with no community go to the dashboard', async () => {
      await expect(ContractsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        'REDIRECT:/dashboard?reason=invalid-selection',
      );
      await expect(NewContractPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
        'REDIRECT:/dashboard?reason=invalid-selection',
      );
    });
  });

  describe('a manager of a condo', () => {
    it('opens the list, with Add contract and the access sentence', async () => {
      const element = (await ContractsPage({ searchParams: Promise.resolve({ communityId: '42' }) })) as ReactElement<{
        communityId: number;
        canWrite: boolean;
        timeZone: string;
        about: string;
      }>;
      expect(element.props).toEqual({
        communityId: 42,
        canWrite: true,
        timeZone: 'America/New_York',
        about: 'Managers can add and change these.',
      });
    });

    it('opens the New page as an empty form', async () => {
      render((await NewContractPage({ searchParams: Promise.resolve({ communityId: '42' }) })) as ReactElement);
      expect(screen.getByRole('heading', { level: 1, name: 'New Contract' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Title/)).toHaveValue('');
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/contracts?communityId=42');
    });

    it('opens the Edit page with the stored contract, and loads no bid to do it', async () => {
      const element = (await edit('7')) as ReactElement;
      const props = JSON.stringify(element.props);
      for (const secret of SECRETS) {
        expect(props).not.toContain(secret);
      }

      render(element);
      expect(screen.getByRole('heading', { level: 1, name: 'Edit Contract' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Title/)).toHaveValue('Roof replacement');
      // 22:00 UTC is 5:00 pm in the community's time zone (EST).
      expect(screen.getByLabelText('Bidding closes at')).toHaveValue('2026-12-12T17:00');
      expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/contracts/7?communityId=42');
    });

    it("opens a contract with its title, status, Edit, and the linked document's title", async () => {
      h.rows.contracts = [contractRow({ documentId: 100, complianceChecklistItemId: 200 })];
      h.rows.documents = [{ id: 100, communityId: 42, title: 'Signed roofing agreement' }];
      h.rows.compliance_checklist_items = [{ id: 200, communityId: 42, title: 'Contracts and bids' }];

      render((await detail('7')) as ReactElement);

      expect(screen.getByRole('heading', { level: 1, name: 'Roof replacement' })).toBeInTheDocument();
      expect(screen.getByText('Draft')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/contracts/7/edit?communityId=42');
      expect(screen.getByRole('link', { name: 'Signed roofing agreement' })).toHaveAttribute(
        'href',
        '/communities/42/documents?doc=100',
      );
      expect(screen.getByText('Contracts and bids')).toBeInTheDocument();
      expect(screen.getByText('Managers can add and change these.')).toBeInTheDocument();
    });
  });
});
