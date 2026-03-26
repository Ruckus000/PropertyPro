import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/api/errors/AppError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
  createAssessmentForCommunityMock,
  listAssessmentsForCommunityMock,
  updateAssessmentForCommunityMock,
  deleteAssessmentForCommunityMock,
  generateAssessmentLineItemsForCommunityMock,
  createPaymentIntentForLineItemMock,
  findActorUnitIdMock,
  waiveLateFeesForUnitMock,
  startConnectOnboardingMock,
  completeConnectOnboardingMock,
  validateConnectOAuthStateMock,
  getConnectStatusMock,
  eqMock,
  userRolesTableMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createAssessmentForCommunityMock: vi.fn(),
  listAssessmentsForCommunityMock: vi.fn(),
  updateAssessmentForCommunityMock: vi.fn(),
  deleteAssessmentForCommunityMock: vi.fn(),
  generateAssessmentLineItemsForCommunityMock: vi.fn(),
  createPaymentIntentForLineItemMock: vi.fn(),
  findActorUnitIdMock: vi.fn(),
  waiveLateFeesForUnitMock: vi.fn(),
  startConnectOnboardingMock: vi.fn(),
  completeConnectOnboardingMock: vi.fn(),
  validateConnectOAuthStateMock: vi.fn(),
  getConnectStatusMock: vi.fn(),
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  userRolesTableMock: {
    userId: Symbol('user_roles.user_id'),
    unitId: Symbol('user_roles.unit_id'),
  },
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  userRoles: userRolesTableMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/services/finance-service', () => ({
  createAssessmentForCommunity: createAssessmentForCommunityMock,
  listAssessmentsForCommunity: listAssessmentsForCommunityMock,
  updateAssessmentForCommunity: updateAssessmentForCommunityMock,
  deleteAssessmentForCommunity: deleteAssessmentForCommunityMock,
  generateAssessmentLineItemsForCommunity: generateAssessmentLineItemsForCommunityMock,
  createPaymentIntentForLineItem: createPaymentIntentForLineItemMock,
  findActorUnitId: findActorUnitIdMock,
  waiveLateFeesForUnit: waiveLateFeesForUnitMock,
  startConnectOnboarding: startConnectOnboardingMock,
  completeConnectOnboarding: completeConnectOnboardingMock,
  validateConnectOAuthState: validateConnectOAuthStateMock,
  getConnectStatus: getConnectStatusMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { POST as assessmentsPost } from '../../src/app/api/v1/assessments/route';
import { PATCH as assessmentPatch, DELETE as assessmentDelete } from '../../src/app/api/v1/assessments/[id]/route';
import { POST as assessmentGeneratePost } from '../../src/app/api/v1/assessments/[id]/generate/route';
import { POST as createIntentPost } from '../../src/app/api/v1/payments/create-intent/route';
import { POST as delinquencyWaivePost } from '../../src/app/api/v1/delinquency/[unitId]/waive/route';
import { POST as connectOnboardPost } from '../../src/app/api/v1/stripe/connect/onboard/route';
import { POST as connectCompletePost } from '../../src/app/api/v1/stripe/connect/complete/route';
import { GET as connectStatusGet } from '../../src/app/api/v1/stripe/connect/status/route';

const communityId = 321;

function jsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'req-finance-test-1',
    },
    body: JSON.stringify(body),
  });
}

