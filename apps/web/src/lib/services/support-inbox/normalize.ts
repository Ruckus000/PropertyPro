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

/** A verdict is a word ('pass', 'fail', 'softfail', 'none'). This is slack. */
const MAX_VERDICT_CHARS = 64;

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
  // Numbers only. A BOOLEAN must not stringify: mailparser sets `html` to
  // `false` when a message has no HTML part, and `String(false)` put the
  // literal word "false" into html_body for every plain-text-only sender —
  // enough to make sanitizeInboundHtml return a truthy string, so the console
  // offered "Show original HTML" and rendered a word the sender never wrote.
  // `text` and `subject` carry the same signal.
  if (typeof value === 'number') return String(value);
  return null;
}

/** Tolerates a bare scalar where an array was expected — a common provider drift. */
/**
 * An authentication verdict from the provider, clamped.
 *
 * Accepts a bare string OR one level of object nesting, because the provider
 * sends the latter — see the comment in the body. A boolean still does not
 * stringify, for the reason `readString` documents.
 *
 * The clamp matters either way: this is a remote party's value crossing a trust
 * boundary into an unconstrained text column, and a verdict is a word. Anything
 * longer is not a verdict, so keep a prefix — enough to recognise in a
 * quarantine investigation — rather than storing an unbounded blob or dropping
 * the evidence entirely.
 */
function readVerdict(value: unknown): string | null {
  // A bare string is the shape this reader was written for. It is NOT what
  // production sends: the first real message after this feature shipped stored
  // three nulls. Forward Email's MX is built on mailauth, which reports a
  // verdict as an OBJECT, so a string-only reader silently drops every one.
  // `result` and `status` are the keys mailauth uses; dig one level through
  // each rather than betting on a single shape.
  const direct = readString(value);
  if (direct !== null) return direct.slice(0, MAX_VERDICT_CHARS);

  const record = asRecord(value);
  if (record === null) return null;

  const nested =
    readString(record.result) ??
    readString(asRecord(record.status)?.result) ??
    readString(record.status);
  return nested === null ? null : nested.slice(0, MAX_VERDICT_CHARS);
}

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
  /** True when nothing matched and the fallback was used. */
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

/**
 * SPF/DKIM/DMARC verdicts read out of the RFC 8601 `Authentication-Results`
 * header, as a fallback for the provider's own JSON fields.
 *
 * This exists because the JSON fields are a bet on one vendor's undocumented
 * shape — the docblock at the top of this file says as much — and that bet lost
 * on the first real message. The header does not have that problem: it is a
 * standard every receiving MTA writes, in a format the RFC fixes, so a reader
 * for it survives a provider changing its payload or being swapped out.
 *
 * `headerLines` survives the `?attachments=false` flag, the same property
 * `detectAttachments` above relies on.
 *
 * Only the FIRST verdict per method is kept. Each hop prepends its own
 * `Authentication-Results`, and mailparser preserves that order, so the first
 * is the most recent hop — the one that actually authenticated this delivery.
 * A later one was written by a relay we have no reason to trust.
 */
function readAuthenticationResults(
  payload: Record<string, unknown>,
): { spf: string | null; dkim: string | null; dmarc: string | null } {
  const out: { spf: string | null; dkim: string | null; dmarc: string | null } = {
    spf: null,
    dkim: null,
    dmarc: null,
  };

  for (const line of readArray(payload.headerLines)) {
    const record = asRecord(line);
    const text = readString(record?.line) ?? readString(line);
    if (!text || !/^authentication-results\s*:/i.test(text)) continue;

    // The leading `(?:^|[;\s])` is load-bearing: without it `dkim=` would also
    // match inside tokens like `header.d=`, and `spf=` inside `receivedspf=`.
    const pairs = /(?:^|[;\s])(spf|dkim|dmarc)\s*=\s*([a-z]+)/gi;
    for (const match of text.matchAll(pairs)) {
      const [, rawMethod, rawVerdict] = match;
      if (rawMethod === undefined || rawVerdict === undefined) continue;
      const method = rawMethod.toLowerCase() as 'spf' | 'dkim' | 'dmarc';
      if (out[method] !== null) continue;
      out[method] = rawVerdict.toLowerCase().slice(0, MAX_VERDICT_CHARS);
    }
  }

  return out;
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
  const authResults = readAuthenticationResults(record);

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
    // Provider field first — it is their own explicit verdict — then the
    // standard header. Either may be absent; both being absent is the honest
    // null, and means this provider reports authentication nowhere we can read.
    spfResult: readVerdict(record.spf) ?? authResults.spf,
    dkimResult: readVerdict(record.dkim) ?? authResults.dkim,
    dmarcResult: readVerdict(record.dmarc) ?? authResults.dmarc,
  };
}
