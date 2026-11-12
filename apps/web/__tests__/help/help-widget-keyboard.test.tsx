/**
 * Keyboard behaviour of the legacy help panel (shown while
 * NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED is off). Uses the REAL provider, so the
 * open/close state flows exactly as it does under the app shell's "Open help"
 * button.
 *
 * - Escape closes the open panel.
 * - The closed panel is `inert`, so Tab cannot reach its close button, search
 *   box or links (aria-hidden + opacity-0 + pointer-events-none did not stop it).
 * - Opening moves focus to the search box; closing hands it back to the opener.
 *
 * jsdom does not implement inert's focus semantics, so the inert test asserts
 * the attribute itself; the browser does the rest. The open/close tests read
 * `aria-hidden` instead, so removing `inert` reddens only the inert test.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/announcements' }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));
vi.mock('@/hooks/use-help', () => ({
  useHelpSearch: () => ({ data: undefined, error: null }),
  useContextualHelp: () => ({
    data: [
      { category: 'getting-started', slug: 'tour', title: 'Get around', description: 'A tour.' },
    ],
    isFetching: false,
    isError: false,
  }),
}));

import { HelpWidget } from '@/components/help/help-widget';
import { HelpWidgetProvider, useHelpWidget } from '@/components/help/help-widget-provider';

beforeEach(() => {
  // The provider's `?` shortcut effect reads matchMedia, which jsdom lacks.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

function OpenHelpButton() {
  const { toggle } = useHelpWidget();
  return (
    <button type="button" onClick={toggle}>
      Open help
    </button>
  );
}

function renderShell() {
  const utils = render(
    <HelpWidgetProvider>
      <OpenHelpButton />
      <button type="button">Elsewhere</button>
      <HelpWidget communityId={3} />
    </HelpWidgetProvider>,
  );
  const panel = utils.container.querySelector('aside[aria-label="Help panel"]') as HTMLElement;
  return { ...utils, panel, user: userEvent.setup() };
}

describe('HelpWidget — keyboard', () => {
  it('is inert while closed, and not inert while open', async () => {
    const { panel, user } = renderShell();
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('inert');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Open help' }));
    expect(panel).not.toHaveAttribute('inert');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('keeps the slide/fade transition classes in both states', async () => {
    const { panel, user } = renderShell();
    expect(panel.className).toMatch(/\btransition-\[transform,opacity\]/);
    expect(panel.className).toMatch(/\bopacity-0\b/);

    await user.click(screen.getByRole('button', { name: 'Open help' }));
    expect(panel.className).toMatch(/\btransition-\[transform,opacity\]/);
    expect(panel.className).toMatch(/\bopacity-100\b/);
  });

  it('moves focus to the search box when it opens', async () => {
    const { user } = renderShell();
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    expect(screen.getByPlaceholderText('Search help...')).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button that opened it', async () => {
    const { panel, user } = renderShell();
    const opener = screen.getByRole('button', { name: 'Open help' });
    await user.click(opener);
    expect(panel).toHaveAttribute('aria-hidden', 'false');

    await user.keyboard('{Escape}');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener when closed with its own close button', async () => {
    const { panel, user } = renderShell();
    const opener = screen.getByRole('button', { name: 'Open help' });
    await user.click(opener);

    await user.click(screen.getByRole('button', { name: 'Close help panel' }));
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(opener).toHaveFocus();
  });

  it('does not pull focus back if the user has already moved it elsewhere', async () => {
    const { panel, user } = renderShell();
    await user.click(screen.getByRole('button', { name: 'Open help' }));
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    await user.click(elsewhere);

    await user.keyboard('{Escape}');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(elsewhere).toHaveFocus();
  });

  it('leaves Escape alone while closed, and when another handler already claimed it', async () => {
    const { panel, user } = renderShell();
    await user.keyboard('{Escape}');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    await user.click(screen.getByRole('button', { name: 'Open help' }));
    // A nested widget (a Radix menu, say) that handles Escape first.
    const claim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', claim, { capture: true });
    try {
      await user.keyboard('{Escape}');
    } finally {
      window.removeEventListener('keydown', claim, { capture: true });
    }
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });
});
