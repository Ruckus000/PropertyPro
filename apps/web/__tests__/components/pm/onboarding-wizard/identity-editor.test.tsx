// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { IdentityEditor } from '@/components/pm/onboarding-wizard/IdentityEditor';

// HeroImageField has its own test (HeroImageField.test.tsx) and fires its own
// queries/uploads on mount. Stub it here so these tests stay scoped to the
// tagline behavior (and don't consume the tagline PATCH's mockImplementationOnce).
vi.mock('@/components/pm/onboarding-wizard/HeroImageField', () => ({
  HeroImageField: () => <div data-testid="hero-image-field-stub" />,
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string' && url.endsWith('/api/v1/pm/onboarding/website') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as { tagline?: string | null };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            branding: {
              layoutId: null,
              themePresetSlug: null,
              tagline: body.tagline ?? null,
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

describe('<IdentityEditor>', () => {
  it('renders the tagline textarea with the establishedYear-based placeholder', async () => {
    render(wrap(<IdentityEditor communityId={42} establishedYear={1985} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    expect(input.placeholder).toContain('1985');
  });

  it('seeds the input from initialTagline (resume)', async () => {
    render(
      wrap(
        <IdentityEditor communityId={42} initialTagline="Coastal living, refined" />,
      ),
    );
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    expect(input.value).toBe('Coastal living, refined');
  });

  it('updates the counter as the user types', async () => {
    render(wrap(<IdentityEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Hello world' } });
    await waitFor(() =>
      expect(screen.getByTestId('wizard-tagline-counter')).toHaveTextContent('11 / 80'),
    );
  });

  it('Continue PATCHes the trimmed tagline value', async () => {
    const onContinue = vi.fn();
    render(wrap(<IdentityEditor communityId={42} onContinue={onContinue} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '  Calm coastal living  ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('Calm coastal living'));
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ communityId: 42, tagline: 'Calm coastal living' });
  });

  it('Continue PATCHes null when the tagline is empty (clears the value)', async () => {
    const onContinue = vi.fn();
    render(wrap(<IdentityEditor communityId={42} initialTagline="old" onContinue={onContinue} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith(null));
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ communityId: 42, tagline: null });
  });

  it('disables Continue and shows an error when over the hard cap', async () => {
    render(wrap(<IdentityEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    // 81 chars — one over the 80-char cap
    fireEvent.change(input, { target: { value: 'a'.repeat(81) } });
    const button = screen.getByRole('button', { name: /continue/i });
    await waitFor(() => expect(button).toBeDisabled());
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('Skip calls onSkip without firing a PATCH', async () => {
    const onSkip = vi.fn();
    render(wrap(<IdentityEditor communityId={42} onSkip={onSkip} />));
    await screen.findByTestId('wizard-tagline-input');
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
      status: 500,
      json: async () => ({ error: { message: 'Save failed' } }),
    } as Response));
    render(wrap(<IdentityEditor communityId={42} />));
    const input = await screen.findByTestId('wizard-tagline-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'A nice tagline' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/save failed/i);
    });
  });
});
