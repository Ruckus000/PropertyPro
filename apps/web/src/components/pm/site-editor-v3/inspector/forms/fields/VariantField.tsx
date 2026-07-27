'use client';

import { BLOCK_VARIANTS, type BlockVariant } from '@propertypro/shared';

const LABELS: Record<BlockVariant, string> = {
  compact: 'Compact',
  standard: 'Standard',
  wide: 'Wide',
};

const HINT = 'Controls how wide this section runs on your website.';

export interface VariantFieldProps {
  /** Unique per section — several inspectors never coexist, but ids must not collide. */
  idPrefix: string;
  value: BlockVariant;
  onChange: (next: BlockVariant) => void;
}

/**
 * Layout-variant picker.
 *
 * Native radios in a fieldset, deliberately, NOT a Radix `Select`. Roving
 * arrow-key navigation, the group label/description association, and the
 * selected-state announcement all come free from the platform here, and a
 * Radix select would cost ~25-35 KiB of portal/dialog machinery on a route
 * with a hard budget — for worse keyboard semantics. `form-registry.test.ts`
 * enforces the ban.
 */
export function VariantField({ idPrefix, value, onChange }: VariantFieldProps) {
  const hintId = `${idPrefix}-variant-hint`;

  return (
    <fieldset className="space-y-1.5" aria-describedby={hintId}>
      <legend className="text-sm font-medium text-content">Width</legend>
      <div className="flex gap-1 rounded-md border border-edge bg-surface-muted p-1">
        {BLOCK_VARIANTS.map((variant) => {
          const id = `${idPrefix}-variant-${variant}`;
          const isSelected = value === variant;
          return (
            <label
              key={variant}
              htmlFor={id}
              className={
                isSelected
                  ? 'flex-1 cursor-pointer rounded-sm bg-surface-card px-3 py-1.5 text-center text-sm font-medium text-content shadow-e1 focus-within:ring-2 focus-within:ring-interactive'
                  : 'flex-1 cursor-pointer rounded-sm px-3 py-1.5 text-center text-sm text-content-secondary hover:text-content focus-within:ring-2 focus-within:ring-interactive'
              }
            >
              <input
                type="radio"
                id={id}
                name={`${idPrefix}-variant`}
                value={variant}
                checked={isSelected}
                onChange={() => onChange(variant)}
                // Visually hidden rather than `hidden`/`appearance-none`: the
                // input must stay focusable and hit-testable for keyboard and
                // screen-reader users. The label carries the visible state.
                className="sr-only"
              />
              {LABELS[variant]}
            </label>
          );
        })}
      </div>
      <p id={hintId} className="text-xs text-content-secondary">
        {HINT}
      </p>
    </fieldset>
  );
}
