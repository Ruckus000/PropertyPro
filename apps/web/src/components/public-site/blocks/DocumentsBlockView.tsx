/**
 * DocumentsBlockView — presentational half of the documents block.
 *
 * Pure, synchronous, prop-driven. See `BlockViewProps` in ./types.
 */
import type { DocumentsBlockContent } from '@propertypro/shared';
import type { PublicDocument } from '@/lib/db/public-community-reader';
import type { BlockViewProps } from './types';
import { SiteSection, SiteSectionEmpty } from './SiteSection';

function formatDate(value: Date, timezone: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  try {
    return value.toLocaleString('en-US', { ...opts, timeZone: timezone || 'America/New_York' });
  } catch {
    return value.toLocaleString('en-US', { ...opts, timeZone: 'America/New_York' });
  }
}

export type DocumentsBlockViewProps = BlockViewProps<DocumentsBlockContent, PublicDocument[]>;

export function DocumentsBlockView({
  content,
  blockId,
  data,
  community,
  anchorId,
}: DocumentsBlockViewProps) {
  return (
    <SiteSection id={anchorId} headingId={`documents-${blockId}`} title="Documents">
      {data.length === 0 ? (
        <SiteSectionEmpty>{content?.emptyText ?? 'No documents available.'}</SiteSectionEmpty>
      ) : (
        <ul className="divide-y divide-edge border-y border-edge">
          {data.map((doc) => (
            <li key={doc.id} className="flex items-start justify-between gap-6 py-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-content">{doc.title}</p>
                {doc.description && (
                  <p className="mt-1 text-base text-content-secondary">{doc.description}</p>
                )}
                <p className="mt-1 text-sm text-content-secondary">
                  {doc.categoryName && (
                    <>
                      <span className="capitalize">{doc.categoryName}</span>
                      {' · '}
                    </>
                  )}
                  <time dateTime={doc.createdAt.toISOString()}>
                    {formatDate(doc.createdAt, community.timezone)}
                  </time>
                </p>
              </div>
              <a
                href={`/api/v1/public/documents/${doc.id}/download?communityId=${community.id}`}
                className="inline-flex min-h-11 shrink-0 items-center text-base font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                aria-label={`Download ${doc.title}`}
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </SiteSection>
  );
}
