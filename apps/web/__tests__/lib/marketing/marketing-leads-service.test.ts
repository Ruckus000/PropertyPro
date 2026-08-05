import { beforeEach, describe, expect, it, vi } from 'vitest';

const selectLimitMock = vi.fn();
const updateWhereMock = vi.fn();
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
const insertValuesMock = vi.fn();

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: selectLimitMock })),
    })),
  })),
  update: vi.fn(() => ({ set: updateSetMock })),
  insert: vi.fn(() => ({ values: insertValuesMock })),
};

vi.mock('@propertypro/db', () => ({
  marketingLeads: {
    id: 'marketing_leads.id',
    emailNormalized: 'marketing_leads.email_normalized',
  },
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => dbMock,
}));

const { captureMarketingLead } = await import(
  '../../../src/lib/services/marketing-leads-service'
);

describe('captureMarketingLead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimitMock.mockResolvedValue([]);
  });

  it('inserts a new lead with a normalized email', async () => {
    await captureMarketingLead({
      email: '  President@Association.ORG ',
      associationType: 'condo',
      unitCount: 84,
      obligationRequired: true,
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const values = insertValuesMock.mock.calls[0]?.[0];
    expect(values).toMatchObject({
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

  it('updates instead of inserting when the email is already known', async () => {
    selectLimitMock.mockResolvedValue([{ id: 42 }]);

    await captureMarketingLead({
      email: 'president@association.org',
      associationName: 'Sunset Condos',
    });

    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(updateWhereMock).toHaveBeenCalledWith({
      __eq: { col: 'marketing_leads.id', val: 42 },
    });
  });

  it('never resets sales-owned triage fields on a repeat submission', async () => {
    selectLimitMock.mockResolvedValue([{ id: 7 }]);

    await captureMarketingLead({ email: 'president@association.org' });

    const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('notes');
  });

  it('leaves already-known fields untouched when a later submission omits them', async () => {
    selectLimitMock.mockResolvedValue([{ id: 7 }]);

    await captureMarketingLead({ email: 'president@association.org' });

    // drizzle omits `undefined` keys, so a bare re-submission must not clobber
    // a richer earlier capture.
    const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.associationName).toBeUndefined();
    expect(patch.unitCount).toBeUndefined();
    expect(patch.obligationRequired).toBeUndefined();
  });
});
