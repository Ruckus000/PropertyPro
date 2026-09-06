/**
 * Unit coverage for the marketing lead capture service.
 *
 * SCOPE, deliberately narrow: this file asserts what is decided in TypeScript —
 * the values handed to the INSERT, and the SHAPE of the write. The merge
 * precedence now lives in the ON CONFLICT clause and is therefore SQL, which a
 * mocked client cannot evaluate; those rules, and the concurrency property that
 * motivated them, are covered against a real database in
 * `__tests__/integration/marketing-leads-upsert.integration.test.ts`.
 *
 * Do not "improve" this file by asserting on the generated SQL string. That
 * pins drizzle's formatting, not our behaviour, and would pass just as happily
 * against a clause that merged the wrong way round.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onConflictDoUpdateMock = vi.fn();
const insertValuesMock = vi.fn((_values?: unknown) => ({
  onConflictDoUpdate: onConflictDoUpdateMock,
}));

const dbMock = {
  insert: vi.fn(() => ({ values: insertValuesMock })),
  // Present so the test can prove they are NOT used — see the read-then-write
  // regression guard below.
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock('@propertypro/db', () => ({
  marketingLeads: {
    id: 'marketing_leads.id',
    emailNormalized: 'marketing_leads.email_normalized',
    associationName: 'marketing_leads.association_name',
    contactName: 'marketing_leads.contact_name',
    associationType: 'marketing_leads.association_type',
    unitCount: 'marketing_leads.unit_count',
    communityCount: 'marketing_leads.community_count',
    message: 'marketing_leads.message',
    obligationRequired: 'marketing_leads.obligation_required',
    source: 'marketing_leads.source',
  },
}));

vi.mock('@propertypro/db/filters', () => {
  // Minimal stand-in for drizzle's tagged template: enough to build the clause
  // without pretending to evaluate it.
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: strings.raw.join('?'),
    values,
  });
  sql.join = (chunks: unknown[], sep: unknown) => ({ __join: chunks, sep });
  return { sql, eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }) };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => dbMock,
}));

const { captureMarketingLead } = await import(
  '../../../src/lib/services/marketing-leads-service'
);

describe('captureMarketingLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a new lead with a normalized email', async () => {
    await captureMarketingLead({
      email: '  President@Association.ORG ',
      associationType: 'condo',
      unitCount: 84,
      obligationRequired: true,
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0]?.[0]).toMatchObject({
      email: 'President@Association.ORG',
      emailNormalized: 'president@association.org',
      associationType: 'condo',
      unitCount: 84,
      // Stored as text so the value the visitor was actually shown survives a
      // later change to the statute logic.
      obligationRequired: 'true',
      source: 'compliance_checker',
    });
  });

  it('records a portfolio inquiry with its own source and fields', async () => {
    await captureMarketingLead({
      email: 'ops@managementco.com',
      contactName: 'A Person',
      associationName: 'Management Co',
      communityCount: 12,
      unitCount: 1400,
      message: 'Six of ours are behind.',
      source: 'pm_inquiry',
    });

    expect(insertValuesMock.mock.calls[0]?.[0]).toMatchObject({
      source: 'pm_inquiry',
      communityCount: 12,
      unitCount: 1400,
      message: 'Six of ours are behind.',
    });
  });

  it('omits absent optional fields so the conflict clause can keep stored values', async () => {
    await captureMarketingLead({ email: 'sparse@association.org' });

    const values = insertValuesMock.mock.calls[0]?.[0] as Record<string, unknown>;
    // Each must be `undefined`, not null: drizzle drops undefined from the
    // INSERT, which is what makes `coalesce(excluded.x, x)` fall through to the
    // stored value instead of overwriting it with NULL.
    for (const field of [
      'associationName',
      'contactName',
      'associationType',
      'unitCount',
      'communityCount',
      'message',
      'obligationRequired',
    ]) {
      expect(values[field]).toBeUndefined();
    }
  });

  it('writes through a single upsert keyed on the normalized email', async () => {
    await captureMarketingLead({ email: 'president@association.org' });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);

    const config = onConflictDoUpdateMock.mock.calls[0]?.[0];
    expect(config.target).toBe('marketing_leads.email_normalized');
    // status and notes are sales-owned. Both capture endpoints are
    // unauthenticated and key on email alone, so anything listed here can be
    // written by anyone who knows a prospect's address.
    expect(Object.keys(config.set)).not.toContain('status');
    expect(Object.keys(config.set)).not.toContain('notes');
  });

  it('never reads before writing', async () => {
    // The regression guard for the original defect. A SELECT-then-INSERT dedupe
    // passes every other test in this file — with one caller at a time it is
    // indistinguishable from an upsert — and loses rows only under concurrency.
    // If this fails, the race is back.
    await captureMarketingLead({ email: 'president@association.org' });

    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});
