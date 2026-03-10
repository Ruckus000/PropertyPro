'use client';

interface EsignStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  opened: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Opened' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  declined: { bg: 'bg-red-100', text: 'text-red-800', label: 'Declined' },
  expired: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Expired' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Cancelled' },
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  archived: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Archived' },
};

export function EsignStatusBadge({ status }: EsignStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
