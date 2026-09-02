import { Skeleton, Separator } from '@propertypro/design-system';

export const DocumentListLoading = () => (
  <div className="w-full max-w-[640px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">Association documents</p>
      <p className="mt-1 text-xs text-content-secondary">Loading records for Sunset Condos…</p>
    </div>
    <ul className="divide-y divide-edge-subtle">
      {[0, 1, 2, 3].map((row) => (
        <li key={row} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </li>
      ))}
    </ul>
  </div>
);

export const KpiRowLoading = () => (
  <div className="w-full max-w-[640px] space-y-4">
    <div>
      <Skeleton className="h-6 w-48" />
      <Skeleton className="mt-2 h-3 w-64" />
    </div>
    <div className="grid grid-cols-3 gap-4">
      {['Open work orders', 'Documents due', 'Delinquent units'].map((label) => (
        <div key={label} className="rounded-md border border-edge bg-surface-card p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-20" />
        </div>
      ))}
    </div>
  </div>
);

export const ViolationDetailLoading = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-5 w-56" />
      <Skeleton className="h-5 w-24 rounded-full" />
    </div>
    <Skeleton className="mt-3 h-3 w-72" />
    <Separator className="my-4" />
    <div className="space-y-3">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
    <Separator className="my-4" />
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  </div>
);
