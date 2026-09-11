/**
 * Platform support tickets — the shared vocabulary.
 *
 * A ticket is a platform-scoped unit of WORK. It is deliberately not the same
 * thing as a support inbox thread (`support-inbox.ts`), which is a
 * CONVERSATION with one external person on one mailbox. The two are linked but
 * not merged, and the distinction is load-bearing in both directions:
 *
 *   - a thread with no ticket is mail nobody has committed to doing anything
 *     about, which is the normal state of most mail;
 *   - a ticket with no thread is real and common — an operator notices a
 *     broken PDF pipeline, or a community's Stripe sync stalls, and no
 *     customer has written in at all.
 *
 * So `support_tickets.thread_id` is nullable, and so is `community_id`: the
 * correspondent behind a ticket is frequently not a member of any community,
 * which is also why neither table is tenant-scoped.
 *
 * Three surfaces need the same closed sets:
 *
 *   1. apps/admin — the queue filters, the Zod schemas, the detail-page selects
 *   2. packages/db — the migration's CHECK constraints
 *   3. any future apps/web surface that reports a ticket's state back
 *
 * (2) is the unavoidable duplicate: SQL cannot import TypeScript. Migration
 * `0072_support_tickets.sql` names this file in a comment so the pairing is
 * discoverable; changing a value here means changing the CHECK too, and
 * nothing but review enforces it. This mirrors exactly what `0068` did for the
 * inbox.
 */

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/**
 * Three levels, not five.
 *
 * A five-level scale collapses to three in practice — everything becomes P2 —
 * and the queue's whole job is to make "what do I do next" answerable at a
 * glance. `high` is the only value that is meant to feel expensive to set.
 */
export const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high'] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

/**
 * What the ticket is ABOUT, which is not the same question as who it is for.
 *
 * These name the platform subsystem an operator would have to go and look at:
 * `billing` (Stripe, plans, invoices), `compliance` (statutory deadlines,
 * postings, SIRS), `site` (the public-site editor and its publishes), `access`
 * (invitations, roles, locked-out users). `other` exists so triage is never
 * blocked on the taxonomy being complete — a ticket that cannot be filed is a
 * ticket that does not get created.
 */
export const SUPPORT_TICKET_CATEGORIES = [
  'billing',
  'compliance',
  'site',
  'access',
  'other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  billing: 'Billing',
  compliance: 'Compliance',
  site: 'Site',
  access: 'Access',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Three states, and no `closed`/`wont_fix` distinction.
 *
 * `waiting` means blocked on someone who is not us — a customer reply, an
 * attorney, a Stripe support case. It is separated from `open` because the two
 * need different attention: an `open` ticket aging is a backlog problem, a
 * `waiting` ticket aging is a chase.
 *
 * `resolved` is terminal for the queue but never a delete: the row stays, and
 * `resolved_at` is stamped so "how long did this take" is answerable without
 * reconstructing it from the event log.
 */
export const SUPPORT_TICKET_STATUSES = ['open', 'waiting', 'resolved'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: 'Open',
  waiting: 'Waiting',
  resolved: 'Resolved',
};

// ---------------------------------------------------------------------------
// Event kinds
// ---------------------------------------------------------------------------

/**
 * The ticket timeline's row kinds.
 *
 * One append-only table holds both operator notes and machine-written state
 * transitions, for the same reason `support_inbox_messages` holds both emails
 * and notes: the dominant read is a single chronological timeline, and two
 * tables would make that a re-sorted UNION on every render.
 *
 * `linked` records a ticket being attached to an inbox thread or a community
 * after creation — the fact that the association was made, and by whom, which
 * the ticket row's own nullable FK cannot express once it has been set.
 */
export const SUPPORT_TICKET_EVENT_KINDS = [
  'created',
  'note',
  'status_changed',
  'priority_changed',
  'assigned',
  'linked',
] as const;
export type SupportTicketEventKind = (typeof SUPPORT_TICKET_EVENT_KINDS)[number];

export const SUPPORT_TICKET_EVENT_KIND_LABELS: Record<SupportTicketEventKind, string> = {
  created: 'Created',
  note: 'Note',
  status_changed: 'Status changed',
  priority_changed: 'Priority changed',
  assigned: 'Assigned',
  linked: 'Linked',
};

// ---------------------------------------------------------------------------
// Title bounds
// ---------------------------------------------------------------------------

/**
 * The `support_tickets_title_check` bounds, single-sourced for the Zod schema
 * that will front the create route so the form rejects what the database would
 * reject, rather than surfacing a 23514 as a 500.
 */
export const SUPPORT_TICKET_TITLE_MIN_LENGTH = 1;
export const SUPPORT_TICKET_TITLE_MAX_LENGTH = 200;
