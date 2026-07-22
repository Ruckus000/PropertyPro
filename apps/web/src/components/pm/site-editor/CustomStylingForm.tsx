'use client';
import { useState, type FormEvent } from 'react';
import type { CustomCssOverrides } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';
import { useSaveCustomCss } from '@/hooks/use-custom-css';

interface Props {
  communityId: number;
  initial: CustomCssOverrides | null;
  /** Pro+ gate. When false the section is visible-but-locked (upsell). */
  hasSiteCustomCss: boolean;
}

const COLOR_DEFAULTS = {
  primaryColor: '#2563eb', // design-tokens:exempt — branding color-picker default; feature product IS choosing a hex value
  secondaryColor: '#6b7280', // design-tokens:exempt — branding color-picker default; feature product IS choosing a hex value
  accentColor: '#dbeafe', // design-tokens:exempt — branding color-picker default; feature product IS choosing a hex value
} as const;

const hexInputClass =
  'w-28 rounded-sm border border-default px-2 py-1.5 font-mono text-sm focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive disabled:opacity-50';

export function CustomStylingForm({ communityId, initial, hasSiteCustomCss }: Props) {
  const [primaryOn, setPrimaryOn] = useState(initial?.primaryColor != null);
  const [secondaryOn, setSecondaryOn] = useState(initial?.secondaryColor != null);
  const [accentOn, setAccentOn] = useState(initial?.accentColor != null);
  const [bodyFontOn, setBodyFontOn] = useState(initial?.bodyFont != null);

  const [primaryColor, setPrimaryColor] = useState(initial?.primaryColor ?? COLOR_DEFAULTS.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(
    initial?.secondaryColor ?? COLOR_DEFAULTS.secondaryColor,
  );
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? COLOR_DEFAULTS.accentColor);
  const [bodyFont, setBodyFont] = useState(initial?.bodyFont ?? 'Inter');

  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const mutation = useSaveCustomCss();

  const disabled = !hasSiteCustomCss || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setSaved(false);
    const overrides: CustomCssOverrides = {
      ...(primaryOn ? { primaryColor } : {}),
      ...(secondaryOn ? { secondaryColor } : {}),
      ...(accentOn ? { accentColor } : {}),
      ...(bodyFontOn ? { bodyFont } : {}),
    };
    const payload = Object.keys(overrides).length > 0 ? overrides : null;
    try {
      await mutation.mutateAsync({ communityId, customCssOverrides: payload });
      setSaved(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  function colorRow(
    label: string,
    on: boolean,
    setOn: (v: boolean) => void,
    value: string,
    setValue: (v: string) => void,
  ) {
    const key = label.toLowerCase();
    return (
      <div className="space-y-2">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-content">
          <input
            type="checkbox"
            aria-label={`Override ${key}`}
            checked={on}
            disabled={!hasSiteCustomCss}
            onChange={(e) => setOn(e.target.checked)}
          />
          Override {key}
        </label>
        {on && (
          <div className="flex items-center gap-3 pl-6">
            <input
              type="color"
              aria-label={`${label} picker`}
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 w-16 cursor-pointer rounded-sm border border-default p-0.5 disabled:opacity-50"
            />
            <input
              type="text"
              aria-label={`${label} value`}
              value={value}
              disabled={disabled}
              maxLength={7}
              pattern="^#[0-9a-fA-F]{6}$"
              onChange={(e) => setValue(e.target.value)}
              className={hexInputClass}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!hasSiteCustomCss && (
        <div className="rounded-md border border-default bg-surface-muted px-4 py-3 text-sm text-content-secondary">
          Custom styling is a <strong className="font-medium text-content">Professional</strong> feature.
          Upgrade to fine-tune your site&rsquo;s colors and body font beyond the selected preset.
        </div>
      )}

      {colorRow('Primary color', primaryOn, setPrimaryOn, primaryColor, setPrimaryColor)}
      {colorRow('Secondary color', secondaryOn, setSecondaryOn, secondaryColor, setSecondaryColor)}
      {colorRow('Accent color', accentOn, setAccentOn, accentColor, setAccentColor)}

      <div className="space-y-2">
        <label className="inline-flex items-center gap-2 text-sm font-medium text-content">
          <input
            type="checkbox"
            aria-label="Override body font"
            checked={bodyFontOn}
            disabled={!hasSiteCustomCss}
            onChange={(e) => setBodyFontOn(e.target.checked)}
          />
          Override body font
        </label>
        {bodyFontOn && (
          <div className="pl-6">
            <select
              aria-label="Body font value"
              value={bodyFont}
              disabled={disabled}
              onChange={(e) => setBodyFont(e.target.value)}
              className="w-full max-w-xs rounded-sm border border-default px-2 py-1.5 text-sm focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive disabled:opacity-50"
            >
              {ALLOWED_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}
      {saved && (
        <div className="rounded-sm border border-success bg-success/10 px-3 py-2 text-sm text-success-strong">
          Custom styling saved.
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        {mutation.isPending ? 'Saving…' : 'Save custom styling'}
      </button>
    </form>
  );
}
