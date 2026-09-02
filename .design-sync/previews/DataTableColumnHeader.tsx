import { useState } from 'react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableColumnHeader,
  StatusBadge,
} from '@propertypro/design-system';

interface AccountRow {
  unit: string;
  owner: string;
  balance: string;
  daysPastDue: number;
  status: string;
  statusLabel: string;
}

const accounts: AccountRow[] = [
  { unit: '306', owner: 'Marisol Vega', balance: '$4,275.00', daysPastDue: 118, status: 'overdue', statusLabel: '90+ days' },
  { unit: '512', owner: 'Elena Castellanos', balance: '$2,190.00', daysPastDue: 76, status: 'overdue', statusLabel: '61-90 days' },
  { unit: '204', owner: 'Priya Raghavan', balance: '$1,842.50', daysPastDue: 62, status: 'overdue', statusLabel: '61-90 days' },
  { unit: '705', owner: 'Andre Fontaine', balance: '$918.40', daysPastDue: 28, status: 'pending', statusLabel: '0-30 days' },
  { unit: '118', owner: 'David Okonkwo', balance: '$610.00', daysPastDue: 34, status: 'due_soon', statusLabel: '31-60 days' },
];

const columns: ColumnDef<AccountRow, unknown>[] = [
  {
    accessorKey: 'unit',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Unit" />,
    cell: ({ row }) => <span className="font-medium">{row.original.unit}</span>,
  },
  {
    accessorKey: 'owner',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Owner of record" />,
  },
  {
    accessorKey: 'balance',
    header: ({ column }) => (
      <div className="flex justify-end">
        <DataTableColumnHeader column={column} title="Balance" />
      </div>
    ),
    cell: ({ row }) => <div className="text-right font-medium">{row.original.balance}</div>,
  },
  {
    accessorKey: 'daysPastDue',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Days past due" />,
    cell: ({ row }) => <span className="text-content-secondary">{row.original.daysPastDue}</span>,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Aging bucket" />,
    enableSorting: false,
    cell: ({ row }) => (
      <StatusBadge status={row.original.status} label={row.original.statusLabel} size="sm" />
    ),
  },
];

// The route resolves sorting server-side (manual sorting), so the rows arrive
// already ordered — mirrored here so the arrow and the row order agree.
function orderBy(rows: AccountRow[], sorting: SortingState): AccountRow[] {
  const first = sorting[0];
  if (!first) return rows;
  const dir = first.desc ? -1 : 1;
  const value = (row: AccountRow) =>
    first.id === 'balance'
      ? Number(row.balance.replace(/[$,]/g, ''))
      : first.id === 'daysPastDue'
        ? row.daysPastDue
        : first.id === 'unit'
          ? Number(row.unit)
          : row.owner;
  return [...rows].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * dir;
    }
    return (av - bv) * dir;
  });
}

const Shell = ({
  title,
  description,
  sorting,
}: {
  title: string;
  description: string;
  sorting: SortingState;
}) => {
  const [sortState, setSortState] = useState<SortingState>(sorting);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={orderBy(accounts, sortState)}
          sorting={sortState}
          onSortingChange={setSortState}
        />
      </CardContent>
    </Card>
  );
};

export const Unsorted = () => (
  <Shell
    title="Delinquency register"
    description="Every sortable column offers the neutral affordance until one is chosen."
    sorting={[]}
  />
);

export const SortedDescending = () => (
  <Shell
    title="Delinquency register — highest balance first"
    description="The active column carries a solid arrow; the rest stay neutral."
    sorting={[{ id: 'balance', desc: true }]}
  />
);

export const SortedAscending = () => (
  <Shell
    title="Delinquency register — by unit"
    description="Aging bucket is not sortable, so its header renders as plain text."
    sorting={[{ id: 'unit', desc: false }]}
  />
);
