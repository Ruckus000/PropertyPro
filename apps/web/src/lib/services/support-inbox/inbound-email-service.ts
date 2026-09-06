/**
 * Persistence for the platform support inbox.
 *
 * The ONLY module in this feature that touches the database — the route imports
 * no table references (`guard:route-table-imports`).
 *
 * Unscoped by necessity, not by shortcut: `support_inbox_threads` and
 * `support_inbox_messages` have no `community_id` because whoever writes to
 * support@ is usually not a member of any community and often not a user at
 * all. There is no tenant to scope to, so `createScopedClient` cannot express
 * these tables at all.
 */
import { createHash } from 'node:crypto';

// support_inbox_* have no community_id by design (see rls-config.ts), so there
// is no tenant to scope to; the route in front of this is signature-verified.
// AUTHZ: platform support inbox — tables have no community_id; no tenant data read.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { supportInboxMessages, supportInboxThreads } from '@propertypro/db';
import { and, desc, eq, gte, inArray, ne } from '@propertypro/db/filters';
import type { SupportThreadStatus } from '@propertypro/shared';

import {
  buildDedupeKey,
  collectAncestorIds,
  nextThreadStatus,
  normalizeSubject,
  THREAD_FALLBACK_WINDOW_DAYS,
} from './threading';
import type { InboundEmail } from './types';

/**
 * `INSERT ... RETURNING` always yields a row, but the driver's type does not
 * say so. Throwing here rather than using `!` keeps the failure a real 500 with
 * a message that names the table, instead of a downstream `undefined.id`.
 */
function requireRow<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`support inbox: ${what} returned no row`);
  return row;
}

/**
 * The unscoped Drizzle client, and the transaction handle it hands a callback.
 * Derived rather than imported: `@propertypro/db/unsafe` exports the factory,
 * not the type.
 */
type UnscopedDb = ReturnType<typeof createUnscopedClient>;
type UnscopedTx = Parameters<Parameters<UnscopedDb['transaction']>[0]>[0];

export interface PersistInboundEmailResult {
  threadId: number;
  messageId: number;
  /** True when this exact message had already been stored — nothing was written. */
  duplicate: boolean;
}

/**
 * Postgres unique-violation. Same shape as the local helper in the Stripe
 * webhook route; kept local here too rather than extracted, because the two
 * existing copies already disagree on signature and reconciling them is not
 * this feature's job.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

async function findMessageIdByDedupeKey(
  db: UnscopedDb | UnscopedTx,
  dedupeKey: string,
): Promise<{ id: number; threadId: number } | null> {
  const rows = await db
    .select({ id: supportInboxMessages.id, threadId: supportInboxMessages.threadId })
    .from(supportInboxMessages)
    .where(eq(supportInboxMessages.dedupeKey, dedupeKey))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Find the thread this message belongs to.
 *
 * 1. The RFC headers, nearest ancestor first. This is the only match that is
 *    actually CORRECT, so it is tried first and exclusively.
 * 2. Failing that, a heuristic on (mailbox, participant, normalized subject)
 *    inside a rolling window. Only reachable when a client dropped the headers
 *    — common when someone forwards from a phone.
 *
 * Requiring the SAME SENDER in step 2 is the safety property, not an
 * optimisation: without it, "Re: Question" from two unrelated people merges
 * into one thread and each of them can read the other's correspondence.
 */
