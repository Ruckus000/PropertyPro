/**
 * The Sheet and Dialog close buttons must meet the touch-target rule in
 * `.claude/rules/design.md` ("Component Dimensions"): 44px below `md`, 36px at
 * `md` and up.
 *
 * Both used to be `absolute right-4 top-4` with no padding around a 16px icon,
 * so the hit area WAS the icon: measured live on 2026-10-14, the Operations
 * "Submit Request" sheet's close button was 16px wide and a click 8px below its
 * centre missed it. Every Sheet and Dialog in web and admin renders these two
 * primitives, so every close button had the same 16px target.
 *
 * The fix grows the box without moving the X: the button is anchored at the
 * icon's old centre (`right-6 top-6` = 24px = the old 16px offset + half the
 * 16px icon) and shifted back by half its own size, so the centre is the same
 * whichever size applies.
 *
 * JSDOM runs neither layout nor Tailwind, so this file pins the CLASS CONTRACT
 * plus the config values those classes resolve to. Rendered size was measured
 * in Chrome via `getBoundingClientRect()`: 44×44 at a 375px viewport and 36×36
 * at desktop width, with the icon's rect unchanged from before the fix.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import tailwindConfig from '../../../tailwind.config';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';

afterEach(cleanup);

const spacing = (tailwindConfig.theme?.extend?.spacing ?? {}) as Record<string, string>;

function classTokens(el: HTMLElement): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function expectTouchTarget(el: HTMLElement, label: string) {
  const tokens = classTokens(el);
  for (const cls of ['h-11', 'w-11', 'md:h-9', 'md:w-9']) {
    expect(tokens, `${label} should carry ${cls}`).toContain(cls);
  }
  // Centre-anchored, so the visible X does not move between sizes.
  for (const cls of ['right-6', 'top-6', 'translate-x-1/2', '-translate-y-1/2']) {
    expect(tokens, `${label} should carry ${cls}`).toContain(cls);
  }
}

describe('Sheet/Dialog close buttons meet the touch-target rule', () => {
  it('the size classes resolve to 44px and 36px in the web Tailwind config', () => {
    expect(spacing['11']).toBe('44px');
    expect(spacing['9']).toBe('36px');
    // The anchor: the icon's centre sat at right-4 (16px) + half of h-4 (8px).
    expect(spacing['6']).toBe('24px');
  });

  it('DialogContent close button has a 44px / 36px hit area', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <DialogDescription>D</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expectTouchTarget(screen.getByRole('button', { name: 'Close' }), 'Dialog close');
  });

  it('SheetContent close button has a 44px / 36px hit area', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>T</SheetTitle>
          <SheetDescription>D</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expectTouchTarget(screen.getByRole('button', { name: 'Close' }), 'Sheet close');
  });
});
