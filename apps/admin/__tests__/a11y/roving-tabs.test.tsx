// @vitest-environment jsdom
/**
 * Admin's two tab strips — the 7-tab client workspace (the console's primary
 * navigation) and the demo edit drawer — were plain `<button>` lists: no
 * `role`, no `aria-selected`, no arrow keys, and every tab in the tab order.
 *
 * These exercise the hook directly rather than through either component, so
 * the contract is pinned once for both consumers.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRovingTabs } from '@/components/a11y/use-roving-tabs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TABS = ['overview', 'members', 'settings'] as const;
type Tab = (typeof TABS)[number];

const onChangeSpy = vi.fn();

function Harness() {
  const [active, setActive] = useState<Tab>('overview');
  const { tabListProps, getTabProps, getPanelProps } = useRovingTabs(
    TABS,
    active,
    (tab) => {
      onChangeSpy(tab);
      setActive(tab);
    },
    { idPrefix: 'test', label: 'Sections' },
  );

  return (
    <div>
      <div {...tabListProps}>
        {TABS.map((tab) => (
          <button key={tab} {...getTabProps(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div {...getPanelProps(active)}>{active} panel</div>
    </div>
  );
}

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
  });
  return {
    container,
    tabs: () => Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[],
    panel: () => container.querySelector('[role="tabpanel"]') as HTMLElement,
    async press(key: string) {
      const list = container.querySelector('[role="tablist"]')!;
      await act(async () => {
        list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    },
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe('useRovingTabs', () => {
  it('applies tab semantics and ties each tab to its panel', async () => {
    const h = await mount();

    expect(h.container.querySelector('[role="tablist"]')?.getAttribute('aria-label')).toBe(
      'Sections',
    );
    const [first, second] = h.tabs();
    expect(first!.getAttribute('aria-selected')).toBe('true');
    expect(second!.getAttribute('aria-selected')).toBe('false');
    expect(h.panel().getAttribute('aria-labelledby')).toBe(first!.id);

    await h.cleanup();
  });

  // Asserting only the ACTIVE tab's aria-controls hid a real bug: the panel id
  // was per-tab while both consumers render ONE panel container, so every
  // inactive tab referenced an id that is not in the document.
  it('points every tab at a panel that actually exists', async () => {
    const h = await mount();

    for (const tab of h.tabs()) {
      const target = tab.getAttribute('aria-controls');
      expect(target, `${tab.textContent} aria-controls`).toBeTruthy();
      expect(
        h.container.querySelector(`#${target}`),
        `${tab.textContent} -> #${target} must resolve`,
      ).toBeTruthy();
    }

    await h.cleanup();
  });

  // The panel id must not move when the selection does, or the inactive tabs'
  // references break again the moment a tab is clicked.
  it('keeps the panel id stable across tab changes', async () => {
    const h = await mount();
    const before = h.panel().id;

    await h.press('ArrowRight');

    expect(h.panel().id).toBe(before);
    expect(h.panel().getAttribute('aria-labelledby')).toBe(h.tabs()[1]!.id);

    await h.cleanup();
  });

  // Roving tabindex: Tab should move PAST the strip into the panel, not
  // through all seven tabs.
  it('keeps exactly one tab in the tab order', async () => {
    const h = await mount();

    expect(h.tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1]);

    await h.cleanup();
  });

  it('moves and wraps with the arrow keys', async () => {
    const h = await mount();

    await h.press('ArrowRight');
    expect(onChangeSpy).toHaveBeenLastCalledWith('members');

    await h.press('ArrowRight');
    await h.press('ArrowRight');
    // Wrapped past the end back to the first.
    expect(onChangeSpy).toHaveBeenLastCalledWith('overview');

    await h.press('ArrowLeft');
    // Wrapped backwards off the start to the last.
    expect(onChangeSpy).toHaveBeenLastCalledWith('settings');

    await h.cleanup();
  });

  it('jumps to the ends with Home and End', async () => {
    const h = await mount();

    await h.press('End');
    expect(onChangeSpy).toHaveBeenLastCalledWith('settings');

    await h.press('Home');
    expect(onChangeSpy).toHaveBeenLastCalledWith('overview');

    await h.cleanup();
  });

  it('moves focus with the selection, not just the highlight', async () => {
    const h = await mount();

    await h.press('ArrowRight');

    expect(document.activeElement).toBe(h.tabs()[1]);
    expect(h.tabs().map((t) => t.tabIndex)).toEqual([-1, 0, -1]);

    await h.cleanup();
  });

  it('ignores keys it does not own, so typing still reaches the page', async () => {
    const h = await mount();
    onChangeSpy.mockClear();

    await h.press('a');
    await h.press('Tab');
    await h.press('ArrowDown');

    expect(onChangeSpy).not.toHaveBeenCalled();

    await h.cleanup();
  });
});
