import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  StatusBadge,
} from '@propertypro/design-system';
import { Upload } from 'lucide-react';

interface ViolationRow {
  id: string;
  unit: string;
  owner: string;
  kind: string;
  reported: string;
  fine: string;
  status: string;
  statusLabel: string;
}

const violations: ViolationRow[] = [
  { id: 'V-2026-0184', unit: '306', owner: 'Marisol Vega', kind: 'Unauthorized balcony enclosure', reported: '14 Aug 2026', fine: '$250.00', status: 'open', statusLabel: 'Open' },
  { id: 'V-2026-0179', unit: '512', owner: 'Elena Castellanos', kind: 'Commercial vehicle in guest parking', reported: '09 Aug 2026', fine: '$100.00', status: 'review', statusLabel: 'Hearing set' },
  { id: 'V-2026-0176', unit: '204', owner: 'Priya Raghavan', kind: 'Unapproved exterior door colour', reported: '06 Aug 2026', fine: '—', status: 'in_progress', statusLabel: 'Cure period' },
  { id: 'V-2026-0171', unit: '118', owner: 'David Okonkwo', kind: 'Unregistered pet over weight limit', reported: '02 Aug 2026', fine: '—', status: 'compliant', statusLabel: 'Cured' },
  { id: 'V-2026-0166', unit: '705', owner: 'Andre Fontaine', kind: 'Satellite dish on common element', reported: '27 Jul 2026', fine: '$500.00', status: 'overdue', statusLabel: 'Fine pending' },
];

const violationColumns: ColumnDef<ViolationRow, unknown>[] = [
  {
    id: 'case',
    header: 'Case',
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-medium">{row.original.id}</span>
    ),
  },
  {
    id: 'unit',
    header: 'Unit',
    cell: ({ row }) => (
      <div className="flex flex-col whitespace-nowrap">
        <span className="font-medium">{row.original.unit}</span>
        <span className="text-xs text-content-tertiary">{row.original.owner}</span>
      </div>
    ),
  },
  {
    id: 'kind',
    header: 'Alleged violation',
    cell: ({ row }) => <span className="text-content-secondary">{row.original.kind}</span>,
  },
  {
    id: 'reported',
    header: 'Reported',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-content-secondary">{row.original.reported}</span>
    ),
  },
  {
    id: 'fine',
    header: () => <div className="text-right">Fine</div>,
    cell: ({ row }) => (
      <div className="whitespace-nowrap text-right">{row.original.fine}</div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <StatusBadge status={row.original.status} label={row.original.statusLabel} size="sm" />
      </div>
    ),
  },
];

// The bulk-notice view drops the money and date columns: the operator is
// choosing cases, not auditing them, and the extra room keeps each row to a
// single line of the violation text.
const selectionColumns: ColumnDef<ViolationRow, unknown>[] = [
  violationColumns[0]!,
  violationColumns[1]!,
  violationColumns[2]!,
  violationColumns[5]!,
];

export const ViolationRegister = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Open violations</CardTitle>
      <CardDescription>
        Sunset Condos · every denial and fine must cite the rule or covenant relied on
      </CardDescription>
    </CardHeader>
    <CardContent>
      <DataTable columns={violationColumns} data={violations} />
    </CardContent>
  </Card>
);

export const WithRowSelection = () => {
  const [rowSelection, setRowSelection] = useState({
    'V-2026-0179': true,
    'V-2026-0166': true,
  });

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Send hearing notices</CardTitle>
        <CardDescription>
          2 of 5 cases selected · a 14-day hearing notice is required before any fine is levied
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={selectionColumns}
          data={violations}
          getRowId={(row) => row.id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      </CardContent>
    </Card>
  );
};

export const LoadingState = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Open violations</CardTitle>
      <CardDescription>Loading cases for Sunset Condos…</CardDescription>
    </CardHeader>
    <CardContent>
      <DataTable
        columns={violationColumns}
        data={[]}
        isLoading
        pagination={{ pageIndex: 0, pageSize: 5 }}
      />
    </CardContent>
  </Card>
);

export const EmptyRegister = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Open violations</CardTitle>
      <CardDescription>Palm Shores HOA · no open cases this quarter</CardDescription>
    </CardHeader>
    <CardContent>
      <DataTable
        columns={violationColumns}
        data={[]}
        emptyMessage="No open violations — the register is clear."
        emptyAction={
          <Button size="sm" variant="outline">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Record a violation
          </Button>
        }
      />
    </CardContent>
  </Card>
);
