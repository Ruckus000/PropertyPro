'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Skeleton } from '@/components/ui/skeleton';

interface PendingRequest {
  id: number;
  userId: string;
  communityId: number;
  unitIdentifier: string;
  residentType: 'owner' | 'tenant' | string;
  status: string;
  createdAt: string;
}

export function AdminReviewList() {
  const qc = useQueryClient();
  const [actingId, setActingId] = useState<number | null>(null);
  const [denyDraftId, setDenyDraftId] = useState<number | null>(null);
  const [denyNotes, setDenyNotes] = useState('');

  const { data, isLoading, isError } = useQuery<{ data: PendingRequest[] }>({
    queryKey: ['admin-join-requests'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/join-requests');
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
  });

  const act = useMutation({
    mutationFn: async (input: { id: number; action: 'approve' | 'deny'; notes?: string }) => {
      setActingId(input.id);
      const res = await fetch(
        `/api/v1/admin/join-requests/${input.id}/${input.action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: input.notes }),
        },
      );
      if (!res.ok) throw new Error(`${input.action} failed`);
      return res.json();
    },
    onSettled: () => {
      setActingId(null);
      setDenyDraftId(null);
      setDenyNotes('');
      qc.invalidateQueries({ queryKey: ['admin-join-requests'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        title="We couldn't load join requests"
        description="Please refresh the page to try again."
      />
    );
  }

  const requests = data?.data ?? [];

  if (requests.length === 0) {
    return (
      <EmptyState
        title="No pending requests"
        description="All join requests have been reviewed."
      />
    );
  }

  return (
    <div className="space-y-3">
      {act.error && (
        <AlertBanner
          status="danger"
          title="Action failed"
          description="We couldn't save your review. Please try again."
        />
      )}
      {requests.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.unitIdentifier}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline">{r.residentType}</Badge>
                <span className="text-xs text-muted-foreground">
                  Submitted {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="secondary"
                disabled={actingId === r.id}
                onClick={() => {
                  setDenyDraftId(r.id);
                  setDenyNotes('');
                }}
              >
                Deny
              </Button>
              <Button
                size="sm"
                disabled={actingId === r.id}
                onClick={() => act.mutate({ id: r.id, action: 'approve' })}
              >
                {actingId === r.id ? 'Working…' : 'Approve'}
              </Button>
            </div>
          </div>
          {denyDraftId === r.id && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <label
                htmlFor={`deny-notes-${r.id}`}
                className="text-sm font-medium"
              >
                Reason for denying (sent to requester)
              </label>
              <textarea
                id={`deny-notes-${r.id}`}
                className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="e.g. Unit number doesn't match our records. Please provide your lease or closing document."
                value={denyNotes}
                onChange={(e) => setDenyNotes(e.target.value)}
                maxLength={500}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={actingId === r.id}
                  onClick={() => {
                    setDenyDraftId(null);
                    setDenyNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={actingId === r.id}
                  onClick={() =>
                    act.mutate({
                      id: r.id,
                      action: 'deny',
                      notes: denyNotes.trim() || undefined,
                    })
                  }
                >
                  {actingId === r.id ? 'Denying…' : 'Confirm deny'}
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
