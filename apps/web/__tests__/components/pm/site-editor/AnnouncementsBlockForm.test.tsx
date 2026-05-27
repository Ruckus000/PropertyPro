import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { AnnouncementsBlockForm } from '@/components/pm/site-editor/AnnouncementsBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<AnnouncementsBlockForm>', () => {
  it('renders limit and timeWindowDays fields with defaults (5, 30)', () => {
    render(wrap(<AnnouncementsBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByLabelText(/maximum items/i)).toHaveValue(5);
    expect(screen.getByLabelText(/time window/i)).toHaveValue(30);
  });

  it('disables Save when limit is out of range (0 or 21)', async () => {
    render(wrap(<AnnouncementsBlockForm communityId={42} blockOrder={2} initial={null} />));
    const limitInput = screen.getByLabelText(/maximum items/i);

    await userEvent.clear(limitInput);
    await userEvent.type(limitInput, '0');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    await userEvent.clear(limitInput);
    await userEvent.type(limitInput, '21');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('disables Save when timeWindowDays is out of range (0 or 366)', async () => {
    render(wrap(<AnnouncementsBlockForm communityId={42} blockOrder={2} initial={null} />));
    const windowInput = screen.getByLabelText(/time window/i);

    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '0');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();

    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '366');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('submits PATCH with the parsed payload on Save click', async () => {
    render(
      wrap(<AnnouncementsBlockForm communityId={42} blockOrder={4} initial={null} />),
    );

    // Clear and set limit to 10
    const limitInput = screen.getByLabelText(/maximum items/i);
    await userEvent.clear(limitInput);
    await userEvent.type(limitInput, '10');

    // Clear and set window to 60
    const windowInput = screen.getByLabelText(/time window/i);
    await userEvent.clear(windowInput);
    await userEvent.type(windowInput, '60');

    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = calls[0];
    expect(url).toBe('/api/v1/pm/site/blocks');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body.communityId).toBe(42);
    expect(body.blockType).toBe('announcements');
    expect(body.blockOrder).toBe(4);
    expect(body.content.limit).toBe(10);
    expect(body.content.timeWindowDays).toBe(60);
  });

  it('surfaces server error as inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'Invalid limit.' } }),
    });
    render(wrap(<AnnouncementsBlockForm communityId={42} blockOrder={2} initial={null} />));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid limit.');
    });
  });
});
