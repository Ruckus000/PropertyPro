'use client';

/**
 * Step 2 of the onboarding wizard — choose a color & font preset.
 *
 * Renders preset cards in a 2×3 grid (or whatever count comes from the
 * catalog). Each card shows token swatches + font names + a name.
 * Persists the choice via the wizard hook on Continue.
 */
import { useState } from 'react';
import { useWebsiteWizard } from '@/hooks/use-website-wizard';

export interface PresetCardData {
  slug: string;
  displayName: string;
  description: string | null;
  tokens: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headingFont?: string;
    bodyFont?: string;
  };
  tier: 'essentials' | 'professional' | 'pm';
  isFeatured: boolean;
}

interface Props {
  communityId: number;
  presets: PresetCardData[];
  /** Initial selection if the wizard is being resumed. */
  initialPresetSlug?: string | null;
  /** Called when the user advances to Step 3. */
  onContinue?: (slug: string) => void;
  /** Called when the user clicks "Skip — keep default". */
  onSkip?: () => void;
}

function Swatch({ color, label }: { color?: string; label: string }) {
  if (!color) return null;
  return (
    <span
      aria-label={`${label} ${color}`}
      title={`${label}: ${color}`}
      className="inline-block h-5 w-5 rounded border border-default"
      style={{ backgroundColor: color }}
    />
  );
}

export function PresetChooser({
  communityId,
  presets,
  initialPresetSlug,
  onContinue,
  onSkip,
}: Props) {
  const fallback = presets.find((p) => p.isFeatured)?.slug ?? presets[0]?.slug ?? null;
  const [selected, setSelected] = useState<string | null>(initialPresetSlug ?? fallback);
  const [outcome, setOutcome] = useState<string | null>(null);
  const wizard = useWebsiteWizard(communityId);

  async function handleContinue() {
    if (!selected) {
      setOutcome('Pick a preset to continue.');
      return;
    }
    setOutcome(null);
    try {
      await wizard.mutateAsync({ themePresetSlug: selected });
      onContinue?.(selected);
    } catch (err) {
      setOutcome(err instanceof Error ? err.message : 'Failed to save preset choice.');
    }
  }

  if (presets.length === 0) {
    return (
      <section
        aria-labelledby="wizard-step-2-heading"
        data-testid="preset-chooser"
        className="rounded-md border border-default bg-surface-card p-6 shadow-e0"
      >
        <h2 id="wizard-step-2-heading" className="text-xl font-semibold text-content">
          Choose a color & font preset
        </h2>
        <p className="mt-2 text-sm text-content-secondary">
          No presets are available yet. Skip this step for now.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-content-secondary hover:text-content underline underline-offset-2"
          >
            Skip — keep default
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="wizard-step-2-heading"
      data-testid="preset-chooser"
      className="rounded-md border border-default bg-surface-card p-6 shadow-e0"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-content-secondary">
          Step 2 of 5
        </p>
        <h2 id="wizard-step-2-heading" className="mt-1 text-xl font-semibold text-content">
          Choose a color & font preset
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Each preset bundles a color palette and a typography pairing.
        </p>
      </div>

      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="sr-only">Theme preset</legend>
        {presets.map((preset) => {
          const isSelected = preset.slug === selected;
          return (
            <label
              key={preset.slug}
              data-testid={`preset-card-${preset.slug}`}
              className={`relative cursor-pointer rounded-md border p-4 transition-colors ${
                isSelected
                  ? 'border-interactive bg-interactive/5 ring-2 ring-interactive'
                  : 'border-default bg-surface-card hover:border-interactive-hover'
              }`}
            >
              <input
                type="radio"
                name="wizard-preset"
                value={preset.slug}
                checked={isSelected}
                onChange={() => setSelected(preset.slug)}
                className="sr-only"
              />
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-content">{preset.displayName}</span>
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="rounded-full bg-interactive px-2 py-0.5 text-xs font-medium text-content-inverse"
                  >
                    Selected
                  </span>
                )}
              </div>
              <div
                data-testid={`preset-swatches-${preset.slug}`}
                className="mb-2 flex items-center gap-1.5"
              >
                <Swatch color={preset.tokens.primaryColor} label="Primary" />
                <Swatch color={preset.tokens.secondaryColor} label="Secondary" />
                <Swatch color={preset.tokens.accentColor} label="Accent" />
              </div>
              {(preset.tokens.headingFont || preset.tokens.bodyFont) && (
                <p className="mb-2 text-xs text-content-secondary">
                  {preset.tokens.headingFont}
                  {preset.tokens.headingFont && preset.tokens.bodyFont ? ' · ' : ''}
                  {preset.tokens.bodyFont}
                </p>
              )}
              {preset.description && (
                <p className="text-xs text-content-secondary">{preset.description}</p>
              )}
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
            disabled={wizard.isPending || !selected}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {wizard.isPending ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}
