/**
 * A community's square logo at list size, or its initial when it has none.
 * Used beside each community in the sidebar switcher and the community picker.
 * Decorative: the community's name is always next to it, so `alt` is empty.
 */
import { cn } from '@/lib/utils';

export function CommunityAvatar({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  className?: string;
}) {
  const base = 'size-6 shrink-0 rounded-[var(--radius-sm)] border border-[var(--border-default)]';
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" data-testid="community-avatar-logo" className={cn(base, 'bg-[var(--surface-card)] object-cover', className)} />
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="community-avatar-initial"
      className={cn(
        base,
        'flex items-center justify-center bg-[var(--surface-muted)] text-xs font-semibold text-[var(--text-secondary)]',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
