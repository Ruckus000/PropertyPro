/**
 * Website editor v3 — the Address tool panel.
 *
 * Three things this file is really protecting:
 *
 *   1. the plan gate holds AND issues no provider request — a locked panel that
 *      still calls out is a cost with no user-visible benefit;
 *   2. all four unlocked states render the controls that state needs, since a
 *      PM stuck at "pending" with no records table has no way forward;
 *   3. the DNS records reach the page as real table rows, not prose.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const {
  useCustomDomainMock,
  setDomainMutateMock,
  verifyMutateMock,
  removeMutateMock,
  checkMutateMock,
} = vi.hoisted(() => ({
  useCustomDomainMock: vi.fn(),
  setDomainMutateMock: vi.fn(),
  verifyMutateMock: vi.fn(),
  removeMutateMock: vi.fn(),
  checkMutateMock: vi.fn(),
}));

// Mocked COMPLETELY — see the note in StylingPanel.test.tsx.
vi.mock('@/hooks/use-custom-domain', () => ({
  useCustomDomain: useCustomDomainMock,
  useSetDomain: () => ({ mutate: setDomainMutateMock, isPending: false, error: null }),
  useVerifyDomain: () => ({ mutate: verifyMutateMock, isPending: false, error: null }),
  useRemoveDomain: () => ({ mutate: removeMutateMock, isPending: false, error: null }),
  useCheckDomainAvailability: () => ({
    mutate: checkMutateMock,
    reset: vi.fn(),
    isPending: false,
    error: null,
    data: undefined,
  }),
}));

import { DomainPanel } from '@/components/pm/site-editor-v3/panels/DomainPanel';
import type { DomainState } from '@/hooks/use-custom-domain';

const EMPTY: DomainState = {
  domain: null,
  status: null,
  verifiedAt: null,
  records: [],
  reason: null,
};

function renderPanel({
  hasSiteCustomDomain = true,
  data = EMPTY as DomainState | undefined,
  isPending = false,
  isError = false,
  error = null as Error | null,
} = {}) {
  useCustomDomainMock.mockReturnValue({
    data,
    isPending,
    isError,
    error,
    refetch: vi.fn(),
  });
  return render(
    <DomainPanel communityId={42} hasSiteCustomDomain={hasSiteCustomDomain} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('plan gate', () => {
  it('shows the upsell with a disabled connect control', () => {
    renderPanel({ hasSiteCustomDomain: false });
    expect(screen.getByTestId('custom-domain-upsell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect/i })).toBeDisabled();
    expect(screen.getByLabelText(/your domain/i)).toBeDisabled();
  });

  it('holds the query, so a locked community never calls the provider', () => {
    renderPanel({ hasSiteCustomDomain: false });
    expect(useCustomDomainMock).toHaveBeenCalledWith(42, undefined, { enabled: false });
  });

  it('enables the query once the plan includes it', () => {
    renderPanel();
    expect(useCustomDomainMock).toHaveBeenCalledWith(42, undefined, { enabled: true });
  });
});

describe('loading and read failure', () => {
  it('renders a skeleton while the first read is in flight', () => {
    renderPanel({ data: undefined, isPending: true });
    expect(screen.getByTestId('custom-domain-loading')).toBeInTheDocument();
  });

  it('offers a retry when the read fails', () => {
    renderPanel({ data: undefined, isError: true, error: new Error('Upstream unavailable') });
    expect(screen.getByTestId('custom-domain-read-error')).toBeInTheDocument();
    expect(screen.getByText(/upstream unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });
});

describe('empty state', () => {
  it('offers the connect form and the guided-purchase disclosure', () => {
    renderPanel();
    expect(screen.getByTestId('custom-domain-empty')).toBeInTheDocument();
    expect(screen.getByLabelText(/your domain/i)).toBeEnabled();
    expect(screen.getByTestId('domain-finder')).toBeInTheDocument();
  });

  it('submits the trimmed hostname', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText(/your domain/i), '  www.sunset.com  ');
    await user.click(screen.getByRole('button', { name: /^connect$/i }));

    expect(setDomainMutateMock).toHaveBeenCalledWith('www.sunset.com');
  });

  it('keeps Connect disabled until something is typed', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeDisabled();
  });
});

describe('pending state', () => {
  const PENDING: DomainState = {
    domain: 'www.sunset.com',
    status: 'pending',
    verifiedAt: null,
    records: [
      { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
      { type: 'A', name: '@', value: '76.76.21.21' },
    ],
    reason: null,
  };

  it('lists every DNS record as a table row', () => {
    renderPanel({ data: PENDING });
    expect(screen.getByTestId('custom-domain-pending')).toBeInTheDocument();
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    // One header row plus one per record.
    expect(rows).toHaveLength(3);
    expect(screen.getByText('cname.vercel-dns.com')).toBeInTheDocument();
    expect(screen.getByText('76.76.21.21')).toBeInTheDocument();
  });

  it('offers both the re-check and the remove path', async () => {
    const user = userEvent.setup();
    renderPanel({ data: PENDING });

    await user.click(screen.getByRole('button', { name: /check status/i }));
    expect(verifyMutateMock).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(removeMutateMock).toHaveBeenCalled();
  });

  it('still explains what to do when the provider returned no records', () => {
    renderPanel({ data: { ...PENDING, records: [] } });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/add the dns records at your registrar/i)).toBeInTheDocument();
  });
});

describe('active state', () => {
  const ACTIVE: DomainState = {
    domain: 'www.sunset.com',
    status: 'active',
    verifiedAt: '2026-07-01T00:00:00.000Z',
    records: [],
    reason: null,
  };

  it('links out to the live site and offers removal', () => {
    renderPanel({ data: ACTIVE });
    expect(screen.getByTestId('custom-domain-active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view site/i })).toHaveAttribute(
      'href',
      'https://www.sunset.com',
    );
    expect(screen.getByRole('button', { name: /remove/i })).toBeEnabled();
  });

  it('does not offer a re-check for a domain that is already live', () => {
    renderPanel({ data: ACTIVE });
    expect(screen.queryByRole('button', { name: /check status/i })).not.toBeInTheDocument();
  });
});

describe('error state', () => {
  const ERRORED: DomainState = {
    domain: 'www.sunset.com',
    status: 'error',
    verifiedAt: null,
    records: [],
    reason: 'The CNAME record points somewhere else.',
  };

  it("surfaces the provider's reason and keeps both recovery paths", () => {
    renderPanel({ data: ERRORED });
    expect(screen.getByTestId('custom-domain-error')).toBeInTheDocument();
    expect(screen.getByText(/cname record points somewhere else/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check status/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /remove/i })).toBeEnabled();
  });

  it('falls back to guidance when the provider gave no reason', () => {
    renderPanel({ data: { ...ERRORED, reason: null } });
    expect(screen.getByText(/check the record at your registrar/i)).toBeInTheDocument();
  });
});
