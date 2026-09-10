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
 * The subject stored for a thread whose first message carried no `Subject:`.
 *
 * This is a DISPLAY placeholder, not a subject. It exists because
 * `support_inbox_threads.subject` is NOT NULL while a real email's subject is
 * optional, so the ingest has to write something.
 *
 * It is exported — rather than being a literal at the one write site — because
 * the REPLY path has to recognise it and treat it as absent. It did not, and
 * every reply to a subjectless message went out titled `Re: (no subject)`: a
 * parenthetical where a human subject belongs, which is a shape bulk mail has
 * and a 1:1 reply does not. The first such reply landed in Gmail's spam folder.
 *
 * A fix that only handled null could not work, because null is not what the
 * reply path receives. Anything comparing against this value must import it.
 */
export const SUPPORT_THREAD_NO_SUBJECT = '(no subject)';

/**
 * The display name a reply is sent and signed under, per mailbox.
 *
 * Single-sourced because it appears TWICE in every reply — in the RFC 5322
 * `From` header and again in the signature block at the foot of the body — and
 * the two must never disagree. They did: the signature was a hardcoded literal
 * in the email template, so a `privacy@` reply went out `From: PropertyPro
 * Privacy` and then signed itself "PropertyPro Support", quietly undoing the
 * per-mailbox routing the `From` had just got right.
 */
export const SUPPORT_MAILBOX_SENDER_NAME: Record<SupportMailbox, string> = {
  support: 'PropertyPro Support',
  privacy: 'PropertyPro Privacy',
  contact: 'PropertyPro',
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
  support: `${SUPPORT_MAILBOX_SENDER_NAME.support} <${SUPPORT_MAILBOX_ADDRESS.support}>`,
  privacy: `${SUPPORT_MAILBOX_SENDER_NAME.privacy} <${SUPPORT_MAILBOX_ADDRESS.privacy}>`,
  contact: `${SUPPORT_MAILBOX_SENDER_NAME.contact} <${SUPPORT_MAILBOX_ADDRESS.contact}>`,
};

/**
 * Every local part routed into the inbox, mapped to the mailbox it lands in.
 *
 * Must stay in step with the `forward-email=` alias TXT record: an alias routed
 * in DNS but missing here resolves to the fallback mailbox rather than being
 * lost, but the thread lands in the wrong place — SILENTLY. Nothing logs it.
 * The arrival address is recorded on the message row as `delivered_to`, so a
 * misroute is one query away, but it will not announce itself.
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

// ---------------------------------------------------------------------------
// Canned replies
// ---------------------------------------------------------------------------

/**
 * Three quick-insert replies per mailbox, shown as chips above the reply
 * composer. Fixed length (3) rather than open-ended: this is a starting set an
 * operator can paste from and edit, not a saved-reply library — see
 * `SUPPORT_MAILBOX_CANNED_REPLIES[mb]).toHaveLength(3)` in
 * `support-inbox-canned.test.ts`, which pins the count deliberately.
 */
export const SUPPORT_MAILBOX_CANNED_REPLIES: Record<SupportMailbox, readonly string[]> = {
  support: ['Thanks — looking into it', 'Can you share a screenshot?', 'Fixed, please retry'],
  privacy: ['Confirm identity request', 'Cooling-off period explained', 'Deletion completed'],
  contact: ['Book a demo', 'Pricing overview', 'Refer to §718 guide'],
};

// ---------------------------------------------------------------------------
// Thread context strip
// ---------------------------------------------------------------------------

export interface SupportMailboxContext {
  /** Short heading for the strip. */
  title: string;
  /** One sentence of "why this matters" copy. */
  text: string;
  /** The accessible name of the strip's action control — a Link or a button, per mailbox. */
  action: string;
}

/**
 * The admin inbox's per-mailbox "what to do next" strip (design spec D14/D15).
 * This copy is authored here, not copied from a spec — no prior version of it
 * exists in the repo.
 */
export const SUPPORT_MAILBOX_CONTEXT: Record<SupportMailbox, SupportMailboxContext> = {
  support: {
    title: 'Escalate to a ticket',
    text: "Turn this thread into a tracked support ticket so it shows up in the queue with the rest of the team's work.",
    action: 'Create ticket',
  },
  privacy: {
    title: 'Handle as a data request',
    text: 'Privacy mail often maps to a formal deletion request. Open the deletion queue filtered to this sender to check for a matching case.',
    action: 'Open deletion request',
  },
  contact: {
    title: 'Turn this into a lead',
    text: 'A contact@ message is usually a sales inquiry. Convert it to a lead so it enters the pipeline instead of staying stuck in the inbox.',
    action: 'Convert to lead',
  },
};

/**
 * Whether a mailbox's context-strip action has a real destination to send the
 * operator to, RIGHT NOW.
 *
 * `support` → `/tickets/new`, created by Task 22 (Wave 3); `/tickets` is a nav
 * stub today. `privacy` → `/deletion-requests?q=`, not read by anything until
 * Task 18 adds the `?q=` filter to `DeletionRequestsDashboard`. `contact` →
 * `POST /api/admin/leads`, which ships in this same task.
 *
 * `ThreadContextStrip` reads this directly rather than hardcoding readiness
 * per mailbox, so the fix for Task 22 / Task 18 is flipping ONE boolean here —
 * not finding every place that decided a route existed. A console that offers
 * an action and then 404s is worse than one that offers it a wave later.
 */
export const SUPPORT_MAILBOX_CONTEXT_ACTION_READY: Record<SupportMailbox, boolean> = {
  support: false,
  privacy: false,
  contact: true,
};

