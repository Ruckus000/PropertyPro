import {
  SUPPORT_ALIAS_TO_MAILBOX,
  SUPPORT_FALLBACK_MAILBOX,
  SUPPORT_MAILBOX_DOMAIN,
  type SupportMailbox,
} from '@propertypro/shared';

import { normalizeMessageId, parseMessageIdList } from './threading';
import {
  InboundEmailShapeError,
  type InboundEmail,
  type InboundEmailAddress,
} from './types';

/**
 * Turn a Forward Email webhook payload into an `InboundEmail`.
 *
 * ── The payload, read from their source (helpers/on-data-mx.js) ──
 *
 * The body is mailparser's `simpleParser` output spread at the top level
 * (`from`, `to`, `cc`, `subject`, `messageId`, `inReplyTo`, `references`,
 * `html`, `text`, `date`, `headerLines`), plus `recipients` (which aliases
 * matched), `session`, and the SPF/DKIM/DMARC results. `raw` and `attachments`
 * are present unless the webhook URL passes `?raw=false&attachments=false`,
 * which ours does — see below.
 *
 * ── Why this is written defensively ──
 *
 * Forward Email documents the payload thinly; the shape above is read from
 * their source, not a spec, and it can change without a version bump. So every
 * field is read through a reader that tolerates absent / null / scalar-where-an
 * -array-was-expected, and NOTHING throws on a missing optional.
 *
 * But defensive must not mean "invent a plausible empty message". If there is
 * no recoverable sender, this throws `InboundEmailShapeError`, the route
 * quarantines the payload into `raw_payload` with
 * `normalization_status='failed'`, and an operator reads the real shape out of
 * Postgres. A month of blank threads is far worse than one loud failure on day
 * one — and that quarantine row IS the fixture-capture mechanism, which is why
 * there is no separate capture flag.
 */

// ---------------------------------------------------------------------------
// Defensive readers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** Tolerates a bare scalar where an array was expected — a common provider drift. */
function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = readString(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Pull addresses out of a mailparser address object.
 *
 * simpleParser gives `{ value: [{ address, name }], text, html }`, but a bare
 * string or an array of either shape all show up depending on the header, so
 * each is handled rather than assumed.
 */
function readAddresses(value: unknown): InboundEmailAddress[] {
  const out: InboundEmailAddress[] = [];

  const pushOne = (candidate: unknown) => {
    const record = asRecord(candidate);
    if (record) {
      const email = readString(record.address) ?? readString(record.email);
      if (email) {
        out.push({ email: email.toLowerCase(), name: readString(record.name) });
      }
      return;
    }
    // A bare `"Jane Doe <jane@example.com>"` or `"jane@example.com"`.
    const raw = readString(candidate);
    if (!raw) return;
    const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);
    const angledEmail = angled?.[2];
    if (angledEmail) {
      out.push({
        email: angledEmail.trim().toLowerCase(),
        name: (angled?.[1] ?? '').trim().replace(/^"|"$/g, '') || null,
      });
    } else if (raw.includes('@')) {
      out.push({ email: raw.toLowerCase(), name: null });
    }
  };

  const record = asRecord(value);
  if (record && 'value' in record) {
    for (const entry of readArray(record.value)) pushOne(entry);
    return out;
  }
  for (const entry of readArray(value)) pushOne(entry);
  return out;
}

/** `Support <support@getpropertypro.com>` and `support@…` both yield `support`. */
function localPartOf(address: string): string | null {
  const at = address.lastIndexOf('@');
  if (at <= 0) return null;
  const local = address.slice(0, at).trim().toLowerCase();
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain === SUPPORT_MAILBOX_DOMAIN ? local : null;
}

// ---------------------------------------------------------------------------
// Mailbox resolution
// ---------------------------------------------------------------------------

export interface ResolvedMailbox {
  mailbox: SupportMailbox;
  deliveredTo: string | null;
  /** True when nothing matched and the fallback was used — the route logs this. */
  unresolved: boolean;
}

/**
 * Decide which mailbox a message landed in, without trusting one field.
 *
 * Order: the provider's own `recipients` / `session.recipient` (authoritative,
 * it is the alias that actually matched), then the `To` header, then `Cc`.
 *
 * When nothing matches — a BCC, or a mailing list that rewrote the envelope —
 * this falls back to a real mailbox rather than rejecting. A 400 here would
 * make the provider retry the same message forever, and a misfiled support
 * email is recoverable in a way a discarded one is not.
 */
export function resolveMailbox(payload: Record<string, unknown>): ResolvedMailbox {
  const candidates: string[] = [];

  for (const entry of readArray(payload.recipients)) {
    const value = readString(entry);
    if (value) candidates.push(value.toLowerCase());
  }
  const session = asRecord(payload.session);
  if (session) {
    const recipient = readString(session.recipient);
    if (recipient) candidates.push(recipient.toLowerCase());
  }
  for (const addr of readAddresses(payload.to)) candidates.push(addr.email);
  for (const addr of readAddresses(payload.cc)) candidates.push(addr.email);

  for (const candidate of candidates) {
    const local = localPartOf(candidate);
    if (!local) continue;
    const mailbox = SUPPORT_ALIAS_TO_MAILBOX[local];
    if (mailbox) return { mailbox, deliveredTo: candidate, unresolved: false };
  }

  return {
    mailbox: SUPPORT_FALLBACK_MAILBOX,
    deliveredTo: candidates[0] ?? null,
    unresolved: true,
  };
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * Did the original carry attachments?
 *
 * The webhook URL sets `?attachments=false`, so bodies never reach us — a
 * mailparser Buffer JSON-encodes as `{type:'Buffer',data:[…]}`, roughly 4-6x
 * the original size, and Vercel rejects request bodies over 4.5 MB before the
 * handler ever runs. Dropping them makes that failure structurally impossible.
 *
 * `headerLines` survives the flag, so the multipart type is still readable.
 * `multipart/mixed` means attachments; `multipart/alternative` is just a
 * text+HTML pair and must NOT count, or every HTML email claims an attachment.
 */
export function detectAttachments(payload: Record<string, unknown>): boolean {
  if (readArray(payload.attachments).length > 0) return true;

  for (const line of readArray(payload.headerLines)) {
    const record = asRecord(line);
    const text = readString(record?.line) ?? readString(line);
    if (!text) continue;
    if (/^content-type:\s*multipart\/mixed/i.test(text)) return true;
    if (/^content-disposition:\s*attachment/i.test(text)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The normalizer
// ---------------------------------------------------------------------------

export function normalizeForwardEmailPayload(payload: unknown): InboundEmail {
  const record = asRecord(payload);
  if (!record) {
    throw new InboundEmailShapeError('payload is not a JSON object');
  }

  const from = readAddresses(record.from)[0];
  if (!from) {
    // The one genuinely unrecoverable case: with no sender there is nobody to
    // reply to and no way to key a thread. Quarantine rather than invent.
    throw new InboundEmailShapeError('no sender address could be read');
  }

  const { mailbox, deliveredTo } = resolveMailbox(record);

  return {
    mailbox,
    deliveredTo,
    from,
    to: readAddresses(record.to),
    cc: readAddresses(record.cc),
    subject: readString(record.subject),
    textBody: readString(record.text),
    htmlBody: readString(record.html),
    rfcMessageId: normalizeMessageId(readString(record.messageId)),
    inReplyTo: normalizeMessageId(readString(record.inReplyTo)),
    references: parseMessageIdList(
      Array.isArray(record.references)
        ? (record.references as string[])
        : readString(record.references),
    ),
    sentAt: readDate(record.date),
    hasAttachments: detectAttachments(record),
  };
}
