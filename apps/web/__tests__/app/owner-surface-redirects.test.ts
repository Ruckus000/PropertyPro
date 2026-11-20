/**
 * D9 (2026-11-20 resident review): Insurance and Payments are owner/manager
 * surfaces. Their APIs already refused tenants (`insurance` and `finances` RBAC
 * cells; the insurance tenant exclusion is the 2026-07-17 legal ruling), but
 * the pages rendered anyway, so a condo tenant landed on two permanent error
 * banners (Insurance) or a generic error (Payments). The pages now redirect a
 * tenant to `/dashboard?reason=insufficient-permissions`, like the compliance
 * page, and do it before reading anything.
 *
 * The permission check is the REAL `@/lib/db/access-control` (it is pure), so
 * these tests pin the matrix semantics, not a mock of them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  membershipMock,
  listActorUnitIdsMock,
  withUnitLabelsMock,
  getReportMock,
} = vi.hoisted(() => ({
  membershipMock: vi.fn(),
  listActorUnitIdsMock: vi.fn(),
  withUnitLabelsMock: vi.fn(),
  getReportMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: vi.fn(async () => 'user-1'),
}));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: membershipMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({
  getEffectiveFeaturesForPage: vi.fn(async () => ({ hasInsuranceHub: true })),
}));
vi.mock('@propertypro/db', () => ({
  units: {},
  createScopedClient: vi.fn(() => ({ query: vi.fn(async () => []) })),
}));
vi.mock('@/lib/units/actor-units', () => ({ listActorUnitIds: listActorUnitIdsMock }));
vi.mock('@/lib/units/unit-labels', () => ({ withUnitLabels: withUnitLabelsMock }));
vi.mock('@/lib/services/wind-mitigation-service', () => ({
  getWindMitigationReportById: getReportMock,
}));
vi.mock('@/lib/services/community-contact-service', () => ({
  getCommunityContact: vi.fn(async () => null),
}));
vi.mock('@/components/shared/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/insurance/insurance-summary-section', () => ({
  InsuranceSummarySection: () => null,
}));
vi.mock('@/components/insurance/wind-mitigation-section', () => ({
  WindMitigationSection: () => null,
}));
vi.mock('@/components/insurance/wind-mitigation-report-detail', () => ({
  WindMitigationReportDetail: () => null,
}));
vi.mock('@/components/billing/feature-gate', () => ({ FeatureGate: () => null }));
vi.mock('@/components/finance/payment-portal', () => ({ PaymentPortal: () => null }));
vi.mock(
  '../../src/app/(authenticated)/communities/[id]/payments/_components/AdminPaymentsTabs',
  () => ({ AdminPaymentsTabs: () => null }),
);

import InsurancePage from '../../src/app/(authenticated)/communities/[id]/insurance/page';
import WindMitigationReportPage from '../../src/app/(authenticated)/communities/[id]/insurance/wind-mitigation/[reportId]/page';
import PaymentsPage from '../../src/app/(authenticated)/communities/[id]/payments/page';

const base = {
  userId: 'user-1',
  communityId: 42,
  communityName: 'Sunset Condos',
  communityType: 'condo_718',
  designation: null,
  assessmentPaymentsEnabled: true,
};
const TENANT = { ...base, role: 'resident', isUnitOwner: false, isAdmin: false };
const OWNER = { ...base, role: 'resident', isUnitOwner: true, isAdmin: false };
const MANAGER = { ...base, role: 'property_manager', isUnitOwner: false, isAdmin: true };

const REFUSED = 'NEXT_REDIRECT /dashboard?reason=insufficient-permissions';

const hubProps = { params: Promise.resolve({ id: '42' }) };
const reportProps = { params: Promise.resolve({ id: '42', reportId: '9' }) };
const paymentsProps = {
  params: Promise.resolve({ id: '42' }),
  searchParams: Promise.resolve({}),
};

beforeEach(() => {
  vi.clearAllMocks();
  listActorUnitIdsMock.mockResolvedValue([]);
  withUnitLabelsMock.mockResolvedValue([]);
  getReportMock.mockResolvedValue({ id: 9, formType: 'oir_b1_1802', buildingLabel: null });
});

describe('/communities/[id]/insurance', () => {
  it('redirects a tenant before reading their units', async () => {
    membershipMock.mockResolvedValue(TENANT);
    await expect(InsurancePage(hubProps)).rejects.toThrow(REFUSED);
    expect(listActorUnitIdsMock).not.toHaveBeenCalled();
  });

  it('renders for an owner and a manager (controls)', async () => {
    for (const m of [OWNER, MANAGER]) {
      membershipMock.mockResolvedValue(m);
      await expect(InsurancePage(hubProps)).resolves.toBeDefined();
    }
    expect(listActorUnitIdsMock).toHaveBeenCalledTimes(2);
  });
});

describe('/communities/[id]/insurance/wind-mitigation/[reportId]', () => {
  it('redirects a tenant before reading the report', async () => {
    membershipMock.mockResolvedValue(TENANT);
    await expect(WindMitigationReportPage(reportProps)).rejects.toThrow(REFUSED);
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('renders for an owner and a manager (controls)', async () => {
    for (const m of [OWNER, MANAGER]) {
      membershipMock.mockResolvedValue(m);
      await expect(WindMitigationReportPage(reportProps)).resolves.toBeDefined();
    }
    expect(getReportMock).toHaveBeenCalledTimes(2);
  });
});

describe('/communities/[id]/payments', () => {
  it('redirects a tenant before reading their units', async () => {
    membershipMock.mockResolvedValue(TENANT);
    await expect(PaymentsPage(paymentsProps)).rejects.toThrow(REFUSED);
    expect(listActorUnitIdsMock).not.toHaveBeenCalled();
  });

  it('renders for an owner and a manager (controls)', async () => {
    membershipMock.mockResolvedValue(OWNER);
    await expect(PaymentsPage(paymentsProps)).resolves.toBeDefined();
    expect(listActorUnitIdsMock).toHaveBeenCalledTimes(1);

    membershipMock.mockResolvedValue(MANAGER);
    await expect(PaymentsPage(paymentsProps)).resolves.toBeDefined();
  });
});
