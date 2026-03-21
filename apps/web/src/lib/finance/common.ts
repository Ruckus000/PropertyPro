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
