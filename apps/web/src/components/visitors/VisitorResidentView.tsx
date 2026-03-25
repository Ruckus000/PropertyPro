'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, Share2, UserCheck } from 'lucide-react';
import {
  useMyVisitors,
  useRevokeVisitor,
  type MyVisitorFilter,
  type VisitorListItem,
} from '@/hooks/use-visitors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { VisitorQRCode } from './VisitorQRCode';
import { getVisitorStatus } from './visitor-columns';

interface VisitorResidentViewProps {
  communityId: number;
  /** The resident's unit ID for scoping registration */
  hostUnitId?: number;
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

async function shareVisitorPass(visitor: VisitorListItem): Promise<void> {
  const passText = `${visitor.visitorName} visitor pass: ${visitor.passCode ?? 'Unavailable'}`;

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
  const canRevoke = allowResidentVisitorRevoke
    && visitor.hostUserId === currentUserId
    && (visitor.guestType === 'recurring' || visitor.guestType === 'permanent')
    && !visitor.revokedAt;

  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">{visitor.visitorName}</p>
            <VisitorStatusBadge visitor={visitor} />
          </div>
          <p className="text-xs text-muted-foreground">{visitor.purpose}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">{guestTypeLabel(visitor.guestType)}</Badge>
            {visitor.passCode ? <VisitorQRCode passCode={visitor.passCode} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Expected: {formatDatetime(visitor.expectedArrival)}
          </p>
          {visitor.validUntil ? (
            <p className="text-xs text-muted-foreground">
              Valid Until: {formatDatetime(visitor.validUntil)}
            </p>
          ) : null}
          {formatVehicle(visitor) ? (
            <p className="text-xs text-muted-foreground">Vehicle: {formatVehicle(visitor)}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void shareVisitorPass(visitor)}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            {canRevoke ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void onRevoke(visitor.id)}
              >
                Revoke
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function VisitorResidentView({
  communityId,
  hostUnitId,
  allowResidentVisitorRevoke = false,
  currentUserId,
}: VisitorResidentViewProps) {
  const [activeTab, setActiveTab] = useState<MyVisitorFilter>('active');
  const { data: visitors, isLoading } = useMyVisitors(communityId, activeTab);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My Visitors</h2>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
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

      {!visitors || visitors.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Visitors In This View</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
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
        hostUnitId={hostUnitId}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
    </div>
  );
}
