'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Plus, Share2, UserCheck } from 'lucide-react';
import {
  useMyVisitors,
  useRevokeVisitor,
  type MyVisitorFilter,
  type VisitorListItem,
} from '@/hooks/use-visitors';
import { ApiRequestError } from '@/lib/api/request-json';
import { isNoUnitAssociationError } from '@/lib/units/no-unit-association';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { VisitorQRCode } from './VisitorQRCode';
import { getVisitorStatus } from './visitor-columns';
import { isMultiUsePass } from '@/lib/visitors/visitor-logic';

interface VisitorResidentViewProps {
  communityId: number;
  /** The resident's unit label for scoping registration */
  hostUnitLabel?: string;
  allowResidentVisitorRevoke?: boolean;
  currentUserId: string;
}

function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

function VisitorStatusBadge({ visitor }: { visitor: VisitorListItem }) {
  const status = getVisitorStatus(visitor);

  const labels: Record<string, string> = {
    expected: 'Expected',
    checked_in: 'Checked In',
    checked_out: 'Checked Out',
    expired: 'Expired',
    overstayed: 'Overstayed',
    revoked: 'Revoked',
    revoked_on_site: 'Revoked On-Site',
  };

  return <Badge variant="outline">{labels[status]}</Badge>;
}

function guestTypeLabel(guestType: VisitorListItem['guestType']): string {
  switch (guestType) {
    case 'one_time':
      return 'One-Time';
    case 'recurring':
      return 'Recurring';
    case 'permanent':
      return 'Permanent';
    case 'vendor':
      return 'Vendor';
  }
}

function formatVehicle(visitor: VisitorListItem): string | null {
  const details = [visitor.vehicleColor, visitor.vehicleMake, visitor.vehicleModel]
    .filter(Boolean)
    .join(' ');
  if (details && visitor.vehiclePlate) return `${details} · ${visitor.vehiclePlate}`;
  return details || visitor.vehiclePlate || null;
}

async function shareVisitorPass(visitorName: string, passCode: string): Promise<void> {
  const passText = `${visitorName} visitor pass: ${passCode}`;

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'Visitor Pass',
        text: passText,
      });
      return;
    } catch {
      // fall back to clipboard
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(passText);
  }
}

interface VisitorCardProps {
  visitor: VisitorListItem;
  allowResidentVisitorRevoke: boolean;
  currentUserId: string;
  onRevoke: (visitorId: number) => Promise<void>;
}

function VisitorCard({
  visitor,
  allowResidentVisitorRevoke,
  currentUserId,
  onRevoke,
}: VisitorCardProps) {
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  // One-time passes stay non-revocable by residents (visitor spec: a one-time
  // pass simply expires). Read the DERIVED status, not `checkedOutAt`: a pass
  // whose status is checked out or expired has nothing left to revoke, while a
  // reusable pass that reads `expected` between visits is still a live
  // credential and must stay revocable.
  const status = getVisitorStatus(visitor);
  const canRevoke = allowResidentVisitorRevoke
    && visitor.hostUserId === currentUserId
    && isMultiUsePass(visitor.guestType)
    && !visitor.revokedAt
    && status !== 'checked_out'
    && status !== 'expired';

  const passCode = visitor.passCode;

  async function handleRevoke() {
    setRevokeError(null);
    setRevoking(true);
    try {
      await onRevoke(visitor.id);
    } catch (error) {
      // A 4xx carries the server's reason ("You can only revoke passes you
      // registered"); anything else is a connection or server failure.
      setRevokeError(
        error instanceof ApiRequestError && error.status < 500 && error.message
          ? error.message
          : 'Check your connection, then try again.',
      );
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
          <UserCheck className="h-5 w-5 text-content-secondary" aria-hidden="true" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{visitor.visitorName}</p>
            <VisitorStatusBadge visitor={visitor} />
          </div>
          <p className="text-xs text-content-secondary">{visitor.purpose}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">{guestTypeLabel(visitor.guestType)}</Badge>
            {passCode ? <VisitorQRCode passCode={passCode} /> : null}
          </div>
          <p className="text-xs text-content-secondary">
            Expected: {formatDatetime(visitor.expectedArrival)}
          </p>
          {visitor.validUntil ? (
            <p className="text-xs text-content-secondary">
              Valid Until: {formatDatetime(visitor.validUntil)}
            </p>
          ) : null}
          {formatVehicle(visitor) ? (
            <p className="text-xs text-content-secondary">Vehicle: {formatVehicle(visitor)}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            {passCode ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void shareVisitorPass(visitor.visitorName, passCode)}
              >
                <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Share
              </Button>
            ) : null}
            {canRevoke ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={revoking}>
                    {revoking ? 'Revoking…' : 'Revoke'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke {visitor.visitorName}&apos;s pass?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Staff will no longer admit them with this pass. To let them in again,
                      you&apos;ll need to register them as a new visitor.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep pass</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleRevoke()}>
                      Revoke pass
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
          {revokeError ? (
            <AlertBanner
              status="danger"
              title="We couldn't revoke this pass."
              description={revokeError}
              className="mt-2"
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function VisitorResidentView({
  communityId,
  hostUnitLabel,
  allowResidentVisitorRevoke = false,
  currentUserId,
}: VisitorResidentViewProps) {
  const [activeTab, setActiveTab] = useState<MyVisitorFilter>('active');
  const { data: visitors, isLoading, isError, error, refetch } = useMyVisitors(
    communityId,
    activeTab,
  );
  const [registerOpen, setRegisterOpen] = useState(false);
  const revokeVisitor = useRevokeVisitor(communityId);

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

  // `/api/v1/visitors/my` answers 403 NO_UNIT_ASSOCIATION when the resident
  // has no unit in this community (`requireActorUnitIds`). That is a setup gap
  // no retry can fix, and registering a visitor needs a unit too, so the whole
  // view becomes a calm state that says who can fix it. Other 403s (feature
  // off, wrong role) stay errors.
  if (isError && isNoUnitAssociationError(error)) {
    return (
      <EmptyState
        icon="building"
        title="Your account isn't linked to a unit yet"
        description="Visitor passes are issued per unit. Once your manager links your account to your unit, you can register visitors here."
        action={
          <Button asChild variant="outline">
            <Link href={`/help/contact?communityId=${communityId}`}>Contact management</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Visitors</h2>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Register Visitor
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as MyVisitorFilter)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError ? (
        // Must not fall through to "No Visitors In This View": an empty list
        // there would tell the resident they have no passes.
        <AlertBanner
          status="danger"
          title="We couldn't load your visitors."
          description="Check your connection, then try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : !visitors || visitors.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Visitors In This View</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-content-secondary">
              Register a visitor to generate a pass for your guests.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visitors.map((v) => (
            <VisitorCard
              key={v.id}
              visitor={v}
              allowResidentVisitorRevoke={allowResidentVisitorRevoke}
              currentUserId={currentUserId}
              onRevoke={async (visitorId) => {
                await revokeVisitor.mutateAsync({ visitorId });
              }}
            />
          ))}
        </div>
      )}

      <VisitorRegistrationForm
        communityId={communityId}
        hostUnitLabel={hostUnitLabel}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
    </div>
  );
}
