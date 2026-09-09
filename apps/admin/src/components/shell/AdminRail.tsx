'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronsLeft, Pin } from 'lucide-react';
import { NavRail, type NavRailSection } from '@propertypro/ui';
import { NAV_GROUPS, type NavSignalKey } from './nav-config';
import { RailFooter } from './RailFooter';
import { cn } from '@/lib/utils';

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
  //
  // This is read in an EFFECT, not in the render body, and seeded with the
  // value the server necessarily produces (`true` — a server has no device to
  // ask). Reading `window.matchMedia` during render was safe only while nothing
  // rendered this component: `canHover` now drives `forceOpen` and
  // `reservesLayout`, hence the rail's rendered width classes, so a render-body
  // read would emit a 72px rail on the server and rehydrate a 260px one on a
  // touch-only device — a genuine hydration mismatch, on exactly the device
  // class `forceOpen` exists to help.
  //
  // `matchMedia` is also absent in this repo's jsdom test environment, so the
  // feature-test below keeps a device (or environment) that cannot report hover
  // capability on the "can hover" path rather than crashing.
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(hover: none)');
    const sync = () => setCanHover(!query.matches);
    sync();
    // Hover capability is not immutable: a tablet gains it when a trackpad
    // keyboard is attached and loses it again when detached.
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // A device that cannot hover (`canHover === false`, e.g. a touchscreen with
  // no mouse/trackpad) can never set `hovered`, so `expanded` could otherwise
  // only become true via `pinned` — which can only be toggled through a
  // button that lives INSIDE the collapsed rail and is itself invisible until
  // the rail is already expanded. That closed loop leaves a touch user with
  // no discoverable way to ever open the rail. Treat "cannot hover" as
  // permanently open instead: it's the direct touch equivalent of what a
  // mouse user gets for free by hovering, and it's also the only layout that
  // fits — the collapsed 72px header has room for exactly one 28px icon
  // (the logo), not two side-by-side, so making just the pin button visible
  // at collapsed width would visually overlap it rather than open a real path
  // forward.
  const forceOpen = !canHover;
  const expanded = pinned || hovered || forceOpen;
  // Whether the rail should reserve real layout space (vs. floating over
  // content as a transient hover overlay). `forceOpen` behaves like `pinned`
  // here on purpose — an always-expanded touch rail must not permanently
  // overlay page content that the user can never move a mouse away from.
  const reservesLayout = pinned || forceOpen;

  return (
    // The wrapper reserves the collapsed width; the overlay grows over content on hover (spec D8).
    <div
      className={reservesLayout ? 'relative h-full w-[260px] shrink-0' : 'relative h-full w-[72px] shrink-0'}
      onMouseEnter={() => canHover && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn('absolute inset-y-0 left-0 z-40', expanded && !reservesLayout && 'shadow-e3')}>
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
                className={cn('text-sm font-semibold transition-opacity', expanded ? 'opacity-100' : 'opacity-0')}
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
                className={cn(
                  // `focus-visible:opacity-100` covers a sighted keyboard-only user:
                  // without it, the button stays in the tab order but is fully
                  // transparent when tabbed to (icon, label, and the focus ring
                  // itself all sit under `opacity-0`), so focus lands nowhere
                  // visible. Touch discoverability doesn't route through opacity
                  // at all here — see `forceOpen` above.
                  'ml-auto flex size-7 items-center justify-center rounded-sm text-content-tertiary transition-opacity hover:text-content focus-visible:opacity-100',
                  expanded ? 'opacity-100' : 'opacity-0',
                  pinned && 'bg-surface-muted',
                )}
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
