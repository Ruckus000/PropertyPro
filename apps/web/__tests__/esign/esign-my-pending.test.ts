import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  esignSignersTable,
  esignSubmissionsTable,
  esignTemplatesTable,
  eqMock,
  andMock,
  isNullMock,
  orMock,
  gteMock,
  inArrayMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  esignSignersTable: {
    id: Symbol('signers.id'),
    userId: Symbol('signers.userId'),
    email: Symbol('signers.email'),
    status: Symbol('signers.status'),
    submissionId: Symbol('signers.submissionId'),
    deletedAt: Symbol('signers.deletedAt'),
  },
  esignSubmissionsTable: {
    id: Symbol('submissions.id'),
    status: Symbol('submissions.status'),
    expiresAt: Symbol('submissions.expiresAt'),
    deletedAt: Symbol('submissions.deletedAt'),
  },
  esignTemplatesTable: {
    id: Symbol('templates.id'),
  },
  eqMock: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
  andMock: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNullMock: vi.fn((...args: unknown[]) => ({ type: 'isNull', args })),
  orMock: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  gteMock: vi.fn((...args: unknown[]) => ({ type: 'gte', args })),
  inArrayMock: vi.fn((...args: unknown[]) => ({ type: 'inArray', args })),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  createAdminClient: vi.fn(),
  createPresignedDownloadUrl: vi.fn(),
  esignSigners: esignSignersTable,
  esignSubmissions: esignSubmissionsTable,
  esignTemplates: esignTemplatesTable,
  esignEvents: { submissionId: Symbol('events.submissionId') },
  esignConsent: { userId: Symbol('consent.userId'), revokedAt: Symbol('consent.revokedAt') },
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
  and: andMock,
  isNull: isNullMock,
  or: orMock,
  gte: gteMock,
  inArray: inArrayMock,
}));

vi.mock('../../src/lib/services/esign-pdf-service', () => ({
  flattenSignedPdf: vi.fn(),
  computeDocumentHash: vi.fn(),
  uploadSignedDocument: vi.fn(),
}));

import { listMyPendingSigners } from '../../src/lib/services/esign-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSigner(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    communityId: 1,
    submissionId: 10,
    userId: 'user-1',
    email: 'user@test.com',
    status: 'pending',
    slug: 'sign-slug-1',
    createdAt: new Date('2026-03-01T12:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    communityId: 1,
    templateId: 100,
    externalId: 'sub-ext-1',
    status: 'pending',
    messageSubject: 'Please sign this',
    expiresAt: new Date('2026-04-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    communityId: 1,
    name: 'Proxy Form',
    templateType: 'proxy',
    ...overrides,
  };
}

/**
 * Sets up scoped mock to return specific data for successive selectFrom calls:
 * call 1 = signers, call 2 = submissions, call 3 = templates
 */
