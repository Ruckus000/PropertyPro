import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-level loading skeleton for the community Help Center. Mirrors the
 * page's header → start-here hero → hub (search + task cards) rhythm so the
 * hand-off from skeleton to real content doesn't jump.
 */
export default function HelpLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading help center">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Start-here hero */}
      <Skeleton className="h-40 w-full rounded-2xl" />

      {/* Search */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* Task cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
