/**
 * PR #5b · Onboarding wizard backing API.
 *
 * PATCH /api/v1/pm/onboarding/website
 *
 * Persists a partial wizard step. Each wizard step writes the field(s) it
 * owns, so steps can run in any order. Layout, colour set, colours and fonts
 * are saved as the site's DRAFTED look (`site-design-service`) and go live on
 * step 5's publish; the tagline and name are live-immediate.
 *
 * Step → fields:
 *   1. Layout            → layoutId
 *   2. Theme preset      → themePresetSlug
 *   3. Identity          → primaryColor/secondaryColor/accentColor/fontHeading/fontBody/tagline
 *                          (its logo upload saves through /api/v1/pm/branding)
 *   4. Welcome message   → (handled by /api/v1/pm/site/hero — not this endpoint)
 *   5. Confirm + publish → (handled by /api/v1/pm/site/publish — not this endpoint)
 *
 * Authorization: a management role (property_manager / root_manager), with the `hasSiteEditor` plan feature
 * (mirrors the editor PATCH routes from PR #8e).
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
import { saveDraftDesign } from '@/lib/services/site-design-service';
import { effectiveLook } from '@propertypro/shared';
import { updateCommunityName } from '@/lib/services/community-profile-service';
import { wizardPatchContract } from './contract';
import type { NextRequest } from 'next/server';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';

async function ensurePmAccess(req: NextRequest, communityId: number) {
  const userId = await requireAuthenticatedUserId();
  const effective = resolveEffectiveCommunityId(req, communityId);
  // A demo in its grace window is read-only. Before membership, per api-patterns.md.
  await assertNotDemoGrace(effective);
  const membership = await requireCommunityMembership(effective, userId);
  requireRole(
    membership,
    PM_MANAGER_ROLES,
    'Only property managers can run the onboarding wizard',
  );
  await requirePlanFeature(effective, 'hasSiteEditor');
  return { userId, communityId: effective };
}

export const PATCH = withErrorHandler(
  runRoute(wizardPatchContract, async ({ body, req }) => {
    const { userId, communityId } = await ensurePmAccess(req, body.communityId);

    // `name` is a top-level communities column, NOT branding — pull it out so
    // it never leaks into the branding jsonb merge below. The tagline stays
    // live-immediate; the look fields are the site's DRAFTED look (website
    // builder v4) and go live on the wizard's final Publish step. A chosen
    // colour set is saved with its colours and fonts, so it reaches the live
    // site — saving only its slug is how it never did.
    //
    // Both writes are single atomic UPDATEs, so neither can erase the other
    // and their order is free. The response is built from the two writes' own
    // results, because a re-read here would hit the request cache and return
    // the pre-write row.
    const { communityId: _id, name, tagline, ...lookPatch } = body;
    const afterTagline =
      tagline !== undefined
        ? await updateBrandingForCommunity(communityId, { tagline })
        : ((await getBrandingForCommunity(communityId)) ?? {});
    const design =
      Object.keys(lookPatch).length > 0
        ? await saveDraftDesign(communityId, lookPatch, { actorUserId: userId })
        : null;
    const branding = design
      ? { ...afterTagline, ...design.live, ...design.draft }
      : effectiveLook(afterTagline, { includeDraft: true });

    // Community-name edit (spec §4.1 Step 3) — the service writes
    // communities.name and emits a `community` update audit entry, no-opping
    // when the value is unchanged.
    if (name !== undefined) {
      await updateCommunityName(communityId, name, { actorUserId: userId });
    }

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
