/**
 * One derived reading of a signature request.
 *
 * The E-Sign screen asks the same question from three ends — Requests (what did
 * we send, and where has it got to), Waiting on (who is holding something up),
 * Templates (what can we send again). Every one of those needs the same handful
 * of facts, so they live here: no DOM, no network, `now` always injected.
 *
 * The sequential-blocking rule especially. Before this module it was written
 * three times — privately in `submission-detail.tsx`, again inside
 * `sendReminder`, and a third time as `getSignerContext`'s `isWaiting` — and the
 * restructure needed it in three more places. `sendReminder` is the one that
 * *enforces* it with a 422, so a screen that computes it differently offers a
 * button the API then refuses.
 *
 * Mirrors `lib/meetings/meeting-status.ts` and `lib/esign/builder-state.ts`.
 */
import { ESIGN_MAX_REMINDERS, type EsignSubmissionStatus } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Shapes — exactly what the list endpoint returns, nothing more
// ---------------------------------------------------------------------------

export interface EsignRequestSigner {
  id: number;
  /** Set when the signer is a member; null for an external party. */
  userId: string | null;
  name: string | null;
  email: string;
  role: string;
  status: string;
  sortOrder: number;
  /** Present only for callers who may act on this signer. */
  slug: string | null;
  completedAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
}

export interface EsignRequest {
  id: number;
  externalId: string;
  messageSubject: string | null;
  templateName: string | null;
  status: string;
  /** `pending` past its expiry reads as `expired` without any row being written. */
  effectiveStatus: EsignSubmissionStatus;
  signingOrder: string;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  signedDocumentPath: string | null;
  signers: EsignRequestSigner[];
}

/** Beyond this, an expiry is not worth interrupting anyone about. */
export const ESIGN_URGENT_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/** Never blank: the sender's subject, else the template, else the id. */
export function requestTitle(request: EsignRequest): string {
  const subject = request.messageSubject?.trim();
  if (subject) return subject;
  const template = request.templateName?.trim();
  if (template) return template;
  return `Request #${request.id}`;
}

