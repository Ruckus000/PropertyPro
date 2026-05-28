import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { TextBlockForm } from '@/components/pm/site-editor/TextBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<TextBlockForm>', () => {
  it('renders heading and body fields', () => {
    render(wrap(<TextBlockForm communityId={42} blockOrder={1} initial={null} />));
    expect(screen.getByLabelText(/heading/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/body/i)).toBeInTheDocument();
  });

  it('disables Save when body is empty', () => {
    render(wrap(<TextBlockForm communityId={42} blockOrder={1} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save when body is filled', async () => {
    render(wrap(<TextBlockForm communityId={42} blockOrder={1} initial={null} />));
    await userEvent.type(screen.getByLabelText(/body/i), 'Hello world');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('submits PATCH with correct payload', async () => {
    render(wrap(<TextBlockForm communityId={42} blockOrder={2} initial={null} />));
    await userEvent.type(screen.getByLabelText(/heading/i), 'My Title');
    await userEvent.type(screen.getByLabelText(/body/i), 'Some body text');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.communityId).toBe(42);
    expect(body.blockType).toBe('text');
    expect(body.blockOrder).toBe(2);
    expect(body.content.body).toBe('Some body text');
    expect(body.content.heading).toBe('My Title');
  });

  it('surfaces server error as inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Body too short.' } }),
    });
    render(wrap(<TextBlockForm communityId={42} blockOrder={1} initial={null} />));
    await userEvent.type(screen.getByLabelText(/body/i), 'X');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Body too short.');
    });
  });

  it('pre-fills from initial prop', () => {
    render(
      wrap(
        <TextBlockForm
          communityId={42}
          blockOrder={1}
          initial={{ body: 'Existing body', heading: 'Existing heading' }}
        />,
      ),
    );
    expect(screen.getByLabelText(/heading/i)).toHaveValue('Existing heading');
    expect(screen.getByLabelText(/body/i)).toHaveValue('Existing body');
  });
});
