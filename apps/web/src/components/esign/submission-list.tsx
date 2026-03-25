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
import {
  useEsignSubmissions,
} from '@/hooks/use-esign-submissions';
import type { EsignSubmissionRecord } from '@/lib/services/esign-service';
import {
  AlertTriangle,
  FileSignature,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ESIGN_STATUS_CONFIG } from './esign-status-config';
import type { EsignStatusConfigEntry } from './esign-status-config';

interface SubmissionListProps {
  communityId: number;
}

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing_failed', label: 'Processing Failed' },
  { value: 'expired', label: 'Expired' },
] as const;

const DEFAULT_STATUS: EsignStatusConfigEntry = ESIGN_STATUS_CONFIG['pending']!;

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
      <div className="flex gap-1 mb-4 bg-surface-muted rounded-md p-1 w-fit">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-quick ${
              statusFilter === filter.value
                ? 'bg-surface-card text-content shadow-e0'
                : 'text-content-tertiary hover:text-content-secondary'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-4 w-[200px]" />
              <Skeleton className="h-6 w-[80px] rounded-full" />
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-8 w-8 rounded-md ml-auto" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="p-6 text-center">
          <AlertTriangle className="h-8 w-8 mx-auto text-status-warning mb-2" />
          <p className="text-sm text-content-secondary">
            Failed to load submissions.{' '}
            {(error as Error).message}
          </p>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && submissions && submissions.length === 0 && (
        <Card className="p-12 text-center">
          <FileSignature className="h-12 w-12 mx-auto text-content-disabled mb-4" />
          <h3 className="text-lg font-medium text-content mb-1">
            No submissions yet
          </h3>
          <p className="text-sm text-content-tertiary">
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
                <tr className="border-b bg-surface-page/50">
                  <th className="text-left py-3 px-4 font-medium text-content-tertiary">
                    Document
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-content-tertiary">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-content-tertiary">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 font-medium text-content-tertiary">
                    Expires
                  </th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => {
                  const effectiveStatus = submission.effectiveStatus ?? submission.status;
                  const config = ESIGN_STATUS_CONFIG[effectiveStatus] ??
                    DEFAULT_STATUS;
                  const Icon = config.icon;

                  return (
                    <tr
                      key={submission.id}
                      onClick={() => handleRowClick(submission)}
                      className="border-b last:border-0 hover:bg-surface-hover cursor-pointer transition-colors duration-quick"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <FileSignature className="h-4 w-4 text-content-disabled shrink-0" />
                          <span className="font-medium text-content truncate max-w-[200px]">
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
                      <td className="py-3 px-4 text-content-secondary">
                        {formatDate(submission.createdAt)}
                      </td>
                      <td className="py-3 px-4 text-content-secondary">
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
