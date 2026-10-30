/**
 * The Design tool (website builder v4, Phase 4b; looks, Phase 2B). Everything it
 * saves is a draft; these pin what it sends and what it shows.
 *
 * The list of looks is interim: Task 27 of the combined website-builder plan
 * replaces it with a link to the look picker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { saveMutateMock, savePendingRef, draftLookMutateMock, draftLookPendingRef, designRef } = vi.hoisted(() => ({
  saveMutateMock: vi.fn(),
  savePendingRef: { current: false },
  draftLookMutateMock: vi.fn(),
  draftLookPendingRef: { current: false },
  designRef: {
    current: { live: {}, draft: {} } as { live: Record<string, unknown>; draft: Record<string, unknown> },
  },
}));

vi.mock('@/hooks/use-site-design', () => ({
  siteDesignQueryKey: (communityId: number) => ['pm', 'site', 'design', communityId] as const,
  useSiteDesign: () => ({ data: designRef.current, isError: false, refetch: vi.fn() }),
  useSaveSiteDesign: () => ({ mutate: saveMutateMock, isPending: savePendingRef.current }),
}));
vi.mock('@/hooks/use-draft-site-look', () => ({
  useDraftSiteLook: () => ({ mutate: draftLookMutateMock, isPending: draftLookPendingRef.current }),
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
import { LOOKS } from '@/lib/site-looks/looks';

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
  draftLookPendingRef.current = false;
  designRef.current = {
    live: { layoutId: 'tidewater', themePresetSlug: 'bay-light' },
    draft: {},
  };
});

/** The four looks' radios, in the order the panel lists them. */
function lookRadios() {
  return within(screen.getByRole('radiogroup', { name: 'Look' })).getAllByRole('radio');
}

