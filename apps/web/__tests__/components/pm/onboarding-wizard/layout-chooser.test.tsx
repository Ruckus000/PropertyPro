// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { LayoutChooser } from '@/components/pm/onboarding-wizard/LayoutChooser';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string' && url.endsWith('/api/v1/pm/onboarding/website') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as { layoutId?: string };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            branding: {
              layoutId: body.layoutId ?? null,
              themePresetSlug: null,
              tagline: null,
              primaryColor: null,
              secondaryColor: null,
              accentColor: null,
              fontHeading: null,
              fontBody: null,
            },
          },
        }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: '404' } }) } as Response;
  });
});

describe('<LayoutChooser>', () => {
  it('renders three layout cards', async () => {
    render(wrap(<LayoutChooser communityId={42} />));
    expect(await screen.findByTestId('layout-card-tidewater')).toBeInTheDocument();
    expect(screen.getByTestId('layout-card-boulevard')).toBeInTheDocument();
    expect(screen.getByTestId('layout-card-sable')).toBeInTheDocument();
  });

  it('pre-selects Tidewater by default', async () => {
    render(wrap(<LayoutChooser communityId={42} />));
    const radio = (await screen.findByTestId('layout-card-tidewater'))
      .querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('honors initialLayoutId for resume', async () => {
    render(wrap(<LayoutChooser communityId={42} initialLayoutId="boulevard" />));
    const radio = (await screen.findByTestId('layout-card-boulevard'))
      .querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('clicking a card changes the selection', async () => {
    render(wrap(<LayoutChooser communityId={42} />));
    await screen.findByTestId('layout-card-sable');
    fireEvent.click(screen.getByTestId('layout-card-sable'));
    const sableRadio = screen.getByTestId('layout-card-sable')
      .querySelector('input[type=radio]') as HTMLInputElement;
    await waitFor(() => expect(sableRadio.checked).toBe(true));
  });

  it('Continue PATCHes /api/v1/pm/onboarding/website with the selected layoutId', async () => {
    const onContinue = vi.fn();
    render(wrap(<LayoutChooser communityId={42} onContinue={onContinue} />));
    await screen.findByTestId('layout-card-tidewater');
    fireEvent.click(screen.getByTestId('layout-card-boulevard'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('boulevard'));
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ communityId: 42, layoutId: 'boulevard' });
  });

  it('Skip calls onSkip without firing a PATCH', async () => {
    const onSkip = vi.fn();
    render(wrap(<LayoutChooser communityId={42} onSkip={onSkip} />));
    await screen.findByTestId('layout-card-tidewater');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    expect(fetchCalls).toHaveLength(0);
  });

  it('surfaces server error message on failed Continue', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'You do not have permission' } }),
    } as Response));
    render(wrap(<LayoutChooser communityId={42} />));
    await screen.findByTestId('layout-card-tidewater');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission/i);
    });
  });
});
