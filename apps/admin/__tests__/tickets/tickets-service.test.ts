/**
 * `lib/server/tickets.ts`'s pure half — the two functions with no database in
 * them, so they can be pinned exactly rather than through a mock.
 */
import { describe, expect, it } from 'vitest';
import type { SupportTicketRow } from '@propertypro/db/supabase/admin-types';

import { diffTicketEvents, sortTickets, ticketKey, type AdminTicket } from '@/lib/server/tickets';

/** Only the four fields `sortTickets` reads; the rest are irrelevant to order. */
const queued = (
  id: number,
  status: AdminTicket['status'],
  priority: AdminTicket['priority'],
  updatedAt = '2026-09-01T00:00:00.000Z',
): AdminTicket => ({ id, status, priority, updatedAt }) as unknown as AdminTicket;

const base: SupportTicketRow = {
  id: 118,
  title: 't',
  description: null,
  priority: 'medium',
  category: 'site',
  status: 'open',
  community_id: null,
  thread_id: null,
  external_ref: null,
  assignee_user_id: null,
  created_by: 'u',
  resolved_at: null,
  created_at: 'a',
  updated_at: 'a',
};

describe('tickets', () => {
  it('formats the display key', () => {
    expect(ticketKey(118)).toBe('T-118');
  });

  it('emits one event per changed field', () => {
    const events = diffTicketEvents(base, {
      ...base,
      priority: 'high',
      status: 'waiting',
      assignee_user_id: 'u2',
    });
    expect(events.map((e) => e.kind).sort()).toEqual([
      'assigned',
      'priority_changed',
      'status_changed',
    ]);
    expect(events.find((e) => e.kind === 'priority_changed')!.body).toBe('Priority medium → high');
    expect(events.find((e) => e.kind === 'status_changed')!.body).toBe('Status open → waiting');
  });

  it('emits nothing when nothing changed', () => {
    expect(diffTicketEvents(base, { ...base })).toEqual([]);
  });

  /**
   * The three link columns share ONE event kind, so a merged implementation
   * ("something was linked") would satisfy the kind assertion above while
   * losing which of the three moved. Each body has to name its own field.
   */
  it('emits a separate linked event per link column, naming each one', () => {
    const events = diffTicketEvents(base, {
      ...base,
      community_id: 7,
      thread_id: 12,
      external_ref: 'SENTRY-91',
    });
    expect(events.map((e) => e.body)).toEqual([
      'Linked to community 7',
      'Linked to thread 12',
      'External reference set to SENTRY-91',
    ]);
  });

  it('describes an unassignment rather than assigning to nobody', () => {
    const assigned: SupportTicketRow = { ...base, assignee_user_id: 'u2' };
    expect(diffTicketEvents(assigned, base)).toEqual([{ kind: 'assigned', body: 'Unassigned' }]);
  });

  /**
   * `title`, `description` and `category` have no kind in the closed
   * `support_ticket_events_kind_check` vocabulary. Emitting one anyway would be
   * a 23514 on the INSERT — a 500 on an otherwise valid triage edit.
   */
  it('emits nothing for fields with no event kind', () => {
    expect(
      diffTicketEvents(base, { ...base, title: 'renamed', description: 'x', category: 'billing' }),
    ).toEqual([]);
  });

  /**
   * The queue order cannot be a PostgREST `.order()`: both columns are `text`,
   * and alphabetical order is not their meaning — `open` < `resolved` <
   * `waiting` would sort resolved work above waiting work, and `high` < `low` <
   * `medium` would sort low above medium.
   */
  it('sorts open before waiting before resolved, then high before medium before low', () => {
    const sorted = sortTickets([
      queued(1, 'resolved', 'high'),
      queued(2, 'waiting', 'high'),
      queued(3, 'open', 'low'),
      queued(4, 'open', 'medium'),
      queued(5, 'open', 'high'),
    ]);

    expect(sorted.map((t) => t.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it('breaks ties on most recently updated', () => {
    const sorted = sortTickets([
      queued(1, 'open', 'high', '2026-09-01T00:00:00.000Z'),
      queued(2, 'open', 'high', '2026-09-09T00:00:00.000Z'),
      queued(3, 'open', 'high', '2026-09-05T00:00:00.000Z'),
    ]);

    expect(sorted.map((t) => t.id)).toEqual([2, 3, 1]);
  });
});
