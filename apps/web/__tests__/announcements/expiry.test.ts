/**
 * The expiry predicate, in both of its forms.
 *
 * The SQL half is rendered to real SQL text rather than asserted structurally,
 * because the failure this guards against is invisible structurally: a bare
 * `expires_at > now()` type-checks, reads correctly, and hides EVERY
 * announcement, since SQL three-valued logic makes `NULL > now()` evaluate to
 * NULL rather than TRUE — and today every row has a NULL expiry.
 */
import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  announcementNotExpiredWhere,
  isAnnouncementExpired,
} from '@/lib/announcements/expiry';

function render(sql: ReturnType<typeof announcementNotExpiredWhere>) {
  return new PgDialect().sqlToQuery(sql);
}

describe('announcementNotExpiredWhere (SQL)', () => {
  it('keeps rows with no expiry — the NULL branch that must not be dropped', () => {
    const { sql } = render(announcementNotExpiredWhere(new Date('2026-06-01T00:00:00Z')));

    expect(sql).toContain('"expires_at" is null');
    expect(sql.toLowerCase()).toContain(' or ');
  });

  it('compares against the instant it was given', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const { sql, params } = render(announcementNotExpiredWhere(now));

    expect(sql).toContain('"expires_at" >');
    // Drizzle serialises a timestamptz param to its ISO string before it
    // reaches the driver, so the bound value is compared as text.
    expect(params.map(String)).toContain(now.toISOString());
  });

  it('is a single OR of exactly those two branches', () => {
    /*
     * Pinned so that an extra clause cannot be smuggled in here rather than
     * being composed by the caller — this predicate is shared by three readers
     * and must mean the same thing to all of them.
     */
    const { sql } = render(announcementNotExpiredWhere(new Date('2026-06-01T00:00:00Z')));

    expect(sql).toMatch(/^\("[\w.]*"?\.?"?expires_at" is null or "?[\w.]*"?\.?"?expires_at" > \$1\)$/i);
  });
});

describe('isAnnouncementExpired (JS)', () => {
  const NOW = new Date('2026-06-01T12:00:00Z');

  it('treats a null expiry as never expiring', () => {
    expect(isAnnouncementExpired({ expiresAt: null }, NOW)).toBe(false);
    expect(isAnnouncementExpired({}, NOW)).toBe(false);
  });

  it('hides a row whose expiry has passed', () => {
    expect(isAnnouncementExpired({ expiresAt: new Date('2026-06-01T11:59:59Z') }, NOW)).toBe(true);
  });

  it('keeps a row whose expiry is still ahead', () => {
    expect(isAnnouncementExpired({ expiresAt: new Date('2026-06-01T12:00:01Z') }, NOW)).toBe(false);
  });

  it('expires exactly AT the instant, matching the SQL boundary', () => {
    /*
     * The SQL half keeps rows where `expires_at > now`, so the instant itself
     * is expired. The two halves must agree on the boundary or a row flickers
     * between the paginated feed and the in-JS filter.
     */
    expect(isAnnouncementExpired({ expiresAt: new Date(NOW) }, NOW)).toBe(true);
  });

  it('accepts an ISO string as well as a Date', () => {
    // Rows arrive as Dates from drizzle and as strings across the wire.
    expect(isAnnouncementExpired({ expiresAt: '2026-06-01T11:00:00Z' }, NOW)).toBe(true);
    expect(isAnnouncementExpired({ expiresAt: '2026-06-01T13:00:00Z' }, NOW)).toBe(false);
  });

  it('treats an unparseable value as "no expiry" rather than hiding the row', () => {
    /*
     * Degrade to the pre-feature behaviour. Hiding an announcement because its
     * expiry column holds junk would be a silent content loss; showing it is
     * visible and correctable.
     */
    expect(isAnnouncementExpired({ expiresAt: 'not-a-date' }, NOW)).toBe(false);
  });
});
