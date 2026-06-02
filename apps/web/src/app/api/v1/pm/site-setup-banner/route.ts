/**
 * PM dashboard "finish your site" banner dismissal.
 *
 * GET  /api/v1/pm/site-setup-banner  — { dismissed: boolean }
 * POST /api/v1/pm/site-setup-banner  — dismiss for the current user
 *
 * User-scoped: authorized by session identity only (no community context).
 * Persisted in user_preferences (no community_id) via the unscoped-client
 * service, so a PM's dismissal applies across their whole portfolio.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { getUserPreference, setUserPreference } from '@/lib/services/user-preferences-service';
import { siteSetupBannerStatusContract, siteSetupBannerDismissContract } from './contract';

const PREF_KEY = 'pm_site_setup_banner_dismissed';

function isDismissed(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { dismissed?: unknown }).dismissed === true
  );
}

export const GET = withErrorHandler(
  runRoute(siteSetupBannerStatusContract, async () => {
    const userId = await requireAuthenticatedUserId();
    const value = await getUserPreference(userId, PREF_KEY);
    return { dismissed: isDismissed(value) };
  }),
);

export const POST = withErrorHandler(
  runRoute(siteSetupBannerDismissContract, async () => {
    const userId = await requireAuthenticatedUserId();
    await setUserPreference(userId, PREF_KEY, {
      dismissed: true,
      dismissedAt: new Date().toISOString(),
    });
    return { dismissed: true as const };
  }),
);
