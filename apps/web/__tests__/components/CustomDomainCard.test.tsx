import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomDomainCard } from '@/components/pm/site-editor/CustomDomainCard';
import type { DomainState } from '@/hooks/use-custom-domain';

// --- Hook mocks --------------------------------------------------------------
// Mocking the hooks avoids needing a QueryClientProvider and lets each test
// drive the card into a specific state via the query's returned DomainState.
const setMutate = vi.fn();
const verifyMutate = vi.fn();
const removeMutate = vi.fn();

let queryData: DomainState;
let setState = { mutate: setMutate, isPending: false, error: null as Error | null };
let verifyState = { mutate: verifyMutate, isPending: false, error: null as Error | null };
let removeState = { mutate: removeMutate, isPending: false, error: null as Error | null };

vi.mock('@/hooks/use-custom-domain', () => ({
  useCustomDomain: () => ({ data: queryData }),
  useSetDomain: () => setState,
  useVerifyDomain: () => verifyState,
  useRemoveDomain: () => removeState,
  // Consumed by the DomainFinder rendered inside the card's empty state.
  useCheckDomainAvailability: () => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
    data: undefined,
  }),
}));

const EMPTY: DomainState = {
  domain: null,
  status: null,
  verifiedAt: null,
  records: [],
  reason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  queryData = EMPTY;
  setState = { mutate: setMutate, isPending: false, error: null };
  verifyState = { mutate: verifyMutate, isPending: false, error: null };
  removeState = { mutate: removeMutate, isPending: false, error: null };
});

function renderCard(overrides: Partial<{ hasSiteCustomDomain: boolean; initial: DomainState }> = {}) {
  return render(
    <CustomDomainCard
      communityId={42}
      hasSiteCustomDomain={overrides.hasSiteCustomDomain ?? true}
      initial={overrides.initial ?? queryData}
    />,
  );
}

describe('<CustomDomainCard>', () => {
  it('renders a disabled upsell when the feature is gated', () => {
    renderCard({ hasSiteCustomDomain: false });
    expect(screen.getByTestId('custom-domain-upsell')).toBeInTheDocument();
    // controls are visible-but-disabled
    const input = screen.getByLabelText(/custom domain/i);
    expect(input).toBeDisabled();
  });

  it('renders the empty state with an input and an Add domain button', () => {
    queryData = EMPTY;
    renderCard();
    expect(screen.getByTestId('custom-domain-empty')).toBeInTheDocument();
    expect(screen.getByLabelText(/custom domain/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add domain/i })).toBeInTheDocument();
  });

  it('renders the DomainFinder disclosure ONLY in the empty state', () => {
    queryData = EMPTY;
    const { unmount } = renderCard();
    expect(screen.getByTestId('domain-finder')).toBeInTheDocument();
    unmount();

    queryData = {
      domain: 'www.example.com',
      status: 'pending',
      verifiedAt: null,
      records: [],
      reason: null,
    };
    renderCard();
    expect(screen.queryByTestId('domain-finder')).not.toBeInTheDocument();
  });

  it('does not render the DomainFinder in the gated upsell state', () => {
    renderCard({ hasSiteCustomDomain: false });
    expect(screen.queryByTestId('domain-finder')).not.toBeInTheDocument();
  });

  it('calls the set mutation with the typed host when Add domain is clicked', async () => {
    queryData = EMPTY;
    renderCard();
    await userEvent.type(screen.getByLabelText(/custom domain/i), 'www.example.com');
    await userEvent.click(screen.getByRole('button', { name: /add domain/i }));
    expect(setMutate).toHaveBeenCalledWith('www.example.com');
  });

  it('renders the pending state with a status pill and DNS records table', () => {
    queryData = {
      domain: 'www.example.com',
      status: 'pending',
      verifiedAt: null,
      records: [{ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }],
      reason: null,
    };
    renderCard();
    expect(screen.getByTestId('custom-domain-pending')).toBeInTheDocument();
    expect(screen.getByText(/pending dns/i)).toBeInTheDocument();
    expect(screen.getByText('CNAME')).toBeInTheDocument();
    expect(screen.getByText('cname.vercel-dns.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check status/i })).toBeInTheDocument();
  });

  it('shows the registrar hint when pending with no records', () => {
    queryData = {
      domain: 'www.example.com',
      status: 'pending',
      verifiedAt: null,
      records: [],
      reason: null,
    };
    renderCard();
    expect(screen.getByText(/add the dns records at your registrar/i)).toBeInTheDocument();
  });

  it('renders the active state with a Live pill and a View site link', () => {
    queryData = {
      domain: 'www.example.com',
      status: 'active',
      verifiedAt: '2026-06-01T00:00:00.000Z',
      records: [],
      reason: null,
    };
    renderCard();
    expect(screen.getByTestId('custom-domain-active')).toBeInTheDocument();
    expect(screen.getByText(/live/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /view site/i });
    expect(link).toHaveAttribute('href', 'https://www.example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders the error state with a danger AlertBanner showing the reason', () => {
    queryData = {
      domain: 'www.example.com',
      status: 'error',
      verifiedAt: null,
      records: [],
      reason: 'Domain is already in use by another project.',
    };
    renderCard();
    expect(screen.getByTestId('custom-domain-error')).toBeInTheDocument();
    expect(screen.getByText(/already in use by another project/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check status/i })).toBeInTheDocument();
  });

  it('calls the remove mutation when Remove is clicked', async () => {
    queryData = {
      domain: 'www.example.com',
      status: 'active',
      verifiedAt: '2026-06-01T00:00:00.000Z',
      records: [],
      reason: null,
    };
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(removeMutate).toHaveBeenCalled();
  });

  it('calls the verify mutation when Check status is clicked', async () => {
    queryData = {
      domain: 'www.example.com',
      status: 'pending',
      verifiedAt: null,
      records: [],
      reason: null,
    };
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: /check status/i }));
    expect(verifyMutate).toHaveBeenCalled();
  });

  it('surfaces a mutation error in an inline alert', () => {
    queryData = EMPTY;
    setState = { mutate: setMutate, isPending: false, error: new Error('Invalid hostname') };
    renderCard();
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid hostname/i);
  });
});
