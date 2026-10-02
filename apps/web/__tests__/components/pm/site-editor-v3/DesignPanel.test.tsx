/**
 * The Design tool (website builder v4, Phase 4b). Everything it saves is a
 * draft; these pin what it sends and what it shows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { saveMutateMock, designRef } = vi.hoisted(() => ({
  saveMutateMock: vi.fn(),
  designRef: {
    current: { live: {}, draft: {} } as { live: Record<string, unknown>; draft: Record<string, unknown> },
  },
}));

vi.mock('@/hooks/use-site-design', () => ({
  siteDesignQueryKey: (communityId: number) => ['pm', 'site', 'design', communityId] as const,
  useSiteDesign: () => ({ data: designRef.current, isError: false, refetch: vi.fn() }),
  useSaveSiteDesign: () => ({ mutate: saveMutateMock, isPending: false }),
}));

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

import { DesignPanel } from '@/components/pm/site-editor-v3/panels/DesignPanel';
import type { PresetCardData } from '@/components/pm/onboarding-wizard/PresetChooser';

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
      communityType="condo_718"
      presets={presets}
      hasSiteCustomCss={false}
      theme={THEME}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  designRef.current = {
    live: { layoutId: 'tidewater', themePresetSlug: 'bay-light' },
    draft: {},
  };
});

describe('templates', () => {
  it("shows the community type's templates first, the rest on request", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByTestId('design-template-condo-essentials')).toBeInTheDocument();
    expect(screen.queryByTestId('design-template-neighborhood-hoa')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show all templates/i }));

    expect(screen.getByTestId('design-template-neighborhood-hoa')).toBeInTheDocument();
  });

  it('marks the template matching the look that will publish', () => {
    designRef.current.draft = { themePresetSlug: 'gulf-warm' };
    renderPanel();

    expect(screen.getByTestId('design-template-waterfront-condo')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('design-template-condo-essentials')).toHaveAttribute('aria-checked', 'false');
  });

  it('saves a template as its layout and colour set, and says it needs Publish', async () => {
    const user = userEvent.setup();
    saveMutateMock.mockImplementation((_input, opts) => opts?.onSuccess?.());
    renderPanel();

    await user.click(screen.getByTestId('design-template-waterfront-condo'));

    expect(saveMutateMock.mock.calls[0]![0]).toEqual({ layoutId: 'tidewater', themePresetSlug: 'gulf-warm' });
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/waterfront condo.*publish/i));
  });

  it('hides a template whose colour set is not in the catalog', () => {
    renderPanel(PRESETS.filter((p) => p.slug !== 'gulf-warm'));
    expect(screen.queryByTestId('design-template-waterfront-condo')).not.toBeInTheDocument();
  });
});

describe('colour sets', () => {
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
