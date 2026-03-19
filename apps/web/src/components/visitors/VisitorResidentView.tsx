'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Plus, UserCheck } from 'lucide-react';
import { useMyVisitors, type VisitorListItem } from '@/hooks/use-visitors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';

interface VisitorResidentViewProps {
  communityId: number;
  /** The resident's unit ID for scoping registration */
  hostUnitId?: number;
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
  if (visitor.checkedOutAt) {
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        Checked Out
      </Badge>
    );
  }
  if (visitor.checkedInAt) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        Checked In
      </Badge>
    );
  }
  return (
    <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
      Expected
    </Badge>
  );
}

function VisitorCard({ visitor }: { visitor: VisitorListItem }) {
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
          <p className="text-xs text-muted-foreground">
            Expected: {formatDatetime(visitor.expectedArrival)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function VisitorResidentView({
  communityId,
  hostUnitId,
}: VisitorResidentViewProps) {
  const { data: visitors, isLoading } = useMyVisitors(communityId);
  const [registerOpen, setRegisterOpen] = useState(false);

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

      {!visitors || visitors.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No Active Visitors</CardTitle>
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
            <VisitorCard key={v.id} visitor={v} />
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
