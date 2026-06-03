'use client';

/**
 * Wraps the wizard's layout (step 1) + preset (step 2) choosers alongside a
 * live preview. Lifts the current selection into shared state so the preview
 * iframe re-renders the real public-site layout as the PM picks a layout or
 * preset — before/independent of persistence.
 */
import { useState } from 'react';
import { LayoutChooser } from './LayoutChooser';
import { PresetChooser, type PresetCardData } from './PresetChooser';
import { WizardLivePreview } from './WizardLivePreview';

interface Props {
  communityId: number;
  presets: PresetCardData[];
  initialLayoutId: string | null;
  initialPresetSlug: string | null;
}

export function WizardLayoutThemePreview({
  communityId,
  presets,
  initialLayoutId,
  initialPresetSlug,
}: Props) {
  // Defaults mirror the choosers' own initial selection so the preview matches
  // what's highlighted before the first interaction.
  const presetFallback = presets.find((p) => p.isFeatured)?.slug ?? presets[0]?.slug ?? null;
  const [layoutId, setLayoutId] = useState<string | null>(initialLayoutId ?? 'tidewater');
  const [presetSlug, setPresetSlug] = useState<string | null>(initialPresetSlug ?? presetFallback);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <LayoutChooser
          communityId={communityId}
          initialLayoutId={initialLayoutId}
          onSelect={setLayoutId}
        />
        <PresetChooser
          communityId={communityId}
          presets={presets}
          initialPresetSlug={initialPresetSlug}
          onSelect={setPresetSlug}
        />
      </div>
      <div className="lg:sticky lg:top-6 lg:self-start">
        <WizardLivePreview communityId={communityId} layoutId={layoutId} presetSlug={presetSlug} />
      </div>
    </div>
  );
}
