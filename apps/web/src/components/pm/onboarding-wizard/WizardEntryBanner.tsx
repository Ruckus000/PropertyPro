/**
 * "Your site is using default settings" prompt with a link into the wizard.
 *
 * Rendered by the website editor when the community has not completed the
 * onboarding wizard. The caller gates on the canonical signal
 * `communities.site_onboarding_completed_at IS NULL` (stamped by the wizard's
 * final-step publish).
 *
 * ## Why this is an AlertBanner rather than bespoke markup
 *
 * It used to hand-roll its chrome from the `accent` colour with slash-opacity
 * modifiers for the background and border. `accent.DEFAULT` is declared as a
 * bare `var(--brand-accent)` with no `<alpha-value>` channel, so Tailwind
 * emitted ZERO CSS for both — the banner had no background and no border at
 * all, and had not had one for as long as it shipped. `guard:design-tokens`
 * missed it because `accent` was not in the rule's family list (it is now).
 * `AlertBanner` is the same shape (icon + title + description + action) and its
 * `brand` status maps to solid, real tokens.
 *
 * `role="status"` overrides AlertBanner's default `role="alert"`: this is a
 * standing informational prompt, not something that just went wrong, so it
 * should be announced politely rather than interrupting.
 *
 * Pure server component — no client state, no dismissal persistence.
 */
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';

interface Props {
  communityId: number;
}

export function WizardEntryBanner({ communityId }: Props) {
  return (
    <AlertBanner
      role="status"
      data-testid="wizard-entry-banner"
      status="brand"
      title="Your site is using default settings."
      description="Run the 5-step onboarding wizard to pick a layout, a color palette, and write your welcome message. You can come back anytime."
      action={
        <Button asChild size="sm">
          <a
            href={`/pm/onboarding/website?communityId=${communityId}`}
            data-testid="wizard-entry-banner-cta"
          >
            Customize
          </a>
        </Button>
      }
    />
  );
}
