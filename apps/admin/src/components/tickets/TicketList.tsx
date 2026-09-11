'use client';

import Link from 'next/link';
import { Inbox, TicketCheck } from 'lucide-react';
import { Button, EmptyState } from '@propertypro/ui';

import { SUPPORT_TICKET_STATUS_LABELS, type SupportTicketStatus } from '@propertypro/shared';

import type { AdminTicket } from '@/lib/server/tickets';

import { TicketRow } from './TicketRow';

interface TicketListProps {
  tickets: AdminTicket[];
  /** Highlights the open ticket when this list sits next to a detail pane. */
  activeTicketId?: number;
  truncated: boolean;
  /** The `?status=` filter in force, so rows can carry it and the empty state can name it. */
  status: string;
  /** True when there are no tickets AT ALL, not merely none under this filter. */
  queueIsEmpty: boolean;
}

/**
 * The narrow-column ticket queue for the master-detail layout.
 *
 * A vertical list of rows rather than a table: the column is
 * `minmax(300px,380px)` (see `TicketSplit`), which cannot hold a row of columns
 * for priority, key, title, category, community, age, status and assignee.
 *
 * ## The empty-state copy, and the sentence that is NOT here
 *
 * The plan specified "Resolved tickets are kept for 12 months and searchable
 * from ⌘K." Half of that is a promise about data handling that nothing in this
 * repo implements: there is no retention job, no purge cron and no
 * `resolved_at`-based sweep, so "12 months" would be a commitment the operator
 * could act on and the code could not keep — the same defect class as a docblock
 * asserting a gate the code does not perform. What remains is verifiable:
 * nothing deletes a resolved ticket, and `search/tickets.ts` deliberately does
 * NOT exclude resolved rows from the command palette.
 */
export function TicketList({
  tickets,
  activeTicketId,
  truncated,
  status,
  queueIsEmpty,
}: TicketListProps) {
  if (tickets.length === 0) {
    return queueIsEmpty ? (
      <EmptyState
        icon={TicketCheck}
        title="Nothing to work on yet"
        description="Raise a ticket from a support thread, from a production error on Health, or straight from here. Nothing deletes a resolved ticket — they stay searchable from ⌘K."
        size="sm"
        action={
          <Button asChild size="sm">
            <Link href="/tickets/new">New ticket</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={Inbox}
        title={`No ${
          SUPPORT_TICKET_STATUS_LABELS[status as SupportTicketStatus]?.toLowerCase() ?? status
        } tickets`}
        description="Nothing is in this state right now. Try another tab."
        size="sm"
      />
    );
  }

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      {truncated ? (
        <p className="border-b border-edge-subtle px-3 py-2 text-xs text-content-tertiary">
          Showing the most recently updated tickets only — narrow the filters to see older ones.
        </p>
      ) : null}
      <ul className="max-h-[70vh] divide-y divide-edge-subtle overflow-y-auto">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <TicketRow ticket={ticket} active={ticket.id === activeTicketId} status={status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
