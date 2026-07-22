'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import { Badge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { FilePlus2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDeleteMeeting, useMeeting } from '@/hooks/use-meetings';
import { MEETING_TYPE_TOKENS, resolveEndsAt } from '@/lib/calendar/event-types';
import { DocumentViewerModal } from '@/components/documents/DocumentViewerModal';

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
  const [viewerDocument, setViewerDocument] = useState<{
    id: number;
    title: string;
    fileName: string;
  } | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm('Delete this meeting?');
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(meetingId);
      toast.success('Meeting deleted.');
      onDeleted?.();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete meeting.');
    }
  }

  const meeting = detailQuery.data;
  const meetingToken = meeting ? MEETING_TYPE_TOKENS[meeting.meetingType as keyof typeof MEETING_TYPE_TOKENS] : null;
  const startsAt = meeting ? new Date(meeting.startsAt) : null;
  const endsAt = meeting && startsAt ? resolveEndsAt(startsAt, meeting.endsAt) : null;

  return (
    <Dialog.Root
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !deleteMutation.isPending) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 px-4 py-6 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed inset-0 z-50 flex items-center justify-center px-4 py-6 outline-none focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          )}
          onPointerDownOutside={(event) => {
            if (deleteMutation.isPending) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (deleteMutation.isPending) {
              event.preventDefault();
            }
          }}
        >
      <Card className="w-full max-w-2xl overflow-hidden bg-[var(--surface-card)] shadow-[var(--elevation-e3)]">
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-edge-subtle">
          <div className="flex w-full items-start justify-between gap-4">
            <div className="space-y-2">
              {meetingToken ? <Badge variant={meetingToken.badgeVariant}>{meetingToken.label}</Badge> : null}
              <Dialog.Title asChild>
                <CardTitle>{meeting?.title ?? 'Loading meeting…'}</CardTitle>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-[var(--radius-sm)] p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    {
                      label: 'Target post by',
                      value: meeting.deadlines.minutesPostBy,
                      title:
                        'Conservative internal reminder based on meeting date; statutory website-posting deadlines may depend on when approved minutes are created or received. Confirm with counsel.',
                    },
                  ].map(({ label, value, title }) => {
                    const badge = getDeadlineBadge(value);
                    return (
                      <div
                        key={label}
                        className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div
                            className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]"
                            title={title}
                          >
                            {label}
                          </div>
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
                      <button
                        key={document.id}
                        type="button"
                        onClick={() =>
                          setViewerDocument({
                            id: document.id,
                            title: document.title,
                            fileName: document.fileName,
                          })
                        }
                        className="block w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-page)] px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--surface-hover)]"
                      >
                        <div className="font-medium text-[var(--text-primary)]">{document.title}</div>
                        <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                          {document.category ?? 'Uncategorized'} • {document.fileName}
                        </div>
                      </button>
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
        </CardContent>
        {canWrite ? (
          <CardFooter className="justify-end gap-3 border-t border-edge-subtle">
            <Button variant="destructive" onClick={handleDelete} loading={deleteMutation.isPending}>
              Delete
            </Button>
            <Link
              href={`/communities/${communityId}/meetings/${meetingId}/minutes/author`}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)]"
            >
              <FilePlus2 size={16} aria-hidden="true" />
              Author Minutes
            </Link>
            <Button variant="outline" onClick={() => onEdit(meetingId)}>
              Edit
            </Button>
          </CardFooter>
        ) : null}
      </Card>
        </Dialog.Content>
      </Dialog.Portal>

      <DocumentViewerModal
        open={viewerDocument !== null}
        onOpenChange={(open) => {
          if (!open) setViewerDocument(null);
        }}
        communityId={communityId}
        documentId={viewerDocument?.id ?? null}
        fileName={viewerDocument?.title ?? viewerDocument?.fileName}
        contentTestId="meeting-document-viewer-modal"
      />
    </Dialog.Root>
  );
}
