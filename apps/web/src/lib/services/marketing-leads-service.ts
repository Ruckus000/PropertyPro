/**
 * Marketing lead capture service.
 *
 * Backs the two public capture endpoints — the compliance checker and the
 * portfolio inquiry form. Leads are platform-level records with no community, so
 * this cannot use the tenant-scoped client.
 *
 * AUTHZ: public capture endpoints — leads have no community_id and therefore no
 * tenant to scope to. Writes are INSERT/UPDATE-only against `marketing_leads`.
 * The only values read back are used to decide whether to overwrite (`source`,
 * `message`) and are never returned to the caller, so this cannot be used to
 * probe the pipeline. Callers MUST rate-limit per IP before invoking. Reads for
 * the admin console go through the service-role client in apps/admin, not this
 * module.
 */
import { marketingLeads } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
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

function isKnownSource(value: string): value is LeadSource {
  return value in SOURCE_RANK;
}

/** Higher-ranked of the two, treating an unrecognised stored value as lowest. */
function resolveSource(stored: string, incoming: LeadSource): LeadSource | undefined {
  if (!isKnownSource(stored)) return incoming;
  return SOURCE_RANK[incoming] > SOURCE_RANK[stored] ? incoming : undefined;
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
 */
export async function captureMarketingLead(input: CaptureLeadInput): Promise<void> {
  const db = createUnscopedClient();
  const emailNormalized = input.email.trim().toLowerCase();

  const existing = await db
    .select({
      id: marketingLeads.id,
      source: marketingLeads.source,
      message: marketingLeads.message,
    })
    .from(marketingLeads)
    .where(eq(marketingLeads.emailNormalized, emailNormalized))
    .limit(1);

  const obligationRequired =
    input.obligationRequired === undefined ? undefined : String(input.obligationRequired);
  const source = input.source ?? 'compliance_checker';

  const existingLead = existing[0];
  if (existingLead) {
    await db
      .update(marketingLeads)
      .set({
        // `undefined` values are omitted by drizzle, which is exactly the
        // "don't clobber what we already know" behaviour we want here.
        email: input.email.trim(),
        associationName: input.associationName,
        contactName: input.contactName,
        associationType: input.associationType,
        unitCount: input.unitCount,
        communityCount: input.communityCount,
        // Only fills an empty message. Blind replacement would let a second
        // submission erase prose a human has already read and acted on, from an
        // endpoint that needs nothing but a known email address.
        message: existingLead.message ? undefined : input.message,
        obligationRequired,
        source: resolveSource(existingLead.source, source),
        updatedAt: new Date(),
      })
      .where(eq(marketingLeads.id, existingLead.id));
    return;
  }

  await db.insert(marketingLeads).values({
    email: input.email.trim(),
    emailNormalized,
    associationName: input.associationName,
    contactName: input.contactName,
    associationType: input.associationType,
    unitCount: input.unitCount,
    communityCount: input.communityCount,
    message: input.message,
    obligationRequired,
    source,
  });
}
