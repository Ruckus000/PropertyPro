"use client";

interface Recipient {
  userId: string;
  email: string | null;
  phone: string | null;
  fullName: string;
  smsStatus: string;
  emailStatus: string;
  smsSentAt: string | null;
  smsDeliveredAt: string | null;
  emailSentAt: string | null;
}

interface Props {
  recipients: Recipient[];
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  sentCount: number;
}

const STATUS_COLOR: Record<string, string> = {
  delivered: 'text-green-600',
  sent: 'text-blue-600',
  queued: 'text-yellow-600',
  pending: 'text-gray-400',
  failed: 'text-red-600',
  undelivered: 'text-red-600',
  skipped: 'text-gray-400',
};

export function DeliveryReport({ recipients, recipientCount, deliveredCount, failedCount, sentCount }: Props) {
  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-gray-900">{recipientCount}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{sentCount}</div>
          <div className="text-xs text-gray-500">Sent</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{deliveredCount}</div>
          <div className="text-xs text-gray-500">Delivered</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{failedCount}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
      </div>

      {/* Recipient table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">SMS</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {recipients.map((r) => (
              <tr key={r.userId}>
                <td className="px-4 py-2 text-sm text-gray-900">{r.fullName}</td>
                <td className="px-4 py-2">
                  <span className={`text-sm font-medium ${STATUS_COLOR[r.smsStatus] ?? 'text-gray-400'}`}>
                    {r.smsStatus}
                  </span>
                  {r.phone && <span className="ml-1 text-xs text-gray-400">{r.phone}</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-sm font-medium ${STATUS_COLOR[r.emailStatus] ?? 'text-gray-400'}`}>
                    {r.emailStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
