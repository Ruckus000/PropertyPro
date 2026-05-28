import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { ContactBlockForm } from '@/components/pm/site-editor/ContactBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<ContactBlockForm>', () => {
  it('renders both toggles enabled by default', () => {
    render(wrap(<ContactBlockForm communityId={42} blockOrder={7} initial={null} />));
    expect(screen.getByLabelText(/management contact/i)).toBeChecked();
    expect(screen.getByLabelText(/board roster/i)).toBeChecked();
  });

  it('honors initial visibility values', () => {
    render(wrap(
      <ContactBlockForm
        communityId={42}
        blockOrder={7}
        initial={{ showBoard: false, showManagement: true }}
      />,
    ));
    expect(screen.getByLabelText(/management contact/i)).toBeChecked();
    expect(screen.getByLabelText(/board roster/i)).not.toBeChecked();
  });

  it('submits PATCH with the parsed contact payload', async () => {
    render(wrap(<ContactBlockForm communityId={42} blockOrder={7} initial={null} />));
    fireEvent.click(screen.getByLabelText(/board roster/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      communityId: 42,
      blockType: 'contact',
      blockOrder: 7,
      content: { showBoard: false, showManagement: true },
    });
  });

  it('surfaces server error as inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid contact settings.' } }),
    });
    render(wrap(<ContactBlockForm communityId={42} blockOrder={7} initial={null} />));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid contact settings.');
    });
  });
});
