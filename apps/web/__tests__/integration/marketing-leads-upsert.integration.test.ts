/**
 * marketing_leads upsert — atomicity and merge precedence, against a real database.
 *
 * This suite exists because the property under test is UNPROVABLE with mocks.
 * Dedupe used to be a SELECT followed by an INSERT/UPDATE, and every unit test
 * of that code passed: with one caller at a time, read-then-write is
 * indistinguishable from an upsert. The bug only appears under concurrency,
 * which means only a real database can catch a regression to it.
 *
 * Measured before the fix, on the pre-0055 schema: 24 concurrent submissions of
 * one address produced 22 rows. The race test below is the regression guard for
 * exactly that.
 *
 * No community fixtures: leads are platform-level and have no community_id,
 * which is the whole reason the table sits in RLS_GLOBAL_TABLE_EXCLUSIONS.
 * Every row this suite writes carries a run-unique address and is deleted in
 * afterAll — DATABASE_URL may point at a shared database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from '@propertypro/db/filters';
import { marketingLeads } from '@propertypro/db';
// AUTHZ: Integration test for the platform-level marketing_leads table; no community_id exists to scope by.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { captureMarketingLead } from '../../src/lib/services/marketing-leads-service';
import { getDescribeDb, requireDatabaseUrlInCI } from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('marketing-leads-upsert');
const describeDb = getDescribeDb();

// Run-unique so a shared database cannot collide with a parallel run, and so
// cleanup can delete exactly what this file created and nothing else.
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const merge = `merge-${RUN}@leadtest.invalid`;
const race = `race-${RUN}@leadtest.invalid`;
const ALL = [merge, race];

describeDb('marketing_leads upsert (integration)', () => {
  const db = createUnscopedClient();

  const cleanup = () => db.delete(marketingLeads).where(inArray(marketingLeads.emailNormalized, ALL));
  const rowFor = async (emailNormalized: string) => {
    const rows = await db
      .select()
      .from(marketingLeads)
      .where(inArray(marketingLeads.emailNormalized, [emailNormalized]));
    return rows;
  };

  beforeAll(cleanup);
  afterAll(cleanup);

  it('collapses concurrent first-submissions of one address into a single row', async () => {
    const submissions = 24;

    const settled = await Promise.allSettled(
      Array.from({ length: submissions }, (_, i) =>
        captureMarketingLead({ email: race, unitCount: i + 1 }),
      ),
    );

    // A unique violation surfacing to the caller would be its own bug: the
    // conflict must be absorbed by ON CONFLICT, not thrown at the endpoint.
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(
      rejected.map((s) => String((s as PromiseRejectedResult).reason).slice(0, 200)),
    ).toEqual([]);

    const rows = await rowFor(race);
    expect(rows).toHaveLength(1);
  });

  it('merges a repeat submission without clobbering, downgrading, or touching sales fields', async () => {
    await captureMarketingLead({
      email: `  ${merge.toUpperCase()} `,
      contactName: 'Ada',
      associationType: 'condo',
      unitCount: 80,
      obligationRequired: true,
    });

    const [inserted] = await rowFor(merge);
    expect(inserted.emailNormalized).toBe(merge);
    expect(inserted.source).toBe('compliance_checker');
    expect(inserted.obligationRequired).toBe('true');

    // Sales triages it by hand.
    await db
      .update(marketingLeads)
      .set({ status: 'contacted', notes: 'called 8/1' })
      .where(inArray(marketingLeads.id, [inserted.id]));

    // The same prospect returns through the portfolio form: richer in places,
    // silent in others, and via a higher-ranked door.
    await captureMarketingLead({
      email: merge,
      associationName: 'Sunset HOA',
      communityCount: 40,
      message: 'help please',
      source: 'pm_inquiry',
    });

    const afterRepeat = await rowFor(merge);
    expect(afterRepeat).toHaveLength(1);
    expect(afterRepeat[0]).toMatchObject({
      associationName: 'Sunset HOA', // filled where we had nothing
      contactName: 'Ada', // absent this time — must not be erased
      unitCount: 80, // ditto
      communityCount: 40,
      message: 'help please', // filled while empty
      source: 'pm_inquiry', // upgraded
      status: 'contacted', // sales-owned, never written by capture
      notes: 'called 8/1', // ditto
    });

    // A later checker submission must not undo any of it.
    await captureMarketingLead({
      email: merge,
      message: 'OVERWRITE ME',
      source: 'compliance_checker',
    });

    const afterDowngrade = await rowFor(merge);
    expect(afterDowngrade).toHaveLength(1);
    expect(afterDowngrade[0]).toMatchObject({
      source: 'pm_inquiry', // never downgrades
      message: 'help please', // an existing message is never replaced
      status: 'contacted',
      notes: 'called 8/1',
    });
  });
});
