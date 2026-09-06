import { SUPPORT_MAILBOX_FROM, type SupportMailbox } from '@propertypro/shared';

/**
 * Reply construction for the support inbox. Pure — no PostgREST, no env, no
 * clock — so the RFC rules below are testable without mocking a database.
 */

/** Reply/forward prefixes, in the casings and spacings mail clients emit. */
const SUBJECT_PREFIX = /^\s*(re|fwd|fw|aw|sv|vs)\s*(\[\d+\])?\s*:\s*/i;

/**
 * Prefix a subject with exactly one `Re:`.
 *
 * Strips every existing prefix first, so a long exchange does not accumulate
 * "Re: Re: Re: Fwd: Re:" — which is ugly, and which also defeats the
 * ingestion side's subject-based fallback matching once the prefixes push the
 * real subject past a client's truncation.
 */
export function buildReplySubject(parentSubject: string | null): string {
  let base = parentSubject ?? '';
  let changed = true;
  while (changed) {
    const before = base;
    base = base.replace(SUBJECT_PREFIX, '');
    changed = base !== before;
  }
  base = base.trim();
  return base.length > 0 ? `Re: ${base}` : 'Re: (no subject)';
}

/**
 * Cap on the References chain.
 *
 * RFC 5322 §3.6.4 explicitly permits trimming the middle of a long chain, and
 * some MTAs reject or truncate very long headers. Keeping the TAIL keeps the
 * most recent ancestors, which are the ones any client actually threads on.
 */
const MAX_REFERENCES = 20;

/**
 * The References chain for a reply: the parent's chain plus the parent itself.
 *
 * This is what makes threading work at all in this feature. Resend does not
 * return the RFC Message-ID it stamps on our outbound mail, so our own reply
 * rows cannot record their own id — meaning a customer's reply names an id we
 * have never seen in `In-Reply-To`. What saves it is that any conformant
 * client echoes the whole References chain back, and that chain still contains
 * the ORIGINAL inbound Message-ID, which we do have. Ingestion matches on any
 * entry in the chain, so the thread is re-found.
 */
export function buildReplyReferences(parent: {
  rfcMessageId: string | null;
  references: string[] | null;
}): string[] {
  const chain: string[] = [];
  for (const id of parent.references ?? []) {
    if (id && !chain.includes(id)) chain.push(id);
  }
  if (parent.rfcMessageId && !chain.includes(parent.rfcMessageId)) {
    chain.push(parent.rfcMessageId);
  }
  return chain.length > MAX_REFERENCES ? chain.slice(-MAX_REFERENCES) : chain;
}

const angle = (id: string): string => `<${id}>`;

/**
 * The threading headers for `sendEmail({ headers })`.
 *
 * Returns an EMPTY object when the parent has no Message-ID, rather than an
 * `In-Reply-To: <>`: a malformed header is worse than an absent one, because
 * some clients drop the whole message and others start a new thread anyway.
 */
export function buildReplyHeaders(parent: {
  rfcMessageId: string | null;
  references: string[] | null;
}): Record<string, string> {
  if (!parent.rfcMessageId) return {};

  const references = buildReplyReferences(parent);
  return {
    'In-Reply-To': angle(parent.rfcMessageId),
    References: references.map(angle).join(' '),
  };
}

/**
 * The `From` for a reply — always the mailbox the thread arrived on.
 *
 * Answering a `privacy@` thread from `support@` misroutes the recipient's next
 * reply and reads as a different department. Passed explicitly to `sendEmail`
 * so it can never fall back to `RESEND_FROM` or the package default
 * (`noreply@`), which no human should be asked to answer.
 */
export function replyFromAddress(mailbox: SupportMailbox): string {
  return SUPPORT_MAILBOX_FROM[mailbox];
}

/** How much of the parent message to quote back. */
const MAX_QUOTE_CHARS = 4000;

/**
 * The plain-text quote appended under a reply.
 *
 * Plain text ONLY, never the sender's HTML: that is attacker-controlled markup,
 * and echoing it into an outbound message would make us the delivery vehicle
 * for it.
 */
export function buildQuotedText(parent: { textBody: string | null }): string | undefined {
  const text = parent.textBody?.trim();
  if (!text) return undefined;
  return text.length > MAX_QUOTE_CHARS
    ? `${text.slice(0, MAX_QUOTE_CHARS)}\n[...]`
    : text;
}
