/**
 * Emergency Alerts list on the page kit. A server component: it renders client
 * parts (PageLayout, PageHeader) and hands them elements and plain data only.
 *
 * It states only what BroadcastHistoryTable states today: a title, a severity,
 * a recipient count and one of three statuses. It adds no delivery or reach
 * figure; whether a resident was not reached is on the detail page.
 */
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
import { broadcastStatus, capitalise, formatDate, formatDateTime } from '@/components/emergency/broadcast-status';
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

type ManagerRow = Row & { recipientCount: number };

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
  const status = broadcastStatus(b);
  const when = formatDateTime(b.initiatedAt, timeZone);
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
      meta={[capitalise(b.severity), when]}
      outcome={showCount && 'recipientCount' in b ? `${b.recipientCount} recipients` : undefined}
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
                  unit="recipients on the last alert"
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
