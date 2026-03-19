'use client';

import { FileSignature } from 'lucide-react';
import type { DashboardPendingSigner } from '@/lib/dashboard/load-dashboard-data';

interface DashboardEsignPendingProps {
  items: DashboardPendingSigner[];
}

export function DashboardEsignPending({ items }: DashboardEsignPendingProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Documents to Sign</h2>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <article
            key={item.signerId}
            className="rounded-md border border-gray-100 p-3"
          >
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 shrink-0 text-blue-600" />
              <h3 className="truncate font-medium text-gray-900">
                {item.templateName}
              </h3>
            </div>
            {item.messageSubject && (
              <p className="mt-1 truncate text-sm text-gray-600">
                {item.messageSubject}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between">
              {item.expiresAt && (
                <p className="text-xs text-amber-600">
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
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Sign now
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
