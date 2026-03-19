'use client';

/**
 * SubmissionList — Table of e-sign submissions with status filtering.
 *
 * Uses useEsignSubmissions hook. Rows are clickable, navigating to the
 * submission detail page.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Card } from '@propertypro/ui';
import type { BadgeVariant } from '@propertypro/ui';
import {
  useEsignSubmissions,
} from '@/hooks/use-esign-submissions';
import type { EsignSubmissionRecord } from '@/lib/services/esign-service';
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSignature,
  Loader2,
} from 'lucide-react';

interface SubmissionListProps {
  communityId: number;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'expired', label: 'Expired' },
] as const;

interface StatusConfigEntry {
  label: string;
  variant: BadgeVariant;
  icon: typeof Clock;
}

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  declined: { label: 'Declined', variant: 'danger', icon: XCircle },
  expired: { label: 'Expired', variant: 'neutral', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'neutral', icon: XCircle },
};

const DEFAULT_STATUS: StatusConfigEntry = STATUS_CONFIG['pending']!;

function formatDate(date: Date | string | null): string {
  if (!date) return '\u2014';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function SubmissionList({ communityId }: SubmissionListProps) {
  const [statusFilter, setStatusFilter] = useState('');
  const router = useRouter();

  const { data: submissions, isLoading, error } = useEsignSubmissions(
    communityId,
    statusFilter ? { status: statusFilter } : undefined,
  );

  const handleRowClick = (submission: EsignSubmissionRecord) => {
    router.push(
      `/esign/submissions/${submission.id}?communityId=${communityId}`,
    );
  };

  return (
    <div>
      {/* Status filter */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              statusFilter === filter.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-gray-600">
            Failed to load submissions.{' '}
            {(error as Error).message}
          </p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && submissions && submissions.length === 0 && (
        <Card className="p-12 text-center">
          <FileSignature className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            No submissions yet
          </h3>
          <p className="text-sm text-gray-500">
            Send your first document for e-signing to get started.
          </p>
        </Card>
      )}

      {/* Table */}
      {!isLoading && submissions && submissions.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">
                    Document
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500">
                    Expires
                  </th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => {
                  const config = STATUS_CONFIG[submission.status] ??
                    DEFAULT_STATUS;
                  const Icon = config.icon;

                  return (
                    <tr
                      key={submission.id}
                      onClick={() => handleRowClick(submission)}
                      className="border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileSignature className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="font-medium text-gray-900 truncate max-w-[200px]">
                            {submission.messageSubject ?? `Submission #${submission.id}`}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={config.variant} size="sm">
                          <Badge.Icon>
                            <Icon className="h-3 w-3" />
                          </Badge.Icon>
                          <Badge.Label>{config.label}</Badge.Label>
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {formatDate(submission.expiresAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export default SubmissionList;
