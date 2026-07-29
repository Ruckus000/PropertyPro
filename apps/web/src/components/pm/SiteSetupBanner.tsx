'use client';

/**
 * PM dashboard "finish your site" nudge. Shows when the PM has at least one
 * community whose public-site onboarding is incomplete
 * (siteOnboardingCompletedAt === null) AND the PM hasn't dismissed it.
 * Dismissal is persisted per-user (user_preferences) so it stays dismissed
 * across devices/sessions.
 *
 * ## Why this is an AlertBanner rather than bespoke markup
 *
 * It used to hand-roll its chrome from the `accent` colour with slash-opacity
 * modifiers for the background and border. `accent.DEFAULT` is declared in
 * tailwind.config.ts as a bare `var(--brand-accent)` with no `<alpha-value>`
 * channel, so Tailwind emitted ZERO CSS for both — the banner had no background
 * and no border for as long as it shipped, and rendered as unstyled text on the
 * PM dashboard. Its icon and link were `accent` too, which is coral-200: too
 * light to read as text. The `brand` status maps to a designed pair
 * (coral-50 ground, coral-700 ink) and fixes the contrast as well.
 *
 * `guard:design-tokens` did not catch it because `accent` was missing from the
 * `slash-opacity-semantic` family list; that has since been fixed, which is what
 * keeps this from regressing.
 *
 * `role="status"` overrides AlertBanner's default `role="alert"`: this is a
 * standing nudge, not something that just went wrong, so it is announced
 * politely rather than interrupting. Same call as [[WizardEntryBanner]].
 */
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useSiteSetupBannerDismissed, useDismissSiteSetupBanner } from '@/hooks/use-site-setup-banner';

interface Props {
  /** True when any of the PM's communities has an incomplete public site. */
  hasIncompleteSite: boolean;
  /**
   * The first incomplete community's id — deep-links the CTA into that
   * community's website-onboarding wizard. Falls back to the website editor
   * when absent (shouldn't happen when hasIncompleteSite is true, but the
   * nudge must never be a dead end).
   */
  firstIncompleteCommunityId?: number | null;
}

export function SiteSetupBanner({ hasIncompleteSite, firstIncompleteCommunityId }: Props) {
  const { data: dismissed, isLoading } = useSiteSetupBannerDismissed();
  const dismiss = useDismissSiteSetupBanner();

  // Don't render until we know the dismissal state (avoids a flash), and never
  // when there's nothing to nudge about or the PM already dismissed it.
  if (!hasIncompleteSite || isLoading || dismissed) return null;

  return (
    <AlertBanner
      role="status"
      data-testid="site-setup-banner"
      status="brand"
      title="Finish setting up your community website"
      description="One or more of your communities hasn't published its public site yet. Pick a layout, colors, and a welcome message so residents have somewhere to land."
      action={
        <Button asChild size="sm">
          {/*
            A plain <a>, not next/link: this leaves the PM portal for the
            community-scoped wizard, and the destination reads `communityId`
            server-side to resolve tenancy. Matches WizardEntryBanner.
          */}
          <a
            href={
              firstIncompleteCommunityId
                ? `/pm/onboarding/website?communityId=${firstIncompleteCommunityId}`
                : '/pm/website-editor'
            }
            data-testid="site-setup-banner-cta"
          >
            Set up your website
          </a>
        </Button>
      }
      dismissible
      onDismiss={() => dismiss.mutate()}
      dismissButtonProps={{
        'data-testid': 'site-setup-banner-dismiss',
        disabled: dismiss.isPending,
      } as React.ButtonHTMLAttributes<HTMLButtonElement>}
    />
  );
}
