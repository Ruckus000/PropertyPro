/**
 * Pieces shared by the top tab bar and its More panel: the count badge and the
 * wording of its accessible description (the rail's wording, verbatim).
 */
import { NAV_ITEMS } from './nav-config';
import type { TopNavLink } from './top-nav-model';

/** Same sentences the rail's `badgeDescription` uses. */
export function describeBadge(link: TopNavLink): string {
  const count = link.badge ?? 0;
  const signal = NAV_ITEMS.find((item) => item.id === link.id)?.badgeSignal;
  if (signal === 'pendingJoinRequests') {
    return `${count} pending join ${count === 1 ? 'request' : 'requests'}`;
  }
  if (signal === 'missingRecords') {
    return `${count} missing ${count === 1 ? 'record' : 'records'}`;
  }
  return `${count} ${count === 1 ? 'update' : 'updates'}`;
}

/** A count pill: the number is visual, the sentence is for assistive tech. */
export function NavCount({ link }: { link: TopNavLink }) {
  if (link.badge === null) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="rounded-full border border-edge bg-surface-muted px-1.5 text-xs font-medium text-content"
      >
        {link.badge}
      </span>
      <span className="sr-only">{describeBadge(link)}</span>
    </>
  );
}
