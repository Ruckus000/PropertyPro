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
    source: 'marketing_leads.source',
    message: 'marketing_leads.message',
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

  it('updates instead of inserting when the email is already known', async () => {
    selectLimitMock.mockResolvedValue([{ id: 42, source: 'compliance_checker', message: null }]);

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
    selectLimitMock.mockResolvedValue([{ id: 7, source: 'compliance_checker', message: null }]);

    await captureMarketingLead({ email: 'president@association.org' });

    const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('notes');
  });

  it('leaves already-known fields untouched when a later submission omits them', async () => {
    selectLimitMock.mockResolvedValue([{ id: 7, source: 'compliance_checker', message: null }]);

    await captureMarketingLead({ email: 'president@association.org' });

    // drizzle omits `undefined` keys, so a bare re-submission must not clobber
    // a richer earlier capture.
    const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.associationName).toBeUndefined();
    expect(patch.unitCount).toBeUndefined();
    expect(patch.obligationRequired).toBeUndefined();
  });

  describe('source precedence', () => {
    it('promotes a known checker lead when they submit the portfolio form', async () => {
      // The most valuable inbound we can get. Without this it would stay
      // labelled `compliance_checker` and never surface under the PM filter.
      selectLimitMock.mockResolvedValue([
        { id: 7, source: 'compliance_checker', message: null },
      ]);

      await captureMarketingLead({
        email: 'ops@managementco.com',
        source: 'pm_inquiry',
      });

      const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(patch.source).toBe('pm_inquiry');
    });

    it('never downgrades a portfolio lead who later re-runs the checker', async () => {
      selectLimitMock.mockResolvedValue([{ id: 7, source: 'pm_inquiry', message: null }]);

      await captureMarketingLead({
        email: 'ops@managementco.com',
        source: 'compliance_checker',
      });

      // `undefined` is omitted by drizzle, so the stored source survives.
      const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(patch.source).toBeUndefined();
    });
  });

  describe('message handling', () => {
    it('fills an empty message', async () => {
      selectLimitMock.mockResolvedValue([{ id: 7, source: 'pm_inquiry', message: null }]);

      await captureMarketingLead({ email: 'ops@managementco.com', message: 'Hello.' });

      const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(patch.message).toBe('Hello.');
    });

    it('never overwrites a message a human may already have read', async () => {
      // The endpoint is unauthenticated and keys on email alone, so blind
      // replacement would let anyone knowing the address erase the prose.
      selectLimitMock.mockResolvedValue([
        { id: 7, source: 'pm_inquiry', message: 'The original inquiry.' },
      ]);

      await captureMarketingLead({
        email: 'ops@managementco.com',
        message: 'Overwrite attempt.',
      });

      const patch = updateSetMock.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(patch.message).toBeUndefined();
    });
  });
});