export function templateLabel(request: EsignRequest): string {
  return request.templateName?.trim() || 'Sent without a template';
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface SignatureProgress {
  signed: number;
  total: number;
  /** Whole percent, 0 when there is nothing to divide by. */
  percent: number;
}

export function signatureProgress(request: EsignRequest): SignatureProgress {
  const total = request.signers.length;
  const signed = request.signers.filter((s) => s.status === 'completed').length;
  return {
    signed,
    total,
    percent: total === 0 ? 0 : Math.round((signed / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Sequential order
// ---------------------------------------------------------------------------

/**
 * The earliest earlier signer who has not completed, or null.
 *
 * Kept byte-equivalent to the predicate `sendReminder` enforces: strict `<` on
 * `sortOrder`, so signers who share a position do not block each other, and any
 * status other than `completed` blocks — a signer who DECLINED still holds up
 * the ones behind them, because the request is going nowhere.
 */
export function findBlockingPriorSigner<
  T extends { id: number; sortOrder: number; status: string },
>(signingOrder: string, signers: readonly T[], signer: T): T | null {
  if (signingOrder !== 'sequential') return null;

  const blocking = signers
    .filter(
      (candidate) =>
        candidate.id !== signer.id &&
        candidate.sortOrder < signer.sortOrder &&
        candidate.status !== 'completed',
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return blocking[0] ?? null;
}

/** The same rule, for callers that already hold a whole request. */
export function blockingPriorSignerFor(
  request: EsignRequest,
  signer: EsignRequestSigner,
): EsignRequestSigner | null {
  return findBlockingPriorSigner(request.signingOrder, request.signers, signer);
}

// ---------------------------------------------------------------------------
// Who still owes a signature
// ---------------------------------------------------------------------------

/**
 * Still to sign, and able to.
 *
 * Both halves matter. Nothing writes the signer rows when a submission expires,
 * so a signer on an expired request still reads `pending` — asking the signer
 * alone would report work that can no longer be done.
 */
export function isOpenSigner(request: EsignRequest, signer: EsignRequestSigner): boolean {
  if (request.effectiveStatus !== 'pending') return false;
  return signer.status === 'pending' || signer.status === 'opened';
}

/**
 * There is a link, and handing it over would do something.
 *
 * Separate from `canRemind` because the two differ by exactly one clause, and
 * `submission-detail.tsx` computed them as two overlapping inline predicates —
 * which is how you end up offering Copy link to a signer whose turn has not
 * come, on a URL the signing page then refuses.
 */
export function canShareLink(request: EsignRequest, signer: EsignRequestSigner): boolean {
  return (
    isOpenSigner(request, signer) &&
    signer.slug != null &&
    blockingPriorSignerFor(request, signer) === null
  );
}

/** Every gate `sendReminder` checks, so the button cannot promise what the API refuses. */
export function canRemind(request: EsignRequest, signer: EsignRequestSigner): boolean {
  return canShareLink(request, signer) && signer.reminderCount < ESIGN_MAX_REMINDERS;
}

export interface OutstandingSigner {
  request: EsignRequest;
  signer: EsignRequestSigner;
}

/**
 * Every open signer across every pending request — the Waiting-on view.
 *
 * Ordered by how soon the request expires, then by signing position. A request
 * with no expiry sorts LAST: under a naive comparison a null date beats every
 * real one, which would put the single request with no deadline at the top of a
 * deadline-ordered view.
 */
export function outstandingSigners(
  requests: EsignRequest[],
  _now: Date = new Date(),
): OutstandingSigner[] {
  const rows: OutstandingSigner[] = [];

  for (const request of requests) {
    for (const signer of request.signers) {
      if (isOpenSigner(request, signer)) rows.push({ request, signer });
    }
  }

  return rows.sort((a, b) => {
    const aExpiry = a.request.expiresAt ? Date.parse(a.request.expiresAt) : Infinity;
    const bExpiry = b.request.expiresAt ? Date.parse(b.request.expiresAt) : Infinity;
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    if (a.request.id !== b.request.id) return a.request.id - b.request.id;
    return a.signer.sortOrder - b.signer.sortOrder;
  });
}

/**
 * The one request worth a strip above the table, or null.
 *
 * Pending only. An expired request cannot be chased — it has to be resent — and
 * letting it hold this slot would push out the request someone can still act on.
 * It stays in the table below, badged Expired.
 */
export function mostUrgentRequest(
  requests: EsignRequest[],
  now: Date = new Date(),
): EsignRequest | null {
  const first = outstandingSigners(requests, now)[0];
  if (!first) return null;

  const left = daysLeft(first.request.expiresAt, now);
  if (left === null || left > ESIGN_URGENT_WINDOW_DAYS) return null;

  return first.request;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Whole days from `now` to `expiresAt`, floored, or null when there is no
 * expiry. Elapsed milliseconds rather than a calendar walk — the same reason
 * `posting-deadline.ts` does: a local-calendar add is an hour wrong across DST.
 */
export function daysLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const target = Date.parse(expiresAt);
  if (Number.isNaN(target)) return null;
  return Math.floor((target - now.getTime()) / DAY_MS);
}

export type ExpiryTone = 'neutral' | 'warning' | 'danger';

export interface ExpiryReading {
  label: string;
  tone: ExpiryTone;
  days: number;
}

export function describeExpiry(
  expiresAt: string | null,
  now: Date = new Date(),
): ExpiryReading | null {
  const days = daysLeft(expiresAt, now);
  if (days === null) return null;

  if (days < 0) {
    const ago = Math.abs(days);
    return { label: `Expired ${ago} day${ago === 1 ? '' : 's'} ago`, tone: 'danger', days };
  }
  if (days === 0) {
    return { label: 'Expires today', tone: 'warning', days };
  }
  return {
    label: `${days} day${days === 1 ? '' : 's'} left`,
    tone: days <= ESIGN_URGENT_WINDOW_DAYS ? 'warning' : 'neutral',
    days,
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** `''` is All. Mirrors the route's own accepted values. */
export const ESIGN_STATUS_FILTERS = [
  ['', 'All'],
  ['pending', 'Pending'],
  ['processing', 'Processing'],
  ['completed', 'Completed'],
  ['processing_failed', 'Processing Failed'],
  ['expired', 'Expired'],
] as const;

export type EsignStatusFilter = (typeof ESIGN_STATUS_FILTERS)[number][0];

/**
 * Counts keyed on the DERIVED status, so a pending request past its expiry is
 * counted under Expired — the same bucket the table shows it in. Empty buckets
 * report 0 rather than nothing: a blank pill reads as broken, a zero reads as
 * an answer.
 */
export function countByStatus(requests: EsignRequest[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key] of ESIGN_STATUS_FILTERS) counts[key] = 0;

  counts[''] = requests.length;
  for (const request of requests) {
    const key = request.effectiveStatus;
    if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export interface RequestFilter {
  status?: string;
  query?: string;
}

/** Status and text compose as AND. A blank query filters nothing. */
export function filterRequests(
  requests: EsignRequest[],
  { status, query }: RequestFilter,
): EsignRequest[] {
  const needle = query?.trim().toLowerCase() ?? '';

  return requests.filter((request) => {
    if (status && request.effectiveStatus !== status) return false;
    if (!needle) return true;

    const haystack = [
      requestTitle(request),
      request.templateName ?? '',
      ...request.signers.flatMap((s) => [s.name ?? '', s.email]),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(needle);
  });
}
