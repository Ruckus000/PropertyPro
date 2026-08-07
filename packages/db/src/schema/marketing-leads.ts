/**
 * Marketing leads table.
 *
 * Captures inbound demand from the public marketing site — principally the
 * §718 compliance checker, which is the highest-intent moment on the site
 * (the visitor has just self-identified their association type and unit count
 * and been told whether they carry a statutory obligation).
 *
 * Platform-level, NOT tenant-scoped: a lead by definition has no community yet,
 * so there is no `community_id` and no write-scope trigger. Access is limited to
 * platform admins via the service-role client; RLS denies anon/authenticated
 * outright (see migration 0050).
 *
 * GTM context: docs/gtm/03-LAUNCH-READINESS.md item B1.
 */
import {
  bigserial,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const marketingLeads = pgTable(
  'marketing_leads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull(),
    /**
     * Lowercased/trimmed email. The dedup key, and UNIQUE — see
     * `marketing_leads_email_normalized_key`.
     *
     * The uniqueness is load-bearing, not decorative. Both capture endpoints are
     * unauthenticated and the service upserts on this column, so without a unique
     * index the "one row per prospect" guarantee is only as good as the gap
     * between a SELECT and its INSERT. It also gives `ON CONFLICT` an inference
     * target — Postgres refuses `ON CONFLICT (email_normalized)` unless a unique
     * index on exactly that column exists.
     */
    emailNormalized: text('email_normalized').notNull(),
    associationName: text('association_name'),
    contactName: text('contact_name'),
    /**
     * Self-reported association type from the checker. Free text rather than
     * `communityTypeEnum` — the checker speaks the statute's vocabulary
     * ('condo' / 'hoa'), which is not the same axis as our community types.
     */
    associationType: text('association_type'),
    /** Self-reported unit/parcel count. The primary ICP qualification field. */
    unitCount: integer('unit_count'),
    /**
     * How many communities a management company runs. Deliberately NOT folded
     * into `unit_count`: the admin console reads a 25–149 `unit_count` as the
     * ICP band, so a 40-community portfolio stored there would show up as a
     * textbook self-managed condo and corrupt the one number on the dashboard
     * that is acted on.
     */
    communityCount: integer('community_count'),
    /**
     * Free text from an inbound inquiry form.
     *
     * Separate from `notes` for a security reason, not a tidiness one: `notes`
     * is sales-owned and the capture service never writes it, because the
     * capture endpoint is UNAUTHENTICATED and upserts on normalized email —
     * anyone knowing a lead's address could otherwise overwrite triage notes.
     */
    message: text('message'),
    /**
     * Whether the checker determined a statutory website obligation applies.
     * Stored as computed at capture time so later statute changes don't
     * retroactively rewrite what the visitor was actually told.
     */
    obligationRequired: text('obligation_required'),
    /** Where on the site the lead came from, e.g. 'compliance_checker'. */
    source: text('source').notNull().default('compliance_checker'),
    /** Sales triage state. Not a funnel stage — just "have we dealt with it". */
    status: text('status').notNull().default('new'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('marketing_leads_email_normalized_key').on(table.emailNormalized),
    index('marketing_leads_created_idx').on(table.createdAt),
    index('marketing_leads_status_idx').on(table.status, table.createdAt),
    check(
      'marketing_leads_status_check',
      sql`${table.status} IN ('new','contacted','qualified','disqualified')`,
    ),
    check(
      'marketing_leads_community_count_check',
      sql`${table.communityCount} IS NULL OR (${table.communityCount} > 0 AND ${table.communityCount} <= 10000)`,
    ),
  ],
);
