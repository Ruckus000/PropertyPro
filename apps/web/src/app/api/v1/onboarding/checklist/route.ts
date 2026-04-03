/**
 * Onboarding checklist API
 *
 * GET   /api/v1/onboarding/checklist — list items for current user
 * PATCH /api/v1/onboarding/checklist — mark an item complete
 * POST  /api/v1/onboarding/checklist — create items for current user (welcome screen bootstrap)
 */
import { NextResponse, type NextRequest } from 'next/server';
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

// GET /api/v1/onboarding/checklist — list items for current user
export const GET = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const communityId = resolveEffectiveCommunityId(req, null);
  await requireCommunityMembership(communityId, userId);

  const items = await getChecklistItems(communityId, userId);

  const enriched = items.map((item) => ({
    ...item,
    displayText: CHECKLIST_DISPLAY[item.itemKey as ChecklistItemKey] ?? item.itemKey,
  }));

  return NextResponse.json({ data: enriched });
});

// PATCH /api/v1/onboarding/checklist — mark item complete
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = (await req.json()) as { communityId?: number; itemKey?: string };

  if (!body.itemKey || typeof body.itemKey !== 'string') {
    return NextResponse.json({ error: 'itemKey is required' }, { status: 400 });
  }

  if (!(body.itemKey in CHECKLIST_DISPLAY)) {
    return NextResponse.json({ error: 'Invalid itemKey' }, { status: 400 });
  }

  const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
  await requireCommunityMembership(communityId, userId);

  await markItemComplete(communityId, userId, body.itemKey as ChecklistItemKey);

  return NextResponse.json({ data: { itemKey: body.itemKey, completedAt: new Date() } });
});

// POST /api/v1/onboarding/checklist — create items for current user (called from welcome screen)
export const POST = withErrorHandler(async (req: NextRequest) => {
  const userId = await requireAuthenticatedUserId();
  const body = (await req.json()) as { communityId?: number };
  const communityId = resolveEffectiveCommunityId(req, body.communityId ?? null);
  const membership = await requireCommunityMembership(communityId, userId);

  await createChecklistItems(
    communityId,
    userId,
    membership.role,
    membership.communityType as 'condo_718' | 'hoa_720' | 'apartment',
  );

  return NextResponse.json({ data: { created: true } }, { status: 201 });
});
