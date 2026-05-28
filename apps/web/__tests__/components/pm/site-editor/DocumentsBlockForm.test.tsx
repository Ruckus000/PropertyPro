import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { DocumentsBlockForm } from '@/components/pm/site-editor/DocumentsBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<DocumentsBlockForm>', () => {
  it('renders limit field with default 5 and all 5 category checkboxes', () => {
    render(wrap(<DocumentsBlockForm communityId={42} blockOrder={5} initial={null} />));
    expect(screen.getByLabelText(/maximum items/i)).toHaveValue(5);
    expect(screen.getByLabelText('Budget')).toBeInTheDocument();
    expect(screen.getByLabelText('Minutes')).toBeInTheDocument();
    expect(screen.getByLabelText('Financial')).toBeInTheDocument();
    expect(screen.getByLabelText('Rules')).toBeInTheDocument();
    expect(screen.getByLabelText('Other')).toBeInTheDocument();
  });

  it('disables Save when limit is out of range (0 or 21)', async () => {
    render(wrap(<DocumentsBlockForm communityId={42} blockOrder={5} initial={null} />));
    const limitInput = screen.getByLabelText(/maximum items/i);

    await userEvent.clear(limitInput);
    await userEvent.type(limitInput, '0');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    await userEvent.clear(limitInput);
    await userEvent.type(limitInput, '21');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('submits PATCH with the selected categories and limit', async () => {
    render(wrap(<DocumentsBlockForm communityId={42} blockOrder={5} initial={null} />));

    const budgetCheckbox = screen.getByLabelText('Budget');
    const minutesCheckbox = screen.getByLabelText('Minutes');
    fireEvent.click(budgetCheckbox);
    fireEvent.click(minutesCheckbox);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.communityId).toBe(42);
    expect(body.blockType).toBe('documents');
    expect(body.blockOrder).toBe(5);
    expect(body.content.limit).toBe(5);
    expect(body.content.includeCategories).toContain('budget');
    expect(body.content.includeCategories).toContain('minutes');
  });

  it('pre-fills from initial config (checked categories and limit)', () => {
    render(
      wrap(
        <DocumentsBlockForm
          communityId={42}
          blockOrder={5}
          initial={{ limit: 8, includeCategories: ['rules', 'financial'] }}
        />,
      ),
    );
    expect(screen.getByLabelText(/maximum items/i)).toHaveValue(8);
    expect((screen.getByLabelText('Rules') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Financial') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Budget') as HTMLInputElement).checked).toBe(false);
  });

  it('surfaces server error as inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid limit.' } }),
    });
    render(wrap(<DocumentsBlockForm communityId={42} blockOrder={5} initial={null} />));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid limit.');
    });
  });

  it('renders the per-document public-toggle hint (migration 0007 supersedes the category-as-access warning)', () => {
    // The earlier PR-C role=note warned that category selection WAS the
    // access boundary. Migration 0007 made documents.public_access the
    // authoritative gate — the warning now tells PMs where to set it.
    render(wrap(<DocumentsBlockForm communityId={42} blockOrder={5} initial={null} />));
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/Only documents marked.*Public.*will appear here/i);
    expect(note).toHaveTextContent(/Documents page/i);
  });
});
