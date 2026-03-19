'use client';

import { useState, useMemo, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { isToday, parseISO } from 'date-fns';
import {
  useVisitors,
  useCheckinVisitor,
  useCheckoutVisitor,
  type VisitorListItem,
} from '@/hooks/use-visitors';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import {
  getVisitorColumns,
  type VisitorColumnActions,
} from './visitor-columns';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { Button } from '@/components/ui/button';

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
  const [activeFilter, setActiveFilter] = useState('today');
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data: visitors, isLoading } = useVisitors(communityId);
  const checkinMutation = useCheckinVisitor(communityId);
  const checkoutMutation = useCheckoutVisitor(communityId);

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
        return visitors.filter(
          (v) => !v.checkedInAt && !v.checkedOutAt,
        );
      case 'checked_in':
        return visitors.filter(
          (v) => v.checkedInAt && !v.checkedOutAt,
        );
      default:
        return visitors;
    }
  }, [visitors, activeFilter]);

  const handleCheckIn = useCallback(
    async (visitor: VisitorListItem) => {
      await checkinMutation.mutateAsync(visitor.id);
    },
    [checkinMutation],
  );

  const handleCheckOut = useCallback(
    async (visitor: VisitorListItem) => {
      await checkoutMutation.mutateAsync(visitor.id);
    },
    [checkoutMutation],
  );

  const actions: VisitorColumnActions = useMemo(
    () => ({
      onCheckIn: handleCheckIn,
      onCheckOut: handleCheckOut,
    }),
    [handleCheckIn, handleCheckOut],
  );

  const columns = useMemo(() => getVisitorColumns(actions), [actions]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <QuickFilterTabs
          tabs={FILTER_TABS}
          active={activeFilter}
          onChange={setActiveFilter}
        />
        <Button onClick={() => setRegisterOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register Visitor
        </Button>
      </div>

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

      <VisitorRegistrationForm
        communityId={communityId}
        open={registerOpen}
        onOpenChange={setRegisterOpen}
      />
    </div>
  );
}
