// @vitest-environment jsdom
/**
 * SettingsNav's highlight follows scroll position inside the shell's <main>.
 * jsdom has no layout, so the geometry is stubbed: <main> is 800px tall and
 * the three sections start at 0, 300 and 600.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsNav } from '@/components/settings/settings-nav';

const GROUPS = [
  {
    label: 'Personal',
    items: [
      { id: 'account', label: 'Account' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'display', label: 'Display' },
    ],
  },
];

function renderInShell({ scrollHeight }: { scrollHeight: number }) {
  const tops: Record<string, number> = { account: 0, notifications: 300, display: 600 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const top = tops[this.id] ?? 0;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
  });
  const result = render(
    <main>
      <SettingsNav groups={GROUPS} />
      {Object.keys(tops).map((id) => (
        <section key={id} id={id}>
          <h2>{id}</h2>
        </section>
      ))}
    </main>,
  );
  const main = result.container.querySelector('main')!;
  Object.defineProperty(main, 'clientHeight', { configurable: true, value: 800 });
  Object.defineProperty(main, 'scrollHeight', { configurable: true, value: scrollHeight });
  return { main };
}

const current = () =>
  screen.getByRole('navigation', { name: 'Settings sections' }).querySelector('[aria-current]')
    ?.textContent;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SettingsNav highlight', () => {
  it('highlights the first section on a page too short to scroll', async () => {
    const { main } = renderInShell({ scrollHeight: 800 });
    fireEvent.scroll(main);
    // 'Account' is also the initial state, so let the rAF-throttled update run
    // and commit before asserting, or this would pass without it.
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(current()).toBe('Account');
  });

  it('highlights the last section on screen once a long page is scrolled to the bottom', async () => {
    const { main } = renderInShell({ scrollHeight: 2000 });
    Object.defineProperty(main, 'scrollTop', { configurable: true, value: 1200 });
    fireEvent.scroll(main);
    await waitFor(() => expect(current()).toBe('Display'));
  });

  it('leaves a Cmd-click to the browser', () => {
    renderInShell({ scrollHeight: 2000 });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const link = screen.getByRole('link', { name: 'Display' });
    const notPrevented = fireEvent.click(link, { metaKey: true });
    expect(notPrevented).toBe(true);
    expect(fireEvent.click(link)).toBe(false);
  });
});
