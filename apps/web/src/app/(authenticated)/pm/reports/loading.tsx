import { Skeleton } from '@/components/ui/skeleton';

export default function PmReportsLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading reports"
      role="status"
      className="space-y-8"
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>

      <div className="rounded-2xl border border-edge bg-surface-card p-6">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
