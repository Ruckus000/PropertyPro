import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export type AuthenticatedRouteLoadingVariant =
  | 'default'
  | 'documents'
  | 'meetings'
  | 'payments'
  | 'finance'
  | 'compliance'
  | 'operations'
  | 'announcements'
  | 'notifications';

interface AuthenticatedRouteLoadingProps {
  label?: string;
  variant?: AuthenticatedRouteLoadingVariant;
}

function LoadingHeader({
  eyebrowWidth = 'w-28',
  titleWidth = 'w-full max-w-md',
  descriptionWidth = 'w-full max-w-2xl',
  actionCount = 0,
}: {
  eyebrowWidth?: string;
  titleWidth?: string;
  descriptionWidth?: string;
  actionCount?: number;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-3">
        <Skeleton className={`h-4 ${eyebrowWidth}`} />
        <Skeleton className={`h-10 ${titleWidth}`} />
        <Skeleton className={`h-4 ${descriptionWidth}`} />
      </div>
      {actionCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: actionCount }).map((_, index) => (
            <Skeleton
              key={index}
              className={`h-10 rounded-md ${index === actionCount - 1 ? 'w-32' : 'w-24'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SurfaceCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`rounded-2xl border border-edge bg-surface-card p-6 ${className}`}>{children}</div>;
}

function TabRow({
  count = 4,
  pill = false,
}: {
  count?: number;
  pill?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-edge pb-3">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-9 ${pill ? 'rounded-full' : 'rounded-md'} ${index === 0 ? 'w-24' : index === 1 ? 'w-28' : 'w-32'}`}
        />
      ))}
    </div>
  );
}

function ListRows({
  count = 4,
  height = 'h-20',
}: {
  count?: number;
  height?: string;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={`${height} w-full rounded-xl`} />
      ))}
    </div>
  );
}

function DefaultLoadingState() {
  return (
    <>
      <LoadingHeader />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <SurfaceCard>
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="pt-2">
              <Skeleton className="h-52 w-full rounded-xl" />
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard>
          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </SurfaceCard>
      </div>
    </>
  );
}

function DocumentsLoadingState() {
  return (
    <>
      <LoadingHeader actionCount={3} />
      <SurfaceCard className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </SurfaceCard>
      <SurfaceCard className="overflow-hidden p-0">
        <div className="border-b border-edge px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
        <div className="grid min-h-[500px] gap-0 lg:grid-cols-2">
          <div className="space-y-4 border-r border-edge p-6">
            <Skeleton className="h-5 w-32" />
            <ListRows count={5} height="h-16" />
          </div>
          <div className="space-y-4 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </SurfaceCard>
    </>
  );
}

function MeetingsLoadingState() {
  return (
    <>
      <SurfaceCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-9 w-full max-w-xl" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </SurfaceCard>
      <SurfaceCard>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-8 w-44" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-10 rounded-md" />
              <Skeleton className="h-9 w-10 rounded-md" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, index) => (
              <Skeleton key={index} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>
      </SurfaceCard>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.9fr)]">
        <SurfaceCard className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <ListRows count={4} height="h-16" />
        </SurfaceCard>
        <SurfaceCard className="space-y-4">
          <Skeleton className="h-6 w-44" />
          <ListRows count={2} height="h-24" />
        </SurfaceCard>
      </div>
    </>
  );
}

function PaymentsLoadingState() {
  return (
    <>
      <SurfaceCard className="space-y-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-full rounded-md" />
      </SurfaceCard>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-edge pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex gap-6">
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-36 rounded-md" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <SurfaceCard className="space-y-4">
          <ListRows count={4} height="h-20" />
        </SurfaceCard>
      </div>
    </>
  );
}

function FinanceLoadingState() {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <TabRow count={4} />
        <SurfaceCard className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
          <ListRows count={5} height="h-14" />
        </SurfaceCard>
      </div>
    </>
  );
}

function ComplianceLoadingState() {
  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <SurfaceCard className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </SurfaceCard>
        <SurfaceCard className="space-y-4">
          <Skeleton className="mx-auto h-24 w-24 rounded-full" />
          <Skeleton className="mx-auto h-4 w-24" />
          <Skeleton className="mx-auto h-8 w-20" />
        </SurfaceCard>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
      </div>
      <SurfaceCard className="space-y-2">
        <ListRows count={5} height="h-14" />
      </SurfaceCard>
    </>
  );
}

function OperationsLoadingState() {
  return (
    <>
      <LoadingHeader
        eyebrowWidth="w-24"
        titleWidth="w-60"
        descriptionWidth="w-full max-w-lg"
      />
      <TabRow count={4} pill={true} />
      <div className="space-y-4">
        <SurfaceCard className="space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </SurfaceCard>
        <SurfaceCard className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-full max-w-2xl" />
        </SurfaceCard>
        <SurfaceCard className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </SurfaceCard>
      </div>
    </>
  );
}

function AnnouncementsLoadingState() {
  return (
    <>
      <LoadingHeader
        eyebrowWidth="w-28"
        titleWidth="w-56"
        descriptionWidth="w-full max-w-lg"
      />
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-4 w-16" />
          <ListRows count={2} height="h-28" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <ListRows count={3} height="h-28" />
        </div>
      </div>
    </>
  );
}

function NotificationsLoadingState() {
  return (
    <>
      <LoadingHeader
        eyebrowWidth="w-28"
        titleWidth="w-44"
        descriptionWidth="w-full max-w-lg"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="ml-auto h-8 w-24 rounded-md" />
      </div>
      <SurfaceCard className="space-y-3">
        <ListRows count={5} height="h-14" />
      </SurfaceCard>
    </>
  );
}

function resolveVariant(variant: AuthenticatedRouteLoadingVariant) {
  switch (variant) {
    case 'documents':
      return <DocumentsLoadingState />;
    case 'meetings':
      return <MeetingsLoadingState />;
    case 'payments':
      return <PaymentsLoadingState />;
    case 'finance':
      return <FinanceLoadingState />;
    case 'compliance':
      return <ComplianceLoadingState />;
    case 'operations':
      return <OperationsLoadingState />;
    case 'announcements':
      return <AnnouncementsLoadingState />;
    case 'notifications':
      return <NotificationsLoadingState />;
    case 'default':
    default:
      return <DefaultLoadingState />;
  }
}

export function AuthenticatedRouteLoading({
  label = 'Loading page content',
  variant = 'default',
}: AuthenticatedRouteLoadingProps) {
  return (
    <section aria-busy="true" aria-label={label} role="status" className="space-y-8">
      {resolveVariant(variant)}
    </section>
  );
}
