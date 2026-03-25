'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { isToday, parseISO } from 'date-fns';
import {
  useVisitors,
  useCheckinVisitor,
  useCheckoutVisitor,
  useRevokeVisitor,
  type VisitorListItem,
} from '@/hooks/use-visitors';
import { fetchDeniedMatches, type DeniedMatchItem } from '@/hooks/use-denied-visitors';
import { AlertBanner } from '@/components/shared/alert-banner';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  getVisitorColumns,
  type VisitorColumnActions,
  getVisitorStatus,
} from './visitor-columns';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { DeniedVisitorsTab } from './DeniedVisitorsTab';
import { DeniedMatchWarning } from './DeniedMatchWarning';

interface VisitorStaffViewProps {
  communityId: number;
}

const FILTER_TABS = [
  { label: 'Today', value: 'today' },
  { label: 'Expected', value: 'expected' },
  { label: 'Checked In', value: 'checked_in' },
  { label: 'All', value: 'all' },
];

export function VisitorStaffView({ communityId }: VisitorStaffViewProps) {
  const [activeTab, setActiveTab] = useState('visitors');
  const [activeFilter, setActiveFilter] = useState('today');
  const [guestTypeFilter, setGuestTypeFilter] = useState('all');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<DeniedMatchItem[]>([]);
  const [matchWarningOpen, setMatchWarningOpen] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<VisitorListItem | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<VisitorListItem | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const { data: visitors, isLoading, isError } = useVisitors(
    communityId,
    guestTypeFilter === 'all' ? undefined : { guestType: guestTypeFilter },
  );
  const checkinMutation = useCheckinVisitor(communityId);
  const checkoutMutation = useCheckoutVisitor(communityId);
  const revokeMutation = useRevokeVisitor(communityId);

  const filteredVisitors = useMemo(() => {
    if (!visitors) return [];
    switch (activeFilter) {
      case 'today':
        return visitors.filter((v) => {
          try {
            return isToday(parseISO(v.expectedArrival));
          } catch {
            return false;
          }
        });
      case 'expected':
        return visitors.filter((visitor) => getVisitorStatus(visitor) === 'expected');
      case 'checked_in':
        return visitors.filter((visitor) => {
          const status = getVisitorStatus(visitor);
          return status === 'checked_in' || status === 'overstayed' || status === 'revoked_on_site';
        });
      default:
        return visitors;
    }
  }, [visitors, activeFilter]);

  const handleCheckIn = useCallback(
    async (visitor: VisitorListItem) => {
      let matches: DeniedMatchItem[] = [];
      try {
        matches = await fetchDeniedMatches(
          communityId,
          visitor.visitorName,
          visitor.vehiclePlate,
        );
      } catch {
        // Denied-match check is best-effort — proceed with check-in on failure
      }

      if (matches.length > 0) {
        setPendingMatches(matches);
        setPendingCheckIn(visitor);
        setMatchWarningOpen(true);
        return;
      }

      await checkinMutation.mutateAsync(visitor.id);
    },
    [checkinMutation, communityId],
  );

  const handleCheckOut = useCallback(
    async (visitor: VisitorListItem) => {
      await checkoutMutation.mutateAsync(visitor.id);
    },
    [checkoutMutation],
  );

  const handleConfirmDeniedMatch = useCallback(async () => {
    if (!pendingCheckIn) return;
    await checkinMutation.mutateAsync(pendingCheckIn.id);
    setPendingCheckIn(null);
    setPendingMatches([]);
    setMatchWarningOpen(false);
  }, [checkinMutation, pendingCheckIn]);

  const handleRevoke = useCallback((visitor: VisitorListItem) => {
    setRevokeTarget(visitor);
    setRevokeReason('');
  }, []);

  const actions: VisitorColumnActions = useMemo(
    () => ({
      onCheckIn: handleCheckIn,
      onCheckOut: handleCheckOut,
      onRevoke: handleRevoke,
    }),
    [handleCheckIn, handleCheckOut, handleRevoke],
  );

  const columns = useMemo(() => getVisitorColumns(actions), [actions]);

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="visitors">Visitors</TabsTrigger>
          <TabsTrigger value="denied">Denied List</TabsTrigger>
        </TabsList>

        <TabsContent value="visitors" className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <QuickFilterTabs
                tabs={FILTER_TABS}
                active={activeFilter}
                onChange={setActiveFilter}
              />
              <Select value={guestTypeFilter} onValueChange={setGuestTypeFilter}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Guest type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All guest types</SelectItem>
                  <SelectItem value="one_time">One-Time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="permanent">Permanent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Register Visitor
            </Button>
          </div>

          {isError ? (
            <AlertBanner status="danger" title="We couldn't load visitors. Please try again." />
          ) : (
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              data={filteredVisitors}
              isLoading={isLoading}
              emptyMessage="No visitors found."
              emptyAction={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRegisterOpen(true)}
                >
                  Register first visitor
                </Button>
              }
            />
          </div>
          )}
        </TabsContent>

        <TabsContent value="denied">
          <DeniedVisitorsTab communityId={communityId} />
        </TabsContent>
      </Tabs>

      <VisitorRegistrationForm
        communityId={communityId}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />

      <DeniedMatchWarning
        open={matchWarningOpen}
        onOpenChange={setMatchWarningOpen}
        matches={pendingMatches}
        visitorName={pendingCheckIn?.visitorName ?? 'This visitor'}
        onConfirm={handleConfirmDeniedMatch}
      />

      <Dialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRevokeTarget(null);
            setRevokeReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Revoke Visitor Pass</DialogTitle>
            <DialogDescription>
              Add a reason for revoking {revokeTarget?.visitorName}&apos;s pass.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            placeholder="Required reason"
            rows={4}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRevokeTarget(null);
                setRevokeReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!revokeReason.trim() || revokeMutation.isPending}
              onClick={async () => {
                if (!revokeTarget) return;
                await revokeMutation.mutateAsync({
                  visitorId: revokeTarget.id,
                  reason: revokeReason.trim(),
                });
                setRevokeTarget(null);
                setRevokeReason('');
              }}
            >
              {revokeMutation.isPending ? 'Revoking...' : 'Revoke Pass'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
