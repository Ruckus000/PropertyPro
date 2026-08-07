'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface AccessLogEntry {
  id: number;
  event: string;
  admin_user_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AccessLogTableProps {
  communityId: number;
}

export function AccessLogTable({ communityId }: AccessLogTableProps) {
  const [entries, setEntries] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLog = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/support/access-log?communityId=${communityId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Failed to load access log');
          return;
        }
        setEntries(data.entries ?? []);
      } catch {
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchLog();
  }, [communityId]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 size={18} className="animate-spin text-content-disabled" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger" role="alert">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-edge bg-surface-card p-6 text-center">
        <p className="text-sm text-content-tertiary">No access log entries yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface-card">
      <table className="w-full text-sm">
        <thead className="border-b border-edge bg-surface-page">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
              Event
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
              Admin
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
              Details
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-content-tertiary">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge-subtle">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-surface-page">
              <td className="px-4 py-3 font-mono text-xs text-content-secondary">{entry.event}</td>
              <td className="px-4 py-3 font-mono text-xs text-content-tertiary">
                {entry.admin_user_id
                  ? `${entry.admin_user_id.slice(0, 8)}…`
                  : '—'}
              </td>
              <td className="max-w-xs px-4 py-3 text-xs text-content-tertiary">
                {entry.metadata ? (
                  <span className="truncate block max-w-[200px]">
                    {JSON.stringify(entry.metadata)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-content-tertiary">
                {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
