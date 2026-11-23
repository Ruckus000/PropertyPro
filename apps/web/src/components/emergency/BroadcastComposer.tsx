"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SmsPreview } from './SmsPreview';
import {
  useEmergencyTemplates,
  useCreateBroadcast,
  useScheduleBroadcast,
  useSendBroadcast,
  useCancelBroadcast,
  fetchEmergencyBroadcast,
  type BroadcastView,
} from '@/hooks/use-emergency-broadcasts';
import {
  fillTemplatePlaceholders,
} from '@/lib/constants/emergency-templates';
import type { CommunityType } from '@propertypro/shared';
import { ApiRequestError } from '@/lib/api/request-json';
import { utcDateToWallClockValue, wallClockValueToUtcIso } from '@/lib/utils/zoned-datetime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BROADCAST_AUDIENCE_LABELS,
  getBroadcastAudienceOptions,
  type BroadcastAudience,
} from './broadcast-audience';
import { formatDateTimeWithZone, timeZoneLabel } from './broadcast-status';
import { countNoun, recipientCountText } from './count-noun';

type Severity = 'emergency' | 'urgent' | 'info';
/** The manager's shape of an alert (the composer is manager-only). */
type ManagerAlert = Extract<BroadcastView, { recipients: unknown }>;
type Channel = 'sms' | 'email';

/** An earlier alert to copy into the composer ("Send again later"). */
export interface BroadcastSource {
  title: string;
  body: string;
  smsBody: string | null;
  severity: string;
  targetAudience: string;
  channels: string[];
}

/** The server's window (`assertSchedulableTime`), mirrored so the field can say so first. */
const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;
const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Turn the date-and-time field's value into the instant to send at.
 *
 * The field holds wall-clock time in the COMMUNITY's zone, never the
 * browser's, so the conversion goes through `wallClockValueToUtcIso`, which
 * resolves the zone's offset on that date (daylight saving included).
 */
function resolveScheduledTime(
  value: string,
  timeZone: string,
  now: Date,
): { iso: string } | { error: string } {
  if (!value) return { error: 'Choose a date and time.' };
  let iso: string;
  try {
    iso = wallClockValueToUtcIso(value, timeZone);
  } catch {
    return { error: 'Choose a date and time.' };
  }
  // A time skipped when the clocks go forward does not exist in this zone.
  if (utcDateToWallClockValue(new Date(iso), timeZone) !== value) {
    return { error: 'That time is skipped when the clocks change. Choose a different time.' };
  }
  const ahead = new Date(iso).getTime() - now.getTime();
  if (ahead < MIN_SCHEDULE_LEAD_MS) return { error: 'Choose a time at least 5 minutes from now.' };
  if (ahead > MAX_SCHEDULE_AHEAD_MS) return { error: 'Choose a time within the next 365 days.' };
  return { iso };
}

interface Props {
  communityId: number;
  communityName: string;
  /** Decides which audiences are offered; see `getBroadcastAudienceOptions`. */
  communityType: CommunityType;
  /**
   * Per-community `smsDispatchEnabled` legal gate. REQUIRED so a new call site
   * has to state its intent rather than silently inheriting a default.
   *
   * When false the SMS channel is removed from the composer entirely and the
   * broadcast goes out by EMAIL. It does not block sending — an emergency
   * broadcast must still reach residents. The service degrades the same way
   * server-side, so a crafted request cannot send SMS either.
   * See docs/audits/2026-08-09-legal-risk-audit.md F-10.
   */
  smsEnabled: boolean;
  /** The community's IANA zone. "Send later" times are entered and shown in it. */
  timeZone: string;
  /**
   * "Send again later": pre-fills the alert from an earlier one and opens on
   * the compose step with "Send later" selected.
   */
  source?: BroadcastSource;
}

type Step =
  | 'template'
  | 'compose'
  | 'recipients'
  | 'confirm'
  | 'sending'
  | 'undoing'
  | 'sent'
  | 'send-failed';

