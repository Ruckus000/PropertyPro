/**
 * Unit tests for `/api/v1/esign/submissions` GET — locks in the
 * `safeParse + ValidationError` enum-validation contract from #232 and the
 * happy-path response shape.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listSubmissionsMock,
  createSubmissionMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignManagementReadMock,
  requireEsignWritePermissionMock,
  resolveEffectiveCommunityIdMock,
  parseCommunityIdFromBodyMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  assertCommunityOwnedStoragePathMock,
  assertPdfMagicBytesMock,
} = vi.hoisted(() => ({
  assertCommunityOwnedStoragePathMock: vi.fn(),
  assertPdfMagicBytesMock: vi.fn(),
  listSubmissionsMock: vi.fn(),
  createSubmissionMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireEsignManagementReadMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignManagementRead: requireEsignManagementReadMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  createSubmission: createSubmissionMock,
  listSubmissions: listSubmissionsMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));


vi.mock('@/lib/services/storage-validators', () => ({
  assertCommunityOwnedStoragePath: assertCommunityOwnedStoragePathMock,
  assertPdfMagicBytes: assertPdfMagicBytesMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { ValidationError } from '../../src/lib/api/errors';
import { GET, POST } from '../../src/app/api/v1/esign/submissions/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const membership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
  parseCommunityIdFromBodyMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requireEsignManagementReadMock.mockResolvedValue(undefined);
  requireEsignWritePermissionMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  assertCommunityOwnedStoragePathMock.mockReturnValue(undefined);
  assertPdfMagicBytesMock.mockResolvedValue(undefined);
});

describe('GET /api/v1/esign/submissions', () => {
  it('returns the listSubmissions result wrapped in { data }', async () => {
    const rows = [{ id: 1, status: 'pending' }, { id: 2, status: 'completed' }];
    listSubmissionsMock.mockResolvedValueOnce(rows);

    const response = await GET(makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: rows });
    expect(listSubmissionsMock).toHaveBeenCalledWith(COMMUNITY_ID, { status: undefined });
    // The gate this route runs is the management one, not `esign:read`,
    // which residents also hold. `esign-route-helpers.test.ts` proves what
    // that gate refuses; this proves the route actually reaches it.
    expect(requireEsignManagementReadMock).toHaveBeenCalledWith(membership);
  });

  it('passes a valid status filter through to listSubmissions', async () => {
    listSubmissionsMock.mockResolvedValueOnce([]);

    await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=pending`),
    );

    expect(listSubmissionsMock).toHaveBeenCalledWith(COMMUNITY_ID, { status: 'pending' });
  });

  it('rejects an invalid status with ValidationError (400, not 500) — #232 contract', async () => {
    const response = await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`),
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.message).toBe('Invalid status filter');
    expect(listSubmissionsMock).not.toHaveBeenCalled();
  });

  it('lists all accepted status values in the ValidationError details — #232 contract', async () => {
    const response = await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`),
    );
    const json = await response.json();
    const fieldMessage = json.error?.details?.fields?.[0]?.message ?? '';
    expect(json.error?.details?.fields?.[0]?.field).toBe('status');
    for (const s of ['pending', 'processing', 'completed', 'declined', 'expired']) {
      expect(fieldMessage).toMatch(new RegExp(s));
    }
  });
});

const CREATE_BODY = {
  communityId: COMMUNITY_ID,
  templateId: 3,
  signers: [{
    email: 'signer@example.com',
    name: 'Signer',
    role: 'owner',
    sortOrder: 0,
  }],
  signingOrder: 'parallel' as const,
  sendEmail: true,
};

const CREATE_RESULT = {
  submission: { id: 12, status: 'pending' },
  signers: [{ id: 1, email: 'signer@example.com' }],
};

describe('POST /api/v1/esign/submissions', () => {
  beforeEach(() => {
    createSubmissionMock.mockResolvedValue(CREATE_RESULT);
  });

  it('creates submission and returns { data }', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/esign/submissions', {
      method: 'POST',
      body: JSON.stringify(CREATE_BODY),
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    });
    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: CREATE_RESULT });
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireEsignWritePermissionMock).toHaveBeenCalledWith(membership);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasEsign');
    expect(createSubmissionMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({ templateId: 3, signingOrder: 'parallel' }),
      'req-1',
    );
  });

  it('rejects invalid body via contract validation without calling gates', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/esign/submissions', {
      method: 'POST',
      body: JSON.stringify({ communityId: COMMUNITY_ID }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
  });
});



/**
 * A send that carries its own document instead of naming a template.
 *
 * The PDF arrives the same way a template's does — presigned upload straight
 * to storage — so the server sees only a caller-supplied path and a
 * client-asserted MIME type. Both trust gaps the template route closes have to
 * be closed here too, or this route becomes the way around them.
 */
