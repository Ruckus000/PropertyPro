/**
 * Whether the dashboard shows the "Your website is live" card (D18), and the
 * address it links to.
 *
 * The card is for a manager whose community has the site editor, while the
 * website setup is not done (`site_onboarding_completed_at` is null; Dismiss
 * and Keep this look both stamp it). Residents never see it, and nothing is
 * read for them: the role and feature checks come first.
 *
 * Both dashboards (the main one and the apartment one) call this, so the
 * decision is made in one place. Started without awaiting, like the page's
 * other loads, and resolved inside its Suspense boundary.
 */
import { isAdminRole, type CommunityFeatures, type CommunityRole } from '@propertypro/shared';
import { getCommunityPublicInfo, getSiteOnboardingCompletedAt } from '@/lib/api/branding';
import { buildCommunityUrl } from '@/lib/utils/community-url';

export interface WebsiteLiveCardData {
  /** The site's public address (its home page). */
  publicUrl: string;
}

export async function loadWebsiteLiveCard(
  communityId: number,
  role: CommunityRole,
  features: Pick<CommunityFeatures, 'hasSiteEditor'>,
): Promise<WebsiteLiveCardData | null> {
  if (!isAdminRole(role) || !features.hasSiteEditor) return null;
  try {
    const [completedAt, info] = await Promise.all([
      getSiteOnboardingCompletedAt(communityId),
      getCommunityPublicInfo(communityId),
    ]);
    if (completedAt !== null || !info) return null;
    return { publicUrl: buildCommunityUrl(info.slug, '/') };
  } catch {
    // A card is not worth the dashboard: if either read fails, show no card.
    return null;
  }
}
