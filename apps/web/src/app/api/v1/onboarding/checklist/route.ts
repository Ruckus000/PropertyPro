/**
 * Onboarding checklist API
 *
 * GET   /api/v1/onboarding/checklist — list items for current user
 * PATCH /api/v1/onboarding/checklist — mark an item complete
 * POST  /api/v1/onboarding/checklist — create items for current user (welcome screen bootstrap)
 *
 * Plan A1 drain #123. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getChecklistItems,
  markItemComplete,
  createChecklistItems,
  CHECKLIST_DISPLAY,
  type ChecklistItemKey,
} from '@/lib/services/onboarding-checklist-service';
import {
  onboardingChecklistGetContract,
  onboardingChecklistPatchContract,
  onboardingChecklistPostContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(onboardingChecklistGetContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    await requireCommunityMembership(communityId, userId);

    const items = await getChecklistItems(communityId, userId);

    return items.map((item) => ({
      ...item,
      displayText: CHECKLIST_DISPLAY[item.itemKey as ChecklistItemKey] ?? item.itemKey,
    }));
  }),
);

export const PATCH = withErrorHandler(
  runRoute(onboardingChecklistPatchContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
    await requireCommunityMembership(communityId, userId);

    await markItemComplete(communityId, userId, body.itemKey as ChecklistItemKey);

    return { itemKey: body.itemKey, completedAt: new Date() };
  }),
);

export const POST = withErrorHandler(
  runRoute(onboardingChecklistPostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);

    await createChecklistItems(
      communityId,
      userId,
      membership.role,
      membership.designation,
      membership.communityType as 'condo_718' | 'hoa_720' | 'apartment',
    );

    return { created: true as const };
  }),
);
