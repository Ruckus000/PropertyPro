/**
 * The legacy help panel (shown while NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED is
 * off) used to be a full-height drawer: two contextual articles above a screen
 * of empty space. jsdom lays nothing out, so this pins the CLASSES that size
 * it — a viewport cap with no fixed height, and a viewport-relative width.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/announcements' }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }));
vi.mock('@/components/help/help-widget-provider', () => ({
  useHelpWidget: () => ({ isOpen: true, close: vi.fn() }),
}));
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

describe('HelpWidget — sizing', () => {
  it('is as tall as its content up to the viewport, and follows the viewport width', () => {
    const { container } = render(<HelpWidget communityId={3} />);
    const panel = container.querySelector('aside[aria-label="Help panel"]') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.className).toMatch(/\bmax-h-\[calc\(100dvh-2rem\)\]/);
    expect(panel.className).not.toMatch(/\bh-full\b/);
    expect(panel.className).toMatch(/\bw-\[min\(100vw-2rem,/);
  });

  it('scrolls only its results, so the search box and footer stay put', () => {
    const { container } = render(<HelpWidget communityId={3} />);
    const panel = container.querySelector('aside[aria-label="Help panel"]') as HTMLElement;
    const scroller = panel.querySelector('.overflow-y-auto') as HTMLElement;
    expect(scroller.className).toMatch(/\bmin-h-0\b/);
    expect(scroller.className).toMatch(/\bflex-1\b/);
    // The results sit inside the scroller; the footer link does not.
    expect(scroller.textContent).toContain('Get around');
    expect(scroller.textContent).not.toContain('Visit Help Center');
  });
});
