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
        <Loader2 size={18} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-500">No access log entries yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Event
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Admin
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Details
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-mono text-xs text-gray-700">{entry.event}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">
                {entry.admin_user_id
                  ? `${entry.admin_user_id.slice(0, 8)}…`
                  : '—'}
              </td>
              <td className="max-w-xs px-4 py-3 text-xs text-gray-500">
                {entry.metadata ? (
                  <span className="truncate block max-w-[200px]">
                    {JSON.stringify(entry.metadata)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                {format(new Date(entry.created_at), 'MMM d, yyyy HH:mm')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
