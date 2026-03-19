'use client';

/**
 * SubmissionDetail — Two-column layout showing PDF preview and
 * signer status / event timeline for a single e-sign submission.
 */

import { useCallback } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@propertypro/ui';
import type { BadgeVariant } from '@propertypro/ui';
import {
  useEsignSubmission,
  useCancelEsignSubmission,
  useSendEsignReminder,
} from '@/hooks/use-esign-submissions';
import type {
  EsignSignerRecord,
  EsignEventRecord,
} from '@/lib/services/esign-service';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  Send,
  Ban,
  Download,
  Mail,
  Eye,
  FileSignature,
  Loader2,
  User,
} from 'lucide-react';

interface SubmissionDetailProps {
  communityId: number;
  submissionId: number;
}

interface StatusConfigEntry {
  label: string;
  variant: BadgeVariant;
  icon: typeof Clock;
}

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  pending: { label: 'Pending', variant: 'warning', icon: Clock },
  opened: { label: 'Opened', variant: 'info', icon: Eye },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle2 },
  declined: { label: 'Declined', variant: 'danger', icon: XCircle },
  expired: { label: 'Expired', variant: 'neutral', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'neutral', icon: Ban },
};

const DEFAULT_STATUS: StatusConfigEntry = STATUS_CONFIG['pending']!;

const EVENT_ICONS: Record<string, typeof Clock> = {
  created: FileSignature,
  sent: Send,
  opened: Eye,
  signed: FileSignature,
  completed: CheckCircle2,
  declined: XCircle,
  expired: AlertTriangle,
  cancelled: Ban,
  reminder_sent: Mail,
  signer_completed: CheckCircle2,
  submission_completed: CheckCircle2,
  consent_given: CheckCircle2,
  verified: CheckCircle2,
  downloaded: Download,
};

function formatDateTime(date: Date | string | null): string {
  if (!date) return '\u2014';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SubmissionDetail({
  communityId,
  submissionId,
}: SubmissionDetailProps) {
  const { data, isLoading, error } = useEsignSubmission(
    communityId,
    submissionId,
  );

  const cancelMutation = useCancelEsignSubmission(communityId);
  const remindMutation = useSendEsignReminder(communityId);

  const handleCancel = useCallback(async () => {
    if (!confirm('Cancel this signing request? All pending signatures will be voided.')) {
      return;
    }
    await cancelMutation.mutateAsync(submissionId);
  }, [submissionId, cancelMutation]);

  const handleRemind = useCallback(
    async (signerId: number) => {
      await remindMutation.mutateAsync({ submissionId, signerId });
    },
    [submissionId, remindMutation],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-content-disabled" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
        <p className="text-sm text-content-secondary">
          {error
            ? (error as Error).message
            : 'Submission not found.'}
        </p>
        <Link
          href={`/esign?communityId=${communityId}`}
          className="text-sm text-content-link hover:underline mt-4 inline-block"
        >
          Back to E-Sign
        </Link>
      </Card>
    );
  }

  const { submission, signers, events } = data;
  const submissionConfig = STATUS_CONFIG[submission.status] ?? DEFAULT_STATUS;
  const SubIcon = submissionConfig.icon;
  const isPending = submission.status === 'pending';

  return (
    <div>
      {/* Back link */}
      <Link
        href={`/esign?communityId=${communityId}`}
        className="inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content-secondary mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to E-Sign
      </Link>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: PDF preview */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <div className="relative min-h-[500px] bg-surface-muted flex items-center justify-center">
              <div className="text-center">
                <FileSignature className="h-12 w-12 mx-auto text-content-disabled mb-3" />
                <p className="text-sm text-content-disabled">
                  PDF Document Preview
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Status + signers + timeline */}
        <div className="lg:col-span-2 space-y-4">
          {/* Status header */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-content">
                {submission.messageSubject ?? `Submission #${submission.id}`}
              </h2>
              <Badge variant={submissionConfig.variant} size="sm">
                <Badge.Icon>
                  <SubIcon className="h-3 w-3" />
                </Badge.Icon>
                <Badge.Label>{submissionConfig.label}</Badge.Label>
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-content-tertiary">Created</dt>
                <dd className="text-content">
                  {formatDateTime(submission.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-content-tertiary">Expires</dt>
                <dd className="text-content">
                  {formatDateTime(submission.expiresAt)}
                </dd>
              </div>
              <div>
                <dt className="text-content-tertiary">Signing order</dt>
                <dd className="text-content capitalize">
                  {submission.signingOrder}
                </dd>
              </div>
              {submission.completedAt && (
                <div>
                  <dt className="text-content-tertiary">Completed</dt>
                  <dd className="text-content">
                    {formatDateTime(submission.completedAt)}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {/* Signer cards */}
          <Card className="p-4">
            <h3 className="text-sm font-medium text-content mb-3">
              Signers
            </h3>
            <div className="space-y-3">
              {signers.map((signer: EsignSignerRecord) => {
                const signerConfig =
                  STATUS_CONFIG[signer.status] ?? DEFAULT_STATUS;
                const SIcon = signerConfig.icon;
                const canRemind =
                  isPending &&
                  (signer.status === 'pending' || signer.status === 'opened');

                return (
                  <div
                    key={signer.id}
                    className="flex items-start gap-3 p-3 bg-surface-hover rounded-md"
                  >
                    <div className="h-8 w-8 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-content-tertiary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-content truncate">
                          {signer.name ?? 'Unnamed'}
                        </span>
                        <Badge variant={signerConfig.variant} size="sm">
                          <Badge.Icon>
                            <SIcon className="h-3 w-3" />
                          </Badge.Icon>
                          <Badge.Label>{signerConfig.label}</Badge.Label>
                        </Badge>
                      </div>
                      <p className="text-xs text-content-tertiary truncate">
                        {signer.email}
                      </p>
                      <p className="text-xs text-content-disabled mt-0.5">
                        Role: {signer.role}
                        {signer.completedAt &&
                          ` \u00B7 Signed ${formatDateTime(signer.completedAt)}`}
                      </p>
                    </div>
                    {canRemind && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemind(signer.id)}
                        disabled={remindMutation.isPending}
                        title="Send reminder"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Action buttons */}
          {isPending && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="text-status-danger hover:text-red-700 hover:bg-status-danger-bg"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                <Ban className="h-4 w-4 mr-1" />
                Cancel Request
              </Button>
            </div>
          )}

          {submission.signedDocumentPath && (
            <Button variant="secondary" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Download Signed Document
            </Button>
          )}

          {/* Event timeline */}
          <Card className="p-4">
            <h3 className="text-sm font-medium text-content mb-3">
              Activity Timeline
            </h3>
            {events.length === 0 && (
              <p className="text-sm text-content-disabled">No events recorded.</p>
            )}
            <div className="relative">
              {events.map((event: EsignEventRecord, idx: number) => {
                const Icon = EVENT_ICONS[event.eventType] ?? Clock;
                const isLast = idx === events.length - 1;

                return (
                  <div key={event.id} className="flex gap-3 pb-4 last:pb-0">
                    <div className="relative flex flex-col items-center">
                      <div className="h-6 w-6 rounded-full bg-surface-muted flex items-center justify-center shrink-0 z-10">
                        <Icon className="h-3 w-3 text-content-tertiary" />
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 bg-edge mt-1" />
                      )}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-sm text-content">
                        {formatEventType(event.eventType)}
                      </p>
                      <p className="text-xs text-content-disabled">
                        {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default SubmissionDetail;
