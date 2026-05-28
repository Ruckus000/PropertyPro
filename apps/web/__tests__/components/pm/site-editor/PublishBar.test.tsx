import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { PublishBar } from '@/components/pm/site-editor/PublishBar';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  // Default: blocks fetch returns one published block, hero fetch returns null hero.
  global.fetch = vi.fn(async (url) => {
    if (typeof url === 'string' && url.includes('/blocks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { blocks: [{ id: 1, blockType: 'text', blockOrder: 2, content: { body: 'x' }, isDraft: false }] } }),
      } as Response;
    }
    if (typeof url === 'string' && url.includes('/hero')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { hero: null } }),
      } as Response;
    }
    if (typeof url === 'string' && url.endsWith('/publish')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { published: true, publishedAt: '2026-05-15T12:00:00Z', promotedCount: 2, retiredCount: 1 } }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: '404' } }) } as Response;
  });
});

describe('<PublishBar>', () => {
  it('renders the badge as "All changes published" when no drafts exist', async () => {
    render(wrap(<PublishBar communityId={42} />));
    const badge = await screen.findByTestId('pending-changes-badge');
    await waitFor(() => expect(badge).toHaveTextContent(/all changes published/i));
  });

  it('renders a draft count when any block has isDraft=true', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              blocks: [
                { id: 1, blockType: 'text', blockOrder: 2, content: {}, isDraft: false },
                { id: 2, blockType: 'image', blockOrder: 3, content: {}, isDraft: true },
                { id: 3, blockType: 'announcements', blockOrder: 4, content: {}, isDraft: true },
              ],
            },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/hero')) {
        return { ok: true, status: 200, json: async () => ({ data: { hero: null } }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    render(wrap(<PublishBar communityId={42} />));
    const badge = await screen.findByTestId('pending-changes-badge');
    await waitFor(() => expect(badge).toHaveTextContent(/2 draft sections/i));
  });

  it('POSTs to /publish when the button is clicked and renders the success message', async () => {
    render(wrap(<PublishBar communityId={42} />));
    await screen.findByTestId('pending-changes-badge');
    // Wait for the blocks query to settle so the button is enabled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /publish website/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /publish website/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Published — 2 sections live/i);
    });
    const publishCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/publish'),
    );
    expect(publishCall).toBeDefined();
    expect(JSON.parse((publishCall![1] as RequestInit).body as string)).toMatchObject({
      communityId: 42,
      // The default blocks fixture has isDraft=false but no publishedAt
      // field, so the token derives to null.
      expectedPublishedAt: null,
    });
  });

  it('threads the latest published-block publishedAt as the optimistic-concurrency token', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              blocks: [
                // older published
                { id: 1, blockType: 'text', blockOrder: 2, content: {}, isDraft: false, publishedAt: '2026-05-10T10:00:00Z' },
                // latest published — should be the token
                { id: 2, blockType: 'image', blockOrder: 3, content: {}, isDraft: false, publishedAt: '2026-05-15T11:30:00Z' },
                // draft — ignored even with a later (non-null) publishedAt
                { id: 3, blockType: 'announcements', blockOrder: 4, content: {}, isDraft: true, publishedAt: null },
              ],
            },
          }),
        } as Response;
      }
      if (typeof url === 'string' && url.includes('/hero')) {
        return { ok: true, status: 200, json: async () => ({ data: { hero: null } }) } as Response;
      }
      if (typeof url === 'string' && url.endsWith('/publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { published: true, publishedAt: '2026-05-16T09:00:00Z', promotedCount: 1, retiredCount: 0 } }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    render(wrap(<PublishBar communityId={42} />));
    await screen.findByTestId('pending-changes-badge');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /publish website/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /publish website/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
    const publishCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/publish'),
    );
    expect(JSON.parse((publishCall![1] as RequestInit).body as string)).toMatchObject({
      expectedPublishedAt: '2026-05-15T11:30:00Z',
    });
  });

  it('renders the no-op message on { published: false } responses', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        return { ok: true, status: 200, json: async () => ({ data: { blocks: [] } }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/hero')) {
        return { ok: true, status: 200, json: async () => ({ data: { hero: null } }) } as Response;
      }
      if (typeof url === 'string' && url.endsWith('/publish')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { published: false, reason: 'nothing-to-publish' } }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    render(wrap(<PublishBar communityId={42} />));
    await screen.findByTestId('pending-changes-badge');
    // Wait for the blocks query to settle so the button is enabled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /publish website/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /publish website/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes to publish/i);
    });
  });

  it('surfaces a 409 PublishConflictError as a Conflict message', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('/blocks')) {
        return { ok: true, status: 200, json: async () => ({ data: { blocks: [] } }) } as Response;
      }
      if (typeof url === 'string' && url.includes('/hero')) {
        return { ok: true, status: 200, json: async () => ({ data: { hero: null } }) } as Response;
      }
      if (typeof url === 'string' && url.endsWith('/publish')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: { code: 'CONFLICT', message: 'Another editor published changes while you were working.' } }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    render(wrap(<PublishBar communityId={42} />));
    await screen.findByTestId('pending-changes-badge');
    // Wait for the blocks query to settle so the button is enabled.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /publish website/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /publish website/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Conflict.*another editor published/i);
    });
  });
});
