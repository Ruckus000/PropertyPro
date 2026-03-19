'use client';

import { FileSignature } from 'lucide-react';
import type { DashboardPendingSigner } from '@/lib/dashboard/load-dashboard-data';
import { EmptyState } from '@/components/shared/empty-state';

interface DashboardEsignPendingProps {
  items: DashboardPendingSigner[];
}

export function DashboardEsignPending({ items }: DashboardEsignPendingProps) {
  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Documents to Sign</h2>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState preset="no_esign_pending" size="sm" />
        ) : (
          items.map((item) => (
          <article
            key={item.signerId}
            className="rounded-md border border-edge-subtle p-3"
          >
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 shrink-0 text-interactive" aria-hidden="true" />
              <h3 className="truncate font-medium text-content">
                {item.templateName}
              </h3>
            </div>
            {item.messageSubject && (
              <p className="mt-1 truncate text-sm text-content-secondary">
                {item.messageSubject}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between">
              {item.expiresAt && (
                <p className="text-xs text-status-warning">
                  Expires{' '}
                  {new Date(item.expiresAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              {item.slug && item.submissionExternalId && (
                <a
                  href={`/sign/${item.submissionExternalId}/${item.slug}`}
                  className="text-sm font-medium text-content-link hover:text-interactive-hover"
                >
                  Sign now
                </a>
              )}
            </div>
          </article>
          ))
        )}
      </div>
    </section>
  );
}
