'use client';

/**
 * Emergency alert detail on the page kit. Shows
 * the message, the SMS text, the canceled/pending notices, and, for managers,
 * the delivery report. The panel and the Delivery section are drawn only when
 * BOTH the page says the viewer is a manager and the API returned the report;
 * the API sends the report to managers only.
 */
import { Siren } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionError, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { PageHeader } from '@/components/shared/page-header';
import { broadcastStatus, capitalise, formatDateTime } from '@/components/emergency/broadcast-status';
import { DeliveryReport } from '@/components/emergency/DeliveryReport';
import { useEmergencyBroadcast } from '@/hooks/use-emergency-broadcasts';

interface Props {
  communityId: number;
  broadcastId: number;
  isAdmin: boolean;
  timeZone: string;
  about?: AccessSentence;
}

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
  // Every viewer gets the status. A resident's response carries only completedAt
  // (they are sent sent alerts only) and no canceledAt, so that is all it proves.
  const status = broadcastStatus(
    { completedAt: report.completedAt, canceledAt: 'canceledAt' in report ? report.canceledAt : null },
    { unsentWord: 'Pending' },
  );
  const sentAt = report.completedAt;

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
          status={<StatusGlyph kind={status.kind} label={status.word} />}
        />
      }
      panel={
        managerReport
          ? {
              template: 'detail',
              details: (
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                  <dt className="text-content-secondary">Severity</dt>
                  <dd className="text-content">{capitalise(managerReport.severity)}</dd>
                  {sentAt ? (
                    <>
                      <dt className="text-content-secondary">Sent</dt>
                      <dd className="text-content">{formatDateTime(sentAt, timeZone)}</dd>
                    </>
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
            <p className="text-xs text-content-secondary">
              {[capitalise(report.severity), sentAt ? formatDateTime(sentAt, timeZone) : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
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
