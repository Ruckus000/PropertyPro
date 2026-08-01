/**
 * Website editor v3 — the Colours tool panel.
 *
 * Three things this file is really protecting:
 *
 *   1. the plan gate — a community without `hasSiteCustomCss` must see the
 *      upsell and be unable to submit, not a form that 403s on save;
 *   2. the payload shape — every switch off means `null` ("use the preset"),
 *      not `{}`, which the branding route reads differently;
 *   3. the pickers seed from the community's LIVE colours, not from constants.
 *      The legacy form's hard-coded hexes had drifted from the product default,
 *      so turning an override on silently changed a colour the PM never chose.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Radix Switch/Select (shadcn) need these in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { saveMutateMock, isPendingRef, storeRef } = vi.hoisted(() => ({
  saveMutateMock: vi.fn(),
  isPendingRef: { current: false },
  // Stands in for the React Query cache the real hook reads/writes, so the
  // remount behaviour can be exercised without a QueryClient.
  storeRef: { current: undefined as unknown },
}));

// Mocked COMPLETELY — a partial factory fails at module load for whichever
// export the tree happens to reach, which reads as an unrelated break.
vi.mock('@/hooks/use-custom-css', () => ({
  customCssQueryKey: (communityId: number) =>
    ['pm', 'branding', 'custom-css', communityId] as const,
  useCustomCssOverrides: (_communityId: number, initial: unknown) => ({
    data: storeRef.current === undefined ? initial : storeRef.current,
  }),
  useSaveCustomCss: () => ({ mutate: saveMutateMock, isPending: isPendingRef.current }),
}));

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));
// Every method the site-editor tree can reach, not only the ones this file
// asserts on: corpus trap #3 — a factory missing an export yields `undefined`
// at call time, which reads as an unrelated component breaking. `info` is the
// selection repair's channel (`EditorRoot.tsx`) and had zero coverage repo-wide.
vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

import { StylingPanel } from '@/components/pm/site-editor-v3/panels/StylingPanel';
import type { CustomCssOverrides } from '@propertypro/shared';

const THEME = {
  primaryColor: '#C2533A',
  secondaryColor: '#6B7280',
  accentColor: '#F7DCD2',
  bodyFont: 'Lora',
};

function renderPanel({
  hasSiteCustomCss = true,
  initial = null as CustomCssOverrides | null,
} = {}) {
  return render(
    <StylingPanel
      communityId={42}
      hasSiteCustomCss={hasSiteCustomCss}
      initial={initial}
      theme={THEME}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isPendingRef.current = false;
  storeRef.current = undefined;
});

describe('plan gate', () => {
  it('shows the upsell and disables save when the plan lacks custom CSS', () => {
    renderPanel({ hasSiteCustomCss: false });
    expect(screen.getByTestId('styling-upsell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save colours/i })).toBeDisabled();
  });

  it('disables every override switch when gated', () => {
    renderPanel({ hasSiteCustomCss: false });
    for (const sw of screen.getAllByRole('switch')) {
      expect(sw).toBeDisabled();
    }
  });

  it('shows no upsell and an enabled save when the plan includes it', () => {
    renderPanel();
    expect(screen.queryByTestId('styling-upsell')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save colours/i })).toBeEnabled();
  });
});

describe('seeding from the resolved theme', () => {
  it('starts a fresh override at the colour the site renders today', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('switch', { name: /use my own main colour/i }));
    expect(screen.getByLabelText(/use my own main colour value/i)).toHaveValue(
      THEME.primaryColor,
    );
  });

  it('prefers a stored override over the live colour', () => {
    renderPanel({ initial: { primaryColor: '#123456' } });
    expect(screen.getByLabelText(/use my own main colour value/i)).toHaveValue('#123456');
  });

  it('turns on only the switches that have a stored override', () => {
    renderPanel({ initial: { accentColor: '#123456' } });
    expect(screen.getByRole('switch', { name: /accent colour/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /main colour/i })).not.toBeChecked();
  });
});

describe('saving', () => {
  it('sends only the overrides whose switch is on', async () => {
    const user = userEvent.setup();
    renderPanel({ initial: { primaryColor: '#123456' } });

    await user.click(screen.getByRole('button', { name: /save colours/i }));

    expect(saveMutateMock).toHaveBeenCalledTimes(1);
    expect(saveMutateMock.mock.calls[0]![0]).toEqual({
      communityId: 42,
      customCssOverrides: { primaryColor: '#123456' },
    });
  });

  it('sends null — not an empty object — when every switch is off', async () => {
    const user = userEvent.setup();
    renderPanel({ initial: { primaryColor: '#123456' } });

    await user.click(screen.getByRole('switch', { name: /main colour/i }));
    await user.click(screen.getByRole('button', { name: /save colours/i }));

    expect(saveMutateMock.mock.calls[0]![0]).toEqual({
      communityId: 42,
      customCssOverrides: null,
    });
  });

  it('toasts on success', async () => {
    const user = userEvent.setup();
    saveMutateMock.mockImplementation((_input, opts) => opts?.onSuccess?.());
    renderPanel({ initial: { primaryColor: '#123456' } });

    await user.click(screen.getByRole('button', { name: /save colours/i }));

    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringMatching(/colours saved/i));
  });

  it('surfaces a server error in an alert rather than a toast', async () => {
    const user = userEvent.setup();
    saveMutateMock.mockImplementation((_input, opts) =>
      opts?.onError?.(new Error('Custom styling requires the Professional plan.')),
    );
    renderPanel({ initial: { primaryColor: '#123456' } });

    await user.click(screen.getByRole('button', { name: /save colours/i }));

    expect(
      await screen.findByText(/custom styling requires the professional plan/i),
    ).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
});

describe('surviving a remount', () => {
  // Switching tool tabs unmounts this panel — `renderToolPanel` only renders
  // the active tool. Seeding state from the page-load prop instead of the
  // written-through cache made a saved colour look lost, and made the next
  // Save post `null` over it.
  it('seeds from the last save, not the page-load prop, after remounting', () => {
    const { unmount } = renderPanel({ initial: null });
    // The save landed: the hook writes what it persisted into the cache.
    storeRef.current = { primaryColor: '#1E7A5F' } satisfies CustomCssOverrides;
    unmount();

    renderPanel({ initial: null });

    expect(screen.getByRole('switch', { name: /main colour/i })).toBeChecked();
    expect(screen.getByLabelText(/use my own main colour value/i)).toHaveValue('#1E7A5F');
  });

  it('does not post null over an override that was just saved', async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel({ initial: null });
    storeRef.current = { primaryColor: '#1E7A5F' } satisfies CustomCssOverrides;
    unmount();

    renderPanel({ initial: null });
    await user.click(screen.getByRole('button', { name: /save colours/i }));

    expect(saveMutateMock.mock.calls[0]![0]).toEqual({
      communityId: 42,
      customCssOverrides: { primaryColor: '#1E7A5F' },
    });
  });
});

describe('hex validation', () => {
  it('blocks save and explains, rather than letting the route 400', async () => {
    const user = userEvent.setup();
    renderPanel({ initial: { primaryColor: '#123456' } });

    const field = screen.getByLabelText(/use my own main colour value/i);
    await user.clear(field);
    await user.type(field, '#nope');

    expect(screen.getByText(/six-digit hex colour/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save colours/i })).toBeDisabled();
    expect(saveMutateMock).not.toHaveBeenCalled();
  });
});