async function findThreadId(db: UnscopedDb | UnscopedTx, email: InboundEmail): Promise<number | null> {
  const ancestors = collectAncestorIds(email);

  if (ancestors.length > 0) {
    const matches = await db
      .select({
        threadId: supportInboxMessages.threadId,
        rfcMessageId: supportInboxMessages.rfcMessageId,
      })
      .from(supportInboxMessages)
      .where(inArray(supportInboxMessages.rfcMessageId, ancestors));

    // Preserve ancestor precedence: the query returns rows in whatever order
    // Postgres likes, but "nearest ancestor wins" is the rule that matters when
    // one chain spans two of our threads.
    for (const ancestor of ancestors) {
      const hit = matches.find((row) => row.rfcMessageId === ancestor);
      if (hit) return hit.threadId;
    }
  }

  const since = new Date(Date.now() - THREAD_FALLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const fallback = await db
    .select({ id: supportInboxThreads.id })
    .from(supportInboxThreads)
    .where(
      and(
        eq(supportInboxThreads.mailbox, email.mailbox),
        eq(supportInboxThreads.participantEmail, email.from.email),
        eq(supportInboxThreads.normalizedSubject, normalizeSubject(email.subject)),
        ne(supportInboxThreads.status, 'spam'),
        gte(supportInboxThreads.lastMessageAt, since),
      ),
    )
    .orderBy(desc(supportInboxThreads.lastMessageAt))
    .limit(1);

  return fallback[0]?.id ?? null;
}

/**
 * Store one received message, creating or updating its thread.
 *
 * The message row IS the idempotency fence — there is no separate fence table.
 * Stripe's webhook needs `stripe_webhook_events` because processing one event
 * writes to a dozen tables and cannot be a single transaction, so it needs a
 * `processed_at` to tell "seen but failed" from "never seen". Here the whole
 * effect is two rows in one transaction: a rollback leaves nothing behind, so
 * "seen but failed" is simply "absent" and a provider retry re-processes
 * cleanly. A fourth table would add a state that can drift from what it
 * describes — and the transaction is also what stops a race leaving an orphan
 * thread with no messages.
 */
export async function persistInboundEmail(
  email: InboundEmail,
): Promise<PersistInboundEmailResult> {
  const db = createUnscopedClient();
  const dedupeKey = buildDedupeKey(email);

  const existing = await findMessageIdByDedupeKey(db, dedupeKey);
  if (existing) {
    return { threadId: existing.threadId, messageId: existing.id, duplicate: true };
  }

  const occurredAt = email.sentAt ?? new Date();

  try {
    return await db.transaction(async (tx) => {
      const threadId = await resolveThreadId(tx, email, occurredAt);

      const [message] = await tx
        .insert(supportInboxMessages)
        .values({
          threadId,
          kind: 'email',
          direction: 'inbound',
          dedupeKey,
          rfcMessageId: email.rfcMessageId,
          inReplyTo: email.inReplyTo,
          referencesIds: email.references,
          deliveredTo: email.deliveredTo,
          fromEmail: email.from.email,
          fromName: email.from.name,
          toEmails: email.to.map((address) => address.email),
          ccEmails: email.cc.map((address) => address.email),
          subject: email.subject,
          textBody: email.textBody,
          htmlBody: email.htmlBody,
          sentAt: email.sentAt,
          hasAttachments: email.hasAttachments,
          normalizationStatus: 'ok',
        })
        .returning({ id: supportInboxMessages.id });

      await bumpThread(tx, threadId, occurredAt);

      return {
        threadId,
        messageId: requireRow(message, 'message insert').id,
        duplicate: false,
      };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // Lost a race with a concurrent delivery of the same message. The whole
    // transaction rolled back, so there is nothing to clean up — re-read the
    // winner's row and report a duplicate.
    const winner = await findMessageIdByDedupeKey(db, dedupeKey);
    if (!winner) throw error;
    return { threadId: winner.threadId, messageId: winner.id, duplicate: true };
  }
}

async function resolveThreadId(
  tx: UnscopedTx,
  email: InboundEmail,
  occurredAt: Date,
): Promise<number> {
  const found = await findThreadId(tx, email);
  if (found !== null) return found;

  const [thread] = await tx
    .insert(supportInboxThreads)
    .values({
      mailbox: email.mailbox,
      subject: email.subject ?? '(no subject)',
      normalizedSubject: normalizeSubject(email.subject),
      participantEmail: email.from.email,
      participantName: email.from.name,
      status: 'open',
      firstMessageAt: occurredAt,
      lastMessageAt: occurredAt,
      messageCount: 0,
    })
    .returning({ id: supportInboxThreads.id });

  return requireRow(thread, 'thread insert').id;
}

/** Advance the thread's counters and reopen it if the operator had closed it. */
async function bumpThread(tx: UnscopedTx, threadId: number, occurredAt: Date): Promise<void> {
  const [thread] = await tx
    .select({
      status: supportInboxThreads.status,
      messageCount: supportInboxThreads.messageCount,
      lastMessageAt: supportInboxThreads.lastMessageAt,
    })
    .from(supportInboxThreads)
    .where(eq(supportInboxThreads.id, threadId))
    .limit(1);

  const now = new Date();
  await tx
    .update(supportInboxThreads)
    .set({
      status: nextThreadStatus((thread?.status ?? 'open') as SupportThreadStatus),
      messageCount: (thread?.messageCount ?? 0) + 1,
      // A sender-supplied Date can be in the past; never move the sort key
      // backwards or a reply would bury itself below older threads.
      lastMessageAt:
        thread && thread.lastMessageAt > occurredAt ? thread.lastMessageAt : occurredAt,
      updatedAt: now,
    })
    .where(eq(supportInboxThreads.id, threadId));
}

/**
 * Store a payload the normalizer could not read.
 *
 * This is both the quarantine and the fixture-capture mechanism, which is why
 * there is no separate capture flag: the first message whose shape we guessed
 * wrong lands here to be read out of Postgres and frozen as a test fixture.
 *
 * Deliberately written to the database and not to logs — it holds a third
 * party's email body.
 *
 * The thread it hangs off is synthetic (the sender is by definition unreadable,
 * or we would not be here), so it carries the fallback mailbox and a subject
 * that says what happened.
 */
export async function quarantineInboundPayload(
  payload: unknown,
  reason: string,
): Promise<{ threadId: number; messageId: number }> {
  const db = createUnscopedClient();
  const now = new Date();
  const dedupeKey = buildQuarantineKey(payload, now);

  return db.transaction(async (tx) => {
    const [thread] = await tx
      .insert(supportInboxThreads)
      .values({
        mailbox: 'support',
        subject: 'Unreadable inbound payload',
        normalizedSubject: 'unreadable inbound payload',
        participantEmail: 'unknown@invalid',
        participantName: null,
        status: 'open',
        firstMessageAt: now,
        lastMessageAt: now,
        messageCount: 1,
      })
      .returning({ id: supportInboxThreads.id });

    const threadId = requireRow(thread, 'quarantine thread insert').id;

    const [message] = await tx
      .insert(supportInboxMessages)
      .values({
        threadId,
        kind: 'email',
        direction: 'inbound',
        dedupeKey,
        // The kind-shape CHECK requires a sender on an email row; this is the
        // honest placeholder for "we could not read one".
        fromEmail: 'unknown@invalid',
        subject: `Unreadable inbound payload: ${reason}`,
        textBody: reason,
        rawPayload: asJsonObject(payload),
        normalizationStatus: 'failed',
        receivedAt: now,
      })
      .returning({ id: supportInboxMessages.id });

    return { threadId, messageId: requireRow(message, 'quarantine message insert').id };
  });
}

function buildQuarantineKey(payload: unknown, at: Date): string {
  // Quarantine rows are deliberately NOT deduplicated against each other: if
  // the same malformed payload arrives twice we want to see both, because the
  // repetition is itself the signal that a provider shape changed.
  return createHash('sha256')
    .update(`quarantine\n${at.toISOString()}\n${safeStringify(payload)}`)
    .digest('hex');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[unserializable]';
  }
}

function asJsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return value === undefined ? null : { value: safeStringify(value) };
}
