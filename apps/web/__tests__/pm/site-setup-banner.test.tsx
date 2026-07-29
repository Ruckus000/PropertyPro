import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { SiteSetupBanner } from '@/components/pm/SiteSetupBanner';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function mockStatus(dismissed: boolean) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ data: { dismissed } }),
  });
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('<SiteSetupBanner>', () => {
  it('renders when there is an incomplete site and it is not dismissed', async () => {
    mockStatus(false);
    render(wrap(<SiteSetupBanner hasIncompleteSite />));
    expect(await screen.findByTestId('site-setup-banner')).toBeInTheDocument();
  });

  it('does not render when there is no incomplete site', () => {
    mockStatus(false);
    render(wrap(<SiteSetupBanner hasIncompleteSite={false} />));
    expect(screen.queryByTestId('site-setup-banner')).toBeNull();
  });

  it('does not render when already dismissed', async () => {
    mockStatus(true);
    render(wrap(<SiteSetupBanner hasIncompleteSite />));
    // Give the query a tick to resolve; banner must stay hidden.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('site-setup-banner')).toBeNull();
  });

  it('dismiss button POSTs to the dismiss endpoint and hides the banner', async () => {
    // First call: GET status (not dismissed). Second: POST dismiss.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { dismissed: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { dismissed: true } }) });

    render(wrap(<SiteSetupBanner hasIncompleteSite />));
    const dismissBtn = await screen.findByTestId('site-setup-banner-dismiss');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/v1/pm/site-setup-banner',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    await waitFor(() => expect(screen.queryByTestId('site-setup-banner')).toBeNull());
  });
});

describe('<SiteSetupBanner> — CTA (slice 8f)', () => {
  it('deep-links the CTA into the first incomplete community wizard', async () => {
    mockStatus(false);
    render(wrap(<SiteSetupBanner hasIncompleteSite firstIncompleteCommunityId={7} />));
    const cta = await screen.findByTestId('site-setup-banner-cta');
    expect(cta).toHaveAttribute('href', '/pm/onboarding/website?communityId=7');
    expect(cta).toHaveTextContent(/set up your website/i);
  });

  it('falls back to the website editor hub when no community id is supplied', async () => {
    mockStatus(false);
    render(wrap(<SiteSetupBanner hasIncompleteSite />));
    const cta = await screen.findByTestId('site-setup-banner-cta');
    expect(cta).toHaveAttribute('href', '/pm/website-editor');
  });
});
