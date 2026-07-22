import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/api/errors/AppError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireActiveSubscriptionForMutationMock,
  createAssessmentForCommunityMock,
  paginateAssessmentsForCommunityMock,
  updateAssessmentForCommunityMock,
  deleteAssessmentForCommunityMock,
  generateAssessmentLineItemsForCommunityMock,
  createPaymentIntentForLineItemMock,
  listActorUnitIdsForFinanceMock,
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
  paginateAssessmentsForCommunityMock: vi.fn(),
  updateAssessmentForCommunityMock: vi.fn(),
  deleteAssessmentForCommunityMock: vi.fn(),
  generateAssessmentLineItemsForCommunityMock: vi.fn(),
  createPaymentIntentForLineItemMock: vi.fn(),
  listActorUnitIdsForFinanceMock: vi.fn(),
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
  paginateAssessmentsForCommunity: paginateAssessmentsForCommunityMock,
  updateAssessmentForCommunity: updateAssessmentForCommunityMock,
  deleteAssessmentForCommunity: deleteAssessmentForCommunityMock,
  generateAssessmentLineItemsForCommunity: generateAssessmentLineItemsForCommunityMock,
  createPaymentIntentForLineItem: createPaymentIntentForLineItemMock,
  listActorUnitIdsForFinance: listActorUnitIdsForFinanceMock,
  waiveLateFeesForUnit: waiveLateFeesForUnitMock,
  startConnectOnboarding: startConnectOnboardingMock,
  completeConnectOnboarding: completeConnectOnboardingMock,
  validateConnectOAuthState: validateConnectOAuthStateMock,
  getConnectStatus: getConnectStatusMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET as assessmentsGet, POST as assessmentsPost } from '../../src/app/api/v1/assessments/route';
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
      role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager',
      communityType: 'condo_718',
    });
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);

    createAssessmentForCommunityMock.mockResolvedValue({ id: 11 });
    paginateAssessmentsForCommunityMock.mockResolvedValue({
      data: [{ id: 11, title: 'Monthly Dues' }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });
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
    listActorUnitIdsForFinanceMock.mockResolvedValue([91]);
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

    expect(response.status).toBe(200);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId);
    expect(createAssessmentForCommunityMock).toHaveBeenCalledWith(
      communityId,
      'user-finance-1',
      expect.objectContaining({ title: 'Monthly Dues' }),
      'req-finance-test-1',
    );
  });

  it('returns canonical paginated assessment list envelope', async () => {
    paginateAssessmentsForCommunityMock.mockResolvedValueOnce({
      data: [{ id: 12, title: 'Quarterly Dues' }],
      pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 25 },
    });

    const response = await assessmentsGet(
      new NextRequest(`http://localhost:3000/api/v1/assessments?communityId=${communityId}&pageSize=25`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(paginateAssessmentsForCommunityMock).toHaveBeenCalledWith(communityId, {
      cursor: undefined,
      pageSize: 25,
    });
    expect(body).toEqual({
      data: {
        data: [{ id: 12, title: 'Quarterly Dues' }],
        pagination: { nextCursor: 'next-cursor', hasMore: true, pageSize: 25 },
      },
    });
  });

  it('passes empty assessment cursor and pageSize as missing values', async () => {
    const response = await assessmentsGet(
      new NextRequest(`http://localhost:3000/api/v1/assessments?communityId=${communityId}&cursor=&pageSize=`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(paginateAssessmentsForCommunityMock).toHaveBeenCalledWith(communityId, {
      cursor: undefined,
      pageSize: undefined,
    });
    expect(body.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });
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
    await expect(deleteResponse.json()).resolves.toEqual({ data: { success: true } });
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

  it('rejects create-intent body with neither lineItemId nor payableId', async () => {
    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        payableType: 'assessment_line_item',
      }),
    );

    expect(response.status).toBe(400);
    expect(createPaymentIntentForLineItemMock).not.toHaveBeenCalled();
  });

  it('guards payment intent creation for finance admins', async () => {
    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        lineItemId: 77,
      }),
    );

    expect(response.status).toBe(200);
    // Admin-initiated charge: full guard applies (A3 carve-out is off).
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId, {
      allowResidentSelfService: false,
    });
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
    // Resident paying their own unit: A3 carve-out lets the payment through even
    // if the community's platform subscription is soft-locked.
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(communityId, {
      allowResidentSelfService: true,
    });
    expect(listActorUnitIdsForFinanceMock).toHaveBeenCalledWith(communityId, 'user-finance-1');
    expect(createPaymentIntentForLineItemMock).toHaveBeenCalledWith(
      communityId,
      expect.objectContaining({
        lineItemId: 88,
        allowedUnitId: 91,
      }),
    );
  });

  it('requires explicit unitId for multi-unit owner payment intents', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'resident', isAdmin: false, isUnitOwner: true, displayTitle: 'Owner',
      communityType: 'condo_718',
    });
    listActorUnitIdsForFinanceMock.mockResolvedValueOnce([91, 92]);

    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        lineItemId: 88,
      }),
    );

    expect(response.status).toBe(400);
    expect(createPaymentIntentForLineItemMock).not.toHaveBeenCalled();
  });

  it('rejects rent_obligation intents for non-apartment communities', async () => {
    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        payableType: 'rent_obligation',
        payableId: 77,
      }),
    );

    expect(response.status).toBe(422);
    expect(createPaymentIntentForLineItemMock).not.toHaveBeenCalled();
  });

  it('rejects lineItemId with rent_obligation payloads', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager',
      communityType: 'apartment',
    });

    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        payableType: 'rent_obligation',
        payableId: 77,
        lineItemId: 12,
      }),
    );

    expect(response.status).toBe(422);
    expect(createPaymentIntentForLineItemMock).not.toHaveBeenCalled();
  });

  it('allows apartment tenants to create rent_obligation intents for their own unit obligations', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
      communityType: 'apartment',
    });
    listActorUnitIdsForFinanceMock.mockResolvedValueOnce([93]);

    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        payableType: 'rent_obligation',
        payableId: 77,
      }),
    );

    expect(response.status).toBe(200);
    expect(createPaymentIntentForLineItemMock).toHaveBeenCalledWith(
      communityId,
      expect.objectContaining({
        lineItemId: 77,
        payableId: 77,
        payableType: 'rent_obligation',
        allowedUnitId: 93,
      }),
    );
  });

  it('requires explicit unitId for multi-unit apartment tenant rent payment intents', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-finance-1',
      communityId,
      role: 'resident', isAdmin: false, isUnitOwner: false, displayTitle: 'Tenant',
      communityType: 'apartment',
    });
    listActorUnitIdsForFinanceMock.mockResolvedValueOnce([93, 94]);

    const response = await createIntentPost(
      jsonRequest('http://localhost:3000/api/v1/payments/create-intent', {
        communityId,
        payableType: 'rent_obligation',
        payableId: 77,
      }),
    );

    expect(response.status).toBe(400);
    expect(createPaymentIntentForLineItemMock).not.toHaveBeenCalled();
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
      role: 'property_manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Property Manager',
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
