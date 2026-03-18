'use client';

import { useState } from 'react';
import { Badge, Button, Card } from '@propertypro/ui';
import { X } from 'lucide-react';
import { useDeleteMeeting, useMeeting } from '@/hooks/use-meetings';
import { MEETING_TYPE_TOKENS } from '@/lib/calendar/event-types';

interface MeetingDetailModalProps {
  communityId: number;
  communityTimezone: string;
  meetingId: number;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (meetingId: number) => void;
  onDeleted?: () => void;
}

function getDeadlineBadge(dateIso: string): { variant: 'neutral' | 'warning' | 'danger'; label: string } {
  const deadline = new Date(dateIso);
  const daysUntil = Math.floor((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (daysUntil < 0) {
    return { variant: 'danger', label: 'Critical' };
  }
  if (daysUntil <= 7) {
    return { variant: 'warning', label: 'Urgent' };
  }
  if (daysUntil <= 30) {
    return { variant: 'warning', label: 'Aware' };
  }
  return { variant: 'neutral', label: 'Calm' };
}

export function MeetingDetailModal({
  communityId,
  communityTimezone,
  meetingId,
  canWrite,
  onClose,
  onEdit,
  onDeleted,
}: MeetingDetailModalProps) {
  const detailQuery = useMeeting(communityId, meetingId);
  const deleteMutation = useDeleteMeeting(communityId);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm('Delete this meeting?');
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(meetingId);
      onDeleted?.();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete meeting.');
    }
  }

  const meeting = detailQuery.data;
  const meetingToken = meeting ? MEETING_TYPE_TOKENS[meeting.meetingType as keyof typeof MEETING_TYPE_TOKENS] : null;
  const startsAt = meeting ? new Date(meeting.startsAt) : null;
  const endsAt = meeting
    ? new Date(meeting.endsAt ?? new Date(new Date(meeting.startsAt).getTime() + 60 * 60 * 1000).toISOString())
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleteMutation.isPending) {
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-2xl overflow-hidden bg-[var(--surface-card)] shadow-[var(--elevation-e3)]" noPadding>
        <Card.Header bordered>
          <div className="flex w-full items-start justify-between gap-4">
            <div className="space-y-2">
              {meetingToken ? <Badge variant={meetingToken.badgeVariant}>{meetingToken.label}</Badge> : null}
              <Card.Title>{meeting?.title ?? 'Loading meeting…'}</Card.Title>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]"
            >
              <X size={18} />
            </button>
          </div>
        </Card.Header>
        <Card.Body className="space-y-4">
          {detailQuery.isLoading || !meeting || !startsAt || !endsAt ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              Loading meeting details...
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Time</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">
                    {startsAt.toLocaleString('en-US', {
                      timeZone: communityTimezone,
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    {' '}to{' '}
                    {endsAt.toLocaleTimeString('en-US', {
                      timeZone: communityTimezone,
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Location</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">{meeting.location}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">Compliance deadlines</div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: 'Notice post by', value: meeting.deadlines.noticePostBy },
                    { label: 'Vote docs by', value: meeting.deadlines.ownerVoteDocsBy },
                    { label: 'Minutes post by', value: meeting.deadlines.minutesPostBy },
                  ].map(({ label, value }) => {
                    const badge = getDeadlineBadge(value);
                    return (
                      <div
                        key={label}
                        className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</div>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-[var(--text-primary)]">
                          {new Date(value).toLocaleDateString('en-US', {
                            timeZone: communityTimezone,
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">Attached documents</div>
                {meeting.documents.length === 0 ? (
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                    No documents attached yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {meeting.documents.map((document) => (
                      <a
                        key={document.id}
                        href={`/api/v1/documents/${document.id}/download?communityId=${communityId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3 text-sm transition-colors hover:bg-[var(--surface-hover)]"
                      >
                        <div className="font-medium text-[var(--text-primary)]">{document.title}</div>
                        <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                          {document.category ?? 'Uncategorized'} • {document.fileName}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {errorMessage ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
              {errorMessage}
            </div>
          ) : null}
        </Card.Body>
        {canWrite ? (
          <Card.Footer bordered>
            <Button variant="danger" onClick={handleDelete} loading={deleteMutation.isPending}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => onEdit(meetingId)}>
              Edit
            </Button>
          </Card.Footer>
        ) : null}
      </Card>
    </div>
  );
}
