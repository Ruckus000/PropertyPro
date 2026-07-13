import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { DomainFinder } from '@/components/pm/site-editor/DomainFinder';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function mockCheck(body: unknown, ok = true, status = 200) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

async function openAndCheck(domain: string) {
  fireEvent.click(screen.getByTestId('domain-finder-toggle'));
  fireEvent.change(screen.getByLabelText(/domain to check/i), { target: { value: domain } });
  fireEvent.click(screen.getByRole('button', { name: /check availability/i }));
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('<DomainFinder>', () => {
  it('renders collapsed by default — no input until the disclosure is opened', () => {
    render(wrap(<DomainFinder communityId={42} />));
    expect(screen.getByTestId('domain-finder-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/domain to check/i)).not.toBeInTheDocument();
  });

  it('GETs /api/v1/pm/site/domain/check with communityId + name', async () => {
    mockCheck({ data: { name: 'foo.com', available: true, price: 12, period: 1 } });
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('foo.com');

    await waitFor(() => {
      const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call).toBeDefined();
      expect(String(call![0])).toBe('/api/v1/pm/site/domain/check?communityId=42&name=foo.com');
    });
  });

  it('renders the available result with price + registrar link-outs (safe rel/target)', async () => {
    mockCheck({ data: { name: 'foo.com', available: true, price: 12, period: 1 } });
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('foo.com');

    const available = await screen.findByTestId('domain-finder-available');
    expect(available).toHaveTextContent(/looks available/i);
    expect(available).toHaveTextContent(/\$12/);
    expect(available).toHaveTextContent(/final price set by the registrar/i);

    const namecheap = screen.getByRole('link', { name: /buy at namecheap/i });
    expect(namecheap).toHaveAttribute(
      'href',
      'https://www.namecheap.com/domains/registration/results/?domain=foo.com',
    );
    expect(namecheap).toHaveAttribute('target', '_blank');
    expect(namecheap).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: /buy at porkbun/i })).toHaveAttribute(
      'href',
      'https://porkbun.com/checkout/search?q=foo.com',
    );
  });

  it('omits the price line when price is null', async () => {
    mockCheck({ data: { name: 'foo.com', available: true, price: null, period: null } });
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('foo.com');

    const available = await screen.findByTestId('domain-finder-available');
    expect(available).toHaveTextContent(/looks available/i);
    expect(available).not.toHaveTextContent(/\$/);
  });

  it('renders the taken result with the connect-it-instead hint', async () => {
    mockCheck({ data: { name: 'google.com', available: false, price: null, period: null } });
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('google.com');

    const taken = await screen.findByTestId('domain-finder-taken');
    expect(taken).toHaveTextContent(/already registered/i);
    expect(taken).toHaveTextContent(/enter it above to connect it/i);
    expect(screen.queryByRole('link', { name: /buy at/i })).not.toBeInTheDocument();
  });

  it('surfaces API errors (e.g. 503 provisioning unavailable) as an alert', async () => {
    mockCheck(
      { error: { code: 'DOMAIN_PROVISIONING_UNAVAILABLE', message: 'Custom-domain provisioning is not configured.' } },
      false,
      503,
    );
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('foo.com');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/not configured/i);
  });

  it('URL-encodes the domain in registrar links', async () => {
    mockCheck({ data: { name: 'xn--foo-bar.com', available: true, price: null, period: null } });
    render(wrap(<DomainFinder communityId={42} />));
    await openAndCheck('xn--foo-bar.com');
    await screen.findByTestId('domain-finder-available');
    expect(screen.getByRole('link', { name: /buy at namecheap/i }).getAttribute('href')).toContain(
      encodeURIComponent('xn--foo-bar.com'),
    );
  });
});
