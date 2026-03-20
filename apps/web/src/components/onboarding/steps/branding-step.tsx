'use client';

import { useState } from 'react';
import { THEME_PRESETS, type ThemePreset } from '@propertypro/theme';
import { ColorPickerField, FontSelectField } from '@/components/branding/BrandingFieldSet';

export interface BrandingStepData {
  presetId?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

interface BrandingStepProps {
  onNext: (data: BrandingStepData) => void;
  onBack: () => void;
  initialData?: BrandingStepData;
}

export function BrandingStep({ onNext, onBack, initialData }: BrandingStepProps) {
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
    initialData?.presetId ?? THEME_PRESETS[0]!.id,
  );
  const [primaryColor, setPrimaryColor] = useState(initialData?.primaryColor ?? '#2563EB');
  const [secondaryColor, setSecondaryColor] = useState(initialData?.secondaryColor ?? '#6B7280');
  const [accentColor, setAccentColor] = useState(initialData?.accentColor ?? '#DBEAFE');
  const [fontHeading, setFontHeading] = useState(initialData?.fontHeading ?? 'Inter');
  const [fontBody, setFontBody] = useState(initialData?.fontBody ?? 'Inter');

  const isCustom = selectedPresetId === null;

  function selectPreset(preset: ThemePreset) {
    setSelectedPresetId(preset.id);
    setPrimaryColor(preset.primaryColor);
    setSecondaryColor(preset.secondaryColor);
    setAccentColor(preset.accentColor);
    setFontHeading(preset.fontHeading);
    setFontBody(preset.fontBody);
  }

  function selectCustom() {
    setSelectedPresetId(null);
  }

  function handleNext() {
    onNext({
      presetId: selectedPresetId,
      primaryColor,
      secondaryColor,
      accentColor,
      fontHeading,
      fontBody,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-content">Choose Your Branding</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Pick a theme preset or customize your own colors and fonts.
        </p>
      </div>

      {/* Preset grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectPreset(preset)}
            className={[
              'rounded-md border-2 p-4 text-left transition-all',
              selectedPresetId === preset.id
                ? 'border-interactive ring-2 ring-interactive-muted'
                : 'border-edge hover:border-edge-strong',
            ].join(' ')}
          >
            {/* Color swatches */}
            <div className="mb-3 flex gap-1">
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: preset.primaryColor }}
              />
              <div
                className="h-8 w-8 rounded"
                style={{ backgroundColor: preset.secondaryColor }}
              />
              <div
                className="h-8 w-8 rounded border border-edge"
                style={{ backgroundColor: preset.accentColor }}
              />
            </div>
            <p className="text-sm font-medium text-content">{preset.name}</p>
            <p className="mt-0.5 text-xs text-content-tertiary">{preset.description}</p>
            <p className="mt-1 text-xs text-content-disabled">
              {preset.fontHeading} / {preset.fontBody}
            </p>
          </button>
        ))}

        {/* Custom option */}
        <button
          type="button"
          onClick={selectCustom}
          className={[
            'rounded-md border-2 border-dashed p-4 text-left transition-all',
            isCustom
              ? 'border-interactive ring-2 ring-interactive-muted'
              : 'border-edge-strong hover:border-edge-strong',
          ].join(' ')}
        >
          <div className="mb-3 flex h-8 items-center">
            <svg className="h-6 w-6 text-content-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <p className="text-sm font-medium text-content">Custom</p>
          <p className="mt-0.5 text-xs text-content-tertiary">Pick your own colors and fonts</p>
        </button>
      </div>

      {/* Custom editor — only shown when Custom is selected */}
      {isCustom && (
        <div className="rounded-md border border-edge bg-surface-page p-5 space-y-4">
          <ColorPickerField
            label="Primary Brand Color"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorPickerField
            label="Secondary Brand Color"
            value={secondaryColor}
            onChange={setSecondaryColor}
          />
          <ColorPickerField
            label="Accent Color"
            description="Used for badges and highlighted backgrounds"
            value={accentColor}
            onChange={setAccentColor}
          />
          <FontSelectField
            label="Heading Font"
            value={fontHeading}
            onChange={setFontHeading}
            id="branding-font-heading"
          />
          <FontSelectField
            label="Body Font"
            value={fontBody}
            onChange={setFontBody}
            id="branding-font-body"
          />
        </div>
      )}

      {/* Preview swatch */}
      <div className="rounded-md border border-edge bg-surface-card p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-tertiary">Preview</p>
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <div className="h-10 w-10 rounded" style={{ backgroundColor: primaryColor }} />
            <div className="h-10 w-10 rounded" style={{ backgroundColor: secondaryColor }} />
            <div className="h-10 w-10 rounded border border-edge" style={{ backgroundColor: accentColor }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ fontFamily: `'${fontHeading}', sans-serif` }}>
              {fontHeading}
            </p>
            <p className="text-xs text-content-tertiary" style={{ fontFamily: `'${fontBody}', sans-serif` }}>
              {fontBody}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-edge-strong bg-surface-card px-4 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="rounded bg-interactive px-6 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
