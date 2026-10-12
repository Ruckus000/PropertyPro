import { getFeaturesForCommunity, type CommunityRole, type CommunityType } from '@propertypro/shared';
import { checkPermissionV2 } from '@/lib/db/access-control';

/**
 * The one link the setup-complete celebration offers, chosen from what this
 * person may actually open.
 *
 * The celebration used to link every finisher to the compliance page. Tenants
 * cannot read compliance and apartments have none, so for them the link
 * bounced straight back to the dashboard. Both dashboards call
 * `celebrationNextStepFor` server-side and pass the result down.
 */
export interface CelebrationNextStep {
  label: string;
  href: string;
}

export function chooseCelebrationNextStep(input: {
  communityId: number;
  /** Feature available for this community type AND `compliance:read` granted. */
  canViewCompliance: boolean;
  /** `documents:read` granted. */
  canViewDocuments: boolean;
}): CelebrationNextStep | null {
  if (input.canViewCompliance) {
    return {
      label: 'View compliance dashboard',
      href: `/communities/${input.communityId}/compliance`,
    };
  }
  if (input.canViewDocuments) {
    return {
      label: 'Browse documents',
      href: `/communities/${input.communityId}/documents`,
    };
  }
  return null;
}

export function celebrationNextStepFor(input: {
  communityId: number;
  role: CommunityRole;
  communityType: CommunityType;
  isUnitOwner: boolean;
}): CelebrationNextStep | null {
  const opts = { isUnitOwner: input.isUnitOwner };
  return chooseCelebrationNextStep({
    communityId: input.communityId,
    canViewCompliance:
      getFeaturesForCommunity(input.communityType).hasCompliance &&
      checkPermissionV2(input.role, input.communityType, 'compliance', 'read', opts),
    canViewDocuments: checkPermissionV2(input.role, input.communityType, 'documents', 'read', opts),
  });
}
