'use client';

import { useState } from 'react';
import {
  isExportJobInFlight,
  useCancelExportJob,
  useDownloadExportPart,
  useExportJob,
  useExportJobs,
  useRequestExportJob,
  type ExportJob,
} from '@/hooks/use-export-job';

interface ExportJobCardProps {
  communityId: number;
}

/**
 * Full-archive export: request, watch, download.
 *
 * The card deliberately shows warnings as prominently as the download button.
 * An export that looks complete but silently dropped a document file is worse
 * than one that failed, because the gap is only discovered when the record is
 * needed — so the manifest's warnings are surfaced here, in the poll response,
 * and in the completion email.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
export function ExportJobCard({ communityId }: ExportJobCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const jobsQuery = useExportJobs(communityId);
  const requestJob = useRequestExportJob(communityId);
  const cancelJob = useCancelExportJob(communityId);

  // Newest job only — older ones have expired archives and nothing to offer.
  const latest: ExportJob | undefined = jobsQuery.data?.[0];
  const detail = useExportJob(communityId, latest?.id ?? null);
  const job = detail.data?.job ?? latest;
  const parts = detail.data?.parts ?? [];

  const inFlight = job ? isExportJobInFlight(job.status) : false;
  const warnings = job?.manifest?.warnings ?? [];

  async function handleRequest() {
    setError(null);
    setNotice(null);
    try {
      const result = await requestJob.mutateAsync({ includeDocumentFiles: true });
      setNotice(
        result.deduplicated
          ? 'An export is already being prepared for this community.'
          : 'Export started. This can take several minutes — we’ll email you when it’s ready.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the export.');
    }
  }

  async function handleCancel() {
    if (!job) return;
    setError(null);
    try {
      await cancelJob.mutateAsync(job.id);
      setNotice('Export cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel the export.');
    }
  }

  return (
    <div className="rounded-md border border-edge bg-surface-card p-5">
      <h3 className="text-base font-semibold text-content">
        Full archive
      </h3>
      <p className="mt-1 text-sm text-content-secondary">
        Every record we hold for this community, including the uploaded document
        files themselves. Prepared in the background; you can close this page.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRequest}
          disabled={requestJob.isPending || inFlight}
          aria-busy={requestJob.isPending}
          className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50"
        >
          {inFlight ? 'Preparing…' : 'Prepare full archive'}
        </button>

        {inFlight && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelJob.isPending}
            className="rounded-md border border-edge px-4 py-2 text-sm font-medium text-content hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="mt-3 text-sm text-content-secondary">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}

      {job && <JobStatus job={job} />}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
          <p className="text-sm font-medium text-status-warning">
            {warnings.length === 1
              ? '1 item could not be included'
              : `${warnings.length} items could not be included`}
          </p>
          <ul className="mt-2 space-y-1 text-sm text-content-secondary">
            {warnings.slice(0, 10).map((warning, index) => (
              <li key={`${warning.code}-${warning.documentId ?? index}`}>
                {warning.detail}
              </li>
            ))}
          </ul>
          {warnings.length > 10 && (
            <p className="mt-2 text-sm text-content-secondary">
              The complete list is in <code>manifest.json</code> inside the archive.
            </p>
          )}
        </div>
      )}

      {job?.status === 'ready' && parts.length > 0 && (
        <PartDownloads communityId={communityId} jobId={job.id} parts={parts} />
      )}
    </div>
  );
}

function JobStatus({ job }: { job: ExportJob }) {
  const label: Record<ExportJob['status'], string> = {
    queued: 'Queued — preparation starts within a few minutes.',
    running: 'Preparing your archive…',
    ready: 'Ready to download.',
    failed: 'Preparation failed.',
    expired: 'This archive has been deleted. Request a new one — there is no charge.',
    cancelled: 'Cancelled.',
  };

  return (
    <div className="mt-4 text-sm text-content-secondary">
      <p>{label[job.status]}</p>
      {job.status === 'failed' && job.errorMessage && (
        <p role="alert" className="mt-1 text-status-danger">
          {job.errorMessage}
        </p>
      )}
      {job.status === 'ready' && job.expiresAt && (
        <p className="mt-1">
          These files are deleted on{' '}
          {new Date(job.expiresAt).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
          .
        </p>
      )}
    </div>
  );
}

function PartDownloads({
  communityId,
  jobId,
  parts,
}: {
  communityId: number;
  jobId: number;
  parts: Array<{ id: number; partIndex: number; byteSize: number }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const download = useDownloadExportPart(communityId);

  async function handleDownload(partIndex: number) {
    setError(null);
    try {
      // The signed URL is minted per click and audit-logged; it is never
      // prefetched or cached, so this cannot happen at render time.
      const { url } = await download.mutateAsync({ jobId, partIndex });
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the download.');
    }
  }

  return (
    <div className="mt-4">
      {parts.length > 1 && (
        <p className="mb-2 text-sm text-content-secondary">
          The archive was split into {parts.length} files by size. Download each one.
        </p>
      )}
      <ul className="space-y-2">
        {parts.map((part) => (
          <li key={part.id} className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleDownload(part.partIndex)}
              disabled={download.isPending}
              className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2 disabled:opacity-50"
            >
              Download part {part.partIndex + 1}
            </button>
            <span className="text-sm text-content-secondary">
              {formatBytes(part.byteSize)}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
