/**
 * Give a brand-new community its website, live from the moment it exists: the
 * suggested look for its type (a condo gets Bayfront, an HOA Palm Grove, an
 * apartment Plain & Simple), with the look's layout, colours, fonts and
 * sections published on a published Home page. The manager never has to build
 * a site; picking a different look is one click later.
 *
 * Both community-creation paths call this right after the community exists:
 * `createCommunityForPm` (PM-created communities, and provisioning's
 * add-to-group path, which delegates to it) and `runProvisioning`'s
 * `community_created` step (self-serve signup). The signup path used to skip
 * it, so a founder who had just paid reached "Live — owners can find you now"
 * with a site that had no pages at all.
 *
 * Best-effort: a failure is logged and reported, never thrown, because losing a
 * community that was just created (or failing a paid signup's provisioning) is
 * worse than an empty site the manager can fill in the editor.
 *
 * Safe to call again: `applyLookAtCreation` skips a community that has
 * published sections (checked under the community row lock) and writes the
 * branding before the sections, so a retry finishes a site an earlier failure
 * left half-built. Provisioning retries depend on that. It leaves
 * `site_onboarding_completed_at` null, so the "customize your site" prompts
 * still show.
 *
 * AUTHZ: the caller must have just created the community (see
 * `applyLookAtCreation`).
 */
import { captureException } from '@sentry/nextjs';
import type { CommunityType } from '@propertypro/shared';
import { applyLookAtCreation } from '@/lib/services/site-look-service';

export async function seedNewCommunitySite(
  communityId: number,
  communityType: CommunityType,
): Promise<void> {
  try {
    await applyLookAtCreation(communityId, communityType);
  } catch (err) {
    console.error('applyLookAtCreation failed', { communityId, err });
    captureException(err, { tags: { site_seed: 'look' }, extra: { communityId } });
  }
}
