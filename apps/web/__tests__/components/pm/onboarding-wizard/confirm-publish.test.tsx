// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { ConfirmPublish } from '@/components/pm/onboarding-wizard/ConfirmPublish';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

interface Stubs {
  blocks?: unknown;
  hero?: unknown;
  publishResponse?: { status: number; body: unknown };
}

function installFetch(stubs: Stubs = {}) {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string') {
      if (url.includes('/api/v1/pm/site/blocks')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { blocks: stubs.blocks ?? [] } }),
        } as Response;
      }
      if (url.includes('/api/v1/pm/site/hero')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { hero: stubs.hero ?? null } }),
        } as Response;
      }
      if (url.endsWith('/api/v1/pm/site/publish')) {
        if (stubs.publishResponse) {
          const { status, body } = stubs.publishResponse;
          return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              published: true,
              publishedAt: '2026-05-30T12:00:00Z',
              promotedCount: 2,
              retiredCount: 1,
            },
          }),
        } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: '404' } }) } as Response;
  });
}

describe('<ConfirmPublish>', () => {
  beforeEach(() => {
    installFetch();
  });

  it('renders the loading state while blocks are fetching', async () => {
    render(wrap(<ConfirmPublish communityId={42} />));
    expect(screen.getByTestId('confirm-publish-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no blocks exist after load', async () => {
    installFetch({ blocks: [] });
    render(wrap(<ConfirmPublish communityId={42} />));
    expect(await screen.findByTestId('confirm-publish-empty')).toBeInTheDocument();
  });

  it('renders one row per block in block_order ascending', async () => {
    installFetch({
      blocks: [
        { id: 3, blockType: 'documents', blockOrder: 4, content: {}, isDraft: true, publishedAt: null },
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
        { id: 2, blockType: 'announcements', blockOrder: 2, content: {}, isDraft: false, publishedAt: '2026-05-10T00:00:00Z' },
      ],
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    const list = await screen.findByTestId('confirm-publish-list');
    const rows = list.querySelectorAll('li');
    expect(rows).toHaveLength(3);
    // Order assertion via the testid sequence
    expect(rows[0]).toHaveAttribute('data-testid', 'confirm-row-hero');
    expect(rows[1]).toHaveAttribute('data-testid', 'confirm-row-announcements');
    expect(rows[2]).toHaveAttribute('data-testid', 'confirm-row-documents');
  });

  it('shows Draft vs Live badges per row', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: false, publishedAt: '2026-05-10T00:00:00Z' },
        { id: 2, blockType: 'documents', blockOrder: 2, content: {}, isDraft: true, publishedAt: null },
      ],
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    const heroRow = await screen.findByTestId('confirm-row-hero');
    const docsRow = screen.getByTestId('confirm-row-documents');
    expect(heroRow).toHaveTextContent('Live');
    expect(docsRow).toHaveTextContent('Draft');
  });

  it('badge counts draft sections accurately', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
        { id: 2, blockType: 'docs', blockOrder: 2, content: {}, isDraft: true, publishedAt: null },
        { id: 3, blockType: 'meetings', blockOrder: 3, content: {}, isDraft: false, publishedAt: '2026-05-10T00:00:00Z' },
      ],
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    const badge = await screen.findByTestId('confirm-publish-badge');
    await waitFor(() => expect(badge).toHaveTextContent(/2 draft sections ready to publish/i));
  });

  it('publish POSTs and surfaces the success message + community URL', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
      ],
    });
    render(wrap(<ConfirmPublish communityId={42} communitySlug="sunset-condos" />));
    await screen.findByTestId('confirm-publish-list');
    fireEvent.click(screen.getByRole('button', { name: /publish my site/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/published — 2 sections live/i);
      expect(screen.getByRole('status')).toHaveTextContent(/sunset-condos\.getpropertypro\.com/i);
    });
  });

  it('publish POST includes max(publishedAt) across published rows as the concurrency token', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: false, publishedAt: '2026-05-10T00:00:00Z' },
        { id: 2, blockType: 'docs', blockOrder: 2, content: {}, isDraft: false, publishedAt: '2026-05-15T11:30:00Z' },
        { id: 3, blockType: 'meetings', blockOrder: 3, content: {}, isDraft: true, publishedAt: null },
      ],
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    await screen.findByTestId('confirm-publish-list');
    fireEvent.click(screen.getByRole('button', { name: /publish my site/i }));
    await waitFor(() => {
      const publishCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/publish'),
      );
      expect(publishCall).toBeDefined();
      const body = JSON.parse((publishCall![1] as RequestInit).body as string);
      expect(body.expectedPublishedAt).toBe('2026-05-15T11:30:00Z');
    });
  });

  it('surfaces no-op message on { published: false }', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: false, publishedAt: '2026-05-10T00:00:00Z' },
      ],
      publishResponse: {
        status: 200,
        body: { data: { published: false, reason: 'nothing-to-publish' } },
      },
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    await screen.findByTestId('confirm-publish-list');
    fireEvent.click(screen.getByRole('button', { name: /publish my site/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/no changes to publish/i);
    });
  });

  it('surfaces 409 PublishConflictError as Conflict message', async () => {
    installFetch({
      blocks: [
        { id: 1, blockType: 'hero', blockOrder: 1, content: {}, isDraft: true, publishedAt: null },
      ],
      publishResponse: {
        status: 409,
        body: { error: { code: 'CONFLICT', message: 'Another editor published changes.' } },
      },
    });
    render(wrap(<ConfirmPublish communityId={42} />));
    await screen.findByTestId('confirm-publish-list');
    fireEvent.click(screen.getByRole('button', { name: /publish my site/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/conflict.*another editor/i);
    });
  });

  it('disables Publish button while no blocks exist', async () => {
    installFetch({ blocks: [] });
    render(wrap(<ConfirmPublish communityId={42} />));
    await screen.findByTestId('confirm-publish-empty');
    expect(screen.getByRole('button', { name: /publish my site/i })).toBeDisabled();
  });
});
