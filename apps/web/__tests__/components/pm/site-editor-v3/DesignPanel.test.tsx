/**
 * The Design panel (website builder v4, Phase 4b; Site settings, combined plan
 * Task 27). The colour set and custom colours it saves are drafts; these pin
 * what it sends and what it shows. It lists no looks: it links to the look
 * picker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { saveMutateMock, savePendingRef, designRef } = vi.hoisted(() => ({
  saveMutateMock: vi.fn(),
  savePendingRef: { current: false },
  designRef: {
    current: { live: {}, draft: {} } as { live: Record<string, unknown>; draft: Record<string, unknown> },
  },
}));

vi.mock('@/hooks/use-site-design', () => ({
  siteDesignQueryKey: (communityId: number) => ['pm', 'site', 'design', communityId] as const,
  useSiteDesign: () => ({ data: designRef.current, isError: false, refetch: vi.fn() }),
  useSaveSiteDesign: () => ({ mutate: saveMutateMock, isPending: savePendingRef.current }),
}));

// The Logos section has its own test (LogosSection.test.tsx).
vi.mock('@/components/pm/site-editor-v3/panels/LogosSection', () => ({
  LogosSection: () => null,
}));

const { toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock, info: vi.fn(), dismiss: vi.fn() },
}));

import { DesignPanel } from '@/components/pm/site-editor-v3/panels/DesignPanel';
import type { PresetCardData } from '@/components/pm/site-editor-v3/panels/preset-cards';

const preset = (slug: string, displayName: string): PresetCardData => ({
  slug,
  displayName,
  description: null,
  tokens: { primaryColor: '#123456' },
  tier: 'essentials',
  isFeatured: false,
});

const PRESETS = [
  preset('bay-light', 'Bay Light'),
  preset('gulf-warm', 'Gulf Warm'),
  preset('palm-shadow', 'Palm Shadow'),
  preset('midnight-coast', 'Midnight Coast'),
  preset('linen-bronze', 'Linen Bronze'),
  preset('noir-coastal', 'Noir Coastal'),
];

const THEME = { primaryColor: '#C2533A', secondaryColor: '#6B7280', accentColor: '#F7DCD2', bodyFont: 'Lora' };

function renderPanel(presets = PRESETS) {
  return render(
    <DesignPanel
      communityId={42}
      presets={presets}
      hasSiteCustomCss={false}
      theme={THEME}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  savePendingRef.current = false;
  designRef.current = {
    live: { layoutId: 'tidewater', themePresetSlug: 'bay-light' },
    draft: {},
  };
});

describe('looks', () => {
  it('links to the look picker for this community', () => {
    renderPanel();

    expect(screen.getByRole('link', { name: 'Change look' })).toHaveAttribute(
      'href',
      '/pm/website/looks?communityId=42',
    );
  });

  it('lists no looks, whatever the site is on', () => {
    for (const layoutId of ['tidewater', 'bayfront', 'heritage']) {
      designRef.current = { live: { layoutId, themePresetSlug: 'bay-light' }, draft: {} };
      const { unmount } = renderPanel();

      expect(screen.queryByRole('radiogroup', { name: 'Look' })).not.toBeInTheDocument();
      expect(document.querySelector('[data-testid^="design-look-"]')).toBeNull();
      for (const name of ['Bayfront', 'Heritage', 'Palm Grove', 'Plain & Simple']) {
        expect(screen.queryByText(name)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it('no longer offers the six colour-only templates', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: /show all templates/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid^="design-template-"]')).toBeNull();
  });
});

describe('colour sets', () => {
  it('holds the colour sets still while a colour set is being saved', () => {
    savePendingRef.current = true;
    renderPanel();

    expect(screen.getByLabelText(/midnight coast/i)).toBeDisabled();
  });

  it('lets a colour set be chosen when nothing is being saved', () => {
    renderPanel();

    expect(screen.getByLabelText(/midnight coast/i)).toBeEnabled();
  });

  it('saves a colour set by its slug', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText(/midnight coast/i));

    expect(saveMutateMock.mock.calls[0]![0]).toEqual({ themePresetSlug: 'midnight-coast' });
  });

  it("says when custom colours are replacing the set's, and can clear them", async () => {
    const user = userEvent.setup();
    designRef.current.live = { ...designRef.current.live, customCssOverrides: { primaryColor: '#000000' } };
    renderPanel();

    expect(screen.getByTestId('design-custom-colours-note')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use the set's colours instead/i }));

    expect(saveMutateMock.mock.calls[0]![0]).toEqual({ customCssOverrides: null });
  });

  it('shows no such note once the draft clears them', () => {
    designRef.current.live = { ...designRef.current.live, customCssOverrides: { primaryColor: '#000000' } };
    designRef.current.draft = { customCssOverrides: null };
    renderPanel();

    expect(screen.queryByTestId('design-custom-colours-note')).not.toBeInTheDocument();
  });
});
