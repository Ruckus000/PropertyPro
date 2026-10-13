interface AdminPageLoadingProps {
  label?: string;
}

function AdminSkeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

/**
 * Body-only loading skeleton. It used to wrap itself in `AdminLayout`, because
 * each page wired its own shell and a `loading.tsx` had to render one too. The
 * shell now lives in `app/(console)/layout.tsx`, which a Suspense boundary does
 * NOT replace — so the rail, top bar and banners stay put while this renders,
 * and the old `coolingCount` dance (omit the prop so the sidebar badge doesn't
 * blink off mid-navigation) has no subject left.
 */
export function AdminPageLoading({ label = 'Loading admin page' }: AdminPageLoadingProps) {
  return (
    <section aria-busy="true" aria-label={label} role="status" className="space-y-6">
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

      <div className="rounded-2xl border border-edge bg-surface-card p-6 shadow-sm">
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
  );
}

/**
 * Detail-pane skeleton for the master-detail screens (inbox, tickets). Their
 * list lives in a `(split)/layout.tsx` that stays mounted across row clicks, so
 * the `loading.tsx` beside it renders inside the detail column only — a
 * full-page skeleton there would draw a page header and KPI cards in a pane.
 */
export function AdminDetailLoading({ label = 'Loading' }: AdminPageLoadingProps) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      role="status"
      className="space-y-4 rounded-lg border border-edge bg-surface-card p-4"
    >
      <AdminSkeleton className="h-4 w-28" />
      <AdminSkeleton className="h-7 w-full max-w-md" />
      <AdminSkeleton className="h-4 w-48" />
      <AdminSkeleton className="h-32 w-full rounded-xl" />
      <AdminSkeleton className="h-32 w-full rounded-xl" />
    </section>
  );
}
