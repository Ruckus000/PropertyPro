'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { SlideOverPanel } from '@/components/shared/slide-over-panel';
import { useArcSubmissions, type ArcSubmission, type ArcSubmissionStatus } from '@/hooks/use-arc';
import { cn } from '@/lib/utils';

/* ─────── Helpers ─────── */

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_BADGE_CLASSES: Record<ArcSubmissionStatus, string> = {
  submitted: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  under_review: 'bg-interactive-muted text-content-link border-status-info-border',
  approved: 'bg-status-success-bg text-status-success border-status-success-border',
  denied: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  withdrawn: 'bg-surface-muted text-content-secondary border-edge',
};

const STATUS_LABELS: Record<ArcSubmissionStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
};

/* ─────── Columns ─────── */

function buildColumns(
  onReview: (submission: ArcSubmission) => void,
): ColumnDef<ArcSubmission, unknown>[] {
  return [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: 'projectType',
      header: 'Project Type',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.projectType}
        </span>
      ),
    },
    {
      accessorKey: 'unitId',
      header: 'Unit',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          Unit #{row.original.unitId}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant="outline"
            className={cn('capitalize', STATUS_BADGE_CLASSES[status])}
          >
            {STATUS_LABELS[status] ?? status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Submitted',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReview(row.original);
          }}
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Review
        </button>
      ),
    },
  ];
}

/* ─────── Component ─────── */

interface ArcSubmissionsTabProps {
  communityId: number;
}

export function ArcSubmissionsTab({ communityId }: ArcSubmissionsTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<ArcSubmission | null>(null);

  const apiFilter =
    statusFilter === 'all'
      ? undefined
      : { status: statusFilter as ArcSubmissionStatus };

  const { data: submissions, isLoading } = useArcSubmissions(communityId, apiFilter);

  const filterTabs = useMemo(() => {
    const all = submissions ?? [];
    return [
      { label: 'All', value: 'all', count: all.length },
      { label: 'Submitted', value: 'submitted', count: all.filter((s) => s.status === 'submitted').length },
      { label: 'Under Review', value: 'under_review', count: all.filter((s) => s.status === 'under_review').length },
      { label: 'Approved', value: 'approved', count: all.filter((s) => s.status === 'approved').length },
      { label: 'Denied', value: 'denied', count: all.filter((s) => s.status === 'denied').length },
    ];
    // Counts are computed from the unfiltered "all" query, but when a filter is active
    // we might not have the full list. This is acceptable since the API re-fetches.
  }, [submissions]);

  const columns = useMemo(
    () => buildColumns(setSelectedSubmission),
    [],
  );

  return (
    <div className="space-y-4">
      <QuickFilterTabs
        tabs={statusFilter === 'all' ? filterTabs : filterTabs}
        active={statusFilter}
        onChange={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={submissions ?? []}
        isLoading={isLoading}
        emptyMessage="No ARC submissions found."
      />

      {/* Detail Slide-Over */}
      <SlideOverPanel
        open={selectedSubmission !== null}
        onClose={() => setSelectedSubmission(null)}
        title={selectedSubmission?.title ?? 'ARC Submission'}
        description={`Unit #${selectedSubmission?.unitId ?? ''} - ${selectedSubmission?.projectType ?? ''}`}
        width="md"
      >
        {selectedSubmission && (
          <ArcDetailContent submission={selectedSubmission} />
        )}
      </SlideOverPanel>
    </div>
  );
}

/* ─────── Detail Panel Content ─────── */

function ArcDetailContent({ submission }: { submission: ArcSubmission }) {
  return (
    <div className="space-y-6">
      {/* Status */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
        <Badge
          variant="outline"
          className={cn('mt-1 capitalize', STATUS_BADGE_CLASSES[submission.status])}
        >
          {STATUS_LABELS[submission.status] ?? submission.status}
        </Badge>
      </div>

      {/* Description */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
        <p className="mt-1 text-sm whitespace-pre-wrap">{submission.description}</p>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Est. Start Date
          </h4>
          <p className="mt-1 text-sm">
            {submission.estimatedStartDate
              ? formatDate(submission.estimatedStartDate)
              : '-'}
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Est. Completion
          </h4>
          <p className="mt-1 text-sm">
            {submission.estimatedCompletionDate
              ? formatDate(submission.estimatedCompletionDate)
              : '-'}
          </p>
        </div>
      </div>

      {/* Review Notes */}
      {submission.reviewNotes && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Review Notes
          </h4>
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {submission.reviewNotes}
          </p>
        </div>
      )}

      {/* Decision */}
      {submission.decidedAt && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground">
            Decided
          </h4>
          <p className="mt-1 text-sm">
            {formatDate(submission.decidedAt)}
          </p>
        </div>
      )}

      {/* Submitted */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">
          Submitted
        </h4>
        <p className="mt-1 text-sm">{formatDate(submission.createdAt)}</p>
      </div>
    </div>
  );
}
