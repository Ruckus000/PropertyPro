'use client';

/**
 * PM dashboard "finish your site" nudge. Shows when the PM has at least one
 * community whose public-site onboarding is incomplete
 * (siteOnboardingCompletedAt === null) AND the PM hasn't dismissed it.
 * Dismissal is persisted per-user (user_preferences) so it stays dismissed
 * across devices/sessions.
 */
import { Sparkles, X } from 'lucide-react';
import { useSiteSetupBannerDismissed, useDismissSiteSetupBanner } from '@/hooks/use-site-setup-banner';

interface Props {
  /** True when any of the PM's communities has an incomplete public site. */
  hasIncompleteSite: boolean;
}

export function SiteSetupBanner({ hasIncompleteSite }: Props) {
  const { data: dismissed, isLoading } = useSiteSetupBannerDismissed();
  const dismiss = useDismissSiteSetupBanner();

  // Don't render until we know the dismissal state (avoids a flash), and never
  // when there's nothing to nudge about or the PM already dismissed it.
  if (!hasIncompleteSite || isLoading || dismissed) return null;

  return (
    <div
      role="status"
      data-testid="site-setup-banner"
      className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium text-content">Finish setting up your community website</p>
        <p className="mt-1 text-sm text-content-secondary">
          One or more of your communities hasn&rsquo;t published its public site yet. Pick a layout,
          colors, and a welcome message so residents have somewhere to land.
        </p>
      </div>
      <button
        type="button"
        data-testid="site-setup-banner-dismiss"
        aria-label="Dismiss"
        disabled={dismiss.isPending}
        onClick={() => dismiss.mutate()}
        className="shrink-0 self-start rounded-md p-1 text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive disabled:opacity-50"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
