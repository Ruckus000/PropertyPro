'use client';

/**
 * P3-53: Single audit log entry display component.
 */

export interface AuditLogEntry {
  id: number;
  userId: string;
  communityId: number;
  action: string;
  resourceType: string;
  resourceId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditEntryProps {
  entry: AuditLogEntry;
  userName?: string;
}

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditEntry({ entry, userName }: AuditEntryProps) {
  const timestamp = new Date(entry.createdAt).toLocaleString();
  const userDisplay = userName ?? entry.userId.substring(0, 8) + '...';

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
            {formatAction(entry.action)}
          </span>
          <span className="ml-2 text-sm text-gray-600">
            {entry.resourceType} #{entry.resourceId}
          </span>
        </div>
        <span className="text-xs text-gray-400">{timestamp}</span>
      </div>

      <div className="mt-2 text-xs text-gray-500">
        By: {userDisplay}
      </div>

      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
        <div className="mt-2">
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">Metadata</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
