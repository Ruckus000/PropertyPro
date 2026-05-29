// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { WelcomeMessageEditor } from '@/components/pm/onboarding-wizard/WelcomeMessageEditor';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

interface FetchOpts {
  heroBody?: Record<string, unknown> | null;
  heroError?: { status: number; message: string } | null;
  patchError?: { status: number; message: string } | null;
}

function installFetch(opts: FetchOpts = {}) {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string' && url.includes('/api/v1/pm/site/hero')) {
      if (init?.method === 'PATCH') {
        if (opts.patchError) {
          return {
            ok: false,
            status: opts.patchError.status,
            json: async () => ({ error: { message: opts.patchError!.message } }),
          } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) } as Response;
      }
      if (opts.heroError) {
        return {
          ok: false,
          status: opts.heroError.status,
          json: async () => ({ error: { message: opts.heroError!.message } }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { hero: opts.heroBody ?? null } }),
      } as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: '404' } }) } as Response;
  });
}

describe('<WelcomeMessageEditor>', () => {
  beforeEach(() => {
    installFetch();
  });

  it('renders an empty textarea when the community has no hero saved', async () => {
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
  });

  it('updates the counter as the user types', async () => {
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'A short welcome message.' } });
    await waitFor(() =>
      expect(screen.getByTestId('wizard-welcome-counter')).toHaveTextContent('24 / 280'),
    );
  });

  it('Continue PATCHes hero with the trimmed subtitle + default headline', async () => {
    const onContinue = vi.fn();
    render(
      wrap(
        <WelcomeMessageEditor
          communityId={42}
          defaultHeadline="Welcome to Sunset Condos"
          onContinue={onContinue}
        />,
      ),
    );
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '  Hi from the coast  ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('Hi from the coast'));

    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/site/hero') && (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      communityId: 42,
      headline: 'Welcome to Sunset Condos',
      subtitle: 'Hi from the coast',
    });
  });

  it('Continue OMITS the subtitle field when body is empty', async () => {
    installFetch({ heroBody: { headline: 'Welcome', subtitle: 'old' } });
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe('old'));
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('/site/hero') && (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.subtitle).toBeUndefined();
      expect(body.headline).toBe('Welcome');
    });
  });

  it('Continue preserves existing CTA fields when present', async () => {
    installFetch({
      heroBody: {
        headline: 'H',
        subtitle: 'S',
        ctaText: 'Sign in',
        ctaTarget: '/auth/login',
      },
    });
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toBe('S'));
    fireEvent.change(input, { target: { value: 'New body' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) => typeof c[0] === 'string' && (c[0] as string).includes('/site/hero') && (c[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({
        ctaText: 'Sign in',
        ctaTarget: '/auth/login',
        subtitle: 'New body',
      });
    });
  });

  it('disables Continue and sets aria-invalid when over the 280-char cap', async () => {
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a'.repeat(281) } });
    const button = screen.getByRole('button', { name: /continue/i });
    await waitFor(() => expect(button).toBeDisabled());
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('Skip calls onSkip without firing the hero PATCH', async () => {
    const onSkip = vi.fn();
    render(wrap(<WelcomeMessageEditor communityId={42} onSkip={onSkip} />));
    await screen.findByTestId('wizard-welcome-input');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
    const patchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes('/site/hero') && (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('surfaces server error message on failed Continue', async () => {
    installFetch({ patchError: { status: 500, message: 'Hero save failed' } });
    render(wrap(<WelcomeMessageEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-welcome-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'A welcome.' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/hero save failed/i);
    });
  });
});
