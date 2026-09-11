'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AlertBanner, Button } from '@propertypro/ui';

import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_CATEGORY_LABELS,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_PRIORITY_LABELS,
  SUPPORT_TICKET_TITLE_MAX_LENGTH,
  type SupportTicketCategory,
  type SupportTicketPriority,
} from '@propertypro/shared';

export interface TicketFormCommunity {
  id: number;
  name: string;
}

export interface TicketFormInitial {
  title?: string;
  description?: string;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  communityId?: number | null;
  threadId?: number | null;
  externalRef?: string | null;
}

interface TicketFormProps {
  /** Real (non-demo, not soft-deleted) communities a ticket may be filed against. */
  communities: TicketFormCommunity[];
  /** Prefill resolved on the server from `?thread=`, `?community=`, `?ref=` and `?title=`. */
  initial: TicketFormInitial;
}

/** 44px below md, 36px at and above — `.claude/rules/design.md`. */
const FIELD_CLASSES =
  'min-h-11 w-full rounded-md border border-edge-strong bg-surface-card px-3 text-sm text-content disabled:opacity-60 md:min-h-9';

/**
 * Open a ticket.
 *
 * ## The server is the validator, deliberately
 *
 * There is no client-side title check here, and its absence is a decision rather
 * than an omission. `createTicketSchema` takes its bounds from
 * `@propertypro/shared`, which is also where the migration's
 * `support_tickets_title_check` got them, so the 400 an empty title earns is the
 * same answer the database would give — and it is ONE answer, in one place,
 * rather than two that can drift. A second copy of the rule in this component
 * would eventually disagree with it and reject something the platform accepts.
 *
 * The hidden link fields (`threadId`, `communityId`, `externalRef`) are carried
 * through as state rather than inputs: they come from the URL of whatever raised
 * the ticket — a support thread's context strip, a Sentry issue on Health — and
 * an operator has no reason to retype a thread id.
 */
export function TicketForm({ communities, initial }: TicketFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [priority, setPriority] = useState<SupportTicketPriority>(initial.priority ?? 'medium');
  const [category, setCategory] = useState<SupportTicketCategory>(initial.category ?? 'other');
  const [communityId, setCommunityId] = useState<string>(
    initial.communityId ? String(initial.communityId) : '',
  );
  const [assignToMe, setAssignToMe] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          // Omitted rather than sent empty: `description` is `.max(5000)`
          // optional, and an empty string would store a blank description
          // instead of none.
          ...(description.trim() ? { description: description.trim() } : {}),
          priority,
          category,
          communityId: communityId ? Number(communityId) : null,
          ...(initial.threadId ? { threadId: initial.threadId } : {}),
          ...(initial.externalRef ? { externalRef: initial.externalRef } : {}),
          assignToMe,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | { data?: { id?: number }; error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(body?.error?.message || 'We could not create this ticket. Please try again.');
        return;
      }

      const id = body?.data?.id;
      if (typeof id !== 'number') {
        setError('The ticket was created but we could not open it. Find it in the queue.');
        return;
      }
      router.push(`/tickets/${id}`);
    } catch {
      setError('We could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      // `noValidate`: see the docblock — the schema shared with the database is
      // the only validator, so native constraint UI would be a second opinion.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="max-w-2xl space-y-4"
    >
      {error ? <AlertBanner status="danger" title={error} /> : null}

      <div className="space-y-1">
        <label htmlFor="ticket-title" className="text-sm font-medium text-content">
          Title
        </label>
        <input
          id="ticket-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={SUPPORT_TICKET_TITLE_MAX_LENGTH}
          placeholder="What needs doing?"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ticket-description" className="text-sm font-medium text-content">
          Description
        </label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="What you know so far — steps, ids, what the customer said."
          className="w-full rounded-md border border-edge-strong bg-surface-card px-3 py-2 text-sm text-content"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="ticket-priority" className="text-sm font-medium text-content">
            Priority
          </label>
          <select
            id="ticket-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as SupportTicketPriority)}
            className={FIELD_CLASSES}
          >
            {SUPPORT_TICKET_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TICKET_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="ticket-category" className="text-sm font-medium text-content">
            Category
          </label>
          <select
            id="ticket-category"
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
            className={FIELD_CLASSES}
          >
            {SUPPORT_TICKET_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {SUPPORT_TICKET_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="ticket-community" className="text-sm font-medium text-content">
          Community
        </label>
        <select
          id="ticket-community"
          value={communityId}
          onChange={(event) => setCommunityId(event.target.value)}
          className={FIELD_CLASSES}
        >
          {/* A ticket with no community is normal, not a missing value — a broken
              deploy belongs to none. So this is a real choice, not a prompt. */}
          <option value="">No community — platform-wide</option>
          {communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm text-content md:min-h-9">
        <input
          type="checkbox"
          checked={assignToMe}
          onChange={(event) => setAssignToMe(event.target.checked)}
          className="h-4 w-4 rounded border-edge-strong"
        />
        Assign to me
      </label>

      {initial.threadId ? (
        <p className="text-xs text-content-tertiary">
          Will be linked to inbox thread {initial.threadId}.
        </p>
      ) : null}
      {initial.externalRef ? (
        <p className="text-xs text-content-tertiary">
          External reference <span className="font-mono">{initial.externalRef}</span> will be
          recorded on the ticket.
        </p>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        Create ticket
      </Button>
    </form>
  );
}
