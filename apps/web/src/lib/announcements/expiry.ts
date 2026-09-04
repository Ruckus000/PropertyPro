/**
 * One definition of "this announcement has expired", for every reader.
 *
 * Announcements are read through more than one path — a SQL `where` for the
 * paginated feed, an in-JS filter for the already-materialised list, and a
 * separate unscoped query for the public site. Audience filtering has already
 * drifted across exactly these paths once: `tenants_only` was enforced in the
 * email and list paths and not in the notification feed, which leaked a
 * renters-only announcement's title and body to every owner and manager.
 *
 * So expiry is defined once, in two forms of the same rule, and the readers
 * call it rather than restating it.
 *
 * ## Why expiry is not archival
 *
 * `archived_at` records a manual act already taken. `expires_at` is a decision
 * taken in advance about a moment that has not arrived. They compose: an
 * announcement can be archived by hand before it expires, and hiding on either
 * ground is correct.
 *
 * ## Boundary
 *
 * Expiry is exclusive — an announcement is visible while `now < expiresAt`, and
 * gone at the instant itself. `expiresAt = null` means "never expires", which
 * is every row that existed before the column did.
 */
import { announcements } from '@propertypro/db';
import { gt, isNull, or, type SQL } from '@propertypro/db/filters';

/**
 * SQL half of the rule: rows that have not expired as of `now`.
 *
 * `or(isNull(...), gt(...))` and not a bare `gt`: SQL three-valued logic makes
 * `NULL > now()` evaluate to NULL, not TRUE, so a bare comparison would hide
 * every announcement without an expiry — which is all of them today. That
 * failure would be total and silent.
 */
export function announcementNotExpiredWhere(now: Date = new Date()): SQL {
  // The non-null assertion is safe: `or` returns undefined only for an empty
  // argument list, and two arguments are passed literally here.
  return or(isNull(announcements.expiresAt), gt(announcements.expiresAt, now))!;
}

/** In-JS half of the same rule, for callers filtering materialised rows. */
export function isAnnouncementExpired(
  announcement: { expiresAt?: Date | string | null },
  now: Date = new Date(),
): boolean {
  const expiresAt = announcement.expiresAt;
  if (expiresAt == null) return false;
  const at = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  // An unparseable value must not silently hide the announcement — treat it as
  // "no expiry" so a bad row degrades to the pre-feature behaviour.
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() <= now.getTime();
}
