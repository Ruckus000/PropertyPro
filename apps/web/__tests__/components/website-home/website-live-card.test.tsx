/**
 * The dashboard's "Your website is live" card (website builder, D18).
 *
 * Runs with the REAL hook over a mocked `fetch`, so what Dismiss sends is
 * asserted on the wire. Only the toast is mocked. Whether the card shows at all
 * is the dashboard loader's decision (`load-website-live-card.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

import { WebsiteLiveCard } from '@/components/website-home/website-live-card';

const COMMUNITY_ID = 42;
const PUBLIC_URL = 'https://sunset-condos.getpropertypro.com/';

const fetchMock = vi.fn();

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <WebsiteLiveCard communityId={COMMUNITY_ID} communityName="Sunset Condos" publicUrl={PUBLIC_URL} />,
    { wrapper },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('WebsiteLiveCard', () => {
  it('says the website is live and links to the site, the looks and the website home', () => {
    renderCard();

    expect(screen.getByRole('heading', { level: 2, name: 'Your website is live' })).toBeInTheDocument();
    const view = screen.getByRole('link', { name: /^View site/ });
    expect(view).toHaveAttribute('href', PUBLIC_URL);
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    expect(screen.getByRole('link', { name: 'Pick a different look' })).toHaveAttribute(
      'href',
      `/pm/website/looks?communityId=${COMMUNITY_ID}`,
    );
    expect(screen.getByRole('link', { name: 'Open website home' })).toHaveAttribute(
      'href',
      `/pm/website?communityId=${COMMUNITY_ID}`,
    );
  });

  it('previews the real site in a lazy frame that assistive tech and the keyboard skip', () => {
    renderCard();

    const frame = screen.getByTestId('look-preview-frame');
    expect(frame).toHaveAttribute('src', `/pm/site-preview?communityId=${COMMUNITY_ID}&preview=true`);
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    expect(frame).toHaveAttribute('tabindex', '-1');
    expect(frame).toHaveAttribute('inert');
  });

  it('Dismiss calls keepCurrent, then the card goes', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(screen.queryByTestId('website-live-card')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/pm/site/look');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({ communityId: COMMUNITY_ID, keepCurrent: true });
  });

  it('Dismiss sends the plain keepCurrent, so a look drafted in the editor is never withdrawn', async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      communityId: COMMUNITY_ID,
      keepCurrent: true,
    });
  });

  it('keeps the card and says so when Dismiss fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'boom' } }),
    });
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("We couldn't dismiss this just now. Please try again."),
    );
    expect(screen.getByTestId('website-live-card')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeEnabled();
  });
});
