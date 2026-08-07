'use client';

import { useCallback, useRef } from 'react';

/**
 * ARIA tab semantics plus roving-tabindex keyboard navigation.
 *
 * Admin's two tab strips — the 7-tab client workspace (the console's primary
 * navigation) and the demo edit drawer — were plain `<button>` lists: no
 * `role`, no `aria-selected`, no arrow keys, and every tab in the tab order.
 * A screen-reader user got seven unlabelled buttons with no indication that
 * they select panels or which one is showing; a keyboard user had to tab
 * through all of them to reach the content.
 *
 * There is no a11y library in this app (no Radix, no headless-ui), so this is
 * hand-rolled to the WAI-ARIA Authoring Practices tabs pattern:
 *
 * - Exactly one tab is in the tab order (`tabIndex=0`); the rest are `-1`, so
 *   Tab moves past the strip to the panel rather than through every tab.
 * - Left/Right move between tabs and wrap; Home/End jump to the ends. Moving
 *   focus also selects, which is the automatic-activation variant — correct
 *   here because switching panels is cheap and has no side effects.
 * - `aria-controls` / `aria-labelledby` tie each tab to its panel.
 */
export interface RovingTabsOptions {
  /** Prefix for the generated `id`s; must be unique per tab strip on a page. */
  idPrefix: string;
  /** Accessible name for the tab strip, e.g. "Community sections". */
  label: string;
}

export function useRovingTabs<T extends string>(
  tabs: readonly T[],
  active: T,
  onChange: (tab: T) => void,
  { idPrefix, label }: RovingTabsOptions,
) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement | null>());

  const tabId = (tab: T) => `${idPrefix}-tab-${tab}`;

  /**
   * ONE panel id, not one per tab.
   *
   * Both consumers render a single panel container whose content swaps, rather
   * than one element per tab. A per-tab `aria-controls` therefore pointed every
   * INACTIVE tab at an id that does not exist in the document — an ARIA
   * violation that axe and the VoiceOver rotor both flag, in the hook whose
   * whole purpose is to fix this component's accessibility.
   *
   * `aria-labelledby` on the panel stays dynamic: it is only ever emitted for
   * the active tab, so it always resolves.
   */
  const panelId = `${idPrefix}-panel`;

  const focusTab = useCallback((tab: T) => {
    tabRefs.current.get(tab)?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = tabs.indexOf(active);
      if (current === -1) return;

      let next: number | null = null;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;

      if (next === null) return;
      // Prevent the arrow keys from also scrolling the panel underneath.
      event.preventDefault();

      const target = tabs[next]!;
      onChange(target);
      focusTab(target);
    },
    [tabs, active, onChange, focusTab],
  );

  return {
    tabListProps: {
      role: 'tablist' as const,
      'aria-label': label,
      onKeyDown,
    },
    getTabProps: (tab: T) => ({
      id: tabId(tab),
      role: 'tab' as const,
      type: 'button' as const,
      'aria-selected': active === tab,
      'aria-controls': panelId,
      tabIndex: active === tab ? 0 : -1,
      ref: (el: HTMLButtonElement | null) => {
        tabRefs.current.set(tab, el);
      },
      onClick: () => onChange(tab),
    }),
    /**
     * For the single container that renders whichever panel is active. Pass the
     * ACTIVE tab — the container is labelled by the tab currently showing.
     *
     * `tabIndex={0}` so the panel itself is reachable from the tab strip even
     * when its first child is not focusable, per the ARIA practices note.
     */
    getPanelProps: (tab: T) => ({
      id: panelId,
      role: 'tabpanel' as const,
      'aria-labelledby': tabId(tab),
      tabIndex: 0,
    }),
  };
}
