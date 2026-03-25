'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import {
  useDeleteDeniedVisitor,
  useDeniedVisitors,
  useUpdateDeniedVisitor,
  type DeniedVisitorListItem,
} from '@/hooks/use-denied-visitors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/shared/data-table';
import { DeniedVisitorForm } from './DeniedVisitorForm';

interface DeniedVisitorsTabProps {
  communityId: number;
}

function formatDate(value: string): string {
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
}

function formatUserId(value: string | null): string {
  if (!value) return '\u2014';
  return `${value.slice(0, 8)}...`;
}

export function DeniedVisitorsTab({ communityId }: DeniedVisitorsTabProps) {
  const { data, isLoading } = useDeniedVisitors(communityId);
  const updateDeniedVisitor = useUpdateDeniedVisitor(communityId);
  const deleteDeniedVisitor = useDeleteDeniedVisitor(communityId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeniedVisitorListItem | null>(null);

  const columns = useMemo<ColumnDef<DeniedVisitorListItem, unknown>[]>(() => [
    {
      accessorKey: 'fullName',
      header: 'Full Name',
      cell: ({ row }) => <span className="font-medium">{row.original.fullName}</span>,
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="text-sm text-content-secondary">{row.original.reason}</span>
      ),
    },
    {
      accessorKey: 'vehiclePlate',
      header: 'Vehicle Plate',
      cell: ({ row }) => row.original.vehiclePlate ?? '\u2014',
    },
    {
      accessorKey: 'deniedByUserId',
      header: 'Added By',
      cell: ({ row }) => formatUserId(row.original.deniedByUserId),
    },
    {
      accessorKey: 'createdAt',
      header: 'Date Added',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant="outline" className={row.original.isActive ? 'border-status-success text-status-success' : ''}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(row.original);
              setFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void updateDeniedVisitor.mutateAsync({
                deniedId: row.original.id,
                isActive: !row.original.isActive,
              })
            }
          >
            {row.original.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-status-danger hover:text-status-danger"
            onClick={() => void deleteDeniedVisitor.mutateAsync(row.original.id)}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ], [deleteDeniedVisitor, updateDeniedVisitor]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add to Denied List
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        isLoading={isLoading}
        emptyMessage="No denied-entry records yet."
      />

      <DeniedVisitorForm
        communityId={communityId}
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
    </div>
  );
}
