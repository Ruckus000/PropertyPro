/**
 * When a contract's bids are sealed, and what may be done to its closing time
 * while they are. Pure: no database, no React. Everything that withholds bid
 * details asks this one module: the contracts list, a contract's own page, and
 * the audit trail's redaction of `contract_bid` entries.
 */

/**
 * THE sealing predicate. Fails CLOSED: bidding is open only when no closing
 * time was set, or it is a real time at or before `now`. Anything else a
 * column could hand back (an Invalid Date, text, undefined) is not proof that
 * bidding has closed, so it counts as sealed.
 */
export function isBiddingSealed(closesAt: unknown, now: Date): boolean {
  const open = closesAt === null || (closesAt instanceof Date && closesAt.getTime() <= now.getTime());
  return !open;
}

export const CLOSING_TIME_LOCKED_MESSAGE =
  'Bids have been received, so the closing time can be moved later but not opened early.';

/**
 * Owner decision, 2026-11-24 ("Block it once bids exist"): while a contract is
 * sealed and has at least one bid, its closing time may only stay or move
 * later. It may not be cleared, and may not be brought forward: an earlier
 * time, even one still ahead, opens the bids sooner than bidders were told.
 *
 * `stored` is the closing time as it is now; `next` is the proposed one. When
 * the stored time cannot be read there is nothing to compare with, so the new
 * time only has to be ahead of `now`.
 */
export function isClosingTimeChangeAllowed(stored: unknown, next: Date | null, now: Date): boolean {
  if (next === null || Number.isNaN(next.getTime())) return false;
  if (stored instanceof Date && !Number.isNaN(stored.getTime())) return next.getTime() >= stored.getTime();
  return next.getTime() > now.getTime();
}
