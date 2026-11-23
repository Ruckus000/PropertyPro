'use client';

import { useMemo, useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { PanelGlance, type AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import {
  Section,
  SectionError,
  SectionFirstRun,
  SectionFooter,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { usePackages, type PackageListItem } from '@/hooks/use-packages';
import { Table } from '@/components/ui/table';
import { DataTable } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { Button } from '@/components/ui/button';
import { getPackageColumns } from './package-columns';
import { PackageLogForm } from './PackageLogForm';
import { PackagePickupDialog } from './PackagePickupDialog';

interface PackagesStaffPageProps {
  communityId: number;
  /** Built by the server page with describeAccess; absent when no role can read. */
  about?: AccessSentence;
}

type Filter = 'all' | 'pending' | 'picked_up';

const isAwaiting = (p: PackageListItem) => p.status !== 'picked_up';

// The words are the ones the current view's badge shows; only the mark changes.
const STATUS_WORD: Record<PackageListItem['status'], string> = {
  received: 'Received',
  notified: 'Notified',
  picked_up: 'Picked Up',
};

function renderStatus(status: PackageListItem['status']): React.ReactNode {
  return (
    <StatusGlyph
      kind={status === 'picked_up' ? 'done' : 'in-progress'}
      label={STATUS_WORD[status]}
    />
  );
}

/** One static row from the real column labels, so the empty page shows what a log looks like. */
function ExampleRow({ headers }: { headers: string[] }) {
  const sample: Record<string, React.ReactNode> = {
    Recipient: 'Resident name',
    Unit: 'Unit 4B',
    Carrier: 'UPS',
    'Tracking #': '—',
    Received: 'Today, 9:30 AM',
    Status: renderStatus('received'),
    'Picked Up': '—',
  };
  return (
    <Table className="w-full text-left">
      <thead>
        <tr className="border-b border-edge text-xs text-content-secondary">
          {headers.map((h) => (
            <th key={h} className="px-3 py-2 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {headers.map((h) => (
            <td key={h} className="px-3 py-2 text-content">
              {sample[h] ?? ''}
            </td>
          ))}
        </tr>
      </tbody>
    </Table>
  );
}

export function PackagesStaffPage({ communityId, about }: PackagesStaffPageProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [logOpen, setLogOpen] = useState(false);
  const [pickupPkg, setPickupPkg] = useState<PackageListItem | null>(null);

  const { data: packages, isLoading, isError, refetch } = usePackages(communityId);

  const baseColumns = useMemo(
    () => getPackageColumns({ onMarkPickedUp: (pkg) => setPickupPkg(pkg) }, { renderStatus }),
    [],
  );
  const headers = useMemo(
    () =>
      baseColumns
        .map((c) => c.header)
        .filter((h): h is string => typeof h === 'string' && h !== ''),
    [baseColumns],
  );
  // The shared column set leaves the action column's header empty, which fails
  // axe's empty-table-header; name it for screen readers here without touching
  // the columns the current view also uses.
  const columns = useMemo(
    () =>
      baseColumns.map((c) =>
        c.header === '' ? { ...c, header: <span className="sr-only">Actions</span> } : c,
      ),
    [baseColumns],
  );

  const loaded = packages !== undefined && !isError;
  const awaiting = packages?.filter(isAwaiting).length ?? 0;
  const pickedUp = (packages?.length ?? 0) - awaiting;

  const visible = useMemo(() => {
    if (!packages) return [];
    if (filter === 'pending') return packages.filter(isAwaiting);
    if (filter === 'picked_up') return packages.filter((p) => !isAwaiting(p));
    return packages;
  }, [packages, filter]);

  const tabs = [
    { label: 'All', value: 'all', count: loaded ? packages.length : undefined },
    { label: 'Awaiting pickup', value: 'pending', count: loaded ? awaiting : undefined },
    { label: 'Picked up', value: 'picked_up', count: loaded ? pickedUp : undefined },
  ];

  const isEmpty = loaded && packages.length === 0;
  const logButton = (
    <Button onClick={() => setLogOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      Log a package
    </Button>
  );

  let body: React.ReactNode;
  if (isError) {
    body = (
      <SectionError
        message="We couldn't load the packages. Please try again."
        onRetry={() => void refetch()}
      />
    );
  } else if (isEmpty) {
    body = (
      <SectionFirstRun
        title="No packages logged yet"
        headingLevel={2}
        description="Log the first delivery and the resident gets a notice."
        action={logButton}
        exampleLabel="Example of a logged package"
        example={<ExampleRow headers={headers} />}
      />
    );
  } else if (loaded && visible.length === 0) {
    body = (
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <p className="text-sm text-content">Nothing matches this filter</p>
        <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
          Show all
        </Button>
      </div>
    );
  } else {
    body = (
      <DataTable
        columns={columns}
        data={visible}
        isLoading={isLoading}
        bare
        getRowId={(p) => String(p.id)}
      />
    );
  }

  return (
    <>
      <PageLayout
        template="list"
        records="table"
        header={
          <PageHeader
            title="Packages"
            icon={<Package />}
            description="Log deliveries as they arrive. Residents are told when a package is ready to collect."
            actions={isEmpty ? undefined : logButton}
          />
        }
        panel={{
          template: 'list',
          glance: loaded && !isEmpty ? (
            <PanelGlance
              figure={String(awaiting)}
              unit="awaiting pickup"
              lines={[['Picked up', String(pickedUp)]]}
              source="usePackages"
            />
          ) : undefined,
          about,
        }}
      >
        <Section aria-busy={isLoading}>
          {isError || isEmpty ? null : (
            <SectionToolbar
              filters={
                <QuickFilterTabs
                  tabs={tabs}
                  active={filter}
                  onChange={(v) => setFilter(v as Filter)}
                  tone="ink"
                />
              }
            />
          )}
          {body}
          {loaded && !isEmpty ? <SectionFooter note={`Showing ${visible.length}`} /> : null}
        </Section>
      </PageLayout>

      <PackageLogForm communityId={communityId} open={logOpen} onOpenChange={setLogOpen} />
      <PackagePickupDialog
        communityId={communityId}
        pkg={pickupPkg}
        onClose={() => setPickupPkg(null)}
      />
    </>
  );
}
