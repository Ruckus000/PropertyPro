'use client';

/**
 * Emergency alert detail on the page kit. Shows
 * the message, the SMS text, the canceled/pending notices, and, for managers,
 * the delivery report. The panel and the Delivery section are drawn only when
 * BOTH the page says the viewer is a manager and the API returned the report;
 * the API sends the report to managers only.
 *
 * A manager also sees a "send later" alert here: when it will go, the count as
 * of now, "Cancel scheduled alert" (behind a confirm dialog) and "Send again
 * later". A missed or failed alert shows why in plain words. The Delivery
 * section is drawn only for an alert that was actually sent.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Siren } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionError, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  broadcastStatus,
  capitalise,
  formatDateTime,
  formatDateTimeWithZone,
  formatScheduledTime,
  sendOutcomeReasonText,
} from '@/components/emergency/broadcast-status';
import { DeliveryReport } from '@/components/emergency/DeliveryReport';
import { cn } from '@/lib/utils';
import { useCancelBroadcast, useEmergencyBroadcast } from '@/hooks/use-emergency-broadcasts';

interface Props {
  communityId: number;
  broadcastId: number;
  isAdmin: boolean;
  timeZone: string;
  about?: AccessSentence;
}

export function EmergencyDetailPage({ communityId, broadcastId, isAdmin, timeZone, about }: Props) {
  const { data: report, isLoading, error, refetch } = useEmergencyBroadcast(communityId, broadcastId);
  const cancelMutation = useCancelBroadcast();
  /** A cancel request failed; what to SAY is read off the refreshed alert, below. */
  const [cancelFailed, setCancelFailed] = useState(false);
  const [justCanceled, setJustCanceled] = useState(false);
  const canceledNoticeRef = useRef<HTMLParagraphElement>(null);
  const isCanceled = Boolean(report && 'canceledAt' in report && report.canceledAt);

  // The cancel button (and the dialog that held focus) is gone once the alert
  // is canceled. Put focus on the notice that says so, not on <body>.
  useEffect(() => {
    if (justCanceled && isCanceled) {
      canceledNoticeRef.current?.focus();
      setJustCanceled(false);
    }
  }, [justCanceled, isCanceled]);

  function handleCancelScheduled() {
    setCancelFailed(false);
    cancelMutation.mutate(
      { broadcastId, communityId },
      {
        // Success invalidates this alert's query (in the hook), so the page turns Canceled.
        onSuccess: () => setJustCanceled(true),
        onError: async () => {
          // Refresh first: the message depends on what the alert has become.
          await refetch();
          setCancelFailed(true);
        },
      },
    );
  }

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
    {
      completedAt: report.completedAt,
      canceledAt: 'canceledAt' in report ? report.canceledAt : null,
      scheduledFor: managerReport?.scheduledFor,
      sendClaimedAt: managerReport?.sendClaimedAt,
      sendOutcome: managerReport?.sendOutcome,
    },
    { unsentWord: 'Pending' },
  );
  const sentAt = report.completedAt;
  const scheduledFor = managerReport?.scheduledFor ?? null;
  const isScheduled = status.word === 'Scheduled';
  const neverSent = status.word === 'Missed' || status.word === 'Did not send';
  // Spec: a sent or scheduled alert (missed and failed ones were scheduled) can be sent again.
  // (An immediate send that died part-way has no scheduled time but is offered it too.)
  const canSendAgain = Boolean(
    managerReport && (managerReport.completedAt || scheduledFor || neverSent),
  );
  // A send that failed part-way may have reached some people: show who.
  const reachedBeforeFailing =
    managerReport?.sendOutcome === 'failed' &&
    managerReport.recipients.some(
      (r) =>
        ['sent', 'delivered'].includes(r.emailStatus) ||
        ['queued', 'sent', 'delivered'].includes(r.smsStatus),
    );

  // After a failed cancel the alert was refetched; say what it is NOW.
  let cancelNotice: { status: 'danger' | 'info'; text: string } | null = null;
  if (cancelFailed && managerReport) {
    if (managerReport.canceledAt) {
      cancelNotice = { status: 'info', text: 'This alert was already canceled.' };
    } else if (managerReport.completedAt) {
      cancelNotice = {
        status: 'danger',
        text: 'This alert has already been sent, so it can no longer be canceled.',
      };
    } else if (managerReport.sendOutcome === 'missed') {
      cancelNotice = { status: 'info', text: 'This alert was missed and will not be sent, so there is nothing to cancel.' };
    } else if (managerReport.sendClaimedAt || managerReport.sendOutcome) {
      cancelNotice = {
        status: 'danger',
        text: 'This alert has already started sending, so it can no longer be canceled.',
      };
    } else {
      cancelNotice = { status: 'danger', text: "We couldn't cancel this alert. Please try again." };
    }
  }

  const noticeClass = 'rounded-md border border-edge p-3 text-sm';
  let notice: ReactNode;
  if (!managerReport) {
    notice = undefined;
  } else if (managerReport.canceledAt) {
    notice = (
      <p
        ref={canceledNoticeRef}
        tabIndex={-1}
        className={cn(noticeClass, 'bg-surface-hover text-content-secondary')}
      >
        This broadcast was canceled.
      </p>
    );
  } else if (managerReport.completedAt) {
    notice = undefined;
  } else if (neverSent) {
    notice = (
      <AlertBanner
        status="danger"
        title={status.word === 'Missed' ? 'This alert was not sent.' : 'This alert did not send.'}
        description={
          status.word === 'Missed'
            ? `${sendOutcomeReasonText(managerReport.sendOutcomeReason)} To send it at a new time, use Send again later.`
            : `${sendOutcomeReasonText(managerReport.sendOutcomeReason)} Some residents may already have received it. To send it at a new time, use Send again later.`
        }
      />
    );
  } else if (status.word === 'Sending') {
    notice = (
      <p className={cn(noticeClass, 'bg-status-info-bg text-status-info')}>
        This alert is being sent now.
      </p>
    );
  } else if (scheduledFor) {
    notice = (
      <p className={cn(noticeClass, 'bg-surface-hover text-content')}>
        Scheduled for <strong>{formatDateTimeWithZone(scheduledFor, timeZone)}</strong>. It sends
        within 5 minutes after that time, to{' '}
        <strong>{managerReport.recipientCount} recipients as of now</strong>. Recipients are worked
        out again when it sends.
      </p>
    );
  } else {
    notice = (
      <p className={cn(noticeClass, 'bg-status-warning-bg text-status-warning')}>
        This broadcast is pending confirmation.
      </p>
    );
  }

  const banner =
    notice || cancelNotice ? (
      <div className="flex flex-col gap-3">
        {cancelNotice ? <AlertBanner status={cancelNotice.status} title={cancelNotice.text} /> : null}
        {notice}
      </div>
    ) : undefined;

  const actions =
    canSendAgain || isScheduled ? (
      <>
        {canSendAgain ? (
          <Button asChild variant="outline">
            <Link href={`/emergency/new?communityId=${communityId}&from=${broadcastId}`}>
              Send again later
            </Link>
          </Button>
        ) : null}
        {isScheduled ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? 'Canceling...' : 'Cancel scheduled alert'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this scheduled alert?</AlertDialogTitle>
                <AlertDialogDescription>
                  It will not be sent, and a canceled alert cannot be scheduled again. To send it
                  after all, use Send again later.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep scheduled</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  onClick={handleCancelScheduled}
                >
                  Cancel alert
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </>
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
          actions={actions}
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
                  {scheduledFor ? (
                    <>
                      <dt className="text-content-secondary">Scheduled for</dt>
                      <dd className="text-content">{formatScheduledTime(scheduledFor, timeZone)}</dd>
                    </>
                  ) : null}
                  {isScheduled ? (
                    <>
                      <dt className="text-content-secondary">Recipients</dt>
                      <dd className="text-content">{managerReport.recipientCount} as of now</dd>
                    </>
                  ) : null}
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
        {managerReport && (managerReport.completedAt || reachedBeforeFailing) ? (
          <Section>
            <SectionHeader title={managerReport.completedAt ? 'Delivery' : 'Delivery before it stopped'} />
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
