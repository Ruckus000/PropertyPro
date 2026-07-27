/**
 * Website editor v3, Phase 7 — urgent notice pure logic.
 *
 * Shared by the API route, the two public renderers and the editor panel, so
 * this module must stay dependency-free. In particular it must never reach
 * `@/lib/site-assets/storage-paths`, which imports `node:crypto`: pulling that
 * into a client tree fails the production build only — typecheck and the unit
 * suite both stay green.
 */

/**
 * The cap, in code points.
 *
 * Enforced three times, deliberately. `maxLength` on the textarea is a
 * courtesy; the Zod schema rejects at the API boundary;
 * `normalizeUrgentNoticeText` re-checks after trimming; and a DB CHECK
 * (migration 0042) is the backstop. This write is public the instant it lands,
 * so there is no review step to catch what slips through.
 */
export const URGENT_NOTICE_MAX_LENGTH = 240;

/** The two fields the render-time expiry check needs. */
export interface UrgentNoticeLike {
  urgentNoticeText: string | null;
  /** `Date` from the DB, ISO string once it has crossed the API. */
  urgentNoticeExpiresAt: Date | string | null;
}

/**
 * Trim, collapse internal whitespace, and enforce the 240-code-point cap.
 *
 * Throws on empty or over-length input; callers translate that into their own
 * error type (the route raises `ValidationError` → HTTP 400).
 *
 * Two decisions worth stating:
 *
 * - **Length is measured in code points, not UTF-16 units.** `'🌀'.length` is
 *   2, so a plain `.length` check would reject a 240-character notice that
 *   reads as 240 characters to every human who sees it.
 * - **Markup is left intact.** Sanitising here would be the wrong layer: the
 *   banner renders as a React text child, which escapes on output, and that is
 *   the defence being relied on. Stripping tags here would hide a future
 *   renderer regression rather than prevent one.
 */
export function normalizeUrgentNoticeText(raw: string): string {
  // The public banner is a single line. Newlines would let a notice push page
  // content off-screen, so they collapse to spaces rather than being preserved.
  const normalized = raw.replace(/\s+/gu, ' ').trim();

  if (normalized.length === 0) {
    throw new Error('An urgent notice cannot be empty.');
  }

  const codePoints = [...normalized].length;
  if (codePoints > URGENT_NOTICE_MAX_LENGTH) {
    throw new Error(
      `An urgent notice must be ${URGENT_NOTICE_MAX_LENGTH} characters or fewer.`,
    );
  }

  return normalized;
}

/**
 * Whether a notice should be rendered right now.
 *
 * Called on every public pageview rather than by a sweep. That is the whole
 * point: an expired banner disappears because nothing renders it, not because
 * a job got around to nulling the row. A cron that fails, is misconfigured, or
 * is removed cannot leave a stale emergency notice in front of residents.
 *
 * An unparseable expiry is treated as "no expiry" — failing open. Suppressing
 * an active emergency banner because a timestamp is corrupt is the worse of
 * the two failure modes; a manager can always remove it by hand.
 */
export function isUrgentNoticeActive(notice: UrgentNoticeLike, now: Date): boolean {
  if (!notice.urgentNoticeText || notice.urgentNoticeText.trim().length === 0) {
    return false;
  }

  const { urgentNoticeExpiresAt } = notice;
  if (urgentNoticeExpiresAt === null || urgentNoticeExpiresAt === undefined) {
    return true;
  }

  const expiresAt =
    urgentNoticeExpiresAt instanceof Date
      ? urgentNoticeExpiresAt
      : new Date(urgentNoticeExpiresAt);

  if (Number.isNaN(expiresAt.getTime())) return true;

  // Inclusive: at the exact expiry instant the notice is already down.
  return expiresAt.getTime() > now.getTime();
}
