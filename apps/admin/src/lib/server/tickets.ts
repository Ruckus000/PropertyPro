/**
 * Platform support tickets — the operator work queue's data access.
 *
 * A ticket is a unit of WORK, deliberately not the same object as a support
 * inbox thread (`inbox.ts`), which is CORRESPONDENCE with one external person.
 * A thread records what somebody said; a ticket records what we are going to do
 * about it. `thread_id` links the two when a ticket was escalated out of mail
 * and is null for the many tickets nobody wrote in about — see
 * `packages/shared/src/support-tickets.ts` for the full rationale.
 *
 * Both tables are platform-scoped and RLS-locked to `service_role` by migration
 * 0072 (enabled + FORCEd, zero policies, REVOKE ALL from anon/authenticated),
 * so every read here goes through the admin typed client, exactly like the
 * inbox. What makes that safe is not this module but the caller: every route
 * and page that reaches these functions calls `requirePlatformAdmin()` first.
 *
 * `community_id` is CONTEXT, not scope: a ticket may be about a community, but
 * the people who read it are platform admins with no membership in it, and
 * plenty of tickets belong to no community at all.
 */
import { cache } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

import { createAdminClient, createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type {
  SupportTicketEventRow,
  SupportTicketRow,
} from '@propertypro/db/supabase/admin-types';
import { NotFoundError } from '@propertypro/shared/http';
import type {
  SupportTicketCategory,
  SupportTicketEventKind,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@propertypro/shared';

import { PLATFORM_LIST_LIMIT, wasTruncated } from '@/lib/api/list-limits';
import { buildAuthUserMap } from '@/lib/auth/list-all-auth-users';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface AdminTicket {
  id: number;
  /** The display key an operator says out loud — `T-118`. */
  key: string;
  title: string;
  description: string | null;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  communityId: number | null;
  communityName: string | null;
  threadId: number | null;
  threadSubject: string | null;
  externalRef: string | null;
  assigneeUserId: string | null;
  assigneeEmail: string | null;
  createdBy: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Time since the ticket was OPENED, always — not time-to-resolution.
   *
   * A resolved ticket's age therefore keeps growing. That is deliberate: one
   * label that means two different intervals depending on a sibling field is
   * the kind of thing a reader mis-reads once and then trusts forever. The
   * detail page renders `resolvedAt` next to it when there is one.
   */
  ageLabel: string;
}

export interface TicketEvent {
  id: number;
  kind: SupportTicketEventKind;
  body: string | null;
  actorUserId: string;
  /** Resolved from Supabase auth; null when the account is gone. */
  actorEmail: string | null;
  createdAt: string;
}

export interface TicketFilters {
  status?: SupportTicketStatus | 'all';
  priority?: SupportTicketPriority;
  communityId?: number;
}

export interface TicketCounts {
  open: number;
  waiting: number;
  resolved: number;
}

export interface TicketsResult {
  tickets: AdminTicket[];
  counts: TicketCounts;
  /** True when the cap was hit and some tickets are not shown. */
  truncated: boolean;
}

export interface CreateTicketInput {
  title: string;
  description?: string | null;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  communityId?: number | null;
  threadId?: number | null;
  externalRef?: string | null;
  /** Sets `assignee_user_id` to the acting admin at insert time. */
  assignToMe?: boolean;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string | null;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  status?: SupportTicketStatus;
  communityId?: number | null;
  threadId?: number | null;
  externalRef?: string | null;
  assigneeUserId?: string | null;
}

/** The acting platform admin — `requirePlatformAdmin()`'s return value. */
export interface TicketActor {
  id: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export const ticketKey = (id: number) => `T-${id}`;

/**
 * The timeline rows a triage edit should produce — pure, so it is testable
 * without a database and produces the same events wherever it is called.
 *
 * Only the fields with a KIND in the closed `support_ticket_events_kind_check`
 * vocabulary appear here. A `title`, `description` or `category` edit
 * deliberately emits NOTHING: there is no event kind for it, and inventing one
 * ('note') would put a machine sentence in the column operators write prose
 * into. Those edits are still recorded — the PATCH route audits every changed
 * field to `platform_admin_audit_log` — just not on the ticket's own timeline.
 *
 * One event per changed field, never one merged row: the timeline's whole job
 * is to answer "what changed, and when", and a combined "status and priority
 * changed" row cannot be filtered by kind.
 */
export function diffTicketEvents(
  before: SupportTicketRow,
  after: SupportTicketRow,
): Array<{ kind: SupportTicketEventKind; body: string }> {
  const events: Array<{ kind: SupportTicketEventKind; body: string }> = [];

  if (before.status !== after.status) {
    events.push({ kind: 'status_changed', body: `Status ${before.status} → ${after.status}` });
  }
  if (before.priority !== after.priority) {
    events.push({
      kind: 'priority_changed',
      body: `Priority ${before.priority} → ${after.priority}`,
    });
  }
  if (before.assignee_user_id !== after.assignee_user_id) {
    events.push({
      kind: 'assigned',
      body: after.assignee_user_id ? `Assigned to ${after.assignee_user_id}` : 'Unassigned',
    });
  }
  if (before.community_id !== after.community_id) {
    events.push({
      kind: 'linked',
      body: after.community_id ? `Linked to community ${after.community_id}` : 'Community link removed',
    });
  }
  if (before.thread_id !== after.thread_id) {
    events.push({
      kind: 'linked',
      body: after.thread_id ? `Linked to thread ${after.thread_id}` : 'Thread link removed',
    });
  }
  if (before.external_ref !== after.external_ref) {
    events.push({
      kind: 'linked',
      body: after.external_ref
        ? `External reference set to ${after.external_ref}`
        : 'External reference cleared',
    });
  }

  return events;
}

/** Open work first, most urgent, most recently touched. */
const STATUS_RANK: Record<SupportTicketStatus, number> = { open: 0, waiting: 1, resolved: 2 };
const PRIORITY_RANK: Record<SupportTicketPriority, number> = { high: 0, medium: 1, low: 2 };

/**
 * The queue's order, applied in memory.
 *
 * It cannot be a PostgREST `.order()`: both columns are `text`, and their
 * alphabetical order is not their meaning — `open` < `resolved` < `waiting`,
 * and `high` < `low` < `medium`. (`priority` ascending happens to put `high`
 * first, which is a coincidence of spelling, not a design, and `low` before
 * `medium` gives the coincidence away.) The database sort is on `updated_at`
 * instead, which is what decides WHICH rows come back under the cap; this
 * decides what order they are shown in.
 */
export function sortTickets(tickets: AdminTicket[]): AdminTicket[] {
  return [...tickets].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
  );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/**
 * user id → email, for ticket assignees and event actors.
 *
 * Goes to Supabase AUTH rather than `platform_admin_users`, because that table
 * has no email column: `AdminDatabase`'s `PlatformAdminUserRow` declares one,
 * but `0000_nappy_guardian.sql` creates the table with
 * `(user_id, role, invited_by, created_at)` and nothing has added it since. The
 * shim is wrong, and selecting `email` off it would fail at runtime with a
 * PostgREST 42703 that the type system happily allowed. Both existing readers —
 * `(console)/settings/page.tsx` and `api/admin/platform-admins/route.ts` —
 * already resolve through auth for the same reason.
 *
 * Costly: `buildAuthUserMap` pages the ENTIRE auth user list (~9 round trips at
 * production size), because Supabase offers no "fetch these ids" admin call. So
 * it is skipped entirely when nothing on the page needs a name — the common
 * case for a queue with no assignments — and wrapped in React's `cache()` so a
 * page that renders both a list and a detail pays for it once per request.
 * Outside a Server Component render `cache()` is a passthrough.
 */
const loadAuthEmails = cache(async (): Promise<Map<string, string>> => {
  const users = await buildAuthUserMap(createAdminClient());
  return new Map([...users].map(([id, user]) => [id, user.email ?? '']));
});

async function resolveEmails(userIds: Array<string | null>): Promise<Map<string, string>> {
  const wanted = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  return loadAuthEmails();
}

/**
 * Ticket community id → name.
 *
 * Deliberately NOT filtered to real communities. A ticket's `community_id` is
 * pinned by the ticket row itself — this resolves names for an id set that is
 * already in hand, rather than enumerating a population — and the tickets most
 * in need of a legible name are precisely the ones about a community that was
 * deleted or is a demo ("why did this tenant's data vanish"). Filtering here
 * would render those as an anonymous blank.
 */
async function loadCommunityNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const db = createAdminTypedClient();
  // admin-community-scope:exempt — name lookup for ids already pinned by support_tickets.community_id, not a population read; a ticket ABOUT a demo or soft-deleted community must still say which one, and that is often exactly why the ticket exists
  const { data, error } = await db.from('communities').select('id, name').in('id', ids);
  throwIfError(error, 'Failed to load ticket community names');
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/**
 * The communities a NEW ticket may be filed against.
 *
 * Unlike `loadCommunityNames` above, this IS a population read: it enumerates
 * the choices an operator is offered rather than naming ids a row already
 * pins. So it carries the real-community predicate — non-demo and not
 * soft-deleted — which `guard:admin-community-scope` requires of exactly this
 * shape. Filing a ticket against a seeded demo would put work in the queue for
 * a community nobody is paying for; filing one against a soft-deleted community
 * would deep-link the detail page to a `/clients/[id]` that calls `notFound()`.
 *
 * Ordered by name because the form renders a flat `<select>` an operator scans
 * alphabetically, not by recency.
 */
export interface TicketCommunityOption {
  id: number;
  name: string;
}

export async function listTicketCommunities(): Promise<TicketCommunityOption[]> {
  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('communities')
    .select('id, name')
    .eq('is_demo', false)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(PLATFORM_LIST_LIMIT);
  throwIfError(error, 'Failed to load communities for the ticket form');
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

async function loadThreadSubjects(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const db = createAdminTypedClient();
  const { data, error } = await db.from('support_inbox_threads').select('id, subject').in('id', ids);
  throwIfError(error, 'Failed to load ticket thread subjects');
  return new Map((data ?? []).map((row) => [row.id, row.subject]));
}

interface TicketContext {
  communityNames: Map<number, string>;
  threadSubjects: Map<number, string>;
  emails: Map<string, string>;
}

async function loadTicketContext(rows: SupportTicketRow[]): Promise<TicketContext> {
  const communityIds = [...new Set(rows.map((r) => r.community_id).filter((id): id is number => id !== null))];
  const threadIds = [...new Set(rows.map((r) => r.thread_id).filter((id): id is number => id !== null))];

  const [communityNames, threadSubjects, emails] = await Promise.all([
    loadCommunityNames(communityIds),
    loadThreadSubjects(threadIds),
    resolveEmails(rows.map((r) => r.assignee_user_id)),
  ]);

  return { communityNames, threadSubjects, emails };
}

function mapTicket(row: SupportTicketRow, context: TicketContext): AdminTicket {
  return {
    id: row.id,
    key: ticketKey(row.id),
    title: row.title,
    description: row.description,
    priority: row.priority,
    category: row.category,
    status: row.status,
    communityId: row.community_id,
    communityName: row.community_id === null ? null : context.communityNames.get(row.community_id) ?? null,
    threadId: row.thread_id,
    threadSubject: row.thread_id === null ? null : context.threadSubjects.get(row.thread_id) ?? null,
    externalRef: row.external_ref,
    assigneeUserId: row.assignee_user_id,
    assigneeEmail: row.assignee_user_id === null ? null : context.emails.get(row.assignee_user_id) ?? null,
    createdBy: row.created_by,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ageLabel: formatDistanceToNowStrict(new Date(row.created_at)),
  };
}

async function mapOne(row: SupportTicketRow): Promise<AdminTicket> {
  return mapTicket(row, await loadTicketContext([row]));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The queue.
 *
 * `counts` deliberately ignores the STATUS filter — it is what the status tab
 * bar renders, so a count that only ever described the selected tab would make
 * every other tab read zero. The priority and community filters DO apply to it,
 * so the tabs agree with the rest of the toolbar.
 */
export async function listTickets(filters: TicketFilters = {}): Promise<TicketsResult> {
  const db = createAdminTypedClient();

  // Filters are applied BEFORE `.order()`/`.limit()`: those return PostgREST's
  // transform builder, which has no `.eq()` on it.
  let listQuery = db.from('support_tickets').select('*');
  if (filters.priority) listQuery = listQuery.eq('priority', filters.priority);
  if (filters.communityId !== undefined) {
    listQuery = listQuery.eq('community_id', filters.communityId);
  }
  if (filters.status && filters.status !== 'all') {
    listQuery = listQuery.eq('status', filters.status);
  }

  const countQuery = (status: SupportTicketStatus) => {
    let q = db
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    if (filters.priority) q = q.eq('priority', filters.priority);
    if (filters.communityId !== undefined) q = q.eq('community_id', filters.communityId);
    return q;
  };

  const [listResult, open, waiting, resolved] = await Promise.all([
    // `updated_at` decides WHICH rows survive the cap; `sortTickets` below
    // decides the order they are shown in. See its docblock.
    listQuery.order('updated_at', { ascending: false }).limit(PLATFORM_LIST_LIMIT),
    countQuery('open'),
    countQuery('waiting'),
    countQuery('resolved'),
  ]);

  throwIfError(listResult.error, 'Failed to load support tickets');
  throwIfError(open.error, 'Failed to count open tickets');
  throwIfError(waiting.error, 'Failed to count waiting tickets');
  throwIfError(resolved.error, 'Failed to count resolved tickets');

  const rows = (listResult.data ?? []) as SupportTicketRow[];
  const context = await loadTicketContext(rows);

  return {
    tickets: sortTickets(rows.map((row) => mapTicket(row, context))),
    counts: {
      open: open.count ?? 0,
      waiting: waiting.count ?? 0,
      resolved: resolved.count ?? 0,
    },
    truncated: wasTruncated(rows.length, PLATFORM_LIST_LIMIT),
  };
}

export async function getTicket(
  id: number,
): Promise<{ ticket: AdminTicket; events: TicketEvent[] } | null> {
  const db = createAdminTypedClient();

  const { data: row, error } = await db
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  throwIfError(error, 'Failed to load support ticket');
  if (!row) return null;

  const { data: eventRows, error: eventsError } = await db
    .from('support_ticket_events')
    .select('*')
    .eq('ticket_id', id)
    // Insertion order, which is the index's order — see the schema docblock.
    .order('id', { ascending: true })
    .limit(PLATFORM_LIST_LIMIT);
  throwIfError(eventsError, 'Failed to load support ticket events');

  const events = (eventRows ?? []) as SupportTicketEventRow[];
  const ticketRow = row as SupportTicketRow;

  const emails = await resolveEmails([
    ticketRow.assignee_user_id,
    ...events.map((e) => e.actor_user_id),
  ]);
  const [communityNames, threadSubjects] = await Promise.all([
    loadCommunityNames(ticketRow.community_id === null ? [] : [ticketRow.community_id]),
    loadThreadSubjects(ticketRow.thread_id === null ? [] : [ticketRow.thread_id]),
  ]);

  return {
    ticket: mapTicket(ticketRow, { communityNames, threadSubjects, emails }),
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      actorUserId: e.actor_user_id,
      actorEmail: emails.get(e.actor_user_id) ?? null,
      createdAt: e.created_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function insertEvents(
  ticketId: number,
  actorUserId: string,
  events: Array<{ kind: SupportTicketEventKind; body: string | null }>,
): Promise<void> {
  if (events.length === 0) return;
  const db = createAdminTypedClient();
  const { error } = await db.from('support_ticket_events').insert(
    events.map((e) => ({
      ticket_id: ticketId,
      kind: e.kind,
      body: e.body,
      actor_user_id: actorUserId,
    })),
  );
  throwIfError(error, 'Failed to write support ticket events');
}

/**
 * Open a ticket, and record its birth on the timeline.
 *
 * The `created` event carries no body — the ticket row IS the description — and
 * a `linked` event is written alongside it only when the ticket arrives already
 * attached to something, so the timeline says where it came from.
 *
 * The event insert is a SECOND statement, so a ticket can exist with no
 * `created` row if the process dies between them. That is the honest trade
 * against a Postgres function: a timeline gap is cosmetic, and the alternative
 * is DDL in a migration for a write that happens a handful of times a day.
 */
export async function createTicket(
  input: CreateTicketInput,
  actor: TicketActor,
): Promise<AdminTicket> {
  const db = createAdminTypedClient();

  const { data, error } = await db
    .from('support_tickets')
    .insert({
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'medium',
      category: input.category ?? 'other',
      status: 'open',
      community_id: input.communityId ?? null,
      thread_id: input.threadId ?? null,
      external_ref: input.externalRef ?? null,
      assignee_user_id: input.assignToMe ? actor.id : null,
      created_by: actor.id,
      resolved_at: null,
    })
    .select('*')
    .single();
  throwIfError(error, 'Failed to create support ticket');
  if (!data) throw new Error('Failed to create support ticket: no row returned');

  const row = data as SupportTicketRow;

  const events: Array<{ kind: SupportTicketEventKind; body: string | null }> = [
    { kind: 'created', body: null },
  ];
  if (row.thread_id !== null) {
    events.push({ kind: 'linked', body: `Linked to thread ${row.thread_id}` });
  }
  if (row.external_ref !== null) {
    events.push({ kind: 'linked', body: `External reference set to ${row.external_ref}` });
  }
  await insertEvents(row.id, actor.id, events);

  return mapOne(row);
}

/**
 * Apply a triage edit, and write one timeline row per changed field.
 *
 * Returns the rows on both sides so the caller can audit exactly what moved —
 * the PATCH route builds its `oldValues`/`newValues` from these rather than
 * echoing back the whole patch, which would record fields the request named but
 * did not change.
 *
 * Throws `NotFoundError` for an unknown id, which `withAdminErrorHandler` turns
 * into a 404. The read is unavoidable: `resolved_at` and the timeline both
 * depend on the PREVIOUS state, so a blind update could neither stamp the one
 * nor describe the other.
 */
export async function updateTicket(
  id: number,
  patch: UpdateTicketInput,
  actor: TicketActor,
): Promise<{ before: SupportTicketRow; after: SupportTicketRow }> {
  const db = createAdminTypedClient();

  const { data: beforeRow, error: beforeError } = await db
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  throwIfError(beforeError, 'Failed to load the ticket being updated');
  if (!beforeRow) throw new NotFoundError('Ticket not found');
  const before = beforeRow as SupportTicketRow;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.communityId !== undefined) update.community_id = patch.communityId;
  if (patch.threadId !== undefined) update.thread_id = patch.threadId;
  if (patch.externalRef !== undefined) update.external_ref = patch.externalRef;
  if (patch.assigneeUserId !== undefined) update.assignee_user_id = patch.assigneeUserId;

  /**
   * `resolved_at` tracks the CURRENT resolution, in both directions.
   *
   * Stamped when the ticket first reaches `resolved`, and CLEARED when it
   * leaves — a reopened ticket that kept its old stamp would report the
   * duration of its first life forever, and "how long did this take" is the
   * only question the column exists to answer.
   */
  if (patch.status !== undefined && patch.status !== before.status) {
    if (patch.status === 'resolved') update.resolved_at = new Date().toISOString();
    else if (before.status === 'resolved') update.resolved_at = null;
  }

  const { data: afterRow, error: updateError } = await db
    .from('support_tickets')
    .update(update as never)
    .eq('id', id)
    .select('*')
    .single();
  throwIfError(updateError, 'Failed to update support ticket');
  if (!afterRow) throw new NotFoundError('Ticket not found');
  const after = afterRow as SupportTicketRow;

  await insertEvents(id, actor.id, diffTicketEvents(before, after));

  return { before, after };
}

/**
 * Add an operator note to the timeline.
 *
 * Not audited to `platform_admin_audit_log`, for the same reason inbox notes
 * are not: the row already carries `actor_user_id` and `created_at`, so it is
 * self-auditing, and a second write would duplicate the record for no recall
 * benefit.
 */
export async function addTicketNote(
  id: number,
  body: string,
  actor: TicketActor,
): Promise<TicketEvent> {
  const db = createAdminTypedClient();

  const { data: exists, error: existsError } = await db
    .from('support_tickets')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  throwIfError(existsError, 'Failed to load the ticket being annotated');
  if (!exists) throw new NotFoundError('Ticket not found');

  const { data, error } = await db
    .from('support_ticket_events')
    .insert({ ticket_id: id, kind: 'note', body, actor_user_id: actor.id })
    .select('*')
    .single();
  throwIfError(error, 'Failed to add ticket note');
  if (!data) throw new Error('Failed to add ticket note: no row returned');

  const row = data as SupportTicketEventRow;
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    actorUserId: row.actor_user_id,
    actorEmail: actor.email || null,
    createdAt: row.created_at,
  };
}
