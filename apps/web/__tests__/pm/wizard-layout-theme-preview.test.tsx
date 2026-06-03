import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Stub the choosers so the test exercises the wrapper's state-lifting + preview
// wiring (not the choosers' own fetch/persist behavior). Each stub exposes a
// button that fires onSelect, mimicking a user pick.
vi.mock('@/components/pm/onboarding-wizard/LayoutChooser', () => ({
  LayoutChooser: ({ onSelect }: { onSelect?: (s: string) => void }) => (
    <button data-testid="pick-layout" onClick={() => onSelect?.('boulevard')}>
      pick layout
    </button>
  ),
}));
vi.mock('@/components/pm/onboarding-wizard/PresetChooser', () => ({
  PresetChooser: ({ onSelect }: { onSelect?: (s: string) => void }) => (
    <button data-testid="pick-preset" onClick={() => onSelect?.('sunset')}>
      pick preset
    </button>
  ),
}));

import { WizardLayoutThemePreview } from '@/components/pm/onboarding-wizard/WizardLayoutThemePreview';

function frameSrc() {
  return screen.getByTestId('wizard-live-preview-frame').getAttribute('src') ?? '';
}

describe('WizardLayoutThemePreview', () => {
  it('previews the default layout before any interaction', () => {
    render(
      <WizardLayoutThemePreview communityId={42} presets={[]} initialLayoutId={null} initialPresetSlug={null} />,
    );
    // LayoutChooser defaults to tidewater; wrapper mirrors that in the preview.
    expect(frameSrc()).toContain('layout=tidewater');
  });

  it('updates the preview when a layout is picked', () => {
    render(
      <WizardLayoutThemePreview communityId={42} presets={[]} initialLayoutId={null} initialPresetSlug={null} />,
    );
    fireEvent.click(screen.getByTestId('pick-layout'));
    expect(frameSrc()).toContain('layout=boulevard');
  });

  it('updates the preview when a preset is picked', () => {
    render(
      <WizardLayoutThemePreview communityId={42} presets={[]} initialLayoutId={null} initialPresetSlug={null} />,
    );
    fireEvent.click(screen.getByTestId('pick-preset'));
    expect(frameSrc()).toContain('preset=sunset');
  });
});
