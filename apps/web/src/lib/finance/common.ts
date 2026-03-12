import { userRoles, type ScopedClient } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity } from '@propertypro/shared';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { BadRequestError, ForbiddenError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';

export function requireFinanceEnabled(membership: CommunityMembership): void {
  const features = getFeaturesForCommunity(membership.communityType);
  if (!features.hasFinance) {
    throw new ForbiddenError('Finance features are not enabled for this community type');
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

export async function getActorUnitIds(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number[]> {
  const membershipRows = await scopedClient.selectFrom<{ unitId: number | null }>(
    userRoles,
    { unitId: userRoles.unitId },
    eq(userRoles.userId, actorUserId),
  );

  return membershipRows
    .map((row) => row.unitId)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

export async function requireActorUnitId(
  scopedClient: ScopedClient,
  actorUserId: string,
): Promise<number> {
  const unitIds = await getActorUnitIds(scopedClient, actorUserId);
  const firstUnitId = unitIds[0];
  if (firstUnitId === undefined) {
    throw new ForbiddenError('No unit association found for this user in the selected community');
  }
  return firstUnitId;
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
