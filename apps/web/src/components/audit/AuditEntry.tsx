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
    <div className="rounded-md border border-edge bg-surface-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block rounded bg-interactive-subtle px-2 py-0.5 text-xs font-medium text-content-link">
            {formatAction(entry.action)}
          </span>
          <span className="ml-2 text-sm text-content-secondary">
            {entry.resourceType} #{entry.resourceId}
          </span>
        </div>
        <span className="text-xs text-content-disabled">{timestamp}</span>
      </div>

      <div className="mt-2 text-xs text-content-tertiary">
        By: {userDisplay}
      </div>

      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
        <div className="mt-2">
          <details className="text-xs text-content-tertiary">
            <summary className="cursor-pointer hover:text-content-secondary">Metadata</summary>
            <pre className="mt-1 overflow-x-auto rounded bg-surface-page p-2 text-xs">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
