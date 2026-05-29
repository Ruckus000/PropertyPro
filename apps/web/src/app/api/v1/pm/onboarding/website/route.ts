/**
 * PR #5b · Onboarding wizard backing API.
 *
 * PATCH /api/v1/pm/onboarding/website
 *
 * Persists a partial wizard step into the community's branding jsonb.
 * Each wizard step writes the field(s) it owns; the PATCH merges into
 * existing branding so multiple steps can run in any order.
 *
 * Step → fields:
 *   1. Layout            → layoutId
 *   2. Theme preset      → themePresetSlug
 *   3. Identity          → primaryColor/secondaryColor/accentColor/fontHeading/fontBody/tagline/logoPath
 *   4. Welcome message   → (handled by /api/v1/pm/site/hero — not this endpoint)
 *   5. Confirm + publish → (handled by /api/v1/pm/site/publish — not this endpoint)
 *
 * Authorization: pm_admin or cam, with the `hasSiteEditor` plan feature
 * (mirrors the editor PATCH routes from PR #8e).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { updateBrandingForCommunity } from '@/lib/api/branding';
import { wizardPatchContract } from './contract';
import type { NextRequest } from 'next/server';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(
    membership,
    ['pm_admin', 'cam'],
    'Only property managers can run the onboarding wizard',
  );
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const PATCH = withErrorHandler(
  runRoute(wizardPatchContract, async ({ body, req }) => {
    const { communityId } = await ensurePmAccess(req, body.communityId);

    // Build the patch from whichever fields the wizard step supplied.
    // The contract validates each field's shape; we just forward to the
    // merge helper.
    const { communityId: _id, ...rest } = body;
    const branding = await updateBrandingForCommunity(communityId, rest);

    return {
      branding: {
        layoutId: branding.layoutId ?? null,
        themePresetSlug: branding.themePresetSlug ?? null,
        tagline: branding.tagline ?? null,
        primaryColor: branding.primaryColor ?? null,
        secondaryColor: branding.secondaryColor ?? null,
        accentColor: branding.accentColor ?? null,
        fontHeading: branding.fontHeading ?? null,
        fontBody: branding.fontBody ?? null,
      },
    };
  }),
);
