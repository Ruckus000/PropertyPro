/**
 * The two lists on a resident's Mine tab of /violations: "On your unit" and
 * "Your reports". Server-only; imported by the page. This projection is the
 * D1a/D1b privacy boundary.
 */
import { createScopedClient } from '@propertypro/db';
import type { CommunityMembership } from '@/lib/api/community-membership';
import { residentVisibleViolationsWhere } from '@/lib/violations/common';
import { hydrateReportedByRole } from '@/lib/violations/hydrate-reporter-role';
import { listViolationsForCommunity } from '@/lib/services/violations-service';
import { withUnitLabels } from '@/lib/units/unit-labels';

/**
 * Only what the card renders crosses to the client. A "Your reports" row can be
 * a neighbour's case, and the full row carries its hearing details and
 * resolution notes, which are that household's business, not the reporter's.
 */
export function toCardFields(v: {
  id: number;
  unitId: number;
  category: string;
  description: string;
  status: string;
  severity: string;
  createdAt: unknown;
  reportedByRole: 'staff' | 'resident' | null;
  unitLabel: string;
}) {
  return {
    id: v.id,
    unitId: v.unitId,
    category: v.category,
    description: v.description,
    status: v.status,
    severity: v.severity,
    createdAt: v.createdAt as string | Date,
    reportedByRole: v.reportedByRole,
    unitLabel: v.unitLabel,
  };
}

export type ViolationCardFields = ReturnType<typeof toCardFields>;

export async function loadResidentViolationLists(
  communityId: number,
  membership: CommunityMembership,
  userId: string,
  residentUnitIds: number[],
): Promise<{ onYourUnit: ViolationCardFields[]; yourReports: ViolationCardFields[] }> {
  const scoped = createScopedClient(communityId);
  const viewer = { membership, userId };
  const [onYourUnit, yourReports] = await Promise.all([
    listViolationsForCommunity(communityId, {
      allowedUnitIds: residentUnitIds,
      visibleWhere: residentVisibleViolationsWhere(membership, userId),
    }).then(async (rows) =>
      (await hydrateReportedByRole(scoped, await withUnitLabels(scoped, rows), viewer)).map(
        toCardFields,
      ),
    ),
    listViolationsForCommunity(communityId, { reportedByUserId: userId }).then(async (rows) =>
      (await hydrateReportedByRole(scoped, await withUnitLabels(scoped, rows), viewer)).map(
        toCardFields,
      ),
    ),
  ]);
  return { onYourUnit, yourReports };
}
