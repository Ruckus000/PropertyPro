'use client';

import { format, parseISO } from 'date-fns';
import { Package } from 'lucide-react';
import { useMyPackages, type PackageListItem } from '@/hooks/use-packages';
import { Badge } from '@/components/ui/badge';
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
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Received
        </Badge>
      );
    case 'notified':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          Notified
        </Badge>
      );
    case 'picked_up':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Picked Up
        </Badge>
      );
  }
}

function PackageCard({ pkg }: { pkg: PackageListItem }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{pkg.carrier}</p>
            <StatusBadge status={pkg.status} />
          </div>
          {pkg.trackingNumber && (
            <p className="text-xs font-mono text-muted-foreground">
              {pkg.trackingNumber}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Received {formatDatetime(pkg.createdAt)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PackageResidentView({ communityId }: PackageResidentViewProps) {
  const { data: packages, isLoading } = useMyPackages(communityId);

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

  if (!packages || packages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My Packages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
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
