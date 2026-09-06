import type { SupportMailbox } from '@propertypro/shared';

/**
 * The normalized shape of one received message.
 *
 * THIS TYPE IS THE PROVIDER SEAM. Everything downstream — threading, the
 * dedupe key, persistence, the admin console — speaks only this. Moving from
 * Forward Email to Resend Inbound or a self-hosted Postal means writing a
 * second `normalize*` function that produces this, and changing one import in
 * the route. There is deliberately no adapter interface, no registry and no
 * provider env switch: there is one provider, so an abstraction over a set of
 * one would be scaffolding for a requirement nobody has.
 */
export interface InboundEmailAddress {
  email: string;
  name: string | null;
}

export interface InboundEmail {
  /** Which of our published mailboxes this landed in. */
  mailbox: SupportMailbox;
  /**
   * The literal address the provider matched, e.g. `hello@getpropertypro.com`.
   * Kept because several aliases collapse onto one mailbox and the distinction
   * is worth showing the operator.
   */
  deliveredTo: string | null;
  from: InboundEmailAddress;
  to: InboundEmailAddress[];
  cc: InboundEmailAddress[];
  subject: string | null;
  textBody: string | null;
  /** RAW sender HTML. Attacker-controlled; sanitize at render, never here. */
  htmlBody: string | null;
  /** RFC 5322 Message-ID with angle brackets stripped. Case preserved. */
  rfcMessageId: string | null;
  inReplyTo: string | null;
  /** The References chain, oldest first, angle brackets stripped. */
  references: string[];
  /** The `Date:` header. Sender-controlled, so possibly absent or absurd. */
  sentAt: Date | null;
  /**
   * Whether the original carried attachments.
   *
   * Inferred from the headers, not counted: the webhook URL sets
   * `?attachments=false` so bodies never reach us. This flag is what lets a
   * thread say "there was an attachment we did not keep" instead of rendering
   * a message that looks complete.
   */
  hasAttachments: boolean;
}

/**
 * Thrown when a payload cannot be normalized into something meaningful.
 *
 * Forward Email's payload shape is documented thinly, so the normalizer is
 * written defensively — but defensive must not mean "invent a plausible empty
 * message". A message with no recoverable sender is quarantined loudly instead,
 * because a month of blank threads is far worse than a visible failure on day
 * one.
 */
export class InboundEmailShapeError extends Error {
  constructor(reason: string) {
    super(`Inbound email payload could not be normalized: ${reason}`);
    this.name = 'InboundEmailShapeError';
  }
}

/**
 * Thrown when the webhook signature is missing, malformed or wrong.
 *
 * `kind` exists because the two cases need OPPOSITE HTTP statuses and the route
 * must not have to pattern-match on a message string to tell them apart:
 *   - `unconfigured` is OUR misconfiguration -> 500, loud, and retryable once
 *     fixed (the sender's mail server holds the message meanwhile).
 *   - `rejected` is someone else's problem -> 401. A legitimate key rotation
 *     still gets retried; a forgery just fails again, cheaply.
 */
export type InboundEmailSignatureFailure = 'unconfigured' | 'rejected';

export class InboundEmailSignatureError extends Error {
  readonly kind: InboundEmailSignatureFailure;

  constructor(kind: InboundEmailSignatureFailure, reason: string) {
    super(`Inbound email signature ${kind}: ${reason}`);
    this.name = 'InboundEmailSignatureError';
    this.kind = kind;
  }
}
