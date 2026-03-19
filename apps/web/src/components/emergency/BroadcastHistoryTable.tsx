"use client";
import Link from 'next/link';

interface Broadcast {
  id: number;
  title: string;
  severity: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  initiatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

interface Props {
  broadcasts: Broadcast[];
  communityId: number;
}

const SEVERITY_BADGE: Record<string, string> = {
  emergency: 'bg-status-danger-bg text-status-danger',
  urgent: 'bg-orange-100 text-orange-800',
  info: 'bg-interactive-muted text-content-link',
};

function getStatusLabel(broadcast: Broadcast): { label: string; className: string } {
  if (broadcast.canceledAt) return { label: 'Canceled', className: 'text-content-tertiary' };
  if (broadcast.completedAt) return { label: 'Sent', className: 'text-status-success' };
  return { label: 'Draft', className: 'text-yellow-600' };
}

export function BroadcastHistoryTable({ broadcasts, communityId }: Props) {
  if (broadcasts.length === 0) {
    return (
      <div className="rounded-md border border-edge bg-surface-card p-8 text-center">
        <p className="text-sm text-content-tertiary">No emergency broadcasts yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
      <table className="min-w-full divide-y divide-edge">
        <thead className="bg-surface-page">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Recipients</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {broadcasts.map((b) => {
            const status = getStatusLabel(b);
            return (
              <tr key={b.id} className="hover:bg-surface-page">
                <td className="px-4 py-3">
                  <Link
                    href={`/emergency/${b.id}?communityId=${communityId}`}
                    className="text-sm font-medium text-content-link hover:underline"
                  >
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[b.severity] ?? 'bg-surface-muted text-content'}`}>
                    {b.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-content-secondary">
                  {b.recipientCount}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-content-tertiary">
                  {new Date(b.initiatedAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
