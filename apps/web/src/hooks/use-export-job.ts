'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

/**
 * Async full-archive export: request, poll, cancel, download.
 *
 * Distinct from `useExportData`, which drives the synchronous metadata-only CSV
 * route. That one is still the right tool for a 50-unit HOA wanting a spreadsheet;
 * this one produces the complete statutory record set including document files,
 * which takes minutes and cannot be delivered in a single request.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */

export type ExportJobStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface ExportJobManifestWarning {
  code: string;
  detail: string;
  documentId?: number;
}

export interface ExportJobManifest {
  tables?: Array<{ name: string; file: string; rowCount: number; complete: boolean }>;
  documents?: { expected: number; included: number; bytes: number };
  warnings?: ExportJobManifestWarning[];
}

export interface ExportJob {
  id: number;
  communityId: number;
  status: ExportJobStatus;
  includeDocumentFiles: boolean;
  manifest: ExportJobManifest;
  warningCount: number;
  totalBytes: number | null;
  partCount: number | null;
  errorMessage: string | null;
  queuedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface ExportJobPart {
  id: number;
  partIndex: number;
  byteSize: number;
  fileCount: number;
}

/** Statuses in which the server is still working and the client should poll. */
const IN_FLIGHT: readonly ExportJobStatus[] = ['queued', 'running'];

export function isExportJobInFlight(status: ExportJobStatus): boolean {
  return IN_FLIGHT.includes(status);
}

const KEYS = {
  list: (communityId: number) => ['export-jobs', communityId] as const,
  detail: (communityId: number, jobId: number) =>
    ['export-jobs', communityId, jobId] as const,
};

/**
 * The community's export jobs, newest first.
 *
 * Polls only while something is in flight. A worker tick is every 5 minutes and
 * a large export spans several, so 10s is responsive without being a busy-wait;
 * once nothing is running the interval drops to `false` rather than idling.
 */
export function useExportJobs(communityId: number) {
  return useQuery({
    queryKey: KEYS.list(communityId),
    queryFn: () =>
      requestJson<{ jobs: ExportJob[] }>(
        `/api/v1/export/jobs?communityId=${communityId}`,
      ).then((r) => r.jobs),
    enabled: communityId > 0,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      if (!jobs) return false;
      return jobs.some((job) => isExportJobInFlight(job.status)) ? 10_000 : false;
    },
  });
}

/** One job plus its completed volumes. */
export function useExportJob(communityId: number, jobId: number | null) {
  return useQuery({
    queryKey: KEYS.detail(communityId, jobId ?? 0),
    queryFn: () =>
      requestJson<{ job: ExportJob; parts: ExportJobPart[] }>(
        `/api/v1/export/jobs/${jobId}?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && !!jobId,
    refetchInterval: (query) =>
      query.state.data && isExportJobInFlight(query.state.data.job.status) ? 10_000 : false,
  });
}

/**
 * Queue an export.
 *
 * `deduplicated` is not an error: the server returns the community's existing
 * in-flight job rather than starting a second copy of the entire association.
 * The UI reports it as "already running", not as a failure.
 */
export function useRequestExportJob(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation<
    { job: ExportJob; deduplicated: boolean },
    Error,
    { includeDocumentFiles?: boolean } | void
  >({
    mutationFn: (variables) =>
      requestJson<{ job: ExportJob; deduplicated: boolean }>('/api/v1/export/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityId,
          includeDocumentFiles: variables?.includeDocumentFiles ?? true,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list(communityId) });
    },
  });
}

export function useCancelExportJob(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation<{ cancelled: boolean }, Error, number>({
    mutationFn: (jobId) =>
      requestJson<{ cancelled: boolean }>(`/api/v1/export/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEYS.list(communityId) });
    },
  });
}

/**
 * Mint a signed URL for one volume.
 *
 * A mutation rather than a query on purpose: the URL is short-lived and every
 * call is audit-logged as "this user downloaded the whole association", so it
 * must fire on an explicit click and never be cached, refetched or prefetched.
 */
export function useDownloadExportPart(communityId: number) {
  return useMutation<
    { url: string; fileName: string; byteSize: number; expiresInSeconds: number },
    Error,
    { jobId: number; partIndex: number }
  >({
    mutationFn: ({ jobId, partIndex }) =>
      requestJson(
        `/api/v1/export/jobs/${jobId}/parts/${partIndex}/download?communityId=${communityId}`,
      ),
  });
}
