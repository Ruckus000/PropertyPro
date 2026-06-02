import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { HeroBlockForm } from '@/components/pm/site-editor/HeroBlockForm';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ok: true } }) });
});

describe('<HeroBlockForm>', () => {
  it('renders input fields for headline, subtitle, ctaText, ctaTarget', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    expect(screen.getByLabelText(/headline/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subtitle/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cta text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cta target/i)).toBeInTheDocument();
  });

  it('disables Save when headline is empty', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('enables Save when headline is filled', async () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Welcome');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('submits PATCH on Save click', async () => {
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Welcome');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [url, init] = calls[0];
    expect(url).toBe('/api/v1/pm/site/hero');
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body);
    expect(body.communityId).toBe(42);
    expect(body.headline).toBe('Welcome');
  });

  it('surfaces server validation errors as inline alert', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'ctaText and ctaTarget must both be present or both absent.' } }),
    });
    render(wrap(<HeroBlockForm communityId={42} initial={null} />));
    await userEvent.type(screen.getByLabelText(/headline/i), 'X');
    await userEvent.type(screen.getByLabelText(/cta text/i), 'Login');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(screen.getByText(/ctaText and ctaTarget must both be present/i)).toBeInTheDocument();
    });
  });

  it('pre-fills inputs from initial prop', () => {
    render(wrap(<HeroBlockForm communityId={42} initial={{ headline: 'Pre' }} />));
    expect(screen.getByLabelText(/headline/i)).toHaveValue('Pre');
  });

  it('preserves heroImagePath and heroImageAlt from initial when saving', async () => {
    render(
      wrap(
        <HeroBlockForm
          communityId={42}
          initial={{
            headline: 'Pre',
            heroImagePath: 'communities/42/site/hero-final.jpg',
            heroImageAlt: 'Sunset over the courtyard',
          }}
        />,
      ),
    );
    await userEvent.clear(screen.getByLabelText(/headline/i));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Updated headline');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const init = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.headline).toBe('Updated headline');
    expect(body.heroImagePath).toBe('communities/42/site/hero-final.jpg');
    expect(body.heroImageAlt).toBe('Sunset over the courtyard');
  });
});
