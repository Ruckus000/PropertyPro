import { Skeleton } from '@/components/ui/skeleton';

interface MobileRouteLoadingProps {
  label?: string;
}

export function MobileRouteLoading({
  label = 'Loading mobile page',
}: MobileRouteLoadingProps) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      role="status"
      className="space-y-5 px-4 py-6"
    >
      <div className="rounded-[28px] bg-surface-card p-5 shadow-sm ring-1 ring-black/5">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
      </div>

      <div className="rounded-[28px] bg-surface-card p-5 shadow-sm ring-1 ring-black/5">
        <div className="space-y-4">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
