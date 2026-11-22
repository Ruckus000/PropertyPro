'use client';

import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useVisitors } from '@/hooks/use-visitors';
import { AlertBanner } from '@/components/shared/alert-banner';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getVisitorColumns } from './visitor-columns';
import { filterVisitors, VISITOR_FILTER_TABS } from './visitor-filters';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeniedVisitorsTab } from './DeniedVisitorsTab';
import { useVisitorStaffActions } from './use-visitor-staff-actions';

interface VisitorStaffViewProps {
  communityId: number;
}

export function VisitorStaffView({ communityId }: VisitorStaffViewProps) {
  const [activeTab, setActiveTab] = useState('visitors');
  const [activeFilter, setActiveFilter] = useState('today');
  const [guestTypeFilter, setGuestTypeFilter] = useState('all');
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data: visitors, isLoading, isError } = useVisitors(
    communityId,
    guestTypeFilter === 'all' ? undefined : { guestType: guestTypeFilter },
  );
  const { actions, dialogs } = useVisitorStaffActions(communityId);

  const filteredVisitors = useMemo(
    () => (visitors ? filterVisitors(visitors, activeFilter) : []),
    [visitors, activeFilter],
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
                tabs={VISITOR_FILTER_TABS}
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

      {dialogs}
    </>
  );
}
