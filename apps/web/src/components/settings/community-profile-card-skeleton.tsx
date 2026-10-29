import { SettingsCard } from '@/components/settings/settings-layout';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * What stands in for the Community profile card while it loads: first its code
 * (the lazy loader shows this), then its data (the card shows this).
 *
 * One component for both, so the swap between the two moves nothing on the page
 * and a screen reader gets the same "loading" announcement from each. It lives
 * in its own file, rather than in the card, because the loader must not import
 * the card: that would put the card's code back into the page's own chunk, which
 * is the whole point of loading it lazily.
 */
export function CommunityProfileCardSkeleton() {
  return (
    <SettingsCard>
      <div role="status" className="px-5 py-4">
        <span className="sr-only">Loading community profile…</span>
        <Skeleton className="h-96 w-full" />
      </div>
    </SettingsCard>
  );
}
