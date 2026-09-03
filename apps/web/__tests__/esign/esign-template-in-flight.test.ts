/**
 * Field edits are refused while signatures are in flight.
 *
 * A submission does NOT snapshot the field schema. The public signing route
 * reads it live off the template every time a signer opens their link
 * (`sign/[submissionExternalId]/[slug]/route.ts`), so editing a template today
 * changes the document under everyone mid-signature, and two signers on the
 * same submission can be served different fields. `updateTemplate` had no
 * check of any kind.
 *
 * "In flight" is `effectiveStatus === 'pending'` — the submissions where a
 * signer can still open a link. It cannot be read off the stored column:
 * `expired` is never stored, it is derived from `pending` plus a past
 * `expiresAt`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScopedClientMock,
  logAuditEventMock,
  esignTemplatesTable,
  esignSubmissionsTable,
  eqMock,
  andMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  esignTemplatesTable: {
    id: Symbol('templates.id'),
    status: Symbol('templates.status'),
  },
  esignSubmissionsTable: {
    id: Symbol('submissions.id'),
    templateId: Symbol('submissions.templateId'),
    status: Symbol('submissions.status'),
    expiresAt: Symbol('submissions.expiresAt'),
  },
  eqMock: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  andMock: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  esignTemplates: esignTemplatesTable,
  esignSubmissions: esignSubmissionsTable,
  esignSigners: {},
  esignEvents: {},
  esignConsent: {},
  users: {},
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(),
}));

vi.mock('../../src/lib/services/esign-pdf-service', () => ({
  flattenSignedPdf: vi.fn(),
  computeDocumentHash: vi.fn(),
  uploadSignedDocument: vi.fn(),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  isNull: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  inArray: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
  lt: vi.fn((...args: unknown[]) => ({ type: 'lt', args })),
  gte: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
}));

vi.mock('@propertypro/email', () => ({
  sendEmail: vi.fn(),
  EsignInvitationEmail: vi.fn(),
  EsignReminderEmail: vi.fn(),
}));

import {
  countInFlightSubmissionsForTemplate,
  updateTemplate,
} from '@/lib/services/esign-service';

const TEMPLATE = {
  id: 7,
  communityId: 42,
  name: 'Proxy Form',
  description: null,
  sourceDocumentPath: '42/esign-templates/proxy.pdf',
  templateType: 'proxy',
  fieldsSchema: { version: 1, fields: [], signerRoles: ['signer'] },
  status: 'active',
};

const NEXT_SCHEMA = {
  version: 1 as const,
  fields: [
    {
      id: 'f1',
      type: 'signature' as const,
      signerRole: 'signer',
      page: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 5,
      required: true,
    },
  ],
  signerRoles: ['signer'],
};

/**
 * `submissionRows` is what the submissions query returns; `templateRow` what
 * the templates query returns. The service reads templates first.
 */
function mockClient(submissionRows: Record<string, unknown>[]) {
  const updateMock = vi.fn().mockResolvedValue([{ ...TEMPLATE, name: 'Renamed' }]);
  const selectFromMock = vi.fn((table: unknown) =>
    Promise.resolve(table === esignSubmissionsTable ? submissionRows : [TEMPLATE]),
  );
  createScopedClientMock.mockReturnValue({
    selectFrom: selectFromMock,
    insert: vi.fn(),
    update: updateMock,
  });
  return { updateMock, selectFromMock };
}

const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-03T12:00:00.000Z') });
});

describe('countInFlightSubmissionsForTemplate', () => {
  it('counts pending submissions that have not expired', async () => {
    mockClient([
      { id: 1, status: 'pending', expiresAt: null },
      { id: 2, status: 'pending', expiresAt: new Date(Date.now() + 48 * HOUR) },
    ]);

    await expect(countInFlightSubmissionsForTemplate(42, 7)).resolves.toBe(2);
  });

  it('does not count a pending row whose expiry has passed', async () => {
    // `expired` is never stored — a stale pending row reads as expired, and
    // its signer can no longer open the link.
    mockClient([
      { id: 1, status: 'pending', expiresAt: new Date(Date.now() - 1 * HOUR) },
      { id: 2, status: 'pending', expiresAt: new Date(Date.now() + 1 * HOUR) },
    ]);

    await expect(countInFlightSubmissionsForTemplate(42, 7)).resolves.toBe(1);
  });

  it('scopes the query to this template and to pending rows, in SQL', async () => {
    const { selectFromMock } = mockClient([]);

    await countInFlightSubmissionsForTemplate(42, 7);

    expect(selectFromMock).toHaveBeenCalledWith(
      esignSubmissionsTable,
      expect.anything(),
      expect.anything(),
    );
    // Both filters pushed down rather than fetching every submission in the
    // community and filtering in JS, which is what listSubmissions does.
    expect(eqMock).toHaveBeenCalledWith(esignSubmissionsTable.templateId, 7);
    expect(eqMock).toHaveBeenCalledWith(esignSubmissionsTable.status, 'pending');
  });

  it('is zero when the template has never been sent', async () => {
    mockClient([]);

    await expect(countInFlightSubmissionsForTemplate(42, 7)).resolves.toBe(0);
  });
});

describe('updateTemplate — in-flight guard', () => {
  it('refuses a field-schema change while a signature is in flight', async () => {
    const { updateMock } = mockClient([{ id: 1, status: 'pending', expiresAt: null }]);

    await expect(
      updateTemplate(42, 'user-1', 7, { fieldsSchema: NEXT_SCHEMA }),
    ).rejects.toThrow(/signature/i);

    expect(updateMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('names the count and points at Clone, so the message is actionable', async () => {
    mockClient([
      { id: 1, status: 'pending', expiresAt: null },
      { id: 2, status: 'pending', expiresAt: null },
    ]);

    await expect(
      updateTemplate(42, 'user-1', 7, { fieldsSchema: NEXT_SCHEMA }),
    ).rejects.toThrow(/2 .*Clone/is);
  });

  it('allows a name-only change while signatures are in flight', async () => {
    // Renaming changes nothing a signer is looking at.
    const { updateMock } = mockClient([{ id: 1, status: 'pending', expiresAt: null }]);

    await expect(updateTemplate(42, 'user-1', 7, { name: 'Renamed' })).resolves.toMatchObject({
      name: 'Renamed',
    });

    expect(updateMock).toHaveBeenCalled();
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'esign_template_updated' }),
    );
  });

  it('allows a field-schema change when nothing is in flight', async () => {
    const { updateMock } = mockClient([
      { id: 1, status: 'completed', expiresAt: null },
      { id: 2, status: 'cancelled', expiresAt: null },
    ]);

    await updateTemplate(42, 'user-1', 7, { fieldsSchema: NEXT_SCHEMA });

    expect(updateMock).toHaveBeenCalled();
  });

  it('does not run the guard query at all for a name-only change', async () => {
    // No reason to pay for a submissions scan when the edit cannot affect one.
    const { selectFromMock } = mockClient([]);

    await updateTemplate(42, 'user-1', 7, { name: 'Renamed' });

    const scannedSubmissions = selectFromMock.mock.calls.some(
      (call) => call[0] === esignSubmissionsTable,
    );
    expect(scannedSubmissions).toBe(false);
  });
});
