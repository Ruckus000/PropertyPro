'use client';

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Package } from 'lucide-react';
import { useMyPackages, type PackageListItem } from '@/hooks/use-packages';
import { isNoUnitAssociationError } from '@/lib/units/no-unit-association';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PackageResidentViewProps {
  communityId: number;
}

function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status }: { status: PackageListItem['status'] }) {
  switch (status) {
    case 'received':
      return (
        <Badge className="bg-interactive-muted text-content-link hover:bg-interactive-muted">
          Received
        </Badge>
      );
    case 'notified':
      return (
        <Badge className="bg-status-warning-bg text-status-warning hover:bg-status-warning-bg">
          Notified
        </Badge>
      );
    case 'picked_up':
      return (
        <Badge className="bg-status-success-bg text-status-success hover:bg-status-success-bg">
          Picked Up
        </Badge>
      );
  }
}

function PackageCard({ pkg }: { pkg: PackageListItem }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
          <Package className="h-5 w-5 text-content-secondary" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{pkg.carrier}</p>
            <StatusBadge status={pkg.status} />
          </div>
          {pkg.trackingNumber && (
            <p className="text-xs font-mono text-content-secondary">
              {pkg.trackingNumber}
            </p>
          )}
          <p className="text-xs text-content-secondary">
            Received {formatDatetime(pkg.createdAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PackageResidentView({ communityId }: PackageResidentViewProps) {
  const { data: packages, isLoading, isError, error, refetch } = useMyPackages(communityId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // `/api/v1/packages/my` answers 403 NO_UNIT_ASSOCIATION when the resident
  // has no unit in this community (`requireActorUnitIds`). That is a setup gap,
  // not a failure, and retrying cannot fix it — so it gets a calm state that
  // says who can. Other 403s (feature off, wrong role) stay errors.
  if (isError && isNoUnitAssociationError(error)) {
    return (
      <EmptyState
        icon="building"
        title="Your account isn't linked to a unit yet"
        description="Packages are logged per unit. Once your manager links your account to your unit, packages delivered to it will show here."
        action={
          <Button asChild variant="outline">
            <Link href={`/help/contact?communityId=${communityId}`}>Contact management</Link>
          </Button>
        }
      />
    );
  }

  // Any other failure must not fall through to "No pending packages": an
  // empty list there would tell the resident nothing has arrived.
  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load your packages."
        description="Check your connection, then try again."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!packages || packages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-content-secondary">
            No pending packages. You will be notified when a package arrives.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">My Packages</h2>
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} />
      ))}
    </div>
  );
}
