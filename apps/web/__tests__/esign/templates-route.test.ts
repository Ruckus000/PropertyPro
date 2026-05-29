/**
 * Unit tests for `/api/v1/esign/templates` GET + POST (A1 drain #124).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listTemplatesMock,
  createTemplateMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignReadPermissionMock,
  requireEsignWritePermissionMock,
  resolveEffectiveCommunityIdMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  listTemplatesMock: vi.fn(),
  createTemplateMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
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
  parseCommunityIdFromQuery: vi.fn(),
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  createTemplate: createTemplateMock,
  listTemplates: listTemplatesMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    details?: Record<string, unknown>;
    constructor(msg: string, details?: Record<string, unknown>) {
      super(msg);
      this.name = 'ValidationError';
      this.details = details;
    }
  },
}));

import { GET, POST } from '../../src/app/api/v1/esign/templates/route';

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
  requireEsignReadPermissionMock.mockResolvedValue(undefined);
  requireEsignWritePermissionMock.mockResolvedValue(undefined);
});

describe('GET /api/v1/esign/templates', () => {
  it('returns listTemplates result wrapped in { data }', async () => {
    const rows = [{ id: 1, status: 'active' }];
    listTemplatesMock.mockResolvedValueOnce(rows);

    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/esign/templates?communityId=${COMMUNITY_ID}`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: rows });
    expect(listTemplatesMock).toHaveBeenCalledWith(COMMUNITY_ID, { status: undefined, type: undefined });
  });

  it('rejects an invalid status with ValidationError (400 path) — #232 contract', async () => {
    await expect(
      GET(
        new NextRequest(`http://localhost:3000/api/v1/esign/templates?communityId=${COMMUNITY_ID}&status=invalid`),
      ),
    ).rejects.toThrow('Invalid status filter');
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/esign/templates', () => {
  const validBody = {
    communityId: COMMUNITY_ID,
    name: 'Proxy Form',
    templateType: 'proxy',
    sourceDocumentPath: 'docs/template.pdf',
    fieldsSchema: {
      version: 1 as const,
      fields: [],
      signerRoles: ['owner'],
    },
  };

  it('creates a template', async () => {
    const created = { id: 5, ...validBody };
    createTemplateMock.mockResolvedValueOnce(created);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/v1/esign/templates', {
        method: 'POST',
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: created });
    expect(createTemplateMock).toHaveBeenCalled();
  });
});
