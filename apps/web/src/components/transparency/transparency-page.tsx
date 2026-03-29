import { Badge, Card } from '@propertypro/ui';
import type { TransparencyPageData } from '@/lib/services/transparency-service';
import { ScopeNotice } from './scope-notice';
import { DocumentChecklistSection } from './document-checklist-section';
import { MeetingNoticeTable } from './meeting-notice-table';
import { MinutesAvailabilityGrid } from './minutes-availability-grid';
import { PortalStatusSection } from './portal-status-section';
import { TransparencyFooter } from './transparency-footer';

interface Props {
  data: TransparencyPageData;
}

function communityTypeLabel(value: string): string {
  if (value === 'condo_718') return 'Condo §718';
  if (value === 'hoa_720') return 'HOA §720';
  return 'Community';
}

export function TransparencyPage({ data }: Props) {
  const cityState = [data.community.city, data.community.state].filter(Boolean).join(', ');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${data.community.name} Compliance Transparency`,
    description: 'Public transparency dashboard for document posting and meeting notice records.',
    isPartOf: {
      '@type': 'Organization',
      name: 'PropertyPro Florida',
      url: 'https://getpropertypro.com',
    },
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-12 print:max-w-none print:px-0 print:py-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-link">Compliance Transparency</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-content sm:text-4xl">{data.community.name}</h1>
          <Badge variant="info" size="md">{communityTypeLabel(data.community.communityType)}</Badge>
        </div>
        <p className="text-sm text-content-secondary">{cityState || 'Florida'} community records published by association opt-in.</p>
      </header>

      <ScopeNotice />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-content">Document Posting Status</h2>
        <DocumentChecklistSection groups={data.documents} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-content">Meeting Compliance Records</h2>
        <MeetingNoticeTable meetings={data.meetingNotices.meetings} timezone={data.community.timezone} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-content">Minutes Tracking</h2>
        <MinutesAvailabilityGrid
          months={data.minutesAvailability.months}
          monthsWithMinutes={data.minutesAvailability.monthsWithMinutes}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-content">Access Controls</h2>
        <PortalStatusSection
          passwordProtected={data.portalStatus.passwordProtected}
          individualCredentials={data.portalStatus.individualCredentials}
          publicNoticesPage={data.portalStatus.publicNoticesPage}
        />
      </section>

      <Card className="hidden print:block print:border-black print:bg-surface-card">
        <Card.Body>
          <p className="text-sm font-semibold">Printed from PropertyPro Transparency Page</p>
          <p className="text-xs">Printed at {new Date().toLocaleString('en-US')}</p>
        </Card.Body>
      </Card>

      <TransparencyFooter
        communityType={communityTypeLabel(data.community.communityType)}
        generatedAt={data.metadata.generatedAt}
      />
    </main>
  );
}
