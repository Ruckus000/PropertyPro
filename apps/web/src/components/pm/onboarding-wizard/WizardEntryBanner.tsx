/**
 * Dismissible "Customize your site" banner.
 *
 * Renders on the PM website settings page when the community hasn't
 * completed the onboarding wizard yet. The caller gates on the canonical
 * signal `communities.site_onboarding_completed_at IS NULL` (stamped by
 * the wizard's final-step publish).
 *
 * Pure server component — no client state, no dismissal persistence.
 * A future iteration can add user_preferences-backed dismissal (spec
 * §4.1 entry-point 2).
 */
import { Sparkles } from 'lucide-react';

interface Props {
  communityId: number;
}

export function WizardEntryBanner({ communityId }: Props) {
  return (
    <div
      role="status"
      data-testid="wizard-entry-banner"
      className="mb-6 flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4"
    >
      <Sparkles className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium text-content">Your site is using default settings.</p>
        <p className="mt-1 text-sm text-content-secondary">
          Run the 5-step onboarding wizard to pick a layout, a color palette, and write your
          welcome message. You can come back anytime.
        </p>
      </div>
      <a
        href={`/pm/onboarding/website?communityId=${communityId}`}
        data-testid="wizard-entry-banner-cta"
        className="shrink-0 self-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        Customize →
      </a>
    </div>
  );
}
