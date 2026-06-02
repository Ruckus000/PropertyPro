/**
 * Route unit tests — `POST /api/v1/accounting/export`.
 *
 * Added alongside Plan A1 drain #170. Auth chain mirrors drain #87
 * (`accounting/connect`) with `exportLedgerToAccounting` as the service call
 * and `x-request-id` forwarded as the 5th positional arg.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireAccountingEnabledMock,
  requireAccountingWritePermissionMock,
  exportLedgerToAccountingMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireAccountingEnabledMock: vi.fn(),
  requireAccountingWritePermissionMock: vi.fn(),
  exportLedgerToAccountingMock: vi.fn(),
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

vi.mock('@/lib/accounting/common', () => ({
  requireAccountingEnabled: requireAccountingEnabledMock,
  requireAccountingWritePermission: requireAccountingWritePermissionMock,
}));

vi.mock('@/lib/services/accounting-connectors-service', () => ({
  exportLedgerToAccounting: exportLedgerToAccountingMock,
}));

import { POST } from '../../src/app/api/v1/accounting/export/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Community Association Manager',
  communityType: 'condo_718' as const,
};

const EXPORT_RESULT = {
  provider: 'quickbooks' as const,
  exportedCount: 3,
  skippedCount: 1,
  warnings: ['Skipped ledger entry 99: no account mapping'],
  providerReference: 'qbo-batch-abc',
};

const validBody = {
  communityId: 42,
  provider: 'quickbooks',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  limit: 100,
};

function jsonPost(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/accounting/export', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('POST /api/v1/accounting/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireAccountingEnabledMock.mockReturnValue(undefined);
    requireAccountingWritePermissionMock.mockReturnValue(undefined);
    exportLedgerToAccountingMock.mockResolvedValue(EXPORT_RESULT);
  });

  it('exports ledger entries and returns the service payload', async () => {
    const response = await POST(
      jsonPost(validBody, { 'x-request-id': 'req-export-1' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual(EXPORT_RESULT);
    expect(exportLedgerToAccountingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
      {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        limit: 100,
      },
      'req-export-1',
    );
  });

  it('forwards null x-request-id when header absent', async () => {
    await POST(jsonPost(validBody));

    expect(exportLedgerToAccountingMock).toHaveBeenCalledWith(
      42,
      'user-admin-1',
      'quickbooks',
      {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        limit: 100,
      },
      null,
    );
  });

  it('returns 401 without calling membership when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(jsonPost(validBody));

    expect(response.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(exportLedgerToAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a community member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const response = await POST(jsonPost(validBody));

    expect(response.status).toBe(403);
    expect(requireAccountingEnabledMock).not.toHaveBeenCalled();
    expect(exportLedgerToAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting is disabled', async () => {
    requireAccountingEnabledMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Accounting is not enabled');
    });

    const response = await POST(jsonPost(validBody));

    expect(response.status).toBe(403);
    expect(exportLedgerToAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 403 when accounting write permission is denied', async () => {
    requireAccountingWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Forbidden');
    });

    const response = await POST(jsonPost(validBody));

    expect(response.status).toBe(403);
    expect(exportLedgerToAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without side effects', async () => {
    const response = await POST(jsonPost({ communityId: 42 }));

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(exportLedgerToAccountingMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid date format', async () => {
    const response = await POST(
      jsonPost({ ...validBody, startDate: '01/01/2026' }),
    );

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });
});
