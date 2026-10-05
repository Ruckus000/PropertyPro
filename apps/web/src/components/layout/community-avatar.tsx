/**
 * A community's square logo at list size, or its initial when it has none.
 * Used beside each community in the sidebar switcher and the community picker.
 * Decorative: the community's name is always next to it, so `alt` is empty.
 *
 * Kept deliberately tiny: the switcher ships with every authenticated page,
 * and the web app's total-JS ceiling (scripts/perf-check.ts) had 0.6 KiB of
 * headroom when this was added.
 */
import { cn } from '@/lib/utils';

export function CommunityAvatar({ name, logoUrl, className }: { name: string; logoUrl?: string | null; className?: string }) {
  const cls = cn('size-6 shrink-0 rounded-sm border border-edge bg-surface-muted', className);
  return logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="" className={cn(cls, 'object-cover')} />
  ) : (
    <span aria-hidden="true" className={cn(cls, 'grid place-items-center text-xs font-semibold text-content-secondary')}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
