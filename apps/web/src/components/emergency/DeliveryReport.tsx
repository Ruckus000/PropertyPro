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
  delivered: 'text-status-success',
  sent: 'text-content-link',
  queued: 'text-yellow-600',
  pending: 'text-content-disabled',
  failed: 'text-status-danger',
  undelivered: 'text-status-danger',
  skipped: 'text-content-disabled',
};

export function DeliveryReport({ recipients, recipientCount, deliveredCount, failedCount, sentCount }: Props) {
  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-md border border-edge bg-surface-card p-3 text-center">
          <div className="text-2xl font-bold text-content">{recipientCount}</div>
          <div className="text-xs text-content-tertiary">Total</div>
        </div>
        <div className="rounded-md border border-edge bg-surface-card p-3 text-center">
          <div className="text-2xl font-bold text-content-link">{sentCount}</div>
          <div className="text-xs text-content-tertiary">Sent</div>
        </div>
        <div className="rounded-md border border-edge bg-surface-card p-3 text-center">
          <div className="text-2xl font-bold text-status-success">{deliveredCount}</div>
          <div className="text-xs text-content-tertiary">Delivered</div>
        </div>
        <div className="rounded-md border border-edge bg-surface-card p-3 text-center">
          <div className="text-2xl font-bold text-status-danger">{failedCount}</div>
          <div className="text-xs text-content-tertiary">Failed</div>
        </div>
      </div>

      {/* Recipient table */}
      <div className="overflow-hidden rounded-md border border-edge bg-surface-card">
        <table className="min-w-full divide-y divide-edge">
          <thead className="bg-surface-page">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">SMS</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-content-tertiary">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {recipients.map((r) => (
              <tr key={r.userId}>
                <td className="px-4 py-2 text-sm text-content">{r.fullName}</td>
                <td className="px-4 py-2">
                  <span className={`text-sm font-medium ${STATUS_COLOR[r.smsStatus] ?? 'text-content-disabled'}`}>
                    {r.smsStatus}
                  </span>
                  {r.phone && <span className="ml-1 text-xs text-content-disabled">{r.phone}</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`text-sm font-medium ${STATUS_COLOR[r.emailStatus] ?? 'text-content-disabled'}`}>
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
