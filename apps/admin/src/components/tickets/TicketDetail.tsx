'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Building2, ExternalLink, Loader2, Mail, StickyNote } from 'lucide-react';
import {
  AlertBanner,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  PriorityBadge,
  buttonVariants,
} from '@propertypro/ui';
import type { BadgeVariant } from '@propertypro/ui';

import {
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_EVENT_KIND_LABELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_STATUS_LABELS,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '@propertypro/shared';

import type { AdminTicket, TicketEvent } from '@/lib/server/tickets';

interface TicketDetailProps {
  ticket: AdminTicket;
  events: TicketEvent[];
}

/** Same maps as `TicketRow`, and for the same reason — the label is the meaning. */
const CATEGORY_VARIANT: Record<SupportTicketCategory, BadgeVariant> = {
  billing: 'warning',
  compliance: 'info',
  site: 'brand',
  access: 'owner',
  other: 'neutral',
};

const STATUS_VARIANT: Record<SupportTicketStatus, BadgeVariant> = {
  open: 'info',
  waiting: 'warning',
  resolved: 'success',
};

/** 44px below md, 36px at and above — `.claude/rules/design.md`. */
const SELECT_CLASSES =
  'min-h-11 rounded-md border border-edge-strong bg-surface-card px-2 text-sm text-content disabled:opacity-60 md:min-h-9';

function stamp(iso: string): string {
  return format(new Date(iso), 'd MMM yyyy, HH:mm');
}

/** Pull the server's own message out of an error envelope, or fall back. */
async function errorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return body?.error?.message || fallback;
}

/**
 * One ticket: what it is, where it came from, what has happened to it, and the
 * two things an operator does next — move it along, or write down what they
 * found.
 *
 * ## The triage selects are optimistic, and roll back
 *
 * A select that snaps to the new value and stays there after a failed PATCH
 * leaves the screen asserting a state the database does not have, which is worse
 * than no feedback at all: the operator believes a ticket is resolved. So each
 * control keeps the previous value, restores it on failure, and surfaces the
 * server's own message in an `AlertBanner` — the same discipline the inbox's
 * `StatusControl` applies.
 *
 * No `AdminPageHeader` on this screen: the `<h1>` here IS the ticket title, the
 * way `ThreadView` owns the inbox thread's, so adding the header'd page chrome
 * would give the route two `<h1>`s.
 */
