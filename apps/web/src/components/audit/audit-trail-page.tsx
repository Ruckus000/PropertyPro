'use client';

/**
 * The Audit Trail route on the page kit. `AuditTrailViewer` keeps all the
 * state and builds every part (it is also embedded in the compliance page's
 * history dialog); this file only places those parts in a `PageLayout`.
 *
 * A client component because the header action follows the URL: Download CSV
 * for the whole list, Print record once the list is narrowed to one person or
 * item. What is listed, downloaded and printed is the viewer's, unchanged.
 */
import { History } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import {
  Section,
  SectionFooter,
  SectionHeader,
  SectionToolbar,
} from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { PageHeader } from '@/components/shared/page-header';
import { AuditViewPicker } from './AuditFilters';
import { AUDIT_TRAIL_INTRO, AuditTrailViewer, type AuditTrailParts } from './AuditTrailViewer';

interface AuditTrailPageProps {
  communityId: number;
  /** The community's IANA time zone; every time on the page is shown in it. */
  timeZone: string;
  /** Built by the server page with describeAccess; absent when no role can read. */
  about?: AccessSentence;
}

export function AuditTrailPage({ communityId, timeZone, about }: AuditTrailPageProps) {
  const frame = (parts: AuditTrailParts) => (
    <>
      <PageLayout
        template="list"
        header={
          <PageHeader
            title="Audit Trail"
            icon={<History />}
            description={AUDIT_TRAIL_INTRO}
            actions={parts.exportAction({ csvLabel: 'Download CSV' })}
          />
        }
        // "About" alone is not drawn as a panel: PageLayout puts the sentence under the header.
        panel={{ template: 'list', about }}
      >
        {/* overflow-visible: the search suggestions open over the list and must not be cut at the section's edge. */}
        <Section className="overflow-visible" aria-busy={parts.isPending} data-testid="audit-trail-section">
          {parts.subject !== null && <SectionHeader title={parts.subject} description={parts.intro} />}
          {/* Not a SectionToolbar: its filter slot scrolls sideways, which would clip the suggestions list. */}
          <div className="flex flex-col gap-3 border-b border-edge px-4 py-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">{parts.search}</div>
            {parts.period}
          </div>
          <SectionToolbar filters={<AuditViewPicker view={parts.view} onView={parts.onView} tone="ink" />} />
          <div className="px-4 pb-4" aria-live="polite" aria-busy={parts.isPending}>
            {parts.body}
          </div>
          {parts.footerNote !== null && (
            <SectionFooter
              note={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">{parts.footerNote}</span>}
            >
              {parts.loadMore}
            </SectionFooter>
          )}
        </Section>
      </PageLayout>
      {parts.sheet}
    </>
  );

  return <AuditTrailViewer communityId={communityId} timeZone={timeZone} frame={frame} />;
}
