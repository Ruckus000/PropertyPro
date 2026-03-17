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
  emergency: 'bg-red-100 text-red-800',
  urgent: 'bg-orange-100 text-orange-800',
  info: 'bg-blue-100 text-blue-800',
};

function getStatusLabel(broadcast: Broadcast): { label: string; className: string } {
  if (broadcast.canceledAt) return { label: 'Canceled', className: 'text-gray-500' };
  if (broadcast.completedAt) return { label: 'Sent', className: 'text-green-600' };
  return { label: 'Draft', className: 'text-yellow-600' };
}

export function BroadcastHistoryTable({ broadcasts, communityId }: Props) {
  if (broadcasts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">No emergency broadcasts yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Severity</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Recipients</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {broadcasts.map((b) => {
            const status = getStatusLabel(b);
            return (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/emergency/${b.id}?communityId=${communityId}`}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[b.severity] ?? 'bg-gray-100 text-gray-800'}`}>
                    {b.severity}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {b.recipientCount}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
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
