/**
 * Marketing lead capture service.
 *
 * Backs the public compliance-checker capture endpoint. Leads are platform-level
 * records with no community, so this cannot use the tenant-scoped client.
 *
 * AUTHZ: public capture endpoint — leads have no community_id and therefore no
 * tenant to scope to. Writes are INSERT/UPDATE-only against `marketing_leads`
 * and read back nothing the caller did not supply. Caller MUST rate-limit per IP
 * before invoking. Reads for the admin console go through the service-role
 * client in apps/admin, not this module.
 */
import { marketingLeads } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// AUTHZ: Marketing lead capture: platform-level table with no community_id, so no scoped client exists for it. Caller MUST rate-limit per IP.
import { createUnscopedClient } from '@propertypro/db/unsafe';

export interface CaptureLeadInput {
  email: string;
  associationName?: string;
  contactName?: string;
  associationType?: 'condo' | 'hoa';
  unitCount?: number;
  obligationRequired?: boolean;
  source?: string;
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
 * re-running the checker must not silently reset a lead already triaged.
 */
export async function captureMarketingLead(input: CaptureLeadInput): Promise<void> {
  const db = createUnscopedClient();
  const emailNormalized = input.email.trim().toLowerCase();

  const existing = await db
    .select({ id: marketingLeads.id })
    .from(marketingLeads)
    .where(eq(marketingLeads.emailNormalized, emailNormalized))
    .limit(1);

  const obligationRequired =
    input.obligationRequired === undefined ? undefined : String(input.obligationRequired);

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
        obligationRequired,
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
    obligationRequired,
    source: input.source ?? 'compliance_checker',
  });
}