describe('looks', () => {
  it('Design panel lists the four looks', () => {
    renderPanel();

    const group = screen.getByRole('radiogroup', { name: 'Look' });
    expect(lookRadios().map((radio) => radio.getAttribute('data-testid'))).toEqual([
      'design-look-bayfront',
      'design-look-heritage',
      'design-look-palm-grove',
      'design-look-plain-simple',
    ]);
    // Each look is named and described as the registry has it.
    expect(LOOKS).toHaveLength(4);
    for (const look of LOOKS) {
      const radio = within(group).getByTestId(`design-look-${look.id}`);
      expect(radio).toHaveTextContent(look.name);
      expect(radio).toHaveTextContent(look.description);
    }
  });

  it('no longer offers the six colour-only templates', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: /show all templates/i })).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid^="design-template-"]')).toBeNull();
  });

  it('marks the live look when nothing else is drafted', () => {
    designRef.current = { live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' }, draft: {} };
    renderPanel();

    expect(screen.getByTestId('design-look-bayfront')).toHaveAttribute('aria-checked', 'true');
    expect(lookRadios().filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('marks the look that will publish: the drafted layout over the live one', () => {
    designRef.current = {
      live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' },
      draft: { layoutId: 'heritage', themePresetSlug: 'heritage' },
    };
    renderPanel();

    expect(screen.getByTestId('design-look-heritage')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('design-look-bayfront')).toHaveAttribute('aria-checked', 'false');
    // Not by colour alone: the selected look says so in words.
    expect(screen.getByTestId('design-look-heritage')).toHaveTextContent(/selected/i);
    expect(screen.getByTestId('design-look-bayfront')).not.toHaveTextContent(/selected/i);
  });

  it('says so when the site is on an older look, and marks none', () => {
    // The beforeEach design is Tidewater: a layout that predates the looks.
    renderPanel();

    expect(screen.getByTestId('design-older-look-note')).toHaveTextContent(/older look/i);
    expect(lookRadios().every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('shows no older-look note once a look is selected', () => {
    designRef.current = { live: { layoutId: 'palm-grove', themePresetSlug: 'palm-grove' }, draft: {} };
    renderPanel();

    expect(screen.queryByTestId('design-older-look-note')).not.toBeInTheDocument();
  });

  it('drafts the chosen look, and says it needs Publish', async () => {
    const user = userEvent.setup();
    draftLookMutateMock.mockImplementation((_lookId, opts) => opts?.onSuccess?.());
    designRef.current = { live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' }, draft: {} };
    renderPanel();

    await user.click(screen.getByTestId('design-look-heritage'));

    expect(draftLookMutateMock).toHaveBeenCalledTimes(1);
    expect(draftLookMutateMock.mock.calls[0]![0]).toBe('heritage');
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/heritage.*publish/i));
    // A look is not a design save: that goes through the look route, not the design one.
    expect(saveMutateMock).not.toHaveBeenCalled();
  });

  it('says the website already uses the look when the choice goes back to the live look', async () => {
    const user = userEvent.setup();
    // What the route returns for a way back with nothing edited: counts that are not zero,
    // although nothing is left to publish. The panel knows the live look, so it need not guess from them.
    draftLookMutateMock.mockImplementation((_lookId, opts) =>
      opts?.onSuccess?.({ replaced: 5, kept: 0, added: 1, removed: 1 }),
    );
    designRef.current = {
      live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' },
      draft: { layoutId: 'heritage', themePresetSlug: 'heritage' },
    };
    renderPanel();

    await user.click(screen.getByTestId('design-look-bayfront'));

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith('Your website already uses this look.');
  });

  it('still asks for Publish for a look the website does not use yet', async () => {
    const user = userEvent.setup();
    draftLookMutateMock.mockImplementation((_lookId, opts) =>
      opts?.onSuccess?.({ replaced: 5, kept: 0, added: 1, removed: 1 }),
    );
    designRef.current = {
      live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' },
      draft: { layoutId: 'heritage', themePresetSlug: 'heritage' },
    };
    renderPanel();

    await user.click(screen.getByTestId('design-look-palm-grove'));

    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/palm grove.*publish/i));
  });

  it('can return to the live look after another is drafted', async () => {
    const user = userEvent.setup();
    designRef.current = {
      live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' },
      draft: { layoutId: 'heritage', themePresetSlug: 'heritage' },
    };
    renderPanel();

    await user.click(screen.getByTestId('design-look-bayfront'));

    expect(draftLookMutateMock.mock.calls[0]![0]).toBe('bayfront');
  });

  it('sends nothing for the look that is already selected', async () => {
    const user = userEvent.setup();
    designRef.current = { live: { layoutId: 'bayfront', themePresetSlug: 'bayfront' }, draft: {} };
    renderPanel();

    await user.click(screen.getByTestId('design-look-bayfront'));

    expect(draftLookMutateMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the look cannot be drafted", async () => {
    const user = userEvent.setup();
    draftLookMutateMock.mockImplementation((_lookId, opts) => opts?.onError?.(new Error('That colour set is gone')));
    renderPanel();

    await user.click(screen.getByTestId('design-look-heritage'));

    expect(toastErrorMock).toHaveBeenCalledWith('That colour set is gone');
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('holds the looks still while a switch is being saved', () => {
    draftLookPendingRef.current = true;
    renderPanel();

    expect(lookRadios().every((radio) => radio.hasAttribute('disabled'))).toBe(true);
  });

  it('holds the looks still while a colour set is being saved', () => {
    savePendingRef.current = true;
    renderPanel();

    expect(lookRadios().every((radio) => radio.hasAttribute('disabled'))).toBe(true);
  });
});

describe('colour sets', () => {
  it('holds the colour sets still while a look is being saved', async () => {
    const user = userEvent.setup();
    draftLookPendingRef.current = true;
    renderPanel();

    const set = screen.getByLabelText(/midnight coast/i);
    expect(set).toBeDisabled();
    await user.click(set);

    expect(saveMutateMock).not.toHaveBeenCalled();
  });

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
