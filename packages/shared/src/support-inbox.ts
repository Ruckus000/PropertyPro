/**
 * Platform support inbox — the shared vocabulary.
 *
 * `support@`, `privacy@` and `contact@getpropertypro.com` are received by
 * Forward Email, POSTed to the web app's inbound webhook, and answered from the
 * admin console. Three surfaces therefore need the same two closed sets:
 *
 *   1. apps/web  — the normalizer, to decide which mailbox a message arrived on
 *   2. apps/admin — the inbox filters, the Zod schemas and the reply `From`
 *   3. packages/db — the migration's CHECK constraints
 *
 * (3) is the unavoidable duplicate: SQL cannot import TypeScript. The migration
 * names this file in a comment so the pairing is discoverable; changing a
 * mailbox or a status means changing both, and nothing but review enforces it.
 *
 * Lives in @propertypro/shared rather than either app because a rule with three
 * consumers and one meaning belongs in one place — otherwise adding a fourth
 * mailbox means finding every copy.
 */

/** The domain every support mailbox lives on. */
export const SUPPORT_MAILBOX_DOMAIN = 'getpropertypro.com';

// ---------------------------------------------------------------------------
// Mailboxes
// ---------------------------------------------------------------------------

/**
 * The mailboxes a thread can belong to.
 *
 * `support` and `privacy` are already published — on the contact page, the
 * marketing footer, the accessibility page and the privacy policy — so they are
 * load-bearing, not aspirational. `contact` is new.
 */
export const SUPPORT_MAILBOXES = ['support', 'privacy', 'contact'] as const;
export type SupportMailbox = (typeof SUPPORT_MAILBOXES)[number];

/** Human-readable names for the inbox filter and thread header. */
export const SUPPORT_MAILBOX_LABELS: Record<SupportMailbox, string> = {
  support: 'Support',
  privacy: 'Privacy',
  contact: 'Contact',
};

/** The bare address for each mailbox — `support@getpropertypro.com`, etc. */
export const SUPPORT_MAILBOX_ADDRESS: Record<SupportMailbox, string> = {
  support: `support@${SUPPORT_MAILBOX_DOMAIN}`,
  privacy: `privacy@${SUPPORT_MAILBOX_DOMAIN}`,
  contact: `contact@${SUPPORT_MAILBOX_DOMAIN}`,
};

/**
 * The RFC 5322 `From` for a reply, per mailbox.
 *
 * A reply MUST be sent from the mailbox its thread arrived on — answering a
 * `privacy@` thread from `support@` misroutes the recipient's reply and reads
 * as a different department. The admin reply route passes this explicitly to
 * `sendEmail({ from })` rather than letting it fall back to `RESEND_FROM` or
 * the package default (`noreply@`), which no human should ever be asked to
 * answer.
 */
export const SUPPORT_MAILBOX_FROM: Record<SupportMailbox, string> = {
  support: `PropertyPro Support <${SUPPORT_MAILBOX_ADDRESS.support}>`,
  privacy: `PropertyPro Privacy <${SUPPORT_MAILBOX_ADDRESS.privacy}>`,
  contact: `PropertyPro <${SUPPORT_MAILBOX_ADDRESS.contact}>`,
};

/**
 * Every local part routed into the inbox, mapped to the mailbox it lands in.
 *
 * Must stay in step with the `forward-email=` alias TXT record: an alias routed
 * in DNS but missing here resolves to the fallback mailbox with a
 * `mailbox_unresolved` log line rather than being lost, but the thread lands in
 * the wrong place.
 *
 * `postmaster` and `abuse` are here because RFC 2142 expects them to accept
 * mail once a domain publishes MX, and a bounced abuse report is worse than a
 * misfiled one. They are rare and operational, so they join `support` rather
 * than earning a mailbox of their own.
 */
export const SUPPORT_ALIAS_TO_MAILBOX: Readonly<Record<string, SupportMailbox>> = {
  support: 'support',
  privacy: 'privacy',
  contact: 'contact',
  hello: 'contact',
  postmaster: 'support',
  abuse: 'support',
};

/**
 * Where a message goes when no alias matches — a BCC, or a mailing-list
 * expansion that rewrote the envelope.
 *
 * Deliberately a real mailbox and not a rejection: refusing the message would
 * make the provider retry it forever, and a misfiled support email is
 * recoverable in a way a discarded one is not.
 */
export const SUPPORT_FALLBACK_MAILBOX: SupportMailbox = 'support';

// ---------------------------------------------------------------------------
// Thread status
// ---------------------------------------------------------------------------

/**
 * Triage states. `spam` is a shelf, not a delete — the thread leaves the
 * default list but stays readable, because a false positive on a statutory
 * records request is not recoverable from a deleted row.
 */
export const SUPPORT_THREAD_STATUSES = ['open', 'pending', 'closed', 'spam'] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

export const SUPPORT_THREAD_STATUS_LABELS: Record<SupportThreadStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  closed: 'Closed',
  spam: 'Spam',
};

/** Narrow an untrusted string to a mailbox. */
export function isSupportMailbox(value: unknown): value is SupportMailbox {
  return typeof value === 'string' && (SUPPORT_MAILBOXES as readonly string[]).includes(value);
}

/** Narrow an untrusted string to a thread status. */
export function isSupportThreadStatus(value: unknown): value is SupportThreadStatus {
  return (
    typeof value === 'string' &&
    (SUPPORT_THREAD_STATUSES as readonly string[]).includes(value)
  );
}
