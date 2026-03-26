'use client';

/**
 * P3-53: Audit trail viewer component with filters and pagination.
 *
 * Fetches audit log entries from /api/v1/audit-trail with cursor-based
 * pagination and filter support. Supports CSV export.
 */
import { useState, useEffect, useCallback } from 'react';
import { AuditFilters, type AuditFilterValues } from './AuditFilters';
import { AuditEntry, type AuditLogEntry } from './AuditEntry';

interface AuditTrailViewerProps {
  communityId: number;
}

interface AuditResponse {
  data: AuditLogEntry[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
    pageSize: number;
  };
  users: Record<string, string>;
}

export function AuditTrailViewer({ communityId }: AuditTrailViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<AuditFilterValues>({});

  const buildUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters.action) params.set('action', filters.action);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (cursor) params.set('cursor', cursor);
      return `/api/v1/audit-trail?${params.toString()}`;
    },
    [communityId, filters],
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) {
        const errJson = (await res.json()) as { error: { message: string } };
        throw new Error(errJson.error.message);
      }
      const json = (await res.json()) as AuditResponse;
      setEntries(json.data);
      setNextCursor(json.pagination.nextCursor);
      setHasMore(json.pagination.hasMore);
      setUsers(json.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const fetchMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      if (!res.ok) throw new Error('Failed to load more');
      const json = (await res.json()) as AuditResponse;
      setEntries((prev) => [...prev, ...json.data]);
      setNextCursor(json.pagination.nextCursor);
      setHasMore(json.pagination.hasMore);
      setUsers((prev) => ({ ...prev, ...json.users }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, buildUrl]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  function handleExportCSV() {
    const params = new URLSearchParams({
      communityId: String(communityId),
      format: 'csv',
    });
    if (filters.action) params.set('action', filters.action);
    if (filters.userId) params.set('userId', filters.userId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);

    window.open(`/api/v1/audit-trail?${params.toString()}`, '_blank');
  }

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <AuditFilters
          filters={filters}
          onFilterChange={(newFilters) => setFilters(newFilters)}
        />
        <button
          onClick={handleExportCSV}
          className="shrink-0 rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover"
        >
          Export CSV
        </button>
      </div>

      {loading && (
        <div className="text-sm text-content-tertiary">Loading audit trail...</div>
      )}

      {error && (
        <div className="text-sm text-status-danger">Error: {error}</div>
      )}

      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-content-tertiary">No audit entries found.</p>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <AuditEntry
              key={entry.id}
              entry={entry}
              userName={entry.userId ? users[entry.userId] : undefined}
            />
          ))}

          {hasMore && (
            <div className="pt-4 text-center">
              <button
                onClick={() => void fetchMore()}
                disabled={loadingMore}
                className="rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
