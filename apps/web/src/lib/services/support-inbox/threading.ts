import { createHash } from 'node:crypto';

import type { SupportThreadStatus } from '@propertypro/shared';

import type { InboundEmail } from './types';

/**
 * Pure threading logic for the support inbox. No I/O, no env, no clock — so
 * every rule below is testable without touching a database.
 */

/** Prefixes mail clients prepend, in the casings and spacings seen in the wild. */
const SUBJECT_PREFIX = /^\s*(re|fwd|fw|aw|sv|vs)\s*(\[\d+\])?\s*:\s*/i;
const BRACKET_TAG = /^\s*\[[^\]]{1,40}\]\s*/;

/**
 * Strip reply/forward prefixes and list tags, collapse whitespace, lowercase.
 *
 * Loops because clients stack them: "Re: Fwd: RE: [EXTERNAL] Question" must
 * reduce to "question", or a long thread fragments into a new thread every
 * time someone forwards it.
 */
export function normalizeSubject(subject: string | null): string {
  let out = subject ?? '';
  let changed = true;
  while (changed) {
    const before = out;
    out = out.replace(SUBJECT_PREFIX, '').replace(BRACKET_TAG, '');
    changed = out !== before;
  }
  return out.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Strip angle brackets and surrounding whitespace from a Message-ID.
 *
 * Deliberately does NOT lowercase. RFC 5322 makes the local part of a
 * Message-ID case-sensitive, so folding case can merge two distinct ids and
 * silently glue unrelated conversations together.
 */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Split a References-style header (whitespace-separated ids) into normalized ids. */
export function parseMessageIdList(
  value: string | string[] | null | undefined,
): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\s+/)
      : [];
  const out: string[] = [];
  for (const candidate of raw) {
    const id = normalizeMessageId(candidate);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * The ids to look up, nearest ancestor first.
 *
 * `In-Reply-To` names the immediate parent, so it goes first; `References` is
 * oldest-to-newest, so it is walked BACKWARDS. Order matters when one chain
 * spans two of our threads — the nearest ancestor is the right answer.
 */
export function collectAncestorIds(email: InboundEmail): string[] {
  const ids: string[] = [];
  const push = (id: string | null) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(normalizeMessageId(email.inReplyTo));
  for (let i = email.references.length - 1; i >= 0; i -= 1) {
    push(normalizeMessageId(email.references[i]));
  }
  return ids;
}

/**
 * The idempotency fence, hashed into `support_inbox_messages.dedupe_key`.
 *
 * Hashes NORMALIZED fields, never the raw payload: a provider that starts
 * stamping a per-delivery timestamp or retry counter into its JSON must not
 * thereby start producing duplicates.
 *
 * The mailbox is part of the input because the same message legitimately
 * arrives twice when someone addresses both support@ and privacy@ — that is two
 * threads, not one duplicate.
 *
 * When the sender supplied no Message-ID (it is an OPTIONAL header) the digest
 * falls back to the message's own content. That is exactly why this is a
 * separate column rather than `UNIQUE (rfc_message_id)`: Postgres treats NULLs
 * as distinct, so a unique index on an optional header silently fails to dedupe
 * precisely the messages most likely to be mis-threaded already.
 */
export function buildDedupeKey(email: InboundEmail): string {
  const identity =
    email.rfcMessageId ??
    [
      email.from.email,
      email.subject ?? '',
      email.sentAt?.toISOString() ?? '',
      email.textBody ?? '',
      email.htmlBody ?? '',
    ].join(' ');

  return createHash('sha256').update(`${email.mailbox}\n${identity}`).digest('hex');
}

/**
 * The thread's status after a new INBOUND message arrives.
 *
 * `closed` reopens: someone replying to a closed ticket expects an answer, and
 * leaving it closed hides it from the queue.
 *
 * `spam` does NOT reopen. That status is the operator's explicit verdict, and
 * undoing it automatically would make the spam button useless — the next
 * message from the same sender would put the thread straight back in the inbox.
 */
export function nextThreadStatus(current: SupportThreadStatus): SupportThreadStatus {
  return current === 'spam' ? 'spam' : 'open';
}

/**
 * How far back the subject-and-sender fallback will look.
 *
 * Only consulted when the RFC headers are absent, which happens when a message
 * is forwarded from a phone or written by a client that drops them.
 */
export const THREAD_FALLBACK_WINDOW_DAYS = 14;
