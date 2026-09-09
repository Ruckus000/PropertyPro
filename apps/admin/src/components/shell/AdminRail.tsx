'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronsLeft, Pin } from 'lucide-react';
import { NavRail, type NavRailSection } from '@propertypro/ui';
import { NAV_GROUPS, type NavSignalKey } from './nav-config';
import { RailFooter } from './RailFooter';

export interface AdminRailProps {
  activeId: string | null;
  counts: Record<NavSignalKey, number>;
  pinned: boolean;
  onPinnedChange: (v: boolean) => void;
  user: { email: string; initial: string };
}

/**
 * Builds `NavRail` sections from the shared `NAV_GROUPS` config plus the
 * live signal counts. Shared with `AdminDrawer`, which renders the same nav
 * inside a `Sheet` for narrow viewports.
 */
export function toSections(counts: AdminRailProps['counts']): NavRailSection[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({
      id: i.id,
      label: i.label,
      href: i.href,
      icon: i.icon,
      badge: i.signal ? counts[i.signal] : null,
      badgeVariant: i.tone ?? 'neutral',
    })),
  }));
}

export function AdminRail({ activeId, counts, pinned, onPinnedChange, user }: AdminRailProps) {
  const [hovered, setHovered] = useState(false);

  // Hover-expand only makes sense on a device with a real hover channel.
  // `matchMedia` is absent in this repo's jsdom test environment (and would
  // be absent during any SSR pass), so the check is defensive on both counts
  // — a device that cannot report hover capability is treated as "can hover"
  // rather than crashing the render.
  const canHover =
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : !window.matchMedia('(hover: none)').matches;

  const expanded = pinned || hovered;

  return (
    // The wrapper reserves the collapsed width; the overlay grows over content on hover (spec D8).
    <div
      className={expanded && pinned ? 'relative h-full w-[260px] shrink-0' : 'relative h-full w-[72px] shrink-0'}
      onMouseEnter={() => canHover && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={['absolute inset-y-0 left-0 z-40', expanded && !pinned ? 'shadow-e3' : ''].join(' ')}>
        <NavRail
          sections={toSections(counts)}
          activeView={activeId ?? ''}
          onViewChange={() => {}}
          expanded={expanded}
          renderLink={({ href, children, ...rest }) => (
            <Link href={href} {...rest}>
              {children}
            </Link>
          )}
          header={
            <div className="flex h-[60px] items-center gap-3 border-b border-edge-subtle px-4 whitespace-nowrap">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-interactive font-display text-base font-semibold text-content-inverse"
              >
                P
              </span>
              <span
                className={['text-sm font-semibold transition-opacity', expanded ? 'opacity-100' : 'opacity-0'].join(
                  ' ',
                )}
              >
                PropertyPro
              </span>
              <button
                type="button"
                onClick={() => {
                  onPinnedChange(!pinned);
                  setHovered(false);
                }}
                aria-pressed={pinned}
                aria-label={pinned ? 'Collapse navigation' : 'Keep navigation open'}
                className={[
                  'ml-auto flex size-7 items-center justify-center rounded-sm text-content-tertiary transition-opacity hover:text-content',
                  expanded ? 'opacity-100' : 'opacity-0',
                  pinned ? 'bg-surface-muted' : '',
                ].join(' ')}
              >
                {pinned ? <ChevronsLeft size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
              </button>
            </div>
          }
          footer={<RailFooter user={user} expanded={expanded} />}
        />
      </div>
    </div>
  );
}
