'use client';

/**
 * Step 1 of the onboarding wizard — choose a layout.
 *
 * Renders three layout cards (Tidewater / Boulevard / Sable). Persists
 * the choice through the wizard hook on click; the user advances on
 * the parent's Continue handler.
 */
import { useState } from 'react';
import { useWebsiteWizard } from '@/hooks/use-website-wizard';

export interface LayoutChoice {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  bestFor: string;
}

const LAYOUTS: LayoutChoice[] = [
  {
    slug: 'tidewater',
    name: 'Tidewater',
    tagline: 'Coastal editorial · for the waterfront',
    description:
      'Coastal editorial. Golden-hour palette, Fraunces italic display set against warm ivory, hairline rules.',
    bestFor: 'Waterfront condominium associations',
  },
  {
    slug: 'boulevard',
    name: 'Boulevard',
    tagline: 'Mid-century Floridian · for established HOAs',
    description:
      'Mid-century Floridian. MiMo architectural moods, bold geometry, seafoam + ochre, condensed sans display paired with Newsreader italic.',
    bestFor: 'Established HOAs and postwar communities',
  },
  {
    slug: 'sable',
    name: 'Sable',
    tagline: 'Refined contemporary · for newer-build communities',
    description:
      'Refined contemporary. Linen and oxidized bronze, Cormorant Garamond hairline italic, generous negative space.',
    bestFor: 'Newer-build communities and apartment portfolios',
  },
];

interface Props {
  communityId: number;
  /** Initial selection if the wizard is being resumed. */
  initialLayoutId?: string | null;
  /** Called when the user advances to Step 2. */
  onContinue?: (slug: string) => void;
  /** Called when the user clicks "Skip — keep default". */
  onSkip?: () => void;
}

export function LayoutChooser({ communityId, initialLayoutId, onContinue, onSkip }: Props) {
  const [selected, setSelected] = useState<string>(initialLayoutId ?? 'tidewater');
  const [outcome, setOutcome] = useState<string | null>(null);
  const wizard = useWebsiteWizard(communityId);

  async function handleContinue() {
    setOutcome(null);
    try {
      await wizard.mutateAsync({ layoutId: selected });
      onContinue?.(selected);
    } catch (err) {
      setOutcome(err instanceof Error ? err.message : 'Failed to save layout choice.');
    }
  }

  return (
    <section
      aria-labelledby="wizard-step-1-heading"
      data-testid="layout-chooser"
      className="rounded-md border border-default bg-surface-card p-6 shadow-e0"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-content-secondary">
          Step 1 of 5
        </p>
        <h2 id="wizard-step-1-heading" className="mt-1 text-xl font-semibold text-content">
          Choose a layout
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Three layouts to start from. You can change this later.
        </p>
      </div>

      <fieldset className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <legend className="sr-only">Layout</legend>
        {LAYOUTS.map((layout) => {
          const isSelected = layout.slug === selected;
          return (
            <label
              key={layout.slug}
              data-testid={`layout-card-${layout.slug}`}
              className={`relative cursor-pointer rounded-md border p-4 transition-colors ${
                isSelected
                  ? 'border-interactive bg-interactive/5 ring-2 ring-interactive'
                  : 'border-default bg-surface-card hover:border-interactive-hover'
              }`}
            >
              <input
                type="radio"
                name="wizard-layout"
                value={layout.slug}
                checked={isSelected}
                onChange={() => setSelected(layout.slug)}
                className="sr-only"
              />
              <div className="mb-2 flex items-center justify-between">
                <span className="text-base font-semibold text-content">{layout.name}</span>
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="rounded-full bg-interactive px-2 py-0.5 text-xs font-medium text-content-inverse"
                  >
                    Selected
                  </span>
                )}
              </div>
              <p className="text-xs italic text-content-secondary">{layout.tagline}</p>
              <p className="mt-2 text-sm text-content">{layout.description}</p>
              <p className="mt-3 text-xs text-content-secondary">
                <span className="font-medium">Best for:</span> {layout.bestFor}
              </p>
            </label>
          );
        })}
      </fieldset>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-content-secondary hover:text-content underline underline-offset-2"
        >
          Skip — keep default
        </button>
        <div className="flex items-center gap-3">
          {outcome && (
            <span role="alert" className="text-sm text-danger">
              {outcome}
            </span>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={wizard.isPending}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {wizard.isPending ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}
