"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { SmsPreview } from './SmsPreview';
import {
  useEmergencyTemplates,
  useCreateBroadcast,
  useSendBroadcast,
  useCancelBroadcast,
} from '@/hooks/use-emergency-broadcasts';
import {
  fillTemplatePlaceholders,
} from '@/lib/constants/emergency-templates';

interface Props {
  communityId: number;
  communityName: string;
}

type Step = 'template' | 'compose' | 'recipients' | 'confirm' | 'sending' | 'sent';

export function BroadcastComposer({ communityId, communityName }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('template');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [smsBody, setSmsBody] = useState('');
  const [severity, setSeverity] = useState<'emergency' | 'urgent' | 'info'>('emergency');
  const [templateKey, setTemplateKey] = useState<string | undefined>();
  const [targetAudience, setTargetAudience] = useState<'all' | 'owners_only'>('all');
  const [channels, setChannels] = useState<Array<'sms' | 'email'>>(['sms', 'email']);
  const [confirmed, setConfirmed] = useState(false);
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

  function handleUndo() {
    if (broadcastId) {
      cancelMutation.mutate(
        { broadcastId, communityId },
        {
          onSuccess: () => {
            setStep('template');
            setBroadcastId(null);
            setRecipientInfo(null);
          },
          onError: () => {
            // Cancel failed — broadcast was already sent or undo window expired
            setStep('sent');
          },
        },
      );
    } else {
      setStep('template');
      setBroadcastId(null);
      setRecipientInfo(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-content-tertiary">
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
              onChange={(e) => setSeverity(e.target.value as 'emergency' | 'urgent' | 'info')}
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

          <div>
            <label htmlFor="audience" className="block text-sm font-medium text-content-secondary">Audience</label>
            <select
              id="audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value as 'all' | 'owners_only')}
              className="mt-1 w-full rounded border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="all">All residents</option>
              <option value="owners_only">Owners only</option>
            </select>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-medium text-content-secondary">Channels</span>
            <label className="flex items-center gap-2">
              <input
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
            <label className="flex items-center gap-2">
              <input
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

          <label className="flex items-start gap-3 rounded-md border border-status-danger-border bg-status-danger-bg p-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-status-danger">
              I understand this will immediately alert{' '}
              <strong>{recipientInfo.recipientCount} people</strong> via{' '}
              {channels.join(' and ')}.
            </span>
          </label>

          {createMutation.error && (
            <div className="rounded border border-status-danger-border bg-status-danger-bg p-2 text-sm text-status-danger">
              {createMutation.error.message}
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
            <button
              type="button"
              onClick={handleConfirmSend}
              disabled={!confirmed}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-content-inverse hover:bg-red-700 disabled:opacity-50"
            >
              Send Emergency Alert
            </button>
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