describe('WS66 finance mutation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthenticatedUserIdMock.mockResolvedValue('user-finance-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-finance-1',
      communityId,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);

    createAssessmentForCommunityMock.mockResolvedValue({ id: 11 });
    listAssessmentsForCommunityMock.mockResolvedValue([]);
    updateAssessmentForCommunityMock.mockResolvedValue({ id: 11, title: 'Updated' });
    deleteAssessmentForCommunityMock.mockResolvedValue(undefined);
    generateAssessmentLineItemsForCommunityMock.mockResolvedValue({
      insertedCount: 2,
      skippedCount: 0,
      dueDate: '2026-01-15',
    });
    createPaymentIntentForLineItemMock.mockResolvedValue({
      paymentIntentId: 'pi_123',
      clientSecret: 'secret_123',
      amountCents: 25000,
      currency: 'usd',
    });
    findActorUnitIdMock.mockResolvedValue(91);
    waiveLateFeesForUnitMock.mockResolvedValue({ waivedCount: 1, waivedAmountCents: 500 });
    startConnectOnboardingMock.mockResolvedValue({
      onboardingUrl: 'https://connect.stripe.test/onboard',
    });
    completeConnectOnboardingMock.mockResolvedValue({
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    validateConnectOAuthStateMock.mockReturnValue(undefined);
    getConnectStatusMock.mockResolvedValue({
      connected: true,
      stripeAccountId: 'acct_123',
      onboardingComplete: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it('guards assessment creation with active subscription check', async () => {
    const response = await assessmentsPost(
      jsonRequest('http://localhost:3000/api/v1/assessments', {
        communityId,
        title: 'Monthly Dues',
        description: 'Standard dues',
        amountCents: 25000,
        frequency: 'monthly',
        dueDay: 10,
      }),
    );

    expect(response.status).toBe(201);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(createAssessmentForCommunityMock).toHaveBeenCalledWith(
      communityId,
      'user-finance-1',
      expect.objectContaining({ title: 'Monthly Dues' }),
      'req-finance-test-1',
    );
  });

  it('guards assessment updates and deletes with active subscription check', async () => {
    const patchResponse = await assessmentPatch(
      jsonRequest('http://localhost:3000/api/v1/assessments/11', {
        communityId,
        title: 'Updated Title',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(patchResponse.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);

    const deleteResponse = await assessmentDelete(
      new NextRequest(`http://localhost:3000/api/v1/assessments/11?communityId=${communityId}`, {
        method: 'DELETE',
        headers: {
          'x-request-id': 'req-finance-test-delete',
        },
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(deleteResponse.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(deleteAssessmentForCommunityMock).toHaveBeenCalledWith(
      communityId,
      11,
      'user-finance-1',
      'req-finance-test-delete',
    );
  });

  it('guards line-item generation with active subscription check', async () => {
    const response = await assessmentGeneratePost(
      jsonRequest('http://localhost:3000/api/v1/assessments/11/generate', {
        communityId,
        dueDate: '2026-01-15',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );

    expect(response.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(generateAssessmentLineItemsForCommunityMock).toHaveBeenCalledWith(
      communityId,
      11,
      'user-finance-1',
      '2026-01-15',
      'req-finance-test-1',
    );
  });

  it('guards payment intent creation for finance admins', async () => {
    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        lineItemId: 77,
      }),
    );

    expect(response.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(createPaymentIntentForLineItemMock).toHaveBeenCalledWith(
      communityId,
      expect.objectContaining({
        lineItemId: 77,
        actorUserId: 'user-finance-1',
        allowedUnitId: undefined,
      }),
    );
  });

  it('uses owner unit scoping when creating payment intents', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718',
    });

    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        lineItemId: 88,
      }),
    );

    expect(response.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(findActorUnitIdMock).toHaveBeenCalledWith(communityId, 'user-finance-1');
    expect(createPaymentIntentForLineItemMock).toHaveBeenCalledWith(
      communityId,
      expect.objectContaining({
        lineItemId: 88,
        allowedUnitId: 91,
      }),
    );
  });

  it('guards delinquency waive and connect onboarding mutations', async () => {
    const waiveResponse = await delinquencyWaivePost(
      jsonRequest(`http://localhost:3000/api/v1/delinquency/91/waive`, { communityId }),
      { params: Promise.resolve({ unitId: '91' }) },
    );
    expect(waiveResponse.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);

    const onboardResponse = await connectOnboardPost(
      jsonRequest('http://localhost:3000/api/v1/stripe/connect/onboard', { communityId }),
    );
    expect(onboardResponse.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(startConnectOnboardingMock).toHaveBeenCalledWith(
      communityId,
      'user-finance-1',
      'req-finance-test-1',
    );
  });

  it('returns subscription-required errors from guard before side effects', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
      new AppError('Subscription required', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const response = await assessmentsPost(
      jsonRequest('http://localhost:3000/api/v1/assessments', {
        communityId,
        title: 'Blocked Dues',
        amountCents: 10000,
        frequency: 'monthly',
      }),
    );

    expect(response.status).toBe(403);
    expect(createAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns connect status for authorized staff roles', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { documents: { read: true, write: true }, meetings: { read: true, write: true }, announcements: { read: true, write: true }, compliance: { read: true, write: true }, residents: { read: true, write: true }, financial: { read: true, write: true }, maintenance: { read: true, write: true }, violations: { read: true, write: true }, leases: { read: true, write: true }, contracts: { read: true, write: true }, polls: { read: true, write: true }, settings: { read: true, write: true }, audit: { read: true, write: true }, arc_submissions: { read: true, write: true }, work_orders: { read: true, write: true }, amenities: { read: true, write: true }, packages: { read: true, write: true }, visitors: { read: true, write: true }, calendar_sync: { read: true, write: true }, accounting: { read: true, write: true }, esign: { read: true, write: true }, finances: { read: true, write: true } } },
      communityType: 'condo_718',
    });

    const response = await connectStatusGet(
      new NextRequest(`http://localhost:3000/api/v1/stripe/connect/status?communityId=${communityId}`),
    );

    expect(response.status).toBe(200);
    expect(getConnectStatusMock).toHaveBeenCalledWith(communityId);
  });

  it('rejects connect status for owners', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718',
    });

    const response = await connectStatusGet(
      new NextRequest(`http://localhost:3000/api/v1/stripe/connect/status?communityId=${communityId}`),
    );

    expect(response.status).toBe(403);
    expect(getConnectStatusMock).not.toHaveBeenCalled();
  });

  it('completes connect onboarding with valid state and code', async () => {
    const response = await connectCompletePost(
      jsonRequest('http://localhost:3000/api/v1/stripe/connect/complete', {
        communityId,
        code: 'ac_test_code',
        state: 'valid-state-token',
      }),
    );

    expect(response.status).toBe(200);
    expect(validateConnectOAuthStateMock).toHaveBeenCalledWith(
      'valid-state-token',
      communityId,
      'user-finance-1',
    );
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(completeConnectOnboardingMock).toHaveBeenCalledWith(
      communityId,
      'ac_test_code',
      'user-finance-1',
      'req-finance-test-1',
    );

    const body = await response.json();
    expect(body.data).toEqual({
      stripeAccountId: 'acct_123',
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it('rejects connect completion with invalid state', async () => {
    validateConnectOAuthStateMock.mockImplementationOnce(() => {
      throw new AppError('OAuth state signature invalid', 403, 'FORBIDDEN');
    });

    const response = await connectCompletePost(
      jsonRequest('http://localhost:3000/api/v1/stripe/connect/complete', {
        communityId,
        code: 'ac_test_code',
        state: 'forged-state',
      }),
    );

    expect(response.status).toBe(403);
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
  });

  it('rejects connect completion with missing state', async () => {
    const response = await connectCompletePost(
      jsonRequest('http://localhost:3000/api/v1/stripe/connect/complete', {
        communityId,
        code: 'ac_test_code',
      }),
    );

    // Missing state field fails validation → 400
    expect(response.status).toBe(400);
    expect(completeConnectOnboardingMock).not.toHaveBeenCalled();
  });
});
