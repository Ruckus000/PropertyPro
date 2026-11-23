/**
 * Emergency Alerts list on the page kit. A server component: it renders client
 * parts (PageLayout, PageHeader) and hands them elements and plain data only.
 *
 * It states a title, a severity, a recipient count and one status word. A
 * manager also sees "send later" alerts: Scheduled with the time it will go
 * and the count "as of now", and Missed / Did not send with the reason in
 * plain words. A recipient's rows never carry those fields. It adds no
 * delivery or reach figure; whether a resident was not reached is on the
 * detail page.
 *
 * Order is the page's: newest first by when the alert was created, so an alert
 * scheduled today sits at the top.
 */
import { recipientCountText } from './count-noun';
import Link from 'next/link';
import { Siren } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { RecordList, RecordRow } from '@propertypro/ui/components/shared/record-row';
import {
  Section,
  SectionFirstRun,
  SectionFooter,
  SectionHeader,
} from '@propertypro/ui/components/shared/section';
import { PanelGlance, type AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import {
  broadcastStatus,
  capitalise,
  formatDate,
  formatDateTime,
  formatScheduledTime,
  sendOutcomeReasonText,
} from '@/components/emergency/broadcast-status';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';

type Row = {
  id: number;
  title: string;
  severity: string;
  initiatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
};

type ManagerRow = Row & {
  recipientCount: number;
  scheduledFor?: string | null;
  sendClaimedAt?: string | null;
  sendOutcome?: string | null;
  sendOutcomeReason?: string | null;
};

type Props =
  | {
      view: 'manager';
      broadcasts: ManagerRow[];
      canWrite: boolean;
      communityId: number;
      timeZone: string;
      about?: AccessSentence;
    }
  | { view: 'recipient'; broadcasts: Row[]; communityId: number; timeZone: string };

function EmergencyRow({
  b,
  communityId,
  timeZone,
  showCount,
}: {
  b: Row | ManagerRow;
  communityId: number;
  timeZone: string;
  showCount: boolean;
}) {
  // Only the manager view reads the scheduling fields; a recipient's row is
  // judged on sent / canceled alone, whatever else it happens to carry.
  const m: Partial<ManagerRow> = showCount ? b : {};
  const status = broadcastStatus({
    canceledAt: b.canceledAt,
    completedAt: b.completedAt,
    scheduledFor: m.scheduledFor,
    sendClaimedAt: m.sendClaimedAt,
    sendOutcome: m.sendOutcome,
  });
  const neverSent = status.word === 'Missed' || status.word === 'Did not send';
  const waiting = status.word === 'Scheduled' || status.word === 'Sending';

  let meta: string[];
  if (m.scheduledFor && (waiting || neverSent)) {
    meta = [capitalise(b.severity), `Scheduled for ${formatScheduledTime(m.scheduledFor, timeZone)}`];
  } else {
    // A scheduled alert that went out is dated when it was sent, not when it was written.
    const when = m.scheduledFor && b.completedAt ? b.completedAt : b.initiatedAt;
    meta = [capitalise(b.severity), formatDateTime(when, timeZone)];
  }
  // Also an immediate send that died part-way: it has no scheduled time but does have a reason.
  if (neverSent) meta.push(sendOutcomeReasonText(m.sendOutcomeReason));

  let outcome: string | undefined;
  if (m.recipientCount !== undefined && !neverSent && status.word !== 'Sending') {
    outcome =
      status.word === 'Scheduled'
        ? `${recipientCountText(m.recipientCount)} as of now`
        : recipientCountText(m.recipientCount);
  }
  return (
    <RecordRow
      lead={<StatusGlyph kind={status.kind} label={status.word} hideLabel />}
      title={
        <Link
          href={`/emergency/${b.id}?communityId=${communityId}`}
          className="inline-flex min-h-11 max-w-full items-center text-content-link hover:underline md:min-h-0"
        >
          <span className="truncate">{b.title}</span>
        </Link>
      }
      statusWord={status.word}
      meta={meta}
      outcome={outcome}
    />
  );
}

function SendAlertButton({ communityId }: { communityId: number }) {
  return (
    <Button asChild>
      <Link href={`/emergency/new?communityId=${communityId}`}>Send alert</Link>
    </Button>
  );
}

export function EmergencyListPage(props: Props) {
  const { communityId, timeZone, broadcasts } = props;
  const manager = props.view === 'manager';
  const canWrite = props.view === 'manager' && props.canWrite;

  // Newest alert that actually went out: sent and not canceled.
  let lastSent: ManagerRow | undefined;
  if (props.view === 'manager') {
    for (const b of props.broadcasts) {
      if (!b.completedAt || b.canceledAt) continue;
      if (!lastSent || Date.parse(b.completedAt) > Date.parse(lastSent.completedAt!)) lastSent = b;
    }
  }

  const sendButton = canWrite ? <SendAlertButton communityId={communityId} /> : undefined;

  const exampleRow = (
    <RecordList>
      <RecordRow
        lead={<StatusGlyph kind="done" label="Sent" hideLabel />}
        title="Water shut off tomorrow, 9 to noon"
        statusWord="Sent"
        meta={['Urgent', 'Today, 9:30 AM']}
        outcome="48 recipients"
      />
    </RecordList>
  );

  return (
    <PageLayout
      template="list"
      records="rows"
      header={
        <PageHeader
          title="Emergency Alerts"
          icon={<Siren />}
          description="Send urgent notices to residents. Every alert is logged with who it went to."
          actions={broadcasts.length === 0 ? undefined : sendButton}
        />
      }
      panel={
        props.view === 'manager'
          ? {
              template: 'list',
              glance: lastSent ? (
                <PanelGlance
                  figure={String(lastSent.recipientCount)}
                  unit={`${lastSent.recipientCount === 1 ? 'recipient' : 'recipients'} on the last alert`}
                  lines={[
                    [
                      'Sent',
                      formatDate(lastSent.completedAt!, timeZone),
                    ],
                  ]}
                  source="emergencyBroadcasts.recipientCount"
                />
              ) : undefined,
              about: props.about,
            }
          : undefined
      }
    >
      <Section>
        {broadcasts.length === 0 ? (
          manager ? (
            <SectionFirstRun
              headingLevel={2}
              title="No alerts sent yet"
              description="When you send one it appears here with who it went to."
              action={sendButton}
              exampleLabel="Example of a sent alert"
              example={exampleRow}
            />
          ) : (
            <SectionFirstRun
              headingLevel={2}
              title="No alerts yet"
              description="Alerts sent to you appear here."
            />
          )
        ) : (
          <>
            <SectionHeader title="Alerts" />
            <RecordList>
              {broadcasts.map((b) => (
                <EmergencyRow
                  key={b.id}
                  b={b}
                  communityId={communityId}
                  timeZone={timeZone}
                  showCount={manager}
                />
              ))}
            </RecordList>
            <SectionFooter note={`Showing ${broadcasts.length}`} />
          </>
        )}
      </Section>
    </PageLayout>
  );
}
