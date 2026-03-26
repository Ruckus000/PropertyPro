import { AdminLayout } from '@/components/AdminLayout';

interface AdminPageLoadingProps {
  label?: string;
}

function AdminSkeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />;
}

export function AdminPageLoading({
  label = 'Loading admin page',
}: AdminPageLoadingProps) {
  return (
    <AdminLayout>
      <section aria-busy="true" aria-label={label} role="status" className="space-y-6 p-6">
        <div className="space-y-3">
          <AdminSkeleton className="h-4 w-24" />
          <AdminSkeleton className="h-9 w-full max-w-sm" />
          <AdminSkeleton className="h-4 w-full max-w-2xl" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <AdminSkeleton className="h-28 rounded-2xl" />
          <AdminSkeleton className="h-28 rounded-2xl" />
          <AdminSkeleton className="h-28 rounded-2xl" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <AdminSkeleton className="h-6 w-40" />
            <AdminSkeleton className="h-12 w-full rounded-xl" />
            <AdminSkeleton className="h-12 w-full rounded-xl" />
            <AdminSkeleton className="h-12 w-full rounded-xl" />
            <AdminSkeleton className="h-12 w-full rounded-xl" />
            <AdminSkeleton className="h-56 w-full rounded-2xl" />
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}
