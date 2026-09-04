/**
 * DocumentsBlockView — presentational half of the documents block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 */
import type { DocumentsBlockContent } from '@propertypro/shared';
import type { PublicDocument } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';

function formatDate(value: Date, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return value.toLocaleString('en-US', { ...opts, timeZone: timezone || 'America/New_York' });
  } catch {
    return value.toLocaleString('en-US', { ...opts, timeZone: 'America/New_York' });
  }
}

export type DocumentsBlockViewProps = BlockViewProps<DocumentsBlockContent, PublicDocument[]>;

export function DocumentsBlockView({ content, blockId, data, community }: DocumentsBlockViewProps) {
  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8" aria-labelledby={`documents-${blockId}`}>
      <div className="mx-auto max-w-3xl">
        <h2
          id={`documents-${blockId}`}
          className="font-heading text-2xl font-semibold text-content mb-6"
        >
          Documents
        </h2>
        {data.length === 0 ? (
          <p className="rounded-md border border-edge bg-surface-card p-4 text-sm text-content-secondary">
            {content?.emptyText ?? "No documents available."}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.map((doc) => (
              <li key={doc.id} className="rounded-md border border-edge bg-surface-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-content truncate">{doc.title}</p>
                    {doc.description && (
                      <p className="mt-1 text-sm text-content-secondary">{doc.description}</p>
                    )}
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                      {doc.categoryName && (
                        <span className="inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary capitalize">
                          {doc.categoryName}
                        </span>
                      )}
                      <time
                        className="text-xs text-content-secondary"
                        dateTime={doc.createdAt.toISOString()}
                      >
                        {formatDate(doc.createdAt, community.timezone)}
                      </time>
                    </div>
                  </div>
                  <a
                    href={`/api/v1/public/documents/${doc.id}/download?communityId=${community.id}`}
                    className="shrink-0 inline-flex items-center rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                    aria-label={`Download ${doc.title}`}
                  >
                    Download
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
