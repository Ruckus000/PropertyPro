'use client';

/**
 * Emergency alert detail on the page kit. Shows what the current page shows:
 * the message, the SMS text, the canceled/pending notices, and, for managers,
 * the delivery report. The panel and the Delivery section are drawn only when
 * BOTH the page says the viewer is a manager and the API returned the report;
 * the API sends the report to managers only.
 */
import { Siren } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionError, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { PageHeader } from '@/components/shared/page-header';
import { DeliveryReport } from '@/components/emergency/DeliveryReport';
import { useEmergencyBroadcast } from '@/hooks/use-emergency-broadcasts';

interface Props {
  communityId: number;
  broadcastId: number;
  isAdmin: boolean;
  timeZone: string;
  about?: AccessSentence;
}

// Same precedence as the list page (emergency-list-page.tsx) and getStatusLabel in
// BroadcastHistoryTable: canceled, then sent, then draft.
// ponytail: duplicated from emergency-list-page.tsx, which was under review when this was written. Trigger: the list page review lands; export one helper and delete this copy.
function statusOf(b: { canceledAt: string | null; completedAt: string | null }): {
  kind: StatusGlyphKind;
  word: string;
} {
  if (b.canceledAt) return { kind: 'not-started', word: 'Canceled' };
  if (b.completedAt) return { kind: 'done', word: 'Sent' };
  return { kind: 'in-progress', word: 'Draft' };
}

const capitalise = (s: string) => (s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1));

export function EmergencyDetailPage({ communityId, broadcastId, isAdmin, timeZone, about }: Props) {
  const { data: report, isLoading, error } = useEmergencyBroadcast(communityId, broadcastId);

  if (isLoading) {
    return (
      <PageLayout template="detail" records="table" header={<PageHeader title="Emergency alert" icon={<Siren />} />}>
        <Section aria-busy="true">
          <SectionHeader title="Message" />
          <p className="px-4 py-4 text-sm text-content-secondary">Loading the alert...</p>
        </Section>
      </PageLayout>
    );
  }

  if (error || !report) {
    return (
      <PageLayout template="detail" records="table" header={<PageHeader title="Emergency alert" icon={<Siren />} />}>
        <Section>
          <SectionError message="We couldn't load this alert. Please try again." />
        </Section>
      </PageLayout>
    );
  }

  // Only a manager's response carries the delivery report; a non-admin never sees it.
  const managerReport = isAdmin && 'recipients' in report ? report : null;
  const status = managerReport ? statusOf(managerReport) : null;
  const sentAt = managerReport?.completedAt;

  const banner = managerReport?.canceledAt ? (
    <p className="rounded-md border border-edge bg-surface-hover p-3 text-sm text-content-secondary">
      This broadcast was canceled.
    </p>
  ) : managerReport && !managerReport.completedAt ? (
    <p className="rounded-md border border-edge bg-status-warning-bg p-3 text-sm text-status-warning">
      This broadcast is pending confirmation.
    </p>
  ) : undefined;

  return (
    <PageLayout
      template="detail"
      records="table"
      banner={banner}
      header={
        <PageHeader
          title={report.title}
          icon={<Siren />}
          status={status ? <StatusGlyph kind={status.kind} label={status.word} /> : undefined}
        />
      }
      panel={
        managerReport
          ? {
              template: 'detail',
              details: (
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-content-secondary">Severity</dt>
                    <dd className="text-content">{capitalise(managerReport.severity)}</dd>
                  </div>
                  {sentAt ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-content-secondary">Sent</dt>
                      <dd className="text-content">
                        {new Intl.DateTimeFormat('en-US', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone,
                        }).format(new Date(sentAt))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ),
              about,
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <Section>
          <SectionHeader title="Message" />
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="whitespace-pre-wrap text-sm text-content">{report.body}</p>
            {managerReport?.smsBody ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-content-secondary">SMS</span>
                <p className="text-sm text-content">{managerReport.smsBody}</p>
              </div>
            ) : null}
          </div>
        </Section>
        {managerReport?.completedAt ? (
          <Section>
            <SectionHeader title="Delivery" />
            <div className="px-4 py-4">
              <DeliveryReport
                recipients={managerReport.recipients}
                recipientCount={managerReport.recipientCount}
                deliveredCount={managerReport.deliveredCount}
                failedCount={managerReport.failedCount}
                sentCount={managerReport.sentCount}
              />
            </div>
          </Section>
        ) : null}
      </div>
    </PageLayout>
  );
}
