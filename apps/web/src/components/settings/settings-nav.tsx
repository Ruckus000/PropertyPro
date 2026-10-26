'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SettingsNavItem {
  /** The `id` of the `SettingsSection` this item jumps to. */
  id: string;
  label: string;
}

export interface SettingsNavGroup {
  label?: string;
  items: SettingsNavItem[];
}

/**
 * The Settings section menu: a sticky column on wide screens (xl, where the
 * cards still get ~690px beside it), and a row you can scroll sideways below that. Items are in-page anchors, so the URL and every
 * existing `/settings?…` link keep working; the highlighted item follows
 * whichever section is nearest the top of the scroll area. The page puts this
 * in a sticky column (the stickiness lives on that wrapper, not here, because
 * a sticky element needs a taller parent to travel within).
 */
export function SettingsNav({ groups }: { groups: SettingsNavGroup[] }) {
  const ids = React.useMemo(() => groups.flatMap((g) => g.items.map((i) => i.id)), [groups]);
  const [activeId, setActiveId] = React.useState<string | null>(ids[0] ?? null);

  // Set by a menu click; scroll updates are ignored until the jump it starts
  // has finished, so a section the page cannot scroll to the top (one near
  // the bottom) stays highlighted after you pick it.
  const pinnedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const first = ids[0] ? document.getElementById(ids[0]) : null;
    // The app shell scrolls <main>, not the window.
    const scroller: HTMLElement | null = first?.closest('main') ?? null;
    const target: HTMLElement | Window = scroller ?? window;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (pinnedRef.current) return;
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const height = scroller ? scroller.clientHeight : window.innerHeight;
      const atBottom = scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      // Current = the last section whose top has passed a line a little below
      // the top of the scroll area. At the very bottom, the last section that
      // is on screen at all, since it may never reach that line.
      const line = atBottom ? top + height : top + 120;
      let next = ids[0] ?? null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) next = id;
      }
      setActiveId(next);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onScrollEnd = () => {
      pinnedRef.current = null;
    };

    update();
    target.addEventListener('scroll', onScroll, { passive: true });
    target.addEventListener('scrollend', onScrollEnd);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      target.removeEventListener('scroll', onScroll);
      target.removeEventListener('scrollend', onScrollEnd);
    };
  }, [ids]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    setActiveId(id);
    pinnedRef.current = id;
    // Fallback for a click that scrolls nothing (no `scrollend` fires) and for
    // browsers without `scrollend`.
    window.setTimeout(() => {
      if (pinnedRef.current === id) pinnedRef.current = null;
    }, 1000);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    // Keep the hash for sharing without the browser's own jump.
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${id}`);
    // Move focus to the section heading so keyboard and screen-reader users land there too.
    const heading = target.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
  }

  return (
    <nav aria-label="Settings sections" className="min-w-0">
      <div className="flex gap-1 overflow-x-auto pb-1 xl:flex-col xl:gap-6 xl:overflow-visible xl:pb-0">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className="flex shrink-0 gap-1 xl:flex-col">
            {group.label ? (
              <p className="hidden px-3 pb-1 text-xs font-medium uppercase tracking-wide text-content-tertiary xl:block">
                {group.label}
              </p>
            ) : null}
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={(e) => handleClick(e, item.id)}
                  aria-current={active ? 'location' : undefined}
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-md px-3 py-3 text-sm xl:py-2 transition-colors duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    active
                      ? 'bg-surface-muted font-medium text-content'
                      : 'text-content-secondary hover:bg-surface-hover hover:text-content',
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
