// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { PresetChooser, type PresetCardData } from '@/components/pm/onboarding-wizard/PresetChooser';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const SAMPLE_PRESETS: PresetCardData[] = [
  {
    slug: 'bay-light',
    displayName: 'Bay Light',
    description: 'Tidewater default — warm ivory ground.',
    tokens: {
      primaryColor: '#0e3338',
      secondaryColor: '#f6f1e6',
      accentColor: '#c66f49',
      headingFont: 'Fraunces',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: true,
  },
  {
    slug: 'midnight-coast',
    displayName: 'Midnight Coast',
    description: 'Deep navy + sunlit ochre + seafoam.',
    tokens: {
      primaryColor: '#1f2a44',
      secondaryColor: '#f4ede1',
      accentColor: '#d68a2a',
      headingFont: 'Newsreader',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: true,
  },
  {
    slug: 'noir-coastal',
    displayName: 'Noir Coastal',
    description: 'Charcoal-warm + pale stone + brass accent.',
    tokens: {
      primaryColor: '#2b2a27',
      secondaryColor: '#d4cbb6',
      accentColor: '#8c7355',
      headingFont: 'Cormorant Garamond',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: false,
  },
];

beforeEach(() => {
  global.fetch = vi.fn(async (url, init) => {
    if (typeof url === 'string' && url.endsWith('/api/v1/pm/onboarding/website') && init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string) as { themePresetSlug?: string };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            branding: {
              layoutId: null,
              themePresetSlug: body.themePresetSlug ?? null,
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

describe('<PresetChooser>', () => {
  it('renders a card per preset', async () => {
    render(wrap(<PresetChooser communityId={42} presets={SAMPLE_PRESETS} />));
    expect(await screen.findByTestId('preset-card-bay-light')).toBeInTheDocument();
    expect(screen.getByTestId('preset-card-midnight-coast')).toBeInTheDocument();
    expect(screen.getByTestId('preset-card-noir-coastal')).toBeInTheDocument();
  });

  it('pre-selects the first featured preset by default', async () => {
    render(wrap(<PresetChooser communityId={42} presets={SAMPLE_PRESETS} />));
    const radio = (await screen.findByTestId('preset-card-bay-light'))
      .querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('falls back to the first preset when none are featured', async () => {
    const noFeatured = SAMPLE_PRESETS.map((p) => ({ ...p, isFeatured: false }));
    render(wrap(<PresetChooser communityId={42} presets={noFeatured} />));
    const radio = (await screen.findByTestId('preset-card-bay-light'))
      .querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('honors initialPresetSlug for resume', async () => {
    render(
      wrap(
        <PresetChooser
          communityId={42}
          presets={SAMPLE_PRESETS}
          initialPresetSlug="noir-coastal"
        />,
      ),
    );
    const radio = (await screen.findByTestId('preset-card-noir-coastal'))
      .querySelector('input[type=radio]') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('clicking a card changes the selection', async () => {
    render(wrap(<PresetChooser communityId={42} presets={SAMPLE_PRESETS} />));
    await screen.findByTestId('preset-card-bay-light');
    fireEvent.click(screen.getByTestId('preset-card-midnight-coast'));
    const midnight = screen.getByTestId('preset-card-midnight-coast')
      .querySelector('input[type=radio]') as HTMLInputElement;
    await waitFor(() => expect(midnight.checked).toBe(true));
  });

  it('Continue PATCHes /api/v1/pm/onboarding/website with the selected themePresetSlug', async () => {
    const onContinue = vi.fn();
    render(
      wrap(
        <PresetChooser
          communityId={42}
          presets={SAMPLE_PRESETS}
          onContinue={onContinue}
        />,
      ),
    );
    await screen.findByTestId('preset-card-bay-light');
    fireEvent.click(screen.getByTestId('preset-card-midnight-coast'));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('midnight-coast'));
    const patchCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body).toEqual({ communityId: 42, themePresetSlug: 'midnight-coast' });
  });

  it('Skip calls onSkip without firing a PATCH', async () => {
    const onSkip = vi.fn();
    render(
      wrap(
        <PresetChooser communityId={42} presets={SAMPLE_PRESETS} onSkip={onSkip} />,
      ),
    );
    await screen.findByTestId('preset-card-bay-light');
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onSkip).toHaveBeenCalled();
    const fetchCalls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).endsWith('/onboarding/website'),
    );
    expect(fetchCalls).toHaveLength(0);
  });

  it('renders the empty-state when no presets are supplied', async () => {
    render(wrap(<PresetChooser communityId={42} presets={[]} />));
    expect(await screen.findByTestId('preset-chooser')).toHaveTextContent(/no presets are available/i);
  });

  it('surfaces server error message on failed Continue', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal error' } }),
    } as Response));
    render(wrap(<PresetChooser communityId={42} presets={SAMPLE_PRESETS} />));
    await screen.findByTestId('preset-card-bay-light');
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/internal error/i);
    });
  });
});
