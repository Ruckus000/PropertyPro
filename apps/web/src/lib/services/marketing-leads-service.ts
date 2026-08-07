/**
 * Marketing lead capture service.
 *
 * Backs the two public capture endpoints — the compliance checker and the
 * portfolio inquiry form. Leads are platform-level records with no community, so
 * this cannot use the tenant-scoped client.
 *
 * AUTHZ: public capture endpoints — leads have no community_id and therefore no
 * tenant to scope to. The only statement issued is a single INSERT … ON CONFLICT
 * DO UPDATE against `marketing_leads`; nothing is read back and nothing is
 * returned to the caller, so this cannot be used to probe the pipeline. Callers
 * MUST rate-limit per IP before invoking. Reads for the admin console go through
 * the service-role client in apps/admin, not this module.
 */
import { marketingLeads } from '@propertypro/db';
import { type SQL, sql } from '@propertypro/db/filters';
// AUTHZ: Marketing lead capture: platform-level table with no community_id, so no scoped client exists for it. Caller MUST rate-limit per IP.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export type LeadSource = 'compliance_checker' | 'pm_inquiry';

/**
 * How much a source is worth when a lead arrives twice through different doors.
 *
 * A property manager who ran the compliance checker weeks ago and then filled in
 * the portfolio form is the single most valuable inbound we get, and without a
 * precedence rule the dedupe would leave them labelled `compliance_checker`
 * forever — exactly the lead the discriminator exists to surface. Never
 * downgrades.
 */
const SOURCE_RANK: Record<LeadSource, number> = {
  compliance_checker: 0,
  pm_inquiry: 1,
};

/**
 * `SOURCE_RANK` as a SQL CASE, so the precedence rule has exactly one
 * definition. Generated from the map rather than hand-written in SQL: a new
 * source added to `SOURCE_RANK` must not silently keep the old ranking here.
 *
 * Unrecognised stored values rank -1 — lowest, so anything real overwrites them.
 * That matches the old TypeScript behaviour and matters because `source` is
 * free text at the database level, not an enum.
 */
function sourceRank(expression: SQL): SQL {
  const whens = (Object.entries(SOURCE_RANK) as [LeadSource, number][]).map(
    ([name, rank]) => sql`when ${expression} = ${name} then ${rank}`,
  );
  return sql`(case ${sql.join(whens, sql` `)} else -1 end)`;
}

export interface CaptureLeadInput {
  email: string;
  associationName?: string;
  contactName?: string;
  associationType?: 'condo' | 'hoa';
  unitCount?: number;
  communityCount?: number;
  message?: string;
  obligationRequired?: boolean;
  source?: LeadSource;
}

/**
 * Records a marketing lead, deduplicating on normalized email.
 *
 * A repeat submission updates the existing row rather than inserting a second —
 * the checker is easy to re-run, and a duplicate-laden list is worse than no
 * list for a solo operator working it by hand. Existing non-null values are
 * only overwritten when the new submission actually supplies something, so a
 * later bare email submission cannot erase an earlier richer one.
 *
 * Never overwrites `status` or `notes` — those are sales-owned, and a prospect
 * re-running the checker must not silently reset a lead already triaged. That is
 * a security property, not a style choice: both callers are unauthenticated and
 * key on email alone, so anything this function writes can be written by anyone
 * who knows a prospect's address.
 *
 * Fed by two public doors — the compliance checker and the portfolio inquiry
 * form. `source` records which, and never downgrades on a repeat visit.
 *
 * ## Why this is one statement
 *
 * Dedupe used to be a SELECT followed by an INSERT or UPDATE. Two concurrent
 * submissions of the same address could both miss the SELECT and both INSERT,
 * producing exactly the duplicate the function exists to prevent — and both
 * callers are public, unauthenticated endpoints, so concurrent submissions are
 * not a hypothetical. `ON CONFLICT (email_normalized)` moves the decision into
 * the database, where the unique index added in 0055 makes it atomic. The loser
 * of a race takes the UPDATE branch instead of inserting.
 *
 * The merge rules live in the conflict clause rather than in TypeScript because
 * that is the only place they can be applied against the *current* row: by the
 * time application code has read a value, another request may already have
 * changed it.
 */
export async function captureMarketingLead(input: CaptureLeadInput): Promise<void> {
  const db = createUnscopedClient();
  const emailNormalized = input.email.trim().toLowerCase();

  const obligationRequired =
    input.obligationRequired === undefined ? undefined : String(input.obligationRequired);

  /**
   * Keep what we already know unless this submission actually supplies a value.
   *
   * Drizzle omits `undefined` from the INSERT, so the column arrives NULL in
   * `excluded` and COALESCE falls through to the stored value. A later bare
   * email submission therefore cannot erase an earlier richer one.
   */
  const keepUnlessSupplied = (column: SQL, excludedColumn: SQL): SQL =>
    sql`coalesce(${excludedColumn}, ${column})`;

  await db
    .insert(marketingLeads)
    .values({
      email: input.email.trim(),
      emailNormalized,
      associationName: input.associationName,
      contactName: input.contactName,
      associationType: input.associationType,
      unitCount: input.unitCount,
      communityCount: input.communityCount,
      message: input.message,
      obligationRequired,
      source: input.source ?? 'compliance_checker',
    })
    .onConflictDoUpdate({
      target: marketingLeads.emailNormalized,
      set: {
        // The address as most recently typed — same column, so casing/whitespace
        // differences from a repeat submission win without changing identity.
        email: sql`excluded.email`,
        associationName: keepUnlessSupplied(
          sql`${marketingLeads.associationName}`,
          sql`excluded.association_name`,
        ),
        contactName: keepUnlessSupplied(
          sql`${marketingLeads.contactName}`,
          sql`excluded.contact_name`,
        ),
        associationType: keepUnlessSupplied(
          sql`${marketingLeads.associationType}`,
          sql`excluded.association_type`,
        ),
        unitCount: keepUnlessSupplied(sql`${marketingLeads.unitCount}`, sql`excluded.unit_count`),
        communityCount: keepUnlessSupplied(
          sql`${marketingLeads.communityCount}`,
          sql`excluded.community_count`,
        ),
        // Only fills an EMPTY message — note the NULLIF, which treats '' the same
        // as NULL exactly as the old truthiness check did. Blind replacement
        // would let a second submission erase prose a human has already read and
        // acted on, from an endpoint that needs nothing but a known address.
        message: sql`coalesce(nullif(${marketingLeads.message}, ''), excluded.message)`,
        obligationRequired: keepUnlessSupplied(
          sql`${marketingLeads.obligationRequired}`,
          sql`excluded.obligation_required`,
        ),
        // Never downgrades: the stored source only changes when the incoming one
        // outranks it.
        source: sql`case
          when ${sourceRank(sql`excluded.source`)} > ${sourceRank(sql`${marketingLeads.source}`)}
            then excluded.source
          else ${marketingLeads.source}
        end`,
        updatedAt: new Date(),
        // `status` and `notes` are deliberately absent — see the docblock.
      },
    });
}