export function BroadcastComposer({
  communityId,
  communityName,
  communityType,
  smsEnabled,
  timeZone,
  source,
}: Props) {
  const router = useRouter();
  const audienceOptions = getBroadcastAudienceOptions(communityType);
  const [step, setStep] = useState<Step>(source ? 'compose' : 'template');
  const [title, setTitle] = useState(source?.title ?? '');
  const [body, setBody] = useState(source?.body ?? '');
  const [smsBody, setSmsBody] = useState(source?.smsBody ?? '');
  const [severity, setSeverity] = useState<Severity>(
    source && (['emergency', 'urgent', 'info'] as string[]).includes(source.severity)
      ? (source.severity as Severity)
      : 'emergency',
  );
  const [templateKey, setTemplateKey] = useState<string | undefined>();
  // A copied audience or channel is kept only if this community still offers it.
  const [targetAudience, setTargetAudience] = useState<BroadcastAudience>(
    audienceOptions.find((option) => option === source?.targetAudience) ?? 'all',
  );
  const [channels, setChannels] = useState<Channel[]>(() => {
    const offered: Channel[] = smsEnabled ? ['sms', 'email'] : ['email'];
    if (!source) return offered;
    const copied = offered.filter((channel) => source.channels.includes(channel));
    return copied.length > 0 ? copied : ['email'];
  });
  const [sendMode, setSendMode] = useState<'now' | 'later'>(source ? 'later' : 'now');
  /** The date-and-time field's value: wall-clock time in the community zone. */
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  /**
   * 'busy' from the click until the outcome is KNOWN (which can mean asking the
   * server what the alert is now); 'done' once it is scheduled; 'closed' when
   * the server says this draft was already sent or canceled. The button is
   * enabled only when 'idle', so a scheduled draft cannot be scheduled twice.
   */
  const [scheduleState, setScheduleState] = useState<'idle' | 'busy' | 'done' | 'closed'>('idle');
  /** Why scheduling did not happen, when it verifiably did not. */
  const [scheduleProblem, setScheduleProblem] = useState<string | null>(null);
  /** Why "Send now" did not send from here. */
  const [sendProblem, setSendProblem] = useState<string | null>(null);
  const [broadcastId, setBroadcastId] = useState<number | null>(null);
  const [recipientInfo, setRecipientInfo] = useState<{
    recipientCount: number;
    smsEligibleCount: number;
    emailCount: number;
  } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(10);
  const hasSentRef = useRef(false);

  const { data: templates } = useEmergencyTemplates(communityId);
  const createMutation = useCreateBroadcast();
  // Scheduling converts the draft made at "Next: Confirm"; it creates nothing new.
  const scheduleMutation = useScheduleBroadcast();
  const sendMutation = useSendBroadcast();
  const cancelMutation = useCancelBroadcast();

  // Undo countdown timer — W5 fix: hasSentRef prevents double-send
  useEffect(() => {
    if (step !== 'sending') {
      hasSentRef.current = false;
      return;
    }
    if (undoCountdown <= 0) {
      // Auto-send after countdown
      if (broadcastId && !hasSentRef.current) {
        hasSentRef.current = true;
        sendMutation.mutate(
          { broadcastId, communityId },
          {
            onSuccess: () => setStep('sent'),
            // A refusal (409: sent by another click, scheduled, canceled) or a
            // lost response must not leave the countdown sitting at 0.
            onError: () => void handleSendFailed(broadcastId),
          },
        );
      }
      return;
    }
    const timer = setTimeout(() => setUndoCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, undoCountdown, broadcastId, communityId, sendMutation]);

  function handleSelectTemplate(key: string) {
    const tmpl = templates?.find((t) => t.key === key);
    if (!tmpl) return;

    const placeholders = { Community: communityName };
    setTitle(fillTemplatePlaceholders(tmpl.title, placeholders));
    setBody(fillTemplatePlaceholders(tmpl.body, placeholders));
    setSmsBody(fillTemplatePlaceholders(tmpl.smsBody, placeholders));
    setSeverity(tmpl.severity as 'emergency' | 'urgent' | 'info');
    setTemplateKey(key);
    setStep('compose');
  }

  function handleStartBlank() {
    setTemplateKey(undefined);
    setStep('compose');
  }

  /** The send request failed or went unanswered: look at the alert, then say what is true. */
  async function handleSendFailed(id: number) {
    const alertNow = await lookUpAlert(id);
    // It did go out (this request's answer was lost, or another click sent it).
    if (alertNow && (alertNow.completedAt || (alertNow.sendClaimedAt && !alertNow.sendOutcome))) {
      setStep('sent');
      return;
    }
    setSendProblem(
      !alertNow
        ? "We couldn't confirm whether this alert was sent. Open the alert to check before you send another."
        : alertNow.canceledAt
          ? 'This alert was canceled, so it was not sent.'
          : alertNow.scheduledFor && !alertNow.sendOutcome
            ? 'This alert is scheduled, so it was not sent now. It will go out at its scheduled time.'
            : alertNow.sendOutcome === 'failed'
              ? 'This alert did not finish sending, and some residents may already have received it. Open the alert to see who, and use Send again later from there.'
              : 'This alert was not sent. Open the alert to see what happened.',
    );
    setStep('send-failed');
  }

  /** The alert as the server has it now, or null when that cannot be read. */
  async function lookUpAlert(id: number): Promise<ManagerAlert | null> {
    try {
      const alertNow = await fetchEmergencyBroadcast(communityId, id);
      return 'recipients' in alertNow ? alertNow : null;
    } catch {
      return null;
    }
  }

  async function handleCreateDraft() {
    const result = await createMutation.mutateAsync({
      communityId,
      title,
      body,
      smsBody: smsBody || undefined,
      severity,
      templateKey,
      targetAudience,
      channels,
    });

    // A new draft: nothing agreed to or attempted on the previous one carries over.
    setConfirmed(false);
    setScheduleState('idle');
    setScheduleProblem(null);
    scheduleMutation.reset();
    setBroadcastId(result.broadcastId);
    setRecipientInfo({
      recipientCount: result.recipientCount,
      smsEligibleCount: result.smsEligibleCount,
      emailCount: result.emailCount,
    });
    setStep('confirm');
  }

  function handleConfirmSend() {
    setStep('sending');
    setUndoCountdown(10);
  }

  async function handleSchedule() {
    if (!broadcastId) return;
    const resolved = resolveScheduledTime(scheduledLocal, timeZone, new Date());
    if ('error' in resolved) {
      setScheduleError(resolved.error);
      return;
    }
    setScheduleError(null);
    setScheduleProblem(null);
    setScheduleState('busy');
    const alertPage = `/emergency/${broadcastId}?communityId=${communityId}`;
    try {
      await scheduleMutation.mutateAsync({
        broadcastId,
        communityId,
        scheduledFor: resolved.iso,
      });
      setScheduleState('done');
      // No undo countdown: a scheduled alert is canceled from its own page.
      router.push(alertPage);
    } catch (error) {
      // The server refused the time (its clock is the authority): same field, same message.
      if (
        error instanceof ApiRequestError &&
        error.fields?.some((field) => field.field === 'scheduledFor')
      ) {
        setScheduleError(error.message);
        setScheduleState('idle');
        return;
      }
      // Anything else can hide a schedule that DID happen: a lost response, a
      // second click answered 409, a failure after the row was written. Telling
      // the manager to start over then sends residents the alert twice. So ask
      // the server what this alert is now, and say only what that shows.
      const alertNow = await lookUpAlert(broadcastId);
      if (alertNow?.scheduledFor && !alertNow.canceledAt) {
        setScheduleState('done');
        router.push(alertPage);
        return;
      }
      const refused = error instanceof ApiRequestError ? error : null;
      if (!alertNow) {
        // Not verifiable either way. Trying again is safe: if it was scheduled
        // the server answers 409 and this same check then finds it.
        setScheduleProblem(
          "We couldn't confirm whether this alert was scheduled. Check your connection and try again, or open the alert to check.",
        );
        setScheduleState('idle');
        return;
      }
      setScheduleProblem(
        refused?.status === 409
          ? 'This alert can no longer be scheduled: it has already been sent or canceled. Open the alert to see what happened.'
          : refused?.status === 400
            ? refused.message
            : refused
              ? `We couldn't schedule this alert. ${refused.message} Please try again.`
              : "We couldn't reach the server, and this alert is not scheduled. Check your connection and try again.",
      );
      // Verified not scheduled. A 409 is final for this draft; anything else may be retried.
      setScheduleState(refused?.status === 409 ? 'closed' : 'idle');
    }
  }

  // Shown on the confirm step once the field holds a time that passes the checks.
  const scheduledPreview =
    sendMode === 'later' && scheduledLocal && !scheduleError
      ? resolveScheduledTime(scheduledLocal, timeZone, new Date())
      : null;
  const scheduledIso = scheduledPreview && 'iso' in scheduledPreview ? scheduledPreview.iso : null;
  const alertHref = broadcastId ? `/emergency/${broadcastId}?communityId=${communityId}` : null;

  function backToStart() {
    setStep('template');
    setBroadcastId(null);
    setRecipientInfo(null);
  }

  function handleUndo() {
    if (!broadcastId) {
      backToStart();
      return;
    }
    const id = broadcastId;
    // Leaving 'sending' stops the countdown, so it cannot run out and send
    // while the cancel request is on its way.
    setStep('undoing');
    cancelMutation.mutate(
      { broadcastId: id, communityId },
      {
        onSuccess: backToStart,
        // A refusal or a lost answer says nothing about whether the alert went
        // out. Look at it, and show what it is; never assume it was sent.
        onError: async () => {
          const alertNow = await lookUpAlert(id);
          if (alertNow?.canceledAt) {
            backToStart();
          } else if (alertNow && (alertNow.completedAt || (alertNow.sendClaimedAt && !alertNow.sendOutcome))) {
            setStep('sent');
          } else {
            setSendProblem(
              alertNow
                ? "We couldn't cancel this alert. It has not been sent. Open the alert to see where it stands."
                : "We couldn't confirm whether this alert was canceled. Open the alert to check before you send another.",
            );
            setStep('send-failed');
          }
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Step indicator */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-content-tertiary">
        {['Template', 'Compose', 'Recipients', 'Confirm'].map((label, i) => {
          const stepIndex = ['template', 'compose', 'recipients', 'confirm'].indexOf(step);
          const isActive = i <= stepIndex;
          return (
            <React.Fragment key={label}>
              {i > 0 && <span className="text-content-disabled">&rarr;</span>}
              <span className={isActive ? 'font-medium text-content' : ''}>{label}</span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: Template selection */}
      {step === 'template' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-content">Choose a Template</h2>
          <div className="grid grid-cols-2 gap-3">
            {templates?.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleSelectTemplate(t.key)}
                className="rounded-md border border-edge bg-surface-card p-4 text-left hover:border-interactive hover:bg-interactive-subtle"
              >
                <div className="text-sm font-medium text-content">{t.label}</div>
                <div className="mt-1 text-xs text-content-tertiary">{t.severity}</div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleStartBlank}
            className="w-full rounded-md border border-dashed border-edge-strong bg-surface-card p-4 text-sm text-content-tertiary hover:border-edge-strong hover:text-content-secondary"
          >
            Start from scratch
          </button>
        </div>
      )}

      {/* Step 2: Compose */}
      {step === 'compose' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-content">Compose Alert</h2>

          <div>
            <label htmlFor="severity" className="block text-sm font-medium text-content-secondary">Severity</label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as Severity)}
              className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="emergency">Emergency</option>
              <option value="urgent">Urgent</option>
              <option value="info">Info</option>
            </select>
          </div>

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-content-secondary">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
              placeholder="Emergency alert title"
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium text-content-secondary">Email body</label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
              placeholder="Full message for email recipients..."
            />
          </div>

          {smsEnabled && (
            <div>
              <label htmlFor="smsBody" className="block text-sm font-medium text-content-secondary">SMS body</label>
              <textarea
                id="smsBody"
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
                placeholder="Short SMS message (160 chars recommended)..."
              />
              <SmsPreview body={smsBody} />
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('template')}
              className="rounded border border-edge-strong px-4 py-2 text-sm text-content-secondary hover:bg-surface-page"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('recipients')}
              disabled={!title.trim() || !body.trim()}
              className="rounded bg-interactive px-4 py-2 text-sm text-content-inverse hover:bg-interactive-hover disabled:opacity-50"
            >
              Next: Recipients
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Recipients */}
      {step === 'recipients' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-content">Select Recipients</h2>

          {audienceOptions.length > 1 ? (
            <div>
              <label htmlFor="audience" className="block text-sm font-medium text-content-secondary">Audience</label>
              <select
                id="audience"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value as BroadcastAudience)}
                className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
              >
                {audienceOptions.map((option) => (
                  <option key={option} value={option}>
                    {BROADCAST_AUDIENCE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <span className="block text-sm font-medium text-content-secondary">Audience</span>
              <p className="mt-1 text-sm text-content">{BROADCAST_AUDIENCE_LABELS.all}</p>
            </div>
          )}

          <div className="space-y-2">
            <span className="block text-sm font-medium text-content-secondary">Channels</span>
            {smsEnabled ? (
              <label className="flex items-center gap-2">
                <input
                  className="h-4 w-4 shrink-0"
                  type="checkbox"
                  checked={channels.includes('sms')}
                  onChange={(e) => {
                    setChannels(e.target.checked
                      ? [...channels, 'sms']
                      : channels.filter((c) => c !== 'sms'));
                  }}
                />
                <span className="text-sm">SMS</span>
              </label>
            ) : (
              <p className="text-xs text-content-tertiary">
                Text messaging is not enabled for this community. This alert will be
                delivered by email to every resident with an email address on file.
              </p>
            )}
            <label className="flex items-center gap-2">
              <input
                className="h-4 w-4 shrink-0"
                type="checkbox"
                checked={channels.includes('email')}
                onChange={(e) => {
                  setChannels(e.target.checked
                    ? [...channels, 'email']
                    : channels.filter((c) => c !== 'email'));
                }}
              />
              <span className="text-sm">Email</span>
            </label>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('compose')}
              className="rounded border border-edge-strong px-4 py-2 text-sm text-content-secondary hover:bg-surface-page"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCreateDraft}
              disabled={channels.length === 0 || createMutation.isPending}
              className="rounded bg-interactive px-4 py-2 text-sm text-content-inverse hover:bg-interactive-hover disabled:opacity-50"
            >
              {createMutation.isPending ? 'Resolving...' : 'Next: Confirm'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 'confirm' && recipientInfo && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-content">Confirm & Send</h2>

          <div className="rounded-md border border-edge bg-surface-card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-content-tertiary">Title:</span>
              <span className="font-medium">{title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-tertiary">Severity:</span>
              <span className="font-medium capitalize">{severity}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-tertiary">Total recipients:</span>
              <span className="font-medium">{recipientInfo.recipientCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-tertiary">SMS eligible:</span>
              <span className="font-medium">{recipientInfo.smsEligibleCount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-content-tertiary">Email recipients:</span>
              <span className="font-medium">{recipientInfo.emailCount}</span>
            </div>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-content-secondary">When to send</legend>
            <label className="flex min-h-11 items-center gap-2 md:min-h-0">
              <input
                type="radio"
                name="send-mode"
                className="h-4 w-4 shrink-0"
                checked={sendMode === 'now'}
                // Not while a schedule request is out: its alert must not also be sent now.
                disabled={scheduleState !== 'idle'}
                onChange={() => {
                  setSendMode('now');
                  setConfirmed(false);
                }}
              />
              <span className="text-sm text-content">Send now</span>
            </label>
            <label className="flex min-h-11 items-center gap-2 md:min-h-0">
              <input
                type="radio"
                name="send-mode"
                className="h-4 w-4 shrink-0"
                checked={sendMode === 'later'}
                disabled={scheduleState !== 'idle'}
                onChange={() => {
                  setSendMode('later');
                  // The "I understand" tick was for sending now; it does not survive the switch.
                  setConfirmed(false);
                }}
              />
              <span className="text-sm text-content">Send later</span>
            </label>
          </fieldset>

          {sendMode === 'now' ? (
            <label className="flex items-start gap-3 rounded-md border border-status-danger-border bg-status-danger-bg p-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 shrink-0 mt-1"
              />
              <span className="text-sm text-status-danger">
                I understand this will immediately alert{' '}
                <strong>{countNoun(recipientInfo.recipientCount, 'person', 'people')}</strong> via{' '}
                {channels.join(' and ')}.
              </span>
            </label>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="scheduled-for">
                  Send on
                  <span aria-hidden="true" className="text-status-danger">
                    {' '}
                    *
                  </span>
                </Label>
                <Input
                  id="scheduled-for"
                  type="datetime-local"
                  required
                  value={scheduledLocal}
                  onChange={(e) => {
                    setScheduledLocal(e.target.value);
                    setScheduleError(null);
                    if (scheduleState !== 'closed') setScheduleProblem(null);
                  }}
                  aria-invalid={scheduleError ? true : undefined}
                  aria-describedby={
                    scheduleError ? 'scheduled-for-help scheduled-for-error' : 'scheduled-for-help'
                  }
                  className={scheduleError ? 'border-status-danger' : undefined}
                />
                <p id="scheduled-for-help" className="text-xs text-content-secondary">
                  Sends within 5 minutes after this time. Time zone: {timeZoneLabel(timeZone)}.
                </p>
                {scheduleError && (
                  <p id="scheduled-for-error" role="alert" className="text-sm text-status-danger">
                    {scheduleError}
                  </p>
                )}
              </div>
              <p className="rounded-md border border-edge bg-surface-card p-3 text-sm text-content">
                {scheduledIso ? (
                  <>
                    This alert will be sent on{' '}
                    <strong>{formatDateTimeWithZone(scheduledIso, timeZone)}</strong> to{' '}
                    <strong>{recipientCountText(recipientInfo.recipientCount)} as of now</strong>.
                  </>
                ) : (
                  <>
                    This alert will be sent at the time you choose to{' '}
                    <strong>{recipientCountText(recipientInfo.recipientCount)} as of now</strong>.
                  </>
                )}{' '}
                Recipients are worked out again when it sends. You can cancel it until it starts
                sending.
              </p>
            </div>
          )}

          {createMutation.error && (
            <div className="rounded border border-status-danger-border bg-status-danger-bg p-2 text-sm text-status-danger">
              {createMutation.error.message}
            </div>
          )}
          {sendMode === 'later' && scheduleProblem && (
            <div
              role="alert"
              className="rounded border border-status-danger-border bg-status-danger-bg p-2 text-sm text-status-danger"
            >
              {scheduleProblem}{' '}
              {alertHref && (
                <Link href={alertHref} className="font-medium underline">
                  View the alert
                </Link>
              )}
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep('recipients')}
              className="rounded border border-edge-strong px-4 py-2 text-sm text-content-secondary hover:bg-surface-page"
            >
              Back
            </button>
            {sendMode === 'now' ? (
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={!confirmed}
                className="rounded bg-status-danger px-4 py-2 text-sm font-medium text-content-inverse hover:bg-status-danger hover:opacity-90 disabled:opacity-50"
              >
                Send Emergency Alert
              </button>
            ) : (
              <Button type="button" onClick={handleSchedule} disabled={scheduleState !== 'idle'}>
                {scheduleState === 'busy' ? 'Scheduling...' : 'Schedule alert'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Sending with undo */}
      {step === 'sending' && (
        <div className="space-y-4 text-center">
          <div className="text-4xl font-bold text-status-danger">{undoCountdown}</div>
          <p className="text-sm text-content-secondary">Sending in {undoCountdown} seconds...</p>
          <button
            type="button"
            onClick={handleUndo}
            className="rounded border-2 border-status-danger px-6 py-3 text-sm font-medium text-status-danger hover:bg-status-danger-bg"
          >
            UNDO - Cancel Broadcast
          </button>
        </div>
      )}

      {step === 'undoing' && (
        <p role="status" className="text-center text-sm text-content-secondary">
          Canceling the alert...
        </p>
      )}

      {/* The send was refused or went unanswered, and the alert is not sent */}
      {step === 'send-failed' && (
        <div className="space-y-4 text-center">
          <div role="alert" className="text-sm font-medium text-status-danger">
            {sendProblem}
          </div>
          {alertHref && (
            <Button asChild variant="outline">
              <Link href={alertHref}>View the alert</Link>
            </Button>
          )}
        </div>
      )}

      {/* Step 6: Sent */}
      {step === 'sent' && broadcastId && (
        <div className="space-y-4 text-center">
          <div className="text-lg font-semibold text-status-success">Emergency alert sent!</div>
          <p className="text-sm text-content-secondary">
            Delivery tracking is in progress. View the report for real-time updates.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/emergency/${broadcastId}?communityId=${communityId}`)}
            className="rounded bg-interactive px-4 py-2 text-sm text-content-inverse hover:bg-interactive-hover"
          >
            View Delivery Report
          </button>
        </div>
      )}
    </div>
  );
}
