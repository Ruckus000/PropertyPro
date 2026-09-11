'use client';

import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Badge, PriorityBadge } from '@propertypro/ui';
import type { BadgeVariant } from '@propertypro/ui';

import {
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  type SupportTicketCategory,
  type SupportTicketStatus,
} from '@propertypro/shared';

import type { AdminTicket } from '@/lib/server/tickets';

interface TicketRowProps {
  ticket: AdminTicket;
  /** Highlights the row whose ticket is open in the detail pane. */
  active?: boolean;
  /** Current `?status=` filter, carried into the link so the queue keeps it. */
  status: string;
}

/**
 * Category and status are Badge VARIANTS, and every one of them renders its
 * label as text.
 *
 * `.claude/rules/design.md` — status is never colour alone. So neither of these
 * maps is allowed to become a bare dot: the variant tints the chip, the label
 * says what it means, and an operator who cannot distinguish the tints still
 * reads "Billing" and "Waiting". `PriorityBadge` (from `@propertypro/ui`) already
 * works this way, which is why it is used rather than a local badge.
 */
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

/**
 * The assignee's initial.
 *
 * Falls back to the raw user id's first character when the email could not be
 * resolved (a deleted auth account), and to nothing at all when the ticket is
 * unassigned — an empty circle that says "nobody" is better than a letter that
 * implies somebody.
 */
function assigneeInitial(ticket: AdminTicket): string | null {
  const source = ticket.assigneeEmail || ticket.assigneeUserId;
  if (!source) return null;
  return source.trim().charAt(0).toUpperCase() || null;
}

export function TicketRow({ ticket, active = false, status }: TicketRowProps) {
  const initial = assigneeInitial(ticket);
  const assigneeLabel = ticket.assigneeUserId
    ? `Assigned to ${ticket.assigneeEmail || ticket.assigneeUserId}`
    : 'Unassigned';
  const href = status === 'all' ? `/tickets/${ticket.id}` : `/tickets/${ticket.id}?status=${status}`;

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // 44px touch target below md, 36px at and above — the rule in
      // `.claude/rules/design.md`, and the same classes the inbox rows use.
      className={`block min-h-11 px-3 py-2.5 hover:bg-surface-hover md:min-h-9 ${
        active ? 'bg-surface-muted' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <PriorityBadge priority={ticket.priority} />
          <span className="font-mono text-xs text-content-tertiary">{ticket.key}</span>
        </span>
        <Badge variant={STATUS_VARIANT[ticket.status]}>
          {SUPPORT_TICKET_STATUS_LABELS[ticket.status]}
        </Badge>
      </div>

      <p className="mt-1 truncate text-sm font-medium text-content">{ticket.title}</p>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Badge variant={CATEGORY_VARIANT[ticket.category]} outlined>
            {SUPPORT_TICKET_CATEGORY_LABELS[ticket.category]}
          </Badge>
          {ticket.communityName ? (
            <span className="flex min-w-0 items-center gap-1 text-xs text-content-tertiary">
              <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{ticket.communityName}</span>
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-content-disabled">{ticket.ageLabel}</span>
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
              initial
                ? 'bg-surface-muted text-content-secondary'
                : 'border border-dashed border-edge-strong text-content-disabled'
            }`}
            aria-hidden="true"
          >
            {initial}
          </span>
          <span className="sr-only">{assigneeLabel}</span>
        </span>
      </div>
    </Link>
  );
}