const ONE_OFF_SCHEMA = {
  version: 1 as const,
  signerRoles: ['owner'],
  fields: [
    {
      id: 'f1',
      type: 'signature' as const,
      signerRole: 'owner',
      page: 0,
      x: 10,
      y: 20,
      width: 30,
      height: 5,
      required: true,
    },
  ],
};

const ONE_OFF_BODY = {
  communityId: COMMUNITY_ID,
  document: {
    name: 'Limited proxy.pdf',
    sourceDocumentPath: `communities/${COMMUNITY_ID}/esign-templates/one-off.pdf`,
    fieldsSchema: ONE_OFF_SCHEMA,
  },
  signers: [
    { email: 'signer@example.com', name: 'Signer', role: 'owner', sortOrder: 0 },
  ],
  signingOrder: 'parallel' as const,
  sendEmail: true,
};

function postJson(body: unknown) {
  return POST(
    new NextRequest('http://localhost:3000/api/v1/esign/submissions', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-9' },
    }),
  );
}

describe('POST /api/v1/esign/submissions — send with no template', () => {
  beforeEach(() => {
    createSubmissionMock.mockResolvedValue(CREATE_RESULT);
  });

  it('passes the document through to the service', async () => {
    const response = await postJson(ONE_OFF_BODY);

    expect(response.status).toBe(200);
    expect(createSubmissionMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({
        templateId: undefined,
        document: ONE_OFF_BODY.document,
      }),
      'req-9',
    );
  });

  it('rejects a storage path outside this community before creating anything', async () => {
    assertCommunityOwnedStoragePathMock.mockImplementationOnce(() => {
      throw new ValidationError('Storage path does not belong to this community.');
    });

    const response = await postJson(ONE_OFF_BODY);

    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(assertCommunityOwnedStoragePathMock).toHaveBeenCalledWith(
      ONE_OFF_BODY.document.sourceDocumentPath,
      COMMUNITY_ID,
      'esign-templates',
    );
  });

  it('rejects bytes that are not a PDF before creating anything', async () => {
    assertPdfMagicBytesMock.mockRejectedValueOnce(
      new ValidationError('Uploaded file is not a valid PDF.'),
    );

    const response = await postJson(ONE_OFF_BODY);

    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
    expect(assertPdfMagicBytesMock).toHaveBeenCalledWith(
      'documents',
      ONE_OFF_BODY.document.sourceDocumentPath,
    );
  });

  it('leaves the upload gates alone when the request names a template', async () => {
    await postJson(CREATE_BODY);

    expect(assertCommunityOwnedStoragePathMock).not.toHaveBeenCalled();
    expect(assertPdfMagicBytesMock).not.toHaveBeenCalled();
  });

  it('refuses a request that names both a template and a document', async () => {
    const response = await postJson({ ...ONE_OFF_BODY, templateId: 3 });

    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });

  it('refuses a request that names neither', async () => {
    const { document: _omitted, ...withoutDocument } = ONE_OFF_BODY;
    const response = await postJson(withoutDocument);

    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });
});
