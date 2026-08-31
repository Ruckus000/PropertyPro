import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

// Re-export from canonical source (M1 deduplication)
export { getActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

export async function requireFinanceEnabled(membership: CommunityMembership): Promise<void> {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasFinance) {
    throw new ForbiddenError('Finance features are not enabled for this community type');
  }
  await requirePlanFeature(membership.communityId, 'hasFinance');
}

/**
 * Gate on TAKING MONEY — the charge path and Stripe Connect onboarding.
 *
 * Synchronous, and deliberately narrower than `requireFinanceEnabled`: finance
 * READS stay open. A resident must still be able to see what they owe and how it
 * was computed; the exposure is in accepting the payment, not in displaying a
 * balance. Same posture as fines — records visible, writes blocked.
 *
 * Disabled because payments currently run as Stripe DESTINATION charges
 * (`transfer_data.destination`), so assessment funds transit PropertyPro's own
 * Stripe balance and chargeback liability sits with us rather than the
 * association — the wrong shape for customers with fund-segregation duties.
 * Re-enable only after the switch to direct charges.
 *
 * Note for callers: place this BEFORE `requireActiveSubscriptionForMutation`, so
 * it stays independent of that guard's deliberate resident-self-service bypass.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-15, F-16.
 */
export function requirePaymentsEnabled(membership: CommunityMembership): void {
  if (!membership.assessmentPaymentsEnabled) {
    throw new ForbiddenError('Online payments are not available for this community');
  }
}

export function requireFinanceReadPermission(membership: CommunityMembership): void {
  requirePermission(membership, 'finances', 'read');
}

export function requireFinanceWritePermission(membership: CommunityMembership): void {
  requirePermission(membership, 'finances', 'write');
}

export function requireFinanceAdminWrite(membership: CommunityMembership): void {
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only finance administrators can perform this action');
  }
}


export function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestError(`${label} must be a positive integer`);
  }
  return parsed;
}

export function parseDateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestError(`${label} must be in YYYY-MM-DD format`);
  }
  return value;
}

export function toIsoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function centsToDollars(amountCents: number): string {
  return (amountCents / 100).toFixed(2);
}
