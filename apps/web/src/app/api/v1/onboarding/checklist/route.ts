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
  getItemKeysForRole,
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

// route-gate: self-scoped — the caller's own onboarding checklist items
export const GET = withErrorHandler(
  runRoute(onboardingChecklistGetContract, async ({ req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, null);
    const membership = await requireCommunityMembership(communityId, userId);

    // Rows are created once, so a list chosen earlier persists after the
    // person's tasks change (old designation-first rows, a new board seat, a
    // role change). Show only today's tasks, and add any that are missing.
    // Someone with no rows yet is bootstrapped by the dashboard, as before.
    const applicable = getItemKeysForRole(membership);
    let rows = await getChecklistItems(communityId, userId);
    if (rows.length > 0 && applicable.some((key) => !rows.some((row) => row.itemKey === key))) {
      await createChecklistItems(communityId, userId, membership);
      rows = await getChecklistItems(communityId, userId);
    }
    const items = rows.filter((item) => (applicable as readonly string[]).includes(item.itemKey));

    return items.map((item) => ({
      ...item,
      displayText: CHECKLIST_DISPLAY[item.itemKey as ChecklistItemKey] ?? item.itemKey,
    }));
  }),
);

// route-gate: self-scoped — completes one of the caller's own checklist items
export const PATCH = withErrorHandler(
  runRoute(onboardingChecklistPatchContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
    await requireCommunityMembership(communityId, userId);

    await markItemComplete(communityId, userId, body.itemKey as ChecklistItemKey);

    return { itemKey: body.itemKey, completedAt: new Date() };
  }),
);

// route-gate: self-scoped — bootstraps the caller's own checklist (idempotent)
export const POST = withErrorHandler(
  runRoute(onboardingChecklistPostContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
    const membership = await requireCommunityMembership(communityId, userId);

    await createChecklistItems(communityId, userId, membership);

    return { created: true as const };
  }),
);