function setupScopedMock(
  signers: Record<string, unknown>[],
  submissions: Record<string, unknown>[],
  templates: Record<string, unknown>[],
) {
  let callCount = 0;
  const scoped = {
    selectFrom: vi.fn(async () => {
      callCount++;
      if (callCount === 1) return signers;
      if (callCount === 2) return submissions;
      if (callCount === 3) return templates;
      return [];
    }),
    query: vi.fn(async () => []),
    insert: vi.fn(async () => []),
    update: vi.fn(async () => []),
  };
  createScopedClientMock.mockReturnValue(scoped);
  return scoped;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listMyPendingSigners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pending signers with correct fields', async () => {
    setupScopedMock(
      [makeSigner()],
      [makeSubmission()],
      [makeTemplate()],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      signerId: 1,
      signerStatus: 'pending',
      submissionId: 10,
      submissionExternalId: 'sub-ext-1',
      messageSubject: 'Please sign this',
      templateName: 'Proxy Form',
      templateType: 'proxy',
      slug: 'sign-slug-1',
    });
  });

  it('returns multiple signers across multiple submissions', async () => {
    setupScopedMock(
      [
        makeSigner({ id: 1, submissionId: 10 }),
        makeSigner({ id: 2, submissionId: 20, slug: 'sign-slug-2' }),
      ],
      [
        makeSubmission({ id: 10, externalId: 'sub-ext-1' }),
        makeSubmission({ id: 20, externalId: 'sub-ext-2', templateId: 200 }),
      ],
      [
        makeTemplate({ id: 100, name: 'Proxy Form' }),
        makeTemplate({ id: 200, name: 'Violation Ack' }),
      ],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(2);
  });

  it('includes signers matched by email only (userId is null)', async () => {
    setupScopedMock(
      [makeSigner({ userId: null, email: 'user@test.com' })],
      [makeSubmission()],
      [makeTemplate()],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(1);
  });

  it('includes signers matched by userId only (email differs)', async () => {
    setupScopedMock(
      [makeSigner({ userId: 'user-1', email: 'other@test.com' })],
      [makeSubmission()],
      [makeTemplate()],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(1);
  });

  it('excludes signers with completed status', async () => {
    // completed signers won't be returned by the first selectFrom call
    setupScopedMock([], [], []);

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(0);
  });

  it('excludes signers when submission is cancelled', async () => {
    // signer exists but submission is filtered out (status != pending)
    setupScopedMock(
      [makeSigner()],
      [], // no submissions match (cancelled submissions excluded)
      [],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(0);
  });

  it('excludes signers when submission is expired', async () => {
    // signer exists but submission is filtered out (expiresAt < now)
    setupScopedMock(
      [makeSigner()],
      [], // expired submissions excluded by gte filter
      [],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(0);
  });

  it('excludes soft-deleted signers', async () => {
    // soft-deleted signers filtered by isNull(deletedAt) in the query
    setupScopedMock([], [], []);

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no pending signers exist', async () => {
    setupScopedMock([], [], []);

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toEqual([]);
  });

  it('includes submissionExternalId in the response', async () => {
    setupScopedMock(
      [makeSigner()],
      [makeSubmission({ externalId: 'test-external-id' })],
      [makeTemplate()],
    );

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result[0]?.submissionExternalId).toBe('test-external-id');
  });

  it('limits results to 10 items', async () => {
    const signers = Array.from({ length: 15 }, (_, i) =>
      makeSigner({
        id: i + 1,
        submissionId: 10 + i,
        slug: `slug-${i}`,
        createdAt: new Date(`2026-03-${String(i + 1).padStart(2, '0')}T12:00:00Z`),
      }),
    );
    const submissions = Array.from({ length: 15 }, (_, i) =>
      makeSubmission({
        id: 10 + i,
        externalId: `ext-${i}`,
      }),
    );

    setupScopedMock(signers, submissions, [makeTemplate()]);

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(10);
  });

  it('sorts results by createdAt descending', async () => {
    const signers = [
      makeSigner({ id: 1, createdAt: new Date('2026-03-01T12:00:00Z') }),
      makeSigner({ id: 2, submissionId: 20, createdAt: new Date('2026-03-10T12:00:00Z') }),
    ];
    const submissions = [
      makeSubmission({ id: 10 }),
      makeSubmission({ id: 20, templateId: 100, externalId: 'sub-ext-2' }),
    ];

    setupScopedMock(signers, submissions, [makeTemplate()]);

    const result = await listMyPendingSigners(1, 'user-1', 'user@test.com');
    expect(result).toHaveLength(2);
    expect(result[0]?.signerId).toBe(2); // newer first
    expect(result[1]?.signerId).toBe(1);
  });

  it('calls createScopedClient with correct communityId', async () => {
    setupScopedMock([], [], []);

    await listMyPendingSigners(42, 'user-1', 'user@test.com');
    expect(createScopedClientMock).toHaveBeenCalledWith(42);
  });
});