export function TicketDetail({ ticket, events }: TicketDetailProps) {
  const router = useRouter();

  const [priority, setPriority] = useState<SupportTicketPriority>(ticket.priority);
  const [status, setStatus] = useState<SupportTicketStatus>(ticket.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, rollback: () => void) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        rollback();
        setError(await errorMessage(response, 'We could not update this ticket. Please try again.'));
        return;
      }
      router.refresh();
    } catch {
      rollback();
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  function changePriority(next: SupportTicketPriority) {
    const previous = priority;
    setPriority(next);
    void patch({ priority: next }, () => setPriority(previous));
  }

  function changeStatus(next: SupportTicketStatus) {
    const previous = status;
    setStatus(next);
    void patch({ status: next }, () => setStatus(previous));
  }

  async function addNote() {
    const body = note.trim();
    if (!body) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      const response = await fetch(`/api/admin/tickets/${ticket.id}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setNoteError(await errorMessage(response, 'We could not save that note. Please try again.'));
        return;
      }
      setNote('');
      router.refresh();
    } catch {
      setNoteError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tickets"
          className="mb-3 inline-flex items-center gap-1 text-sm text-content-secondary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to tickets
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={priority} />
          <Badge variant={CATEGORY_VARIANT[ticket.category]} outlined>
            {SUPPORT_TICKET_CATEGORY_LABELS[ticket.category]}
          </Badge>
          <Badge variant={STATUS_VARIANT[status]}>{SUPPORT_TICKET_STATUS_LABELS[status]}</Badge>
        </div>

        <h1 className="mt-2 text-xl font-semibold text-content">{ticket.title}</h1>

        <p className="mt-1 text-sm text-content-tertiary">
          <span className="font-mono">{ticket.key}</span>
          {ticket.communityName ? ` · ${ticket.communityName}` : ''}
          {` · opened ${ticket.ageLabel} ago`}
          {ticket.resolvedAt ? ` · resolved ${stamp(ticket.resolvedAt)}` : ''}
          {` · ${
            ticket.assigneeUserId
              ? `assigned to ${ticket.assigneeEmail || ticket.assigneeUserId}`
              : 'unassigned'
          }`}
        </p>
      </div>

      {error ? <AlertBanner status="danger" title={error} /> : null}

      <section aria-labelledby="ticket-description">
        <h2 id="ticket-description" className="mb-1 text-sm font-semibold text-content-secondary">
          Description
        </h2>
        {ticket.description ? (
          <p className="whitespace-pre-wrap text-sm text-content">{ticket.description}</p>
        ) : (
          <p className="text-sm text-content-tertiary">
            No description was written when this ticket was opened.
          </p>
        )}
      </section>

      {ticket.threadId !== null || ticket.communityId !== null || ticket.externalRef !== null ? (
        <section aria-labelledby="ticket-links" className="space-y-2">
          <h2 id="ticket-links" className="text-sm font-semibold text-content-secondary">
            Linked
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {ticket.threadId !== null ? (
              <Link
                href={`/inbox/${ticket.threadId}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-edge bg-surface-card px-3 py-2 hover:bg-surface-hover md:min-h-9"
              >
                <Mail className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs text-content-tertiary">Linked thread</span>
                  <span className="block truncate text-sm text-content">
                    {ticket.threadSubject ?? `Thread ${ticket.threadId}`}
                  </span>
                </span>
              </Link>
            ) : null}

            {ticket.communityId !== null ? (
              <Link
                href={`/clients/${ticket.communityId}`}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-edge bg-surface-card px-3 py-2 hover:bg-surface-hover md:min-h-9"
              >
                <Building2 className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs text-content-tertiary">Community</span>
                  <span className="block truncate text-sm text-content">
                    {ticket.communityName ?? `Community ${ticket.communityId}`}
                  </span>
                </span>
              </Link>
            ) : null}

            {ticket.externalRef !== null ? (
              <p className="flex min-h-11 items-center gap-2 rounded-lg border border-edge bg-surface-card px-3 py-2 md:min-h-9">
                <ExternalLink className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs text-content-tertiary">External reference</span>
                  <span className="block truncate font-mono text-sm text-content">
                    {ticket.externalRef}
                  </span>
                </span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="ticket-activity" className="space-y-2">
        <h2 id="ticket-activity" className="text-sm font-semibold text-content-secondary">
          Activity
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-content-tertiary">
            Nothing has happened to this ticket yet.
          </p>
        ) : (
          <ul className="divide-y divide-edge-subtle overflow-hidden rounded-lg border border-edge bg-surface-card">
            {events.map((event) => (
              <li key={event.id} className="px-3 py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-content-tertiary">
                  <span className="font-medium text-content-secondary">
                    {SUPPORT_TICKET_EVENT_KIND_LABELS[event.kind]}
                  </span>
                  <span>{event.actorEmail ?? event.actorUserId}</span>
                  <span>{stamp(event.createdAt)}</span>
                </p>
                {event.body ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-content">{event.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-edge bg-surface-card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-content">
          <StickyNote className="h-4 w-4" aria-hidden="true" />
          Add a note
        </h2>
        <p className="mb-2 text-xs text-content-tertiary">
          Goes on this ticket&apos;s timeline only. Never sent to anyone outside.
        </p>

        <label className="sr-only" htmlFor="ticket-note">
          Note
        </label>
        <textarea
          id="ticket-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="What you found, what you tried…"
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm text-content"
        />

        {noteError ? (
          <p role="alert" className="mt-2 text-sm text-status-danger">
            {noteError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void addNote()}
          disabled={savingNote || note.trim().length === 0}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md border border-edge-strong bg-surface-card px-3 text-sm font-medium text-content hover:bg-surface-hover disabled:opacity-60 md:min-h-9"
        >
          {savingNote ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Add note
        </button>
      </section>

      <section
        aria-labelledby="ticket-triage"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-edge bg-surface-card p-4"
      >
        <h2 id="ticket-triage" className="sr-only">
          Triage
        </h2>

        <span className="flex flex-col gap-1">
          <label htmlFor="ticket-priority" className="text-xs text-content-tertiary">
            Priority
          </label>
          <select
            id="ticket-priority"
            value={priority}
            disabled={pending}
            onChange={(event) => changePriority(event.target.value as SupportTicketPriority)}
            className={SELECT_CLASSES}
          >
            {SUPPORT_TICKET_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TICKET_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </span>

        <span className="flex flex-col gap-1">
          <label htmlFor="ticket-status" className="text-xs text-content-tertiary">
            Status
          </label>
          <select
            id="ticket-status"
            value={status}
            disabled={pending}
            onChange={(event) => changeStatus(event.target.value as SupportTicketStatus)}
            className={SELECT_CLASSES}
          >
            {SUPPORT_TICKET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TICKET_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </span>

        {status === 'resolved' ? null : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" disabled={pending}>
                Resolve ticket
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resolve {ticket.key}?</AlertDialogTitle>
                <AlertDialogDescription>
                  It leaves the open queue and is stamped as resolved. You can reopen it from the
                  status control at any time — nothing is deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it open</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ size: 'sm' })}
                  onClick={() => changeStatus('resolved')}
                >
                  Resolve ticket
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>
    </div>
  );
}
