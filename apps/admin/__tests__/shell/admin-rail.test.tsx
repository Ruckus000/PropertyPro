// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: any) => <a href={href} {...p}>{children}</a> }));
vi.mock('next/navigation', () => ({ usePathname: () => '/inbox' }));
import { AdminRail } from '@/components/shell/AdminRail';

const counts = { inbox: 7, tickets: 0, health: 4, onboarding: 0, billing: 3, leads: 0, deletion: 2 };
const user = { email: 'ops@getpropertypro.com', initial: 'O' };

describe('AdminRail', () => {
  it('marks the active item and exposes counts as accessible badges', () => {
    render(<AdminRail activeId="inbox" counts={counts} pinned onPinnedChange={() => {}} user={user} />);
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    expect(inbox.getAttribute('aria-current')).toBe('page');
    expect(inbox.textContent).toContain('7');
  });
  it('expands on hover when not pinned and collapses on leave', () => {
    const { container } = render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />);
    const nav = container.querySelector('nav[aria-label="Main navigation"]')!;
    expect(nav.className).toContain('w-[72px]');
    fireEvent.mouseEnter(container.firstChild as Element);
    expect(nav.className).toContain('w-[260px]');
    fireEvent.mouseLeave(container.firstChild as Element);
    expect(nav.className).toContain('w-[72px]');
  });
  it('pin button toggles and is announced', () => {
    const onPinnedChange = vi.fn();
    render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={onPinnedChange} user={user} />);
    const pin = screen.getByRole('button', { name: /keep navigation open/i });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(onPinnedChange).toHaveBeenCalledWith(true);
  });

  // Finding 2 (review, task 8): the pin toggle is `opacity-0` whenever the
  // rail isn't expanded, with nothing to reveal it for a keyboard-only user
  // who tabs to it. `getComputedStyle` can't see Tailwind's compiled
  // `:focus-visible` rule in this jsdom run (no real stylesheet is loaded),
  // so this asserts the class the fix depends on is actually present —
  // `node scripts/verify-admin-semantic-css.cjs` is what proves that class
  // resolves to real CSS in this repo's Tailwind config.
  it('carries a focus-visible reveal on the pin toggle for keyboard users', () => {
    render(<AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />);
    const pin = screen.getByRole('button', { name: /keep navigation open/i });
    expect(pin.className).toContain('focus-visible:opacity-100');
  });

  // Finding 2 (review, task 8): on a device that cannot hover (`matchMedia
  // '(hover: none)'` matches — touch with no mouse/trackpad), `hovered` can
  // never become true, so without this fix `expanded` could only flip via
  // `pinned` — itself only reachable through a button that's invisible until
  // the rail is already expanded. That's a closed loop with no discoverable
  // way in. Asserts the rail opens on its own for such a device instead, so
  // every nav label and the pin toggle are reachable without any hover.
  it('opens on its own for a device that cannot hover, so the pin toggle is reachable without hovering', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, // '(hover: none)' matches: no hover channel
      media: '(hover: none)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    });

    try {
      const { container } = render(
        <AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />,
      );
      const nav = container.querySelector('nav[aria-label="Main navigation"]')!;
      // Open immediately — no mouseEnter, no prior pin — breaking the closed loop.
      expect(nav.className).toContain('w-[260px]');
      const pin = screen.getByRole('button', { name: /keep navigation open/i });
      expect(pin.className).toContain('opacity-100');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  // Task 11 is what first RENDERS this component, which turns the hover probe
  // into a hydration hazard: `canHover` drives `forceOpen`/`reservesLayout` and
  // therefore the rail's width classes, and a server has no device to ask. The
  // only value that can be both server-renderable and stable through hydration
  // is the seeded one, so the first paint must be the COLLAPSED rail even on a
  // device whose `matchMedia` says it cannot hover; the effect widens it after
  // mount (the test above). Reverting the `useState`/`useEffect` pair in
  // AdminRail.tsx to a render-body `window.matchMedia(...)` read makes this go
  // red with `w-[260px]` in the server markup while the rest of the file stays
  // green.
  it('renders the collapsed rail on the server even for a device that cannot hover', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, // '(hover: none)' matches
      media: '(hover: none)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    });

    try {
      const markup = renderToStaticMarkup(
        <AdminRail activeId="inbox" counts={counts} pinned={false} onPinnedChange={() => {}} user={user} />,
      );
      expect(markup).toContain('w-[72px]');
      expect(markup).not.toContain('w-[260px]');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
