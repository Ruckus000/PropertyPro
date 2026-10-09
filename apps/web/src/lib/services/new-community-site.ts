/**
 * Give a brand-new community its starting website: the starter pack's
 * published sections on a published Home page, and the community type's
 * default layout and colour set.
 *
 * Both community-creation paths call this right after the community exists:
 * `createCommunityForPm` (PM-created communities, and provisioning's
 * add-to-group path, which delegates to it) and `runProvisioning`'s
 * `community_created` step (self-serve signup). The signup path used to skip
 * it, so a founder who had just paid reached "Live — owners can find you now"
 * with a site that had no pages at all.
 *
 * Best-effort, and each half separately: a failure is logged and reported,
 * never thrown, because losing a community that was just created (or failing
 * a paid signup's provisioning) is worse than an empty site the manager can
 * fill in the editor. A starter-pack failure does not skip the branding.
 *
 * Safe to call again: `applyStarterPackToCommunity` skips a community that has
 * published sections (checked under the community row lock), and
 * `seedDefaultSiteBranding` skips one that already has a layout. Provisioning
 * retries depend on that.
 *
 * AUTHZ: the caller must have just created the community (see
 * `applyStarterPackToCommunity`).
 */
import { captureException } from '@sentry/nextjs';
import type { CommunityType } from '@propertypro/shared';
import { seedDefaultSiteBranding } from '@/lib/api/branding';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';

export async function seedNewCommunitySite(
  communityId: number,
  communityType: CommunityType,
): Promise<void> {
  try {
    await applyStarterPackToCommunity(communityId, communityType);
  } catch (err) {
    console.error('applyStarterPackToCommunity failed', { communityId, err });
    captureException(err, { tags: { site_seed: 'starter_pack' }, extra: { communityId } });
  }

  // Leaves site_onboarding_completed_at null, so the "customize your site"
  // prompts still show.
  try {
    await seedDefaultSiteBranding(communityId, communityType);
  } catch (err) {
    console.error('seedDefaultSiteBranding failed', { communityId, err });
    captureException(err, { tags: { site_seed: 'branding' }, extra: { communityId } });
  }
}
