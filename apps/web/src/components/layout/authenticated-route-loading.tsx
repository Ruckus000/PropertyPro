import { Skeleton } from '@/components/ui/skeleton';

interface AuthenticatedRouteLoadingProps {
  label?: string;
}

export function AuthenticatedRouteLoading({
  label = 'Loading page content',
}: AuthenticatedRouteLoadingProps) {
  return (
    <section aria-busy="true" aria-label={label} role="status" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-edge bg-surface-card p-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="pt-2">
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-edge bg-surface-card p-6">
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
