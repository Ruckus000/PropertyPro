/**
 * Unit tests — `/api/v1/onboarding/apartment` (A1 drain #139).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireActiveSubscriptionForMutationMock,
  createScopedClientMock,
  logAuditEventMock,
  getCommunityForWizardSeedMock,
  getOrCreateWizardStateMock,
  updateWizardStateRowMock,
  createChecklistItemsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  getCommunityForWizardSeedMock: vi.fn(),
  getOrCreateWizardStateMock: vi.fn(),
  updateWizardStateRowMock: vi.fn(),
  createChecklistItemsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/onboarding/wizard-common', () => ({
  requireMutationAuthorization: vi.fn(),
  toIsoString: (value: Date | null) => (value ? value.toISOString() : null),
  deriveNextStep: (last: number | null, max: number) => (last == null ? 0 : Math.min(last + 1, max)),
  normalizeStepIndex: (step?: number, currentStep?: number) =>
    step !== undefined ? step : (currentStep ?? 1) - 1,
  mergeStepData: (existing: Record<string, unknown>, patch: Record<string, unknown>) => ({
    ...existing,
    ...patch,
  }),
  updateCommunityProfile: vi.fn(),
  getOrCreateWizardState: getOrCreateWizardStateMock,
  buildProfileFromCommunity: vi.fn(() => ({ name: 'Ridge' })),
  getCommunityForWizardSeed: getCommunityForWizardSeedMock,
  updateWizardStateRow: updateWizardStateRowMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  createChecklistItems: createChecklistItemsMock,
}));

import { GET, POST } from '../../src/app/api/v1/onboarding/apartment/route';

const MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 42,
  role: 'property_manager_admin' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Manager',
  communityType: 'apartment' as const,
};

const SCOPED = { communityId: 42 };

describe('/api/v1/onboarding/apartment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    getCommunityForWizardSeedMock.mockResolvedValue(null);
    getOrCreateWizardStateMock.mockResolvedValue({
      status: 'in_progress',
      lastCompletedStep: 0,
      stepData: {},
      completedAt: null,
    });
    updateWizardStateRowMock.mockResolvedValue(undefined);
    createChecklistItemsMock.mockResolvedValue(undefined);
  });

  it('GET returns wizard state', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/onboarding/apartment?communityId=42'),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('in_progress');
    expect(getOrCreateWizardStateMock).toHaveBeenCalled();
  });

  it('GET returns 403 for condo community', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      ...MEMBERSHIP,
      communityType: 'condo_718',
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/onboarding/apartment?communityId=42'),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });

  it('POST completes wizard and creates checklist items', async () => {
    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/onboarding/apartment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42, action: 'complete' }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe('completed');
    expect(createChecklistItemsMock).toHaveBeenCalled();
    expect(updateWizardStateRowMock).toHaveBeenCalled();
  });

  it('POST noop when already completed', async () => {
    getOrCreateWizardStateMock.mockResolvedValue({
      status: 'completed',
      lastCompletedStep: 1,
      stepData: {},
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const res = await POST(
      new NextRequest('http://localhost:3000/api/v1/onboarding/apartment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId: 42 }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.noop).toBe(true);
    expect(updateWizardStateRowMock).not.toHaveBeenCalled();
  });
});
