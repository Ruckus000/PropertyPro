'use client';

/**
 * The colour-set cards: one radio per preset, with its swatches and fonts.
 *
 * The website editor's Design panel renders this grid. It lives in `panels/`
 * because that is its only consumer now that the onboarding wizard is gone.
 */

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

function Swatch({ color, label }: { color?: string; label: string }) {
  if (!color) return null;
  return (
    <span
      // `aria-label` is not allowed on a span with no role (axe:
      // aria-prohibited-attr), which the Design tab's audit caught.
      role="img"
      aria-label={`${label} ${color}`}
      title={`${label}: ${color}`}
      className="inline-block h-5 w-5 rounded border border-edge"
      style={{ backgroundColor: color }}
    />
  );
}

/** The colour-set cards, in as many columns as the Design tab has room for. */
export function PresetCards({
  presets,
  selected,
  onChoose,
  name,
  disabled = false,
}: {
  presets: PresetCardData[];
  selected: string | null;
  onChoose: (slug: string) => void;
  /** Radio-group name; must be unique on the page. */
  name: string;
  /** Hold every card still, for a save that is under way: no card takes a click. */
  disabled?: boolean;
}) {
  // The Design tab's card is about 680px wide inside at 768px and 1024px (the
  // tab list sits beside it from 1024px) and about 750px from 1280px. Two
  // columns from `sm` and three from `xl` keep each card 240px or wider. (It
  // was a single column while the cards sat in the 340px rail panel.)
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <legend className="sr-only">Theme preset</legend>
      {presets.map((preset) => {
        const isSelected = preset.slug === selected;
        return (
          <label
            key={preset.slug}
            data-testid={`preset-card-${preset.slug}`}
            className={`relative rounded-md border p-4 transition-colors ${
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            } ${
              isSelected
                ? 'border-interactive bg-interactive-subtle ring-2 ring-interactive'
                : `border-edge bg-surface-card ${disabled ? '' : 'hover:border-interactive-hover'}`
            }`}
          >
            <input
              type="radio"
              name={name}
              value={preset.slug}
              checked={isSelected}
              disabled={disabled}
              onChange={() => onChoose(preset.slug)}
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
  );
}
