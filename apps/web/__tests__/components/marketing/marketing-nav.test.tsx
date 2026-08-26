import { describe, expect, it, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// jsdom does not implement matchMedia, and there is no shared setup mock
// (checked apps/web/__tests__/setup.ts). The nav's auto-close-on-resize effect
// calls window.matchMedia, so provide a minimal mock before rendering.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList;
  }
});

import { MarketingNav } from '../../../src/components/marketing/marketing-nav';

function getToggle() {
  return screen.getByRole('button', { name: /menu/i });
}

describe('MarketingNav mobile menu', () => {
  it('renders a closed hamburger toggle with no visible mobile menu initially', () => {
    render(<MarketingNav />);
    const toggle = getToggle();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe('mk-mobile-menu');
    // Panel is not present/visible when closed.
    expect(screen.queryByRole('navigation', { name: /mobile/i })).toBeNull();
    expect(document.getElementById('mk-mobile-menu')).toBeNull();
  });

  it('opens the menu on toggle click and reveals the links', () => {
    render(<MarketingNav />);
    const toggle = getToggle();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const panel = document.getElementById('mk-mobile-menu');
    expect(panel).not.toBeNull();
    const scope = within(panel as HTMLElement);
    expect(scope.getByRole('link', { name: /pricing/i })).toBeTruthy();
    expect(scope.getByRole('link', { name: /log in/i })).toBeTruthy();
    expect(scope.getByRole('link', { name: /start a trial/i })).toBeTruthy();
  });

  it('closes the menu when Escape is pressed and returns focus to the toggle', () => {
    render(<MarketingNav />);
    const toggle = getToggle();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('mk-mobile-menu')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes the menu when a link in the panel is clicked', () => {
    render(<MarketingNav />);
    const toggle = getToggle();
    fireEvent.click(toggle);

    const panel = document.getElementById('mk-mobile-menu') as HTMLElement;
    fireEvent.click(within(panel).getByRole('link', { name: /pricing/i }));

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('mk-mobile-menu')).toBeNull();
  });

  it('keeps a stable accessible name and conveys state through aria-expanded', () => {
    // The toggle carries a visible "Menu" label, so it no longer swaps an
    // aria-label between "Open menu"/"Close menu". A disclosure button's name
    // should describe WHAT it controls, not its state — state is aria-expanded,
    // which every assistive tech announces. Renaming the control on each click
    // also breaks voice-control users, who address it by its visible text.
    render(<MarketingNav />);
    const toggle = getToggle();
    const name = toggle.textContent?.replace(/[^A-Za-z ]/g, '').trim();
    expect(name).toMatch(/menu/i);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.textContent?.replace(/[^A-Za-z ]/g, '').trim()).toBe(name);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
