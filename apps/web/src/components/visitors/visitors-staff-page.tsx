'use client';

import { useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Plus, Users } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import {
  Section,
  SectionError,
  SectionFooter,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { useVisitors } from '@/hooks/use-visitors';
import type { VisitorStatus } from '@/lib/visitors/visitor-logic';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getVisitorColumns } from './visitor-columns';
import { filterVisitors, VISITOR_FILTER_TABS } from './visitor-filters';
import { useVisitorStaffActions } from './use-visitor-staff-actions';
import { VisitorRegistrationForm } from './VisitorRegistrationForm';
import { DeniedVisitorsTab } from './DeniedVisitorsTab';

interface VisitorsStaffPageProps {
  communityId: number;
  /** Built by the server page with describeAccess; absent when no role can read. */
  about?: AccessSentence;
}

type TabValue = 'visitors' | 'denied';

// The words are the ones the current view's badge shows; only the mark changes.
const STATUS: Record<VisitorStatus, { kind: StatusGlyphKind; word: string }> = {
  expected: { kind: 'not-started', word: 'Expected' },
  checked_in: { kind: 'in-progress', word: 'Checked In' },
  overstayed: { kind: 'attention', word: 'Overstayed' },
  checked_out: { kind: 'done', word: 'Checked Out' },
  // Expired means do not admit; Expected means admit after check-in, so not the same mark.
  expired: { kind: 'attention', word: 'Expired' },
  revoked: { kind: 'overdue', word: 'Revoked' },
  revoked_on_site: { kind: 'overdue', word: 'Revoked On-Site' },
};

function renderStatus(status: VisitorStatus): React.ReactNode {
  const { kind, word } = STATUS[status];
  return <StatusGlyph kind={kind} label={word} />;
}

// Ink, not coral: the selected tab is marked by an underline (design §11.3).
// A plain left-aligned row of text tabs: a hairline under the whole row, an ink
// underline under the selected tab. These override the primitive's pill (bar
// background, centring, rounding, shadow, active card fill) with className only.
// Every override has the primitive's variant (none, or data-[state=active]) so
// tailwind-merge replaces rather than stacks; the primitive has no md: twin for
// any of them. The 44px height below md is the primitive's min-h-11.
const LIST_CLASS =
  'flex w-full justify-start gap-1 rounded-none border-b border-edge-strong bg-transparent p-0';
const TRIGGER_CLASS =
  'rounded-none border-b-2 border-transparent py-2 data-[state=active]:border-content data-[state=active]:bg-transparent data-[state=active]:shadow-none';

export function VisitorsStaffPage({ communityId, about }: VisitorsStaffPageProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabValue>(
    searchParams.get('tab') === 'denied' ? 'denied' : 'visitors',
  );
  const [activeFilter, setActiveFilter] = useState('today');
  const [guestTypeFilter, setGuestTypeFilter] = useState('all');
  const [registerOpen, setRegisterOpen] = useState(false);

  const { data: visitors, isLoading, isError, refetch } = useVisitors(
    communityId,
    guestTypeFilter === 'all' ? undefined : { guestType: guestTypeFilter },
  );
  const { actions, dialogs } = useVisitorStaffActions(communityId);

  const visible = useMemo(
    () => (visitors ? filterVisitors(visitors, activeFilter) : []),
    [visitors, activeFilter],
  );
  const baseColumns = useMemo(() => getVisitorColumns(actions, { renderStatus }), [actions]);
  // The shared column set leaves the action column's header empty, which fails
  // axe's empty-table-header; name it for screen readers here without touching
  // the columns the current view also uses. The same column is pinned to the
  // right edge: the eleven columns before it are wider than the box at 1440px,
  // and a row's Check In and Revoke must not need a sideways scroll.
  const columns = useMemo(
    () =>
      baseColumns.map((c) =>
        c.id === 'actions'
          ? { ...c, header: <span className="sr-only">Actions</span>, meta: { ...c.meta, pinEnd: true } }
          : c,
      ),
    [baseColumns],
  );

  function handleTabChange(next: string) {
    const value: TabValue = next === 'denied' ? 'denied' : 'visitors';
    setTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    // `replace`, not `push`: Back should leave the page, not walk every tab.
    window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
  }

  const registerButton = (
    <Button onClick={() => setRegisterOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      Register Visitor
    </Button>
  );

  return (
    <>
      <Tabs value={tab} onValueChange={handleTabChange}>
        <PageLayout
          template="list"
          records="table"
          header={
            <PageHeader
              title="Visitors"
              icon={<Users />}
              description="Expected visitors and the people who may not be let in."
              // The denied list keeps its own "Add to Denied List" button inside its
              // section, as in the current view, so the header offers none on that tab.
              actions={tab === 'visitors' ? registerButton : undefined}
            />
          }
          tabs={
            <TabsList className={LIST_CLASS}>
              <TabsTrigger value="visitors" className={TRIGGER_CLASS}>
                Visitors
              </TabsTrigger>
              <TabsTrigger value="denied" className={TRIGGER_CLASS}>
                Denied list
              </TabsTrigger>
            </TabsList>
          }
          panel={{ template: 'list', about }}
        >
          <TabsContent value="visitors" className="mt-0">
            <Section aria-busy={isLoading} data-testid="visitors-section">
              {isError ? null : (
                <SectionToolbar
                  filters={
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <QuickFilterTabs
                        tabs={VISITOR_FILTER_TABS}
                        active={activeFilter}
                        onChange={setActiveFilter}
                        tone="ink"
                      />
                      <Select value={guestTypeFilter} onValueChange={setGuestTypeFilter}>
                        <SelectTrigger className="w-full md:w-44" aria-label="Guest type">
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
                  }
                />
              )}
              {isError ? (
                <SectionError
                  message="We couldn't load visitors. Please try again."
                  onRetry={() => void refetch()}
                />
              ) : (
                <DataTable
                  columns={columns}
                  data={visible}
                  isLoading={isLoading}
                  bare
                  emptyMessage="No visitors found."
                  emptyAction={
                    <Button variant="outline" size="sm" onClick={() => setRegisterOpen(true)}>
                      Register first visitor
                    </Button>
                  }
                />
              )}
              {visitors && !isError ? <SectionFooter note={`Showing ${visible.length}`} /> : null}
            </Section>
          </TabsContent>

          <TabsContent value="denied" className="mt-0">
            {/* The tab brings its own button row and bordered table. */}
            <Section bare data-testid="denied-section">
              <DeniedVisitorsTab communityId={communityId} />
            </Section>
          </TabsContent>
        </PageLayout>
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
